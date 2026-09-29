import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as schema from '@/db/schema';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';
import { source, waitForBlockedQuestionLock } from './seed-test-helpers';

// ADR-021 phase 2a, fourth increment: the seed refreshes a question's
// revision 1 only while no incomplete session binds it. #951's guard covers
// graded history; this covers a session whose item is not yet answered, so a
// correction waits for the session to end instead of changing under it.
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const ORIGINAL_ENV = snapshotProcessEnv();
const sessions = new DrizzlePracticeSessionRepository(db);

beforeEach(() => {
  vi.stubEnv('SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY', 'false');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  restoreProcessEnv(ORIGINAL_ENV);
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

async function arrangeSeededQuestion(label: string) {
  const question = await createQuestion(db, cleanup, {
    slug: `it-seed-wait-${label}-${randomUUID()}`,
    difficulty: 'easy',
    status: 'published',
  });
  await syncQuestionsFromFiles(db, [source(question.slug)]);
  return question;
}

// A session that includes the question and has not answered it, so #951's
// graded-history guard does not apply.
async function startSessionWith(questionId: string) {
  const user = await createUser(db, cleanup);
  return sessions.create({
    userId: user.id,
    mode: 'tutor',
    paramsJson: {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [questionId],
    },
  });
}

async function revisionSnapshot(questionId: string) {
  const [question] = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId));
  const [revision] = await db
    .select()
    .from(schema.questionRevisions)
    .where(eq(schema.questionRevisions.questionId, questionId));
  return { question, revision };
}

describe('ADR-021 phase 2a: the seed waits for incomplete sessions', () => {
  it('defers a rewrite while an incomplete session binds the revision, changing nothing', async () => {
    const question = await arrangeSeededQuestion('defer');
    await startSessionWith(question.id);
    const before = await revisionSnapshot(question.id);

    const counts = await syncQuestionsFromFiles(db, [
      source(question.slug, { stem: 'A corrected clinical task.' }),
    ]);

    expect(counts).toMatchObject({
      updated: 0,
      deferred: [{ slug: question.slug, sessions: 1 }],
    });
    expect(await revisionSnapshot(question.id)).toEqual(before);
  });

  it('defers a difficulty-only change, which #951 does not count as content', async () => {
    const question = await arrangeSeededQuestion('difficulty');
    await startSessionWith(question.id);

    const counts = await syncQuestionsFromFiles(db, [
      source(question.slug, { difficulty: 'hard' }),
    ]);

    expect(counts.deferred).toEqual([{ slug: question.slug, sessions: 1 }]);
    expect((await revisionSnapshot(question.id)).revision?.difficulty).toBe(
      'easy',
    );
  });

  it('applies the rewrite once the session has ended', async () => {
    const question = await arrangeSeededQuestion('ended');
    const session = await startSessionWith(question.id);
    await sessions.end(session.id, session.userId);

    const counts = await syncQuestionsFromFiles(db, [
      source(question.slug, { stem: 'A corrected clinical task.' }),
    ]);

    expect(counts).toMatchObject({ updated: 1, deferred: [] });
    expect((await revisionSnapshot(question.id)).revision?.stemMd).toBe(
      'A corrected clinical task.',
    );
  });

  it('makes session creation wait for a seed transaction holding the question row', async () => {
    // A seed transaction locks the question row before counting sessions, so
    // a session that reads the revision unlocked could bind it just after the
    // count and see the refresh (#1208 review). Creation must wait.
    const question = await arrangeSeededQuestion('race');
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

  it('still applies the run’s other questions', async () => {
    const waiting = await arrangeSeededQuestion('waiting');
    const free = await arrangeSeededQuestion('free');
    await startSessionWith(waiting.id);

    const counts = await syncQuestionsFromFiles(db, [
      source(waiting.slug, { stem: 'A corrected clinical task.' }),
      source(free.slug, { stem: 'A corrected clinical task.' }),
    ]);

    expect(counts).toMatchObject({
      updated: 1,
      deferred: [{ slug: waiting.slug, sessions: 1 }],
    });
    expect((await revisionSnapshot(free.id)).revision?.stemMd).toBe(
      'A corrected clinical task.',
    );
  });
});
