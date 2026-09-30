import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { appendQuestionRevision } from '@/scripts/seed/question-revision-writer';
import {
  APPEND_ONLY_MARKER_TRIGGER,
  assertAppendOnlyRevisions,
  syncQuestionsFromFiles,
} from '@/scripts/seed/question-syncer';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { answerableQuestion } from '@/src/application/test-helpers/get-next-question-test-helpers';
import { GetNextQuestionUseCase } from '@/src/application/use-cases/get-next-question';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';
import {
  type ContentEdits,
  source,
  waitForBlockedQuestionLock,
} from './seed-test-helpers';

// ADR-021 phase 2b: the seed appends changed content as a new revision and
// never updates one. Earlier attempts and sessions keep the revision they were
// shown and graded against, so nothing refuses a rewrite over graded history
// or waits for a session in progress; reviews and sessions say when a question
// has been updated since (Pattern Registry F-12).
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const sessions = new DrizzlePracticeSessionRepository(db);
const attempts = new DrizzleAttemptRepository(db);
const questions = new DrizzleQuestionRepository(db);

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

// A question the seed inserted from a source file, as revision 1.
async function seedQuestion(label: string, edits: ContentEdits = {}) {
  const slug = `it-seed-append-${label}-${randomUUID()}`;
  await syncQuestionsFromFiles(db, [source(slug, edits)]);
  const [row] = await db
    .select({ id: schema.questions.id })
    .from(schema.questions)
    .where(eq(schema.questions.slug, slug));
  if (!row) throw new Error(`seed did not insert ${slug}`);
  cleanup.questionIds.push(row.id);
  return { id: row.id, slug };
}

// Every revision of a question, oldest first, with its choices.
async function revisionsOf(questionId: string) {
  const revisions = await db.query.questionRevisions.findMany({
    where: eq(schema.questionRevisions.questionId, questionId),
    orderBy: asc(schema.questionRevisions.revisionNumber),
    with: { choices: { orderBy: asc(schema.choices.sortOrder) } },
  });
  return revisions.map((revision) => ({
    id: revision.id,
    revisionNumber: revision.revisionNumber,
    stemMd: revision.stemMd,
    difficulty: revision.difficulty,
    choices: revision.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      isCorrect: choice.isCorrect,
      sortOrder: choice.sortOrder,
    })),
  }));
}

async function questionRow(questionId: string) {
  const [row] = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId));
  if (!row) throw new Error(`no question ${questionId}`);
  return row;
}

async function startSessionWith(questionId: string) {
  const user = await createUser(db, cleanup);
  const session = await sessions.create({
    userId: user.id,
    mode: 'tutor',
    paramsJson: {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [questionId],
    },
  });
  return { user, session };
}

const changes: ReadonlyArray<readonly [string, ContentEdits]> = [
  ['clinical task', { stem: 'A corrected clinical task.' }],
  ['general explanation', { explanation: 'A corrected rationale.' }],
  ['reference', { reference: 'A corrected reference.' }],
  ['difficulty', { difficulty: 'hard' }],
  ['answer key', { correctLabel: 'C' }],
  ['wrong option explanation', { wrongExplanation: 'A corrected reason.' }],
  ['added option', { labels: ['A', 'B', 'C', 'D'] }],
  ['removed option', { labels: ['A', 'B'] }],
];

describe('ADR-021 phase 2b: the seed appends changed content', () => {
  it.each(changes)(
    'appends a revision for a changed %s and leaves the earlier one intact',
    async (_name, edits) => {
      const question = await seedQuestion('change');
      const [original] = await revisionsOf(question.id);

      const counts = await syncQuestionsFromFiles(db, [
        source(question.slug, edits),
      ]);

      const revisions = await revisionsOf(question.id);
      expect(counts).toMatchObject({ updated: 1, revised: 1, skipped: 0 });
      expect(revisions).toHaveLength(2);
      expect(revisions[0]).toEqual(original);
      expect(revisions[1]?.revisionNumber).toBe(2);
      expect((await questionRow(question.id)).currentRevisionId).toBe(
        revisions[1]?.id,
      );
    },
  );

  it("mirrors the new revision into the question's legacy columns", async () => {
    const question = await seedQuestion('legacy');

    await syncQuestionsFromFiles(db, [
      source(question.slug, { stem: 'A corrected clinical task.' }),
    ]);

    expect(await questionRow(question.id)).toMatchObject({
      stemMd: 'A corrected clinical task.',
      difficulty: 'easy',
    });
  });

  it('skips an unchanged question', async () => {
    const question = await seedQuestion('unchanged');

    const counts = await syncQuestionsFromFiles(db, [source(question.slug)]);

    expect(counts).toMatchObject({ updated: 0, revised: 0, skipped: 1 });
    expect(await revisionsOf(question.id)).toHaveLength(1);
  });

  it('skips a stored revision that differs only in trailing whitespace', async () => {
    // A revision written before canonicalization must not read as changed,
    // or the first seed would append a revision for every such question.
    const question = await seedQuestion('canonical');
    await db.transaction((tx) =>
      appendQuestionRevision(tx, question.id, {
        stemMd: 'Original clinical task.  \n\n',
        explanationMd: 'Original general explanation.',
        referenceMd: 'Original synthetic reference.',
        difficulty: 'easy',
        choices: [
          {
            label: 'A',
            textMd: 'Original option A.',
            isCorrect: false,
            explanationMd: 'Original wrong-option explanation.',
            sortOrder: 1,
          },
          {
            label: 'B',
            textMd: 'Original correct option.',
            isCorrect: true,
            explanationMd: null,
            sortOrder: 2,
          },
          {
            label: 'C',
            textMd: 'Original option C.',
            isCorrect: false,
            explanationMd: 'Original wrong-option explanation.',
            sortOrder: 3,
          },
        ],
      }),
    );

    const counts = await syncQuestionsFromFiles(db, [source(question.slug)]);

    expect(counts).toMatchObject({ skipped: 1, revised: 0 });
    expect(await revisionsOf(question.id)).toHaveLength(2);
  });

  it('changes status and tags in place, without a new revision', async () => {
    const question = await seedQuestion('in-place');
    // A canonical tag, written with its stored name so nothing is renamed.
    const [treatment] = await db
      .select({ name: schema.tags.name, kind: schema.tags.kind })
      .from(schema.tags)
      .where(eq(schema.tags.slug, 'naltrexone'));
    if (!treatment)
      throw new Error('the seeded taxonomy has no naltrexone tag');

    const counts = await syncQuestionsFromFiles(db, [
      source(question.slug, {
        status: 'archived',
        tags: [
          '  - {slug: general, name: General, kind: topic}',
          '  - {slug: alcohol, name: Alcohol, kind: substance}',
          `  - {slug: naltrexone, name: ${JSON.stringify(treatment.name)}, kind: ${treatment.kind}}`,
        ],
      }),
    ]);

    const tagSlugs = await db
      .select({ slug: schema.tags.slug })
      .from(schema.questionTags)
      .innerJoin(schema.tags, eq(schema.questionTags.tagId, schema.tags.id))
      .where(eq(schema.questionTags.questionId, question.id));
    expect(counts).toMatchObject({ updated: 1, revised: 0 });
    expect((await questionRow(question.id)).status).toBe('archived');
    expect(tagSlugs.map((tag) => tag.slug).sort()).toEqual(
      ['alcohol', 'general', 'naltrexone'].sort(),
    );
    expect(await revisionsOf(question.id)).toHaveLength(1);
  });
});

describe('ADR-021 phase 2b: history keeps the revision it answered', () => {
  it('keeps a graded attempt on its revision and grade after a key correction', async () => {
    // Formerly refused by #951's graded-history guard (BUG-281).
    const question = await seedQuestion('graded');
    const [original] = await revisionsOf(question.id);
    const correct = original?.choices.find((choice) => choice.isCorrect);
    if (!original || !correct) throw new Error('no original key');
    const user = await createUser(db, cleanup);
    const attempt = await attempts.insert({
      userId: user.id,
      questionId: question.id,
      questionRevisionId: original.id,
      practiceSessionId: null,
      outcome: { kind: 'answered', selectedChoiceId: correct.id },
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    await syncQuestionsFromFiles(db, [
      source(question.slug, { correctLabel: 'C' }),
    ]);

    const [row] = await db
      .select()
      .from(schema.attempts)
      .where(eq(schema.attempts.id, attempt.id));
    expect(row).toMatchObject({
      questionRevisionId: original.id,
      selectedChoiceId: correct.id,
      isCorrect: true,
    });
    expect((await revisionsOf(question.id))[0]).toEqual(original);
  });

  it('keeps a removed choice with the revision a session selected it in', async () => {
    // Formerly refused by the choice-sync guard (BUG-266).
    const question = await seedQuestion('removed');
    const [original] = await revisionsOf(question.id);
    const optionC = original?.choices.find((choice) => choice.label === 'C');
    if (!optionC) throw new Error('no option C');
    const { session } = await startSessionWith(question.id);
    await db
      .update(schema.practiceSessionQuestionStates)
      .set({ draftSelectedChoiceId: optionC.id, draftSavedAt: new Date() })
      .where(
        eq(schema.practiceSessionQuestionStates.practiceSessionId, session.id),
      );

    await syncQuestionsFromFiles(db, [
      source(question.slug, { labels: ['A', 'B'] }),
    ]);

    const revisions = await revisionsOf(question.id);
    expect(revisions[0]?.choices.map((choice) => choice.label)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(revisions[1]?.choices.map((choice) => choice.label)).toEqual([
      'A',
      'B',
    ]);
  });

  it('keeps an incomplete session on the revision it bound, now marked superseded', async () => {
    // Formerly deferred until the session ended (phase 2a, fourth increment).
    const question = await seedQuestion('session');
    const { user, session } = await startSessionWith(question.id);

    const counts = await syncQuestionsFromFiles(db, [
      source(question.slug, { stem: 'A corrected clinical task.' }),
    ]);

    const next = answerableQuestion(
      await new GetNextQuestionUseCase(questions, attempts, sessions).execute({
        userId: user.id,
        sessionId: session.id,
      }),
    );
    expect(counts).toMatchObject({ revised: 1 });
    expect(next?.stemMd).toBe('Original clinical task.');
    expect(next?.superseded).toBe(true);
  });
});

describe('ADR-021 phase 2b: the seed and the database agree on the schema', () => {
  it('finds the append-only marker migration 0042 installs', async () => {
    await expect(assertAppendOnlyRevisions(db)).resolves.toBeUndefined();
    expect(APPEND_ONLY_MARKER_TRIGGER).toBe('question_revisions_reject_update');
  });

  it('refuses to seed a database without it', async () => {
    await expect(
      assertAppendOnlyRevisions(db, 'no_such_append_only_marker'),
    ).rejects.toThrow('has not applied migration 0042');
  });

  it('makes session creation wait for a seed transaction holding the question row', async () => {
    // The seed locks the question row before it reads the current revision;
    // session creation reads that pointer FOR SHARE, so a new session binds
    // either the old revision or the new one, never a half-written state.
    const question = await seedQuestion('race');
    const user = await createUser(db, cleanup);
    const { sql: blockerSql } = createIntegrationDb();
    const { sql: monitorSql } = createIntegrationDb();
    const lockReady = createDeferred<number>();
    const releaseLock = createDeferred<void>();
    const blocker = blockerSql.begin(async (tx) => {
      const [backend] = await tx<{ pid: number }[]>`
        SELECT pg_backend_pid()::int AS pid
      `;
      await tx`SELECT id FROM questions WHERE id = ${question.id} FOR UPDATE`;
      lockReady.resolve(backend?.pid ?? 0);
      await releaseLock.promise;
    });
    const blockerPid = await lockReady.promise;
    const creation = sessions.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    try {
      await waitForBlockedQuestionLock({ monitorSql, blockerPid });
      releaseLock.resolve();
      await expect(creation).resolves.toMatchObject({ userId: user.id });
    } finally {
      releaseLock.resolve();
      await Promise.allSettled([blocker, creation]);
      await Promise.allSettled([
        closeConnection(blockerSql),
        closeConnection(monitorSql),
      ]);
    }
  });

  it('reports a timeout when nothing waits on the question row lock', async () => {
    const { sql: monitorSql } = createIntegrationDb();
    try {
      await expect(
        waitForBlockedQuestionLock({
          monitorSql,
          blockerPid: -1,
          timeoutMs: 100,
        }),
      ).rejects.toThrow('Timed out waiting for a query to block');
    } finally {
      await closeConnection(monitorSql);
    }
  });

  it('refuses a question with no current revision rather than guessing one', async () => {
    // 0042 verified every question has one; until the contract phase makes
    // the pointer NOT NULL, the seed fails loudly if one is missing.
    const question = await seedQuestion('no-pointer');
    await db
      .update(schema.questions)
      .set({ currentRevisionId: null })
      .where(eq(schema.questions.id, question.id));

    await expect(
      syncQuestionsFromFiles(db, [source(question.slug)]),
    ).rejects.toThrow(`Question "${question.slug}" has no current revision`);
  });

  it('adds file context to seed failures and keeps later files untouched', async () => {
    const badSlug = `it-seed-append-fail-${randomUUID()}`;
    const laterSlug = `it-seed-append-later-${randomUUID()}`;

    await expect(
      syncQuestionsFromFiles(db, [
        source(badSlug, {
          tags: ['  - {slug: general, name: General, kind: nope}'],
        }),
        source(laterSlug),
      ]),
    ).rejects.toThrow(
      new RegExp(`Failed to sync seed question "${badSlug}".*/tmp/${badSlug}`),
    );

    const laterRows = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.slug, laterSlug));
    expect(laterRows).toEqual([]);
  });
});
