import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
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

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

function source(slug: string, status: schema.QuestionStatus = 'published') {
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
      'A synthetic withdrawal task.',
      '## Explanation',
      'A synthetic withdrawal explanation.',
      '### Reference',
      'Synthetic citation.',
    ].join('\n'),
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
  return { question, choices, attempts, tags };
}

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

    const result = withdraw(['--qid', question.slug]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('dry-run');
    expect(result.stdout).toContain(question.slug);
    expect(result.stdout).toContain('archive=1');
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
      '--apply',
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('archived=2');
    const after = await snapshot(first.id);
    expect(after).toEqual({
      ...before,
      question: {
        ...before.question,
        status: 'archived',
        updatedAt: expect.any(Date),
      },
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
      '--apply',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Unknown question QID: ${unknown}`);
    expect(await snapshot(question.id)).toEqual(before);
  });

  it('replays withdrawal without changing archived rows again', async () => {
    const question = await arrangeQuestion(true);
    await syncQuestionsFromFiles(db, [source(question.slug, 'archived')]);
    const before = await snapshot(question.id);

    const result = withdraw(['--qid', question.slug, '--apply']);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('archived=0');
    expect(result.stdout).toContain('alreadyArchived=1');
    expect(await snapshot(question.id)).toEqual(before);
  });

  it.each([
    [[], /At least one --qid/],
    [['--qid'], /Missing value for --qid/],
    [['--qid', '*', '--apply'], /Invalid question QID/],
    [['--qid', 'same-id', '--qid', 'same-id'], /Duplicate question QID/],
    [['--qid', 'valid-id', '--all'], /Unknown argument/],
  ] as const)('rejects ambiguous arguments %j', (args, error) => {
    const result = withdraw([...args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(error);
  });

  it('requires an explicit database target without dotenv fallback', () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const result = withdraw(['--qid', 'valid-id', '--apply'], env);
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
  });
  expect(await snapshot(question.id)).toEqual(before);
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
    await syncQuestionsFromFiles(db, [source(question.slug, 'archived')]);
    const before = await snapshot(question.id);
    const file = source(question.slug);
    if (dedicatedPath) {
      file.absolutePath = path.resolve(
        'content/questions/placeholder',
        `${question.slug}.mdx`,
      );
    }
    const sync = syncQuestionsFromFiles(db, [file]);
    if (dedicatedPath && prefix) {
      await expect(sync).resolves.toEqual({
        inserted: 0,
        updated: 1,
        skipped: 0,
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
