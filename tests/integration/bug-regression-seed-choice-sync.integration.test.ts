import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const LOCK_WAIT_TIMEOUT_MS = 5_000;
const ORIGINAL_ENV = snapshotProcessEnv();

afterEach(async () => {
  vi.restoreAllMocks();
  restoreProcessEnv(ORIGINAL_ENV);
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

function buildSeedQuestionWithRemovedChoice(slug: string): string {
  return [
    '---',
    `slug: ${slug}`,
    'difficulty: easy',
    'status: published',
    'tags:',
    '  - slug: general',
    '    name: General',
    '    kind: topic',
    '  - slug: alcohol',
    '    name: Alcohol',
    '    kind: substance',
    'choices:',
    '  - label: B',
    '    text: Choice B',
    '    correct: true',
    '  - label: C',
    '    text: Choice C',
    '    correct: false',
    '    explanation: Choice C is not correct.',
    '---',
    '',
    '## Stem',
    '',
    '# Stem',
    '',
    '## Explanation',
    '',
    '# Explanation',
  ].join('\n');
}

function buildSeedQuestionWithInsertedChoice(slug: string): string {
  return [
    '---',
    `slug: ${slug}`,
    'difficulty: easy',
    'status: published',
    'tags:',
    '  - slug: general',
    '    name: General',
    '    kind: topic',
    '  - slug: alcohol',
    '    name: Alcohol',
    '    kind: substance',
    'choices:',
    '  - label: A',
    '    text: Choice A',
    '    correct: false',
    '    explanation: Choice A is not correct.',
    '  - label: B',
    '    text: Choice B',
    '    correct: false',
    '    explanation: Choice B is not correct.',
    '  - label: C',
    '    text: Choice C',
    '    correct: true',
    '---',
    '',
    '## Stem',
    '',
    '# Stem',
    '',
    '## Explanation',
    '',
    '# Explanation',
  ].join('\n');
}

function buildSeedQuestionWithExistingChoices(slug: string): string {
  return [
    '---',
    `slug: ${slug}`,
    'difficulty: easy',
    'status: published',
    'tags:',
    '  - slug: general',
    '    name: General',
    '    kind: topic',
    '  - slug: alcohol',
    '    name: Alcohol',
    '    kind: substance',
    'choices:',
    '  - label: A',
    '    text: Choice A',
    '    correct: false',
    '    explanation: Choice A is not correct.',
    '  - label: B',
    '    text: Choice B',
    '    correct: true',
    '---',
    '',
    '## Stem',
    '',
    '# Updated Stem',
    '',
    '## Explanation',
    '',
    '# Updated Explanation',
  ].join('\n');
}

function buildSeedQuestionWithAnswerKey(input: {
  slug: string;
  correctLabel: 'A' | 'B';
  choiceAText?: string;
  choiceBText?: string;
}): string {
  const choiceACorrect = input.correctLabel === 'A';
  const choiceBCorrect = input.correctLabel === 'B';

  return [
    '---',
    `slug: ${input.slug}`,
    'difficulty: easy',
    'status: published',
    'tags:',
    '  - slug: general',
    '    name: General',
    '    kind: topic',
    '  - slug: alcohol',
    '    name: Alcohol',
    '    kind: substance',
    'choices:',
    '  - label: A',
    `    text: ${input.choiceAText ?? 'Choice A'}`,
    `    correct: ${choiceACorrect}`,
    ...(choiceACorrect ? [] : ['    explanation: Choice A is not correct.']),
    '  - label: B',
    `    text: ${input.choiceBText ?? 'Choice B'}`,
    `    correct: ${choiceBCorrect}`,
    ...(choiceBCorrect ? [] : ['    explanation: Choice B is not correct.']),
    '---',
    '',
    '## Stem',
    '',
    '# Stem',
    '',
    '## Explanation',
    '',
    '# Explanation',
  ].join('\n');
}

function buildSeedQuestionWithInvalidTag(slug: string): string {
  return [
    '---',
    `slug: ${slug}`,
    'difficulty: easy',
    'status: published',
    'tags:',
    '  - slug: not-canonical',
    '    name: Not Canonical',
    '    kind: topic',
    '  - slug: alcohol',
    '    name: Alcohol',
    '    kind: substance',
    'choices:',
    '  - label: A',
    '    text: Choice A',
    '    correct: false',
    '    explanation: Choice A is not correct.',
    '  - label: B',
    '    text: Choice B',
    '    correct: true',
    '---',
    '',
    '## Stem',
    '',
    '# Stem',
    '',
    '## Explanation',
    '',
    '# Explanation',
  ].join('\n');
}

function createDeferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function waitForBlockedQuestionLock(input: {
  monitorSql: typeof sql;
  blockerPid: number;
}): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const rows = await input.monitorSql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'
        AND query ILIKE '%"questions"%'
        AND ${input.blockerPid} = ANY(pg_blocking_pids(pid))
    `;
    if ((rows.at(0)?.count ?? 0) > 0) {
      return;
    }
    await sleep(25);
  }

  throw new Error(
    'Timed out waiting for seed sync to block on question row lock',
  );
}

async function insertGradedAttempt(input: {
  userId: string;
  questionId: string;
  selectedChoiceId: string;
  isCorrect: boolean;
}): Promise<void> {
  await db.insert(schema.attempts).values({
    userId: input.userId,
    questionId: input.questionId,
    selectedChoiceId: input.selectedChoiceId,
    isCorrect: input.isCorrect,
    isOmitted: false,
    timeSpentSeconds: 1,
  });
}

async function markPracticeSessionStateGraded(input: {
  userId: string;
  questionId: string;
  selectedChoiceId: string;
  isCorrect: boolean;
}): Promise<void> {
  const sessions = new DrizzlePracticeSessionRepository(db);
  const session = await sessions.create({
    userId: input.userId,
    mode: 'exam',
    paramsJson: {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [input.questionId],
    },
  });

  await db
    .update(schema.practiceSessionQuestionStates)
    .set({
      latestSelectedChoiceId: input.selectedChoiceId,
      latestIsCorrect: input.isCorrect,
      latestAnsweredAt: new Date('2026-07-08T12:00:00.000Z'),
    })
    .where(
      and(
        eq(schema.practiceSessionQuestionStates.practiceSessionId, session.id),
        eq(schema.practiceSessionQuestionStates.questionId, input.questionId),
      ),
    );
}

async function readCorrectLabels(questionId: string): Promise<string[]> {
  const rows = await db
    .select({ label: schema.choices.label })
    .from(schema.choices)
    .where(
      and(
        eq(schema.choices.questionId, questionId),
        eq(schema.choices.isCorrect, true),
      ),
    )
    .orderBy(asc(schema.choices.sortOrder));

  return rows.map((row) => row.label);
}

describe('BUG-266 seed choice sync guard', () => {
  it('refuses to delete a choice referenced only by normalized practice-session draft state', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-seed-choice-sync-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const sessions = new DrizzlePracticeSessionRepository(db);
    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await db
      .update(schema.practiceSessionQuestionStates)
      .set({
        draftSelectedChoiceId: question.incorrectChoiceId,
        draftSavedAt: new Date('2026-06-30T12:00:00.000Z'),
        draftCumulativeMs: 1000,
      })
      .where(
        and(
          eq(
            schema.practiceSessionQuestionStates.practiceSessionId,
            session.id,
          ),
          eq(schema.practiceSessionQuestionStates.questionId, question.id),
        ),
      );

    await expect(
      syncQuestionsFromFiles(db, [
        {
          absolutePath: `${question.slug}.mdx`,
          raw: buildSeedQuestionWithRemovedChoice(question.slug),
        },
      ]),
    ).rejects.toThrow(
      `Refusing to delete choice ${question.incorrectChoiceId} (A) because it is referenced by an attempt or practice session state`,
    );
  });

  it('reports the domain guard when a choice becomes referenced after the preflight check but before delete', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-seed-choice-sync-race-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const { sql: blockerSql } = createIntegrationDb();
    const { db: writerDb, sql: writerSql } = createIntegrationDb();
    const { sql: monitorSql } = createIntegrationDb();
    const lockReady = createDeferred<number>();
    const releaseLock = createDeferred();

    const blocker = blockerSql.begin(async (tx) => {
      const [backend] = await tx<{ pid: number }[]>`
        SELECT pg_backend_pid()::int AS pid
      `;
      await tx`
        SELECT id
        FROM questions
        WHERE id = ${question.id}
        FOR NO KEY UPDATE
      `;
      lockReady.resolve(backend?.pid ?? 0);
      await releaseLock.promise;
    });

    const blockerPid = await lockReady.promise;
    const syncPromise = syncQuestionsFromFiles(db, [
      {
        absolutePath: `${question.slug}.mdx`,
        raw: buildSeedQuestionWithRemovedChoice(question.slug),
      },
    ]);

    try {
      await waitForBlockedQuestionLock({
        monitorSql,
        blockerPid,
      });

      await writerDb.insert(schema.attempts).values({
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.incorrectChoiceId,
        isCorrect: false,
        isOmitted: false,
        timeSpentSeconds: 1,
      });

      releaseLock.resolve();

      await expect(syncPromise).rejects.toThrow(
        `Refusing to delete choice ${question.incorrectChoiceId} (A) because it is referenced by an attempt or practice session state`,
      );
    } finally {
      releaseLock.resolve();
      await Promise.allSettled([blocker, syncPromise]);
      await Promise.allSettled([
        closeConnection(blockerSql),
        closeConnection(writerSql),
        closeConnection(monitorSql),
      ]);
    }
  });

  it('deletes an unreferenced choice inserted after the preflight choice read but before the transaction', async () => {
    const question = await createQuestion(db, cleanup, {
      slug: `it-seed-choice-sync-stale-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const { sql: blockerSql } = createIntegrationDb();
    const { db: writerDb, sql: writerSql } = createIntegrationDb();
    const { sql: monitorSql } = createIntegrationDb();
    const lockReady = createDeferred<number>();
    const releaseLock = createDeferred();

    const blocker = blockerSql.begin(async (tx) => {
      const [backend] = await tx<{ pid: number }[]>`
        SELECT pg_backend_pid()::int AS pid
      `;
      await tx`
        SELECT id
        FROM questions
        WHERE id = ${question.id}
        FOR NO KEY UPDATE
      `;
      lockReady.resolve(backend?.pid ?? 0);
      await releaseLock.promise;
    });

    const blockerPid = await lockReady.promise;
    const syncPromise = syncQuestionsFromFiles(db, [
      {
        absolutePath: `${question.slug}.mdx`,
        raw: buildSeedQuestionWithExistingChoices(question.slug),
      },
    ]);

    try {
      await waitForBlockedQuestionLock({
        monitorSql,
        blockerPid,
      });

      await writerDb.insert(schema.choices).values({
        questionId: question.id,
        label: 'D',
        textMd: 'Choice D',
        isCorrect: false,
        explanationMd: 'Choice D is not correct.',
        sortOrder: 3,
      });

      releaseLock.resolve();

      await expect(syncPromise).resolves.toEqual({
        inserted: 0,
        updated: 1,
        skipped: 0,
      });

      const labels = await db
        .select({ label: schema.choices.label })
        .from(schema.choices)
        .where(eq(schema.choices.questionId, question.id))
        .orderBy(asc(schema.choices.sortOrder));

      expect(labels).toEqual([{ label: 'A' }, { label: 'B' }]);
    } finally {
      releaseLock.resolve();
      await Promise.allSettled([blocker, syncPromise]);
      await Promise.allSettled([
        closeConnection(blockerSql),
        closeConnection(writerSql),
        closeConnection(monitorSql),
      ]);
    }
  });
});

describe('BUG-281 seed answer-key change guard', () => {
  it('refuses to flip the answer key when graded history exists and leaves the key unchanged', async () => {
    delete process.env.SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY;
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-seed-key-guard-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    await insertGradedAttempt({
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
    });
    await markPracticeSessionStateGraded({
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
    });

    await expect(
      syncQuestionsFromFiles(db, [
        {
          absolutePath: `/tmp/${question.slug}.mdx`,
          raw: buildSeedQuestionWithAnswerKey({
            slug: question.slug,
            correctLabel: 'A',
          }),
        },
      ]),
    ).rejects.toThrow(
      new RegExp(
        `Failed to sync seed question "${question.slug}".*Refusing to change answer key for "${question.slug}".*graded history exists.*attempts=1.*practiceSessionStates=1`,
      ),
    );

    await expect(readCorrectLabels(question.id)).resolves.toEqual(['B']);
  });

  it('allows an explicit override and logs the graded history it overrode', async () => {
    process.env.SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY = 'true';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-seed-key-override-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    await insertGradedAttempt({
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
    });

    await expect(
      syncQuestionsFromFiles(db, [
        {
          absolutePath: `/tmp/${question.slug}.mdx`,
          raw: buildSeedQuestionWithAnswerKey({
            slug: question.slug,
            correctLabel: 'A',
          }),
        },
      ]),
    ).resolves.toEqual({ inserted: 0, updated: 1, skipped: 0 });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `Overriding answer-key change for "${question.slug}"`,
      ),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('attempts=1'));
    await expect(readCorrectLabels(question.id)).resolves.toEqual(['A']);
  });

  it('allows a key flip when the question has no graded history', async () => {
    delete process.env.SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY;
    const question = await createQuestion(db, cleanup, {
      slug: `it-seed-key-ungraded-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    await expect(
      syncQuestionsFromFiles(db, [
        {
          absolutePath: `/tmp/${question.slug}.mdx`,
          raw: buildSeedQuestionWithAnswerKey({
            slug: question.slug,
            correctLabel: 'A',
          }),
        },
      ]),
    ).resolves.toEqual({ inserted: 0, updated: 1, skipped: 0 });

    await expect(readCorrectLabels(question.id)).resolves.toEqual(['A']);
  });

  it('allows text-only edits over graded history', async () => {
    delete process.env.SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY;
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-seed-key-text-only-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    await insertGradedAttempt({
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
    });

    await expect(
      syncQuestionsFromFiles(db, [
        {
          absolutePath: `/tmp/${question.slug}.mdx`,
          raw: buildSeedQuestionWithAnswerKey({
            slug: question.slug,
            correctLabel: 'B',
            choiceBText: 'Updated Choice B',
          }),
        },
      ]),
    ).resolves.toEqual({ inserted: 0, updated: 1, skipped: 0 });

    const [choiceB] = await db
      .select({ textMd: schema.choices.textMd })
      .from(schema.choices)
      .where(
        and(
          eq(schema.choices.questionId, question.id),
          eq(schema.choices.label, 'B'),
        ),
      );

    expect(choiceB?.textMd).toBe('Updated Choice B');
    await expect(readCorrectLabels(question.id)).resolves.toEqual(['B']);
  });

  it('stops the seed batch after a guarded key flip failure', async () => {
    delete process.env.SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY;
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-seed-key-batch-fail-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const skippedSlug = `it-seed-key-batch-skipped-${randomUUID()}`;
    await insertGradedAttempt({
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
    });

    await expect(
      syncQuestionsFromFiles(db, [
        {
          absolutePath: `/tmp/${question.slug}.mdx`,
          raw: buildSeedQuestionWithAnswerKey({
            slug: question.slug,
            correctLabel: 'A',
          }),
        },
        {
          absolutePath: `/tmp/${skippedSlug}.mdx`,
          raw: buildSeedQuestionWithAnswerKey({
            slug: skippedSlug,
            correctLabel: 'B',
          }),
        },
      ]),
    ).rejects.toThrow(`Failed to sync seed question "${question.slug}"`);

    const laterRows = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.slug, skippedSlug));

    expect(laterRows).toEqual([]);
  });
});

describe('BUG-270 seed choice reorder', () => {
  it('syncs an inserted choice whose final sort order is still held by a survivor row', async () => {
    const slug = `it-seed-choice-reorder-${randomUUID()}`;
    const question = await createQuestion(db, cleanup, {
      slug,
      status: 'published',
      difficulty: 'easy',
    });
    await db
      .update(schema.choices)
      .set({ label: 'C' })
      .where(eq(schema.choices.id, question.correctChoiceId));

    await expect(
      syncQuestionsFromFiles(db, [
        {
          absolutePath: `${slug}.mdx`,
          raw: buildSeedQuestionWithInsertedChoice(slug),
        },
      ]),
    ).resolves.toEqual({ inserted: 0, updated: 1, skipped: 0 });

    const choices = await db
      .select({
        label: schema.choices.label,
        sortOrder: schema.choices.sortOrder,
      })
      .from(schema.choices)
      .where(eq(schema.choices.questionId, question.id))
      .orderBy(asc(schema.choices.sortOrder));

    expect(choices).toEqual([
      { label: 'A', sortOrder: 1 },
      { label: 'B', sortOrder: 2 },
      { label: 'C', sortOrder: 3 },
    ]);
  });

  it('adds file context to seed failures and keeps later files untouched', async () => {
    const badSlug = `it-seed-choice-fail-${randomUUID()}`;
    const skippedSlug = `it-seed-choice-skipped-${randomUUID()}`;

    await expect(
      syncQuestionsFromFiles(db, [
        {
          absolutePath: `/tmp/${badSlug}.mdx`,
          raw: buildSeedQuestionWithInvalidTag(badSlug),
        },
        {
          absolutePath: `/tmp/${skippedSlug}.mdx`,
          raw: buildSeedQuestionWithInsertedChoice(skippedSlug),
        },
      ]),
    ).rejects.toThrow(
      new RegExp(`Failed to sync seed question "${badSlug}".*/tmp/${badSlug}`),
    );

    const laterRows = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.slug, skippedSlug));

    expect(laterRows).toEqual([]);
  });
});
