import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { answeredOutcome, omittedOutcome } from '@/src/domain/value-objects';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

// Real-Postgres twins for the retired question-state write units: not-found,
// ended-session and missing-state paths, draft finalization, and the
// optimistic version retry loop driven by a concurrent writer.
const { db, sql } = createIntegrationDb();
// A second session plays the concurrent writer; the pooled client above holds
// a single connection that the attempt transaction under test reserves.
const concurrent = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(concurrent.sql);
  await closeConnection(sql);
});

async function createSessionFixture() {
  const user = await createUser(db, cleanup);
  const first = await createQuestion(db, cleanup, {
    slug: `it-qs-writes-first-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
  const second = await createQuestion(db, cleanup, {
    slug: `it-qs-writes-second-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
  const foreign = await createQuestion(db, cleanup, {
    slug: `it-qs-writes-foreign-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
  const repo = new DrizzlePracticeSessionRepository(db);
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
  return { user, first, second, foreign, repo, session };
}

function answerInput(
  fixture: Awaited<ReturnType<typeof createSessionFixture>>,
  questionId: string,
) {
  return {
    sessionId: fixture.session.id,
    userId: fixture.user.id,
    questionId,
    selectedChoiceId: fixture.first.correctChoiceId,
    isCorrect: true,
    answeredAt: new Date('2026-03-01T10:00:00.000Z'),
  };
}

async function stateRow(sessionId: string, questionId: string) {
  const [row] = await db
    .select()
    .from(schema.practiceSessionQuestionStates)
    .where(
      and(
        eq(schema.practiceSessionQuestionStates.practiceSessionId, sessionId),
        eq(schema.practiceSessionQuestionStates.questionId, questionId),
      ),
    );
  if (!row) throw new Error('Expected a normalized question state row');
  return row;
}

describe('DrizzlePracticeSessionRepository question-state writes', () => {
  it('throws NOT_FOUND when the session does not exist', async () => {
    const fixture = await createSessionFixture();

    await expect(
      fixture.repo.recordQuestionAnswer({
        ...answerInput(fixture, fixture.first.id),
        sessionId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Practice session not found',
    });
  });

  it('throws NOT_FOUND when the question is not part of an active session', async () => {
    const fixture = await createSessionFixture();

    await expect(
      fixture.repo.recordQuestionAnswer(
        answerInput(fixture, fixture.foreign.id),
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Question is not part of this practice session',
    });
  });

  it('throws CONFLICT when the loaded session has already ended', async () => {
    const fixture = await createSessionFixture();
    await fixture.repo.end(fixture.session.id, fixture.user.id);

    await expect(
      fixture.repo.recordQuestionAnswer(answerInput(fixture, fixture.first.id)),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
    });
  });

  it('keeps CONFLICT for an ended session when the missing question is not part of the session', async () => {
    const fixture = await createSessionFixture();
    await fixture.repo.end(fixture.session.id, fixture.user.id);

    await expect(
      fixture.repo.recordQuestionAnswer(
        answerInput(fixture, fixture.foreign.id),
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
    });
  });

  it('throws INTERNAL_ERROR when a session-owned question is missing normalized state', async () => {
    const fixture = await createSessionFixture();
    await db
      .delete(schema.practiceSessionQuestionStates)
      .where(
        and(
          eq(
            schema.practiceSessionQuestionStates.practiceSessionId,
            fixture.session.id,
          ),
          eq(schema.practiceSessionQuestionStates.questionId, fixture.first.id),
        ),
      );

    await expect(
      fixture.repo.recordQuestionAnswer(answerInput(fixture, fixture.first.id)),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: `Practice session ${fixture.session.id} is missing normalized question state`,
    });
  });

  it('throws INTERNAL_ERROR over CONFLICT when an ended session is missing state for a session-owned question', async () => {
    const fixture = await createSessionFixture();
    await fixture.repo.end(fixture.session.id, fixture.user.id);
    await db
      .delete(schema.practiceSessionQuestionStates)
      .where(
        and(
          eq(
            schema.practiceSessionQuestionStates.practiceSessionId,
            fixture.session.id,
          ),
          eq(schema.practiceSessionQuestionStates.questionId, fixture.first.id),
        ),
      );

    await expect(
      fixture.repo.recordQuestionAnswer(answerInput(fixture, fixture.first.id)),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: `Practice session ${fixture.session.id} is missing normalized question state`,
    });
  });

  it('finalizes a draft answer into the latest fields and clears the draft snapshot', async () => {
    const fixture = await createSessionFixture();
    const answeredAt = new Date('2026-03-01T10:05:00.000Z');
    await fixture.repo.saveDraftAnswer({
      sessionId: fixture.session.id,
      userId: fixture.user.id,
      questionId: fixture.first.id,
      selectedChoiceId: fixture.first.incorrectChoiceId,
      cumulativeMs: 1_200,
    });

    const finalized = await fixture.repo.finalizeDraftAnswer({
      sessionId: fixture.session.id,
      userId: fixture.user.id,
      questionId: fixture.first.id,
      outcome: answeredOutcome(fixture.first.correctChoiceId),
      isCorrect: true,
      answeredAt,
    });

    expect(finalized).toMatchObject({
      questionId: fixture.first.id,
      latestSelectedChoiceId: fixture.first.correctChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
    });
    const stored = await stateRow(fixture.session.id, fixture.first.id);
    expect(stored).toMatchObject({
      latestSelectedChoiceId: fixture.first.correctChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
    });
  });

  it('finalizes an omitted answer with no selected choice', async () => {
    const fixture = await createSessionFixture();
    const answeredAt = new Date('2026-03-01T10:06:00.000Z');

    const finalized = await fixture.repo.finalizeDraftAnswer({
      sessionId: fixture.session.id,
      userId: fixture.user.id,
      questionId: fixture.second.id,
      outcome: omittedOutcome(),
      isCorrect: false,
      answeredAt,
    });

    expect(finalized).toMatchObject({
      questionId: fixture.second.id,
      latestSelectedChoiceId: null,
      latestIsCorrect: false,
      latestAnsweredAt: answeredAt,
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
    });
  });
});

// Defers execution of an awaited Drizzle query chain until `before` resolves,
// wrapping every builder returned along the chain.
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

type UpdateCapable = Pick<DrizzleDb, 'update'>;

// Runs `beforeUpdate` immediately before each UPDATE issued inside an attempt
// transaction, i.e. after the attempt's snapshot read, so a concurrent writer
// can move the row version between the read and the guarded update.
function interleaveBeforeStateUpdate<T extends UpdateCapable>(
  target: T,
  beforeUpdate: () => Promise<void>,
): T {
  return new Proxy(target, {
    get(obj, property, receiver) {
      const value = Reflect.get(obj, property, receiver);
      if (property === 'transaction' && typeof value === 'function') {
        return (
          fn: (tx: UpdateCapable) => Promise<unknown>,
          config?: unknown,
        ) =>
          value.call(
            obj,
            (tx: UpdateCapable) =>
              fn(interleaveBeforeStateUpdate(tx, beforeUpdate)),
            config,
          );
      }
      if (property === 'update' && typeof value === 'function') {
        return (...args: unknown[]) =>
          deferUntil(value.apply(obj, args) as object, beforeUpdate);
      }
      return value;
    },
  });
}

describe('DrizzlePracticeSessionRepository optimistic version retries', () => {
  it('retries once when a concurrent writer bumps the row version between the snapshot and the update', async () => {
    const fixture = await createSessionFixture();
    const initial = await stateRow(fixture.session.id, fixture.first.id);
    let updateAttempts = 0;
    const hooked = new DrizzlePracticeSessionRepository(
      interleaveBeforeStateUpdate(db, async () => {
        updateAttempts += 1;
        if (updateAttempts === 1) {
          await concurrent.sql`
            update practice_session_question_states
            set version = version + 1
            where id = ${initial.id}
          `;
        }
      }),
    );

    const state = await hooked.recordQuestionAnswer(
      answerInput(fixture, fixture.first.id),
    );

    expect(updateAttempts).toBe(2);
    expect(state.latestSelectedChoiceId).toBe(fixture.first.correctChoiceId);
    const stored = await stateRow(fixture.session.id, fixture.first.id);
    expect(stored.version).toBe(initial.version + 2);
    expect(stored.latestSelectedChoiceId).toBe(fixture.first.correctChoiceId);
  });

  it('throws CONFLICT when every retry observes a newer row version', async () => {
    const fixture = await createSessionFixture();
    const initial = await stateRow(fixture.session.id, fixture.first.id);
    let updateAttempts = 0;
    const hooked = new DrizzlePracticeSessionRepository(
      interleaveBeforeStateUpdate(db, async () => {
        updateAttempts += 1;
        await concurrent.sql`
          update practice_session_question_states
          set version = version + 1
          where id = ${initial.id}
        `;
      }),
    );

    await expect(
      hooked.recordQuestionAnswer(answerInput(fixture, fixture.first.id)),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'practice_session_state_changed_concurrently' },
    });
    expect(updateAttempts).toBe(3);
    const stored = await stateRow(fixture.session.id, fixture.first.id);
    expect(stored.version).toBe(initial.version + 3);
    expect(stored.latestSelectedChoiceId).toBeNull();
  });

  it('throws NOT_FOUND when the session disappears after the retries', async () => {
    const fixture = await createSessionFixture();
    const initial = await stateRow(fixture.session.id, fixture.first.id);
    let updateAttempts = 0;
    const hooked = new DrizzlePracticeSessionRepository(
      interleaveBeforeStateUpdate(db, async () => {
        updateAttempts += 1;
        await concurrent.sql`
          update practice_session_question_states
          set version = version + 1
          where id = ${initial.id}
        `;
        if (updateAttempts === 3) {
          // Cascades to the question-state rows before the final snapshot read.
          await concurrent.sql`
            delete from practice_sessions where id = ${fixture.session.id}
          `;
        }
      }),
    );

    await expect(
      hooked.recordQuestionAnswer(answerInput(fixture, fixture.first.id)),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Practice session not found',
    });
    expect(updateAttempts).toBe(3);
  });

  it('throws CONFLICT when the session ends after the retries', async () => {
    const fixture = await createSessionFixture();
    const initial = await stateRow(fixture.session.id, fixture.first.id);
    let updateAttempts = 0;
    const hooked = new DrizzlePracticeSessionRepository(
      interleaveBeforeStateUpdate(db, async () => {
        updateAttempts += 1;
        await concurrent.sql`
          update practice_session_question_states
          set version = version + 1
          where id = ${initial.id}
        `;
        if (updateAttempts === 3) {
          await concurrent.sql`
            update practice_sessions set ended_at = now()
            where id = ${fixture.session.id}
          `;
        }
      }),
    );

    await expect(
      hooked.recordQuestionAnswer(answerInput(fixture, fixture.first.id)),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
    });
    expect(updateAttempts).toBe(3);
  });
});
