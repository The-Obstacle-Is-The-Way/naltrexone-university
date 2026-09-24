import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { ApplicationError } from '@/src/application/errors';
import { FakePracticeSessionRepository } from '@/src/application/test-helpers/fakes';
import { createPracticeSession } from '@/src/domain/test-helpers';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

// Real-Postgres twins for the retired session-write units: the create input
// guard, discard scoping, and end() with its clock, explicit timestamp,
// snapshot, guarded-update fallbacks and fake-parity contract.
const { db, sql } = createIntegrationDb();
// A second session plays the concurrent writer for the end() fallbacks.
const concurrent = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(concurrent.sql);
  await closeConnection(sql);
});

async function createSessionFixture(now?: () => Date) {
  const user = await createUser(db, cleanup);
  const first = await createQuestion(db, cleanup, {
    slug: `it-ps-writes-first-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
  const second = await createQuestion(db, cleanup, {
    slug: `it-ps-writes-second-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
  const repo = new DrizzlePracticeSessionRepository(db, now);
  const session = await repo.create({
    userId: user.id,
    mode: 'tutor',
    paramsJson: {
      count: 2,
      tagSlugs: [],
      difficulties: [],
      questionIds: [first.id, second.id],
    },
  });
  return { user, first, second, repo, session };
}

async function storedSession(id: string) {
  const [row] = await db
    .select({
      id: schema.practiceSessions.id,
      endedAt: schema.practiceSessions.endedAt,
    })
    .from(schema.practiceSessions)
    .where(eq(schema.practiceSessions.id, id));
  return row ?? null;
}

async function storedStateCount(sessionId: string) {
  const rows = await db
    .select({ id: schema.practiceSessionQuestionStates.id })
    .from(schema.practiceSessionQuestionStates)
    .where(
      eq(schema.practiceSessionQuestionStates.practiceSessionId, sessionId),
    );
  return rows.length;
}

// Defers execution of an awaited Drizzle query chain until `before` resolves.
function deferUntil<T extends object>(
  target: T,
  before: () => Promise<void>,
): T {
  return new Proxy(target, {
    get(obj, property, receiver) {
      const value = Reflect.get(obj, property, receiver);
      if (property === 'then') {
        if (typeof value !== 'function') return value;
        return (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) =>
          before()
            .then(
              () =>
                new Promise((resolve, reject) => {
                  value.call(obj, resolve, reject);
                }),
            )
            .then(onFulfilled, onRejected);
      }
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const result = value.apply(obj, args);
        return result !== null && typeof result === 'object'
          ? deferUntil(result, before)
          : result;
      };
    },
  });
}

// Runs `beforeUpdate` immediately before the guarded UPDATE that end() issues
// on the root connection after its repeatable-read snapshot.
function interleaveBeforeRootUpdate(
  target: DrizzleDb,
  beforeUpdate: () => Promise<void>,
): DrizzleDb {
  return new Proxy(target, {
    get(obj, property, receiver) {
      const value = Reflect.get(obj, property, receiver);
      if (property === 'update' && typeof value === 'function') {
        return (...args: unknown[]) =>
          deferUntil(value.apply(obj, args) as object, beforeUpdate);
      }
      return value;
    },
  });
}

describe('DrizzlePracticeSessionRepository create', () => {
  it('returns the mapped session and stores the initial question states', async () => {
    const user = await createUser(db, cleanup);
    const first = await createQuestion(db, cleanup, {
      slug: `it-ps-create-first-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const second = await createQuestion(db, cleanup, {
      slug: `it-ps-create-second-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
    });
    const repo = new DrizzlePracticeSessionRepository(db);

    const created = await repo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: ['opioids'],
        difficulties: ['easy', 'hard'],
        questionIds: [first.id, second.id],
      },
    });

    const initialState = (questionId: string) => ({
      questionId,
      markedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      latestAnsweredAt: null,
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
    });
    expect(created).toEqual({
      id: expect.any(String),
      userId: user.id,
      mode: 'exam',
      questionIds: [first.id, second.id],
      questionStates: [initialState(first.id), initialState(second.id)],
      tagFilters: ['opioids'],
      difficultyFilters: ['easy', 'hard'],
      startedAt: expect.any(Date),
      endedAt: null,
    });
    const stored = await db
      .select({
        questionId: schema.practiceSessionQuestionStates.questionId,
        position: schema.practiceSessionQuestionStates.position,
        markedForReview: schema.practiceSessionQuestionStates.markedForReview,
        latestSelectedChoiceId:
          schema.practiceSessionQuestionStates.latestSelectedChoiceId,
        draftCumulativeMs:
          schema.practiceSessionQuestionStates.draftCumulativeMs,
        version: schema.practiceSessionQuestionStates.version,
      })
      .from(schema.practiceSessionQuestionStates)
      .where(
        eq(schema.practiceSessionQuestionStates.practiceSessionId, created.id),
      )
      .orderBy(asc(schema.practiceSessionQuestionStates.position));
    expect(stored).toEqual([
      {
        questionId: first.id,
        position: 0,
        markedForReview: false,
        latestSelectedChoiceId: null,
        draftCumulativeMs: 0,
        version: 0,
      },
      {
        questionId: second.id,
        position: 1,
        markedForReview: false,
        latestSelectedChoiceId: null,
        draftCumulativeMs: 0,
        version: 0,
      },
    ]);
  });
});

describe('DrizzlePracticeSessionRepository create guard', () => {
  it('returns VALIDATION_ERROR for invalid paramsJson without issuing a statement', async () => {
    const user = await createUser(db, cleanup);
    const repo = new DrizzlePracticeSessionRepository(db);
    const execute = vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');

    await expect(
      repo.create({
        userId: user.id,
        mode: 'tutor',
        paramsJson: { count: 'two', questionIds: 'not-a-list' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('DrizzlePracticeSessionRepository discard', () => {
  it('deletes an incomplete session and its question states', async () => {
    const fixture = await createSessionFixture();

    await expect(
      fixture.repo.discard(fixture.session.id, fixture.user.id),
    ).resolves.toBeUndefined();

    await expect(storedSession(fixture.session.id)).resolves.toBeNull();
    await expect(storedStateCount(fixture.session.id)).resolves.toBe(0);
  });

  it("leaves another user's session and its states untouched", async () => {
    const fixture = await createSessionFixture();
    const other = await createUser(db, cleanup);

    await expect(
      fixture.repo.discard(fixture.session.id, other.id),
    ).resolves.toBeUndefined();

    await expect(storedSession(fixture.session.id)).resolves.toMatchObject({
      id: fixture.session.id,
    });
    await expect(storedStateCount(fixture.session.id)).resolves.toBe(2);
  });

  it('leaves an ended session and its states untouched', async () => {
    const fixture = await createSessionFixture();
    const ended = await fixture.repo.end(fixture.session.id, fixture.user.id);

    await expect(
      fixture.repo.discard(fixture.session.id, fixture.user.id),
    ).resolves.toBeUndefined();

    await expect(storedSession(fixture.session.id)).resolves.toMatchObject({
      id: fixture.session.id,
      endedAt: ended.endedAt,
    });
    await expect(storedStateCount(fixture.session.id)).resolves.toBe(2);
  });
});

describe('DrizzlePracticeSessionRepository end', () => {
  it('throws NOT_FOUND when the snapshot has no practice session', async () => {
    const fixture = await createSessionFixture();

    await expect(
      fixture.repo.end(randomUUID(), fixture.user.id),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Practice session not found',
    });
  });

  it('stamps the injected clock and returns the snapshot loaded before the update', async () => {
    const now = new Date('2026-03-02T09:00:00.000Z');
    const fixture = await createSessionFixture(() => now);
    const answeredAt = new Date('2026-03-02T08:59:00.000Z');
    await fixture.repo.recordQuestionAnswer({
      sessionId: fixture.session.id,
      userId: fixture.user.id,
      questionId: fixture.first.id,
      selectedChoiceId: fixture.first.correctChoiceId,
      isCorrect: true,
      answeredAt,
    });

    const ended = await fixture.repo.end(fixture.session.id, fixture.user.id);

    expect(ended).toMatchObject({
      id: fixture.session.id,
      userId: fixture.user.id,
      endedAt: now,
    });
    expect(ended.questionStates).toEqual([
      expect.objectContaining({
        questionId: fixture.first.id,
        latestSelectedChoiceId: fixture.first.correctChoiceId,
        latestIsCorrect: true,
        latestAnsweredAt: answeredAt,
      }),
      expect.objectContaining({
        questionId: fixture.second.id,
        latestSelectedChoiceId: null,
      }),
    ]);
    await expect(storedSession(fixture.session.id)).resolves.toMatchObject({
      endedAt: now,
    });
  });

  it('uses an explicit endedAt without consulting the clock', async () => {
    const fixture = await createSessionFixture(() => {
      throw new Error('clock must not be consulted for an explicit endedAt');
    });
    const explicitEndedAt = new Date('2026-03-02T09:30:00.000Z');

    const ended = await fixture.repo.end(
      fixture.session.id,
      fixture.user.id,
      explicitEndedAt,
    );

    expect(ended.endedAt).toEqual(explicitEndedAt);
    await expect(storedSession(fixture.session.id)).resolves.toMatchObject({
      endedAt: explicitEndedAt,
    });
  });

  it('reports CONFLICT when a concurrent end commits between the snapshot and the guarded update', async () => {
    const fixture = await createSessionFixture();
    const concurrentEndedAt = new Date('2026-03-02T10:00:00.000Z');
    const hooked = new DrizzlePracticeSessionRepository(
      interleaveBeforeRootUpdate(db, async () => {
        await concurrent.sql`
          update practice_sessions
          set ended_at = ${concurrentEndedAt.toISOString()}::timestamptz
          where id = ${fixture.session.id}
        `;
      }),
    );

    await expect(
      hooked.end(fixture.session.id, fixture.user.id),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
    });
    await expect(storedSession(fixture.session.id)).resolves.toMatchObject({
      endedAt: concurrentEndedAt,
    });
  });

  it('reports NOT_FOUND when the session disappears between the snapshot and the guarded update', async () => {
    const fixture = await createSessionFixture();
    const hooked = new DrizzlePracticeSessionRepository(
      interleaveBeforeRootUpdate(db, async () => {
        await concurrent.sql`
          delete from practice_sessions where id = ${fixture.session.id}
        `;
      }),
    );

    await expect(
      hooked.end(fixture.session.id, fixture.user.id),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Practice session not found',
    });
  });

  it('matches the fake already-ended end error contract', async () => {
    const fixture = await createSessionFixture();
    const ended = await fixture.repo.end(fixture.session.id, fixture.user.id);
    const fakeRepository = new FakePracticeSessionRepository([
      createPracticeSession({
        id: fixture.session.id,
        userId: fixture.user.id,
        mode: 'tutor',
        endedAt: ended.endedAt,
      }),
    ]);

    const results = await Promise.allSettled([
      fixture.repo.end(fixture.session.id, fixture.user.id),
      fakeRepository.end(fixture.session.id, fixture.user.id),
    ]);

    const shapes = results.map((result) => {
      expect(result.status).toBe('rejected');
      if (result.status !== 'rejected') {
        throw new Error('Expected already-ended end() to reject');
      }
      expect(result.reason).toBeInstanceOf(ApplicationError);
      const error = result.reason as ApplicationError;
      expect(error).toMatchObject({
        code: 'CONFLICT',
        message: 'Practice session already ended',
      });
      expect(error.details).toBeUndefined();
      return { code: error.code, message: error.message };
    });
    expect(shapes[1]).toEqual(shapes[0]);
  });
});
