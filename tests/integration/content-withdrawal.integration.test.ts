import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import {
  answeredRevisionIdOf,
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

function source(
  slug: string,
  status: schema.QuestionStatus = 'published',
  stem = 'A synthetic withdrawal task.',
) {
  return {
    absolutePath: `/tmp/${slug}.mdx`,
    raw: [
      '---',
      `slug: ${slug}`,
      'difficulty: easy',
      `status: ${status}`,
      'tags:',
      '  - {slug: general, name: General, kind: topic}',
      '  - {slug: alcohol, name: Alcohol, kind: substance}',
      'choices:',
      '  - {label: A, text: Choice A, correct: false, explanation: Wrong option.}',
      '  - {label: B, text: Choice B, correct: true}',
      '---',
      '## Stem',
      stem,
      '## Explanation',
      'A synthetic withdrawal explanation.',
      '### Reference',
      'Synthetic citation.',
    ].join('\n'),
  };
}

// The same file under the synthetic placeholder directory.
function placeholderSource(
  slug: string,
  status: schema.QuestionStatus = 'published',
) {
  return {
    ...source(slug, status),
    absolutePath: path.resolve('content/questions/placeholder', `${slug}.mdx`),
  };
}

async function arrangeQuestion(
  graded = false,
  slug = `it-withdraw-${randomUUID()}`,
) {
  const question = await createQuestion(db, cleanup, {
    slug,
    status: 'published',
    difficulty: 'easy',
  });
  await syncQuestionsFromFiles(db, [source(question.slug)]);
  if (graded) {
    const user = await createUser(db, cleanup);
    await db.insert(schema.attempts).values({
      userId: user.id,
      questionId: question.id,
      questionRevisionId: await answeredRevisionIdOf(
        db,
        question.id,
        question.correctChoiceId,
      ),
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      isOmitted: false,
      timeSpentSeconds: 1,
    });
  }
  return question;
}

async function snapshot(questionId: string) {
  const [question] = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId));
  const choices = await db
    .select()
    .from(schema.choices)
    .where(eq(schema.choices.questionId, questionId))
    .orderBy(schema.choices.label);
  const attempts = await db
    .select()
    .from(schema.attempts)
    .where(eq(schema.attempts.questionId, questionId));
  const tags = await db
    .select()
    .from(schema.questionTags)
    .where(eq(schema.questionTags.questionId, questionId))
    .orderBy(schema.questionTags.tagId);
  const withdrawals = await db
    .select()
    .from(schema.questionWithdrawals)
    .where(eq(schema.questionWithdrawals.questionId, questionId))
    .orderBy(schema.questionWithdrawals.questionRevisionId);
  return { question, choices, attempts, tags, withdrawals };
}

// One withdrawal per revision of the question, as snapshot() orders them.
async function withdrawalsOfEveryRevision(
  questionId: string,
  record: { reason: string; authority: string },
) {
  const revisions = await db
    .select({ id: schema.questionRevisions.id })
    .from(schema.questionRevisions)
    .where(eq(schema.questionRevisions.questionId, questionId))
    .orderBy(schema.questionRevisions.id);
  return revisions.map((revision) => ({
    questionId,
    questionRevisionId: revision.id,
    ...record,
    effectiveAt: expect.any(Date),
  }));
}

const ORDER = { reason: 'Unsafe dosing guidance', authority: 'Clinical lead' };
const ORDER_ARGS = ['--reason', ORDER.reason, '--authority', ORDER.authority];
const SEED_RECORD = {
  reason: 'archived in seed input',
  authority: 'content seed',
};

function withdraw(args: string[], env = process.env) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/seed/withdraw-questions.ts', ...args],
    { encoding: 'utf8', env },
  );
}

describe('explicit content withdrawal command', () => {
  it('previews an explicit QID without changing any stored rows', async () => {
    const question = await arrangeQuestion(true);
    const before = await snapshot(question.id);

    const result = withdraw(['--qid', question.slug, ...ORDER_ARGS]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('dry-run');
    expect(result.stdout).toContain(question.slug);
    expect(result.stdout).toContain(ORDER.reason);
    expect(result.stdout).toContain(ORDER.authority);
    expect(result.stdout).toContain('archive=1');
    expect(result.stdout).toContain('revisionsToWithdraw=2');
    expect(await snapshot(question.id)).toEqual(before);
  });

  it('archives only explicitly named QIDs and preserves stored content/history', async () => {
    const first = await arrangeQuestion(true);
    const second = await arrangeQuestion();
    const untouched = await arrangeQuestion();
    const before = await snapshot(first.id);
    const untouchedBefore = await snapshot(untouched.id);

    const result = withdraw([
      '--qid',
      first.slug,
      '--qid',
      second.slug,
      ...ORDER_ARGS,
      '--apply',
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('archived=2');
    expect(result.stdout).toContain('revisionsWithdrawn=4');
    const after = await snapshot(first.id);
    expect(before.withdrawals).toEqual([]);
    expect(after).toEqual({
      ...before,
      question: {
        ...before.question,
        status: 'archived',
        updatedAt: expect.any(Date),
      },
      withdrawals: await withdrawalsOfEveryRevision(first.id, ORDER),
    });
    expect((await snapshot(second.id)).question?.status).toBe('archived');
    expect(await snapshot(untouched.id)).toEqual(untouchedBefore);
  });

  it('rejects an unknown QID without partially archiving the known QID', async () => {
    const question = await arrangeQuestion(true);
    const before = await snapshot(question.id);
    const unknown = `it-missing-${randomUUID()}`;

    const result = withdraw([
      '--qid',
      question.slug,
      '--qid',
      unknown,
      ...ORDER_ARGS,
      '--apply',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Unknown question QID: ${unknown}`);
    expect(await snapshot(question.id)).toEqual(before);
  });

  it('replays withdrawal without changing archived rows or their first record', async () => {
    const question = await arrangeQuestion(true);
    await syncQuestionsFromFiles(db, [source(question.slug, 'archived')]);
    const before = await snapshot(question.id);

    const result = withdraw(['--qid', question.slug, ...ORDER_ARGS, '--apply']);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('archived=0');
    expect(result.stdout).toContain('alreadyArchived=1');
    expect(result.stdout).toContain('revisionsWithdrawn=0');
    expect(await snapshot(question.id)).toEqual(before);
  });

  // An archive made by code older than migration 0045 recorded no withdrawal.
  it('records the withdrawal of a question archived without one', async () => {
    const question = await arrangeQuestion(true);
    await db
      .update(schema.questions)
      .set({ status: 'archived' })
      .where(eq(schema.questions.id, question.id));
    const before = await snapshot(question.id);

    const result = withdraw(['--qid', question.slug, ...ORDER_ARGS, '--apply']);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('alreadyArchived=1');
    expect(result.stdout).toContain('revisionsWithdrawn=2');
    expect(await snapshot(question.id)).toEqual({
      ...before,
      withdrawals: await withdrawalsOfEveryRevision(question.id, ORDER),
    });
  });

  it.each([
    [[], /At least one --qid/],
    [['--qid'], /Missing value for --qid/],
    [['--qid', '*', '--apply'], /Invalid question QID/],
    [['--qid', 'same-id', '--qid', 'same-id'], /Duplicate question QID/],
    [['--qid', 'valid-id', '--all'], /Unknown argument/],
    [['--qid', 'valid-id', '--authority', 'Owner'], /--reason is required/],
    [['--qid', 'valid-id', '--reason', 'Unsafe'], /--authority is required/],
    [
      ['--qid', 'valid-id', '--reason', '--apply'],
      /Missing value for --reason/,
    ],
    [
      ['--qid', 'valid-id', '--authority', ' '],
      /Missing value for --authority/,
    ],
    [
      ['--qid', 'valid-id', '--reason', 'A', '--reason', 'B'],
      /Duplicate --reason/,
    ],
  ] as const)('rejects ambiguous arguments %j', (args, error) => {
    const result = withdraw([...args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(error);
  });

  it('requires an explicit database target without dotenv fallback', () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const result = withdraw(
      ['--qid', 'valid-id', ...ORDER_ARGS, '--apply'],
      env,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('An explicit DATABASE_URL is required');
  });
});

describe.each([false, true])(
  'stale seed after withdrawal (graded=%s)',
  (graded) => {
    it.each(['draft', 'published'] as const)(
      'refuses an archived-to-%s transition without changing rows',
      async (status) => {
        const question = await arrangeQuestion(graded);
        await syncQuestionsFromFiles(db, [source(question.slug, 'archived')]);
        const before = await snapshot(question.id);

        await expect(
          syncQuestionsFromFiles(db, [source(question.slug, status)]),
        ).rejects.toThrow(/Refusing to reactivate archived question/);

        expect(await snapshot(question.id)).toEqual(before);
      },
    );
  },
);

it('keeps an unchanged archived seed idempotent', async () => {
  const question = await arrangeQuestion(true);
  const file = source(question.slug, 'archived');
  await syncQuestionsFromFiles(db, [file]);
  const before = await snapshot(question.id);
  await expect(syncQuestionsFromFiles(db, [file])).resolves.toEqual({
    inserted: 0,
    updated: 0,
    skipped: 1,
    revised: 0,
  });
  expect(await snapshot(question.id)).toEqual(before);
});

describe('seed withdrawal records', () => {
  it('records every revision when seed input archives a question', async () => {
    const question = await arrangeQuestion(true);

    await syncQuestionsFromFiles(db, [source(question.slug, 'archived')]);

    expect((await snapshot(question.id)).withdrawals).toEqual(
      await withdrawalsOfEveryRevision(question.id, SEED_RECORD),
    );
  });

  it('records a revision appended to an archived question', async () => {
    const question = await arrangeQuestion();
    await syncQuestionsFromFiles(db, [source(question.slug, 'archived')]);

    await expect(
      syncQuestionsFromFiles(db, [
        source(question.slug, 'archived', 'A corrected withdrawal task.'),
      ]),
    ).resolves.toMatchObject({ revised: 1 });

    expect((await snapshot(question.id)).withdrawals).toEqual(
      await withdrawalsOfEveryRevision(question.id, SEED_RECORD),
    );
  });

  // An archive made by code older than migration 0045 recorded no withdrawal.
  it('records an archived question without one when its unchanged seed is replayed', async () => {
    const question = await arrangeQuestion();
    await db
      .update(schema.questions)
      .set({ status: 'archived' })
      .where(eq(schema.questions.id, question.id));

    await expect(
      syncQuestionsFromFiles(db, [source(question.slug, 'archived')]),
    ).resolves.toMatchObject({ skipped: 1 });

    expect((await snapshot(question.id)).withdrawals).toEqual(
      await withdrawalsOfEveryRevision(question.id, SEED_RECORD),
    );
  });

  it('records a question first seeded as archived', async () => {
    const slug = `it-withdraw-${randomUUID()}`;

    await expect(
      syncQuestionsFromFiles(db, [source(slug, 'archived')]),
    ).resolves.toMatchObject({ inserted: 1 });

    const [inserted] = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.slug, slug));
    if (!inserted) throw new Error(`Seed did not insert ${slug}`);
    cleanup.questionIds.push(inserted.id);
    expect((await snapshot(inserted.id)).withdrawals).toEqual(
      await withdrawalsOfEveryRevision(inserted.id, SEED_RECORD),
    );
  });

  it('refuses to restore a withdrawn synthetic placeholder', async () => {
    const question = await arrangeQuestion(
      false,
      `placeholder-withdraw-${randomUUID()}`,
    );
    const result = withdraw(['--qid', question.slug, ...ORDER_ARGS, '--apply']);
    expect(result.status, result.stderr).toBe(0);
    const before = await snapshot(question.id);

    await expect(
      syncQuestionsFromFiles(db, [placeholderSource(question.slug)]),
    ).rejects.toThrow(/Refusing to reactivate withdrawn question/);

    expect(await snapshot(question.id)).toEqual(before);
  });
});

it.each([
  ['dedicated path and prefix', true, true],
  ['prefix only', false, true],
  ['path only', true, false],
] as const)(
  'reserves synthetic placeholder restoration for %s',
  async (_name, dedicatedPath, prefix) => {
    const question = await arrangeQuestion(
      false,
      `${prefix ? 'placeholder' : 'it'}-withdraw-${randomUUID()}`,
    );
    const file = (status: schema.QuestionStatus) =>
      dedicatedPath
        ? placeholderSource(question.slug, status)
        : source(question.slug, status);
    await syncQuestionsFromFiles(db, [file('archived')]);
    const before = await snapshot(question.id);
    // Only authored content records a withdrawal when the seed archives it.
    expect(before.withdrawals).toEqual(
      dedicatedPath && prefix
        ? []
        : await withdrawalsOfEveryRevision(question.id, SEED_RECORD),
    );
    const sync = syncQuestionsFromFiles(db, [file('published')]);
    if (dedicatedPath && prefix) {
      await expect(sync).resolves.toEqual({
        inserted: 0,
        updated: 1,
        skipped: 0,
        revised: 0,
      });
      expect((await snapshot(question.id)).question?.status).toBe('published');
    } else {
      await expect(sync).rejects.toThrow(
        /Refusing to reactivate archived question/,
      );
      expect(await snapshot(question.id)).toEqual(before);
    }
  },
);

it('observes archival committed while seed waits for the question lock', async () => {
  const question = await arrangeQuestion(true);
  const { sql: withdrawalSql } = createIntegrationDb();
  const { sql: monitorSql } = createIntegrationDb();
  const ready = Promise.withResolvers<number>();
  const release = Promise.withResolvers<void>();
  const withdrawal = withdrawalSql.begin(async (tx) => {
    const [backend] = await tx<{ pid: number }[]>`
      SELECT pg_backend_pid()::int AS pid
    `;
    await tx`UPDATE questions SET status = 'archived' WHERE id = ${question.id}`;
    ready.resolve(backend?.pid ?? 0);
    await release.promise;
  });
  const pid = await ready.promise;
  const seed = syncQuestionsFromFiles(db, [source(question.slug)]);
  try {
    await expect
      .poll(async () => {
        const [row] = await monitorSql<{ blocked: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE ${pid} = ANY(pg_blocking_pids(pid))
        ) AS blocked
      `;
        return row?.blocked;
      })
      .toBe(true);
    release.resolve();
    await expect(seed).rejects.toThrow(
      /Refusing to reactivate archived question/,
    );
    expect((await snapshot(question.id)).question?.status).toBe('archived');
  } finally {
    release.resolve();
    await Promise.allSettled([withdrawal, seed]);
    await Promise.allSettled([
      closeConnection(withdrawalSql),
      closeConnection(monitorSql),
    ]);
  }
});
