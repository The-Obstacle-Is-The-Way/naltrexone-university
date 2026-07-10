import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { createContainer } from '@/lib/container';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const concurrent = createIntegrationDb();
const observer = createIntegrationDb();
const cleanup = createCleanupState();

const LOCK_WAIT_TIMEOUT_MS = 3_000;

async function waitForBlockedPracticeSessionStateDelete(input: {
  blockerPid: number;
}): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const rows = await observer.sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'
        AND query ILIKE '%practice_session_question_states%'
        AND query ILIKE '%delete%'
        AND ${input.blockerPid} = ANY(pg_blocking_pids(pid))
    `;
    if ((rows.at(0)?.count ?? 0) > 0) {
      return;
    }
    await sleep(25);
  }

  throw new Error(
    'Timed out waiting for discard to block on practice-session state locks',
  );
}

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(observer.sql);
  await closeConnection(concurrent.sql);
  await closeConnection(sql);
});

function observeTransactionIsolation(
  currentDb: DrizzleDb,
  input: {
    observedIsolationLevels: string[];
    observedTransactionDepths: number[];
  },
  depth = 0,
): DrizzleDb {
  return new Proxy(currentDb, {
    get(target, property, receiver) {
      if (property !== 'transaction') {
        return Reflect.get(target, property, receiver);
      }

      return async <T>(
        fn: (tx: DrizzleDb) => Promise<T>,
        config?: Parameters<DrizzleDb['transaction']>[1],
      ): Promise<T> =>
        target.transaction(async (tx) => {
          const rows = await tx.execute<{ transaction_isolation: string }>(
            drizzleSql`SHOW transaction_isolation`,
          );
          const isolationLevel = rows[0]?.transaction_isolation;
          if (isolationLevel) {
            input.observedIsolationLevels.push(isolationLevel);
            input.observedTransactionDepths.push(depth);
          }
          return fn(
            observeTransactionIsolation(
              tx as unknown as DrizzleDb,
              input,
              depth + 1,
            ),
          );
        }, config);
    },
  }) as DrizzleDb;
}

function interleaveAfterFirstSessionRead(
  currentDb: DrizzleDb,
  input: {
    sessionId: string;
    completed: boolean;
    afterRead: () => Promise<void>;
  },
): DrizzleDb {
  return new Proxy(currentDb, {
    get(target, property, receiver) {
      if (property === 'transaction') {
        return async <T>(
          fn: (tx: DrizzleDb) => Promise<T>,
          config?: Parameters<DrizzleDb['transaction']>[1],
        ): Promise<T> =>
          target.transaction(
            async (tx) =>
              fn(
                interleaveAfterFirstSessionRead(
                  tx as unknown as DrizzleDb,
                  input,
                ),
              ),
            config,
          );
      }

      if (property !== 'query') {
        return Reflect.get(target, property, receiver);
      }

      const query = Reflect.get(target, property, receiver) as object;
      return new Proxy(query, {
        get(queryTarget, tableProperty, queryReceiver) {
          const tableQuery = Reflect.get(
            queryTarget,
            tableProperty,
            queryReceiver,
          );
          if (
            tableProperty !== 'practiceSessions' ||
            !tableQuery ||
            typeof tableQuery !== 'object'
          ) {
            return tableQuery;
          }

          return new Proxy(tableQuery, {
            get(repositoryTarget, methodProperty, repositoryReceiver) {
              const method = Reflect.get(
                repositoryTarget,
                methodProperty,
                repositoryReceiver,
              );
              if (
                methodProperty !== 'findFirst' ||
                typeof method !== 'function'
              ) {
                return method;
              }

              return async (...args: unknown[]) => {
                const row = await Reflect.apply(method, repositoryTarget, args);
                if (
                  !input.completed &&
                  row &&
                  typeof row === 'object' &&
                  'id' in row &&
                  row.id === input.sessionId
                ) {
                  input.completed = true;
                  await input.afterRead();
                }
                return row;
              };
            },
          });
        },
      });
    },
  }) as DrizzleDb;
}

describe('BUG-267 practice-session transaction isolation', () => {
  it('opens the finalize exam write transaction at repeatable read in the real driver', async () => {
    const observedIsolationLevels: string[] = [];
    const observedTransactionDepths: number[] = [];
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-finalize-isolation-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const now = new Date('2026-06-30T12:01:00.000Z');
    const container = createContainer({
      primitives: {
        db: observeTransactionIsolation(db, {
          observedIsolationLevels,
          observedTransactionDepths,
        }),
        now: () => now,
      },
    });
    const session = await container.createPracticeSessionRepository().create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    observedIsolationLevels.length = 0;
    observedTransactionDepths.length = 0;
    await container.createFinalizeExamAnswersUseCase().execute({
      userId: user.id,
      sessionId: session.id,
    });

    expect(observedIsolationLevels.length).toBeGreaterThan(1);
    expect(observedTransactionDepths).toContain(1);
    expect(
      observedTransactionDepths.filter((depth) => depth === 1).length,
    ).toBeGreaterThanOrEqual(3);
    expect(observedIsolationLevels).toContain('repeatable read');
    expect(observedIsolationLevels).not.toContain('read committed');
  });
});

describe('BUG-268 practice-session repeatable-read transaction retries', () => {
  it('retries the full session-backed submit transaction after a serialization failure', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-submit-serialization-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const sessionRepository = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepository.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    let conflictInjected = false;
    let recordQuestionAnswerCalls = 0;

    const createPracticeSessionRepository = (
      dbOverride?: DrizzleDb,
    ): PracticeSessionRepository => {
      const repo = new DrizzlePracticeSessionRepository(dbOverride ?? db);
      return new Proxy(repo, {
        get(target, property, receiver) {
          if (property !== 'recordQuestionAnswer') {
            return Reflect.get(target, property, receiver);
          }

          return async (
            input: Parameters<
              PracticeSessionRepository['recordQuestionAnswer']
            >[0],
          ) => {
            if (dbOverride) {
              recordQuestionAnswerCalls += 1;
            }
            if (dbOverride && !conflictInjected) {
              conflictInjected = true;
              await concurrent.db
                .update(schema.practiceSessionQuestionStates)
                .set({
                  markedForReview: true,
                  version: drizzleSql`${schema.practiceSessionQuestionStates.version} + 1`,
                  updatedAt: new Date('2026-06-30T12:05:00.000Z'),
                })
                .where(
                  and(
                    eq(
                      schema.practiceSessionQuestionStates.practiceSessionId,
                      session.id,
                    ),
                    eq(
                      schema.practiceSessionQuestionStates.questionId,
                      question.id,
                    ),
                  ),
                );
            }

            return target.recordQuestionAnswer(input);
          };
        },
      }) as PracticeSessionRepository;
    };

    const container = createContainer({
      primitives: {
        db,
        now: () => new Date('2026-06-30T12:06:00.000Z'),
      },
      repositories: {
        createPracticeSessionRepository,
      },
    });

    await expect(
      container.createSubmitAnswerUseCase().execute({
        userId: user.id,
        sessionId: session.id,
        questionId: question.id,
        choiceId: question.correctChoiceId,
      }),
    ).resolves.toMatchObject({
      isCorrect: true,
      correctChoiceId: question.correctChoiceId,
    });

    const [state] = await db
      .select({
        markedForReview: schema.practiceSessionQuestionStates.markedForReview,
        latestSelectedChoiceId:
          schema.practiceSessionQuestionStates.latestSelectedChoiceId,
      })
      .from(schema.practiceSessionQuestionStates)
      .where(
        and(
          eq(
            schema.practiceSessionQuestionStates.practiceSessionId,
            session.id,
          ),
          eq(schema.practiceSessionQuestionStates.questionId, question.id),
        ),
      );

    expect(conflictInjected).toBe(true);
    expect(recordQuestionAnswerCalls).toBe(2);
    expect(state).toEqual({
      markedForReview: true,
      latestSelectedChoiceId: question.correctChoiceId,
    });
  });
});

describe('BUG-292 discard serialization-failure ownership', () => {
  it('retries a blocked discard after finalize commits and converges to idempotent success', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-discard-finalize-race-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const sessionRepository = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepository.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    const finalizeWritesReady = createDeferred<number>();
    const allowFinalizeCommit = createDeferred<void>();
    let discardCalls = 0;

    const finalize = concurrent.sql.begin(async (tx) => {
      await tx`SET LOCAL lock_timeout = '2s'`;
      await tx`SET LOCAL statement_timeout = '5s'`;
      const [backend] = await tx<{ pid: number }[]>`
        SELECT pg_backend_pid()::int AS pid
      `;
      await tx`
        UPDATE practice_session_question_states
        SET marked_for_review = NOT marked_for_review,
            version = version + 1,
            updated_at = TIMESTAMPTZ '2026-07-10T12:01:00.000Z'
        WHERE practice_session_id = ${session.id}
      `;
      await tx`
        UPDATE practice_sessions
        SET ended_at = TIMESTAMPTZ '2026-07-10T12:02:00.000Z'
        WHERE id = ${session.id}
          AND ended_at IS NULL
      `;
      finalizeWritesReady.resolve(backend?.pid ?? 0);
      await allowFinalizeCommit.promise;
    });

    const blockerPid = await Promise.race([
      finalizeWritesReady.promise,
      finalize.then(() => {
        throw new Error(
          'Finalize transaction completed before the test barrier',
        );
      }),
    ]);
    const container = createContainer({
      primitives: { db },
      repositories: {
        createPracticeSessionRepository: (
          dbOverride?: DrizzleDb,
        ): PracticeSessionRepository => {
          const repository = new DrizzlePracticeSessionRepository(
            dbOverride ?? db,
          );
          return new Proxy(repository, {
            get(target, property, receiver) {
              if (property !== 'discard') {
                return Reflect.get(target, property, receiver);
              }
              return async (
                ...args: Parameters<PracticeSessionRepository['discard']>
              ) => {
                discardCalls += 1;
                return target.discard(...args);
              };
            },
          }) as PracticeSessionRepository;
        },
      },
    });
    const discard = container.createDiscardPracticeSessionUseCase().execute({
      userId: user.id,
      sessionId: session.id,
    });

    try {
      await waitForBlockedPracticeSessionStateDelete({ blockerPid });
      allowFinalizeCommit.resolve();
      await finalize;

      await expect(discard).resolves.toEqual({ discarded: true });
    } finally {
      allowFinalizeCommit.resolve();
      await Promise.allSettled([finalize, discard]);
    }

    expect(discardCalls).toBe(2);
    await expect(
      sessionRepository.findByIdAndUserId(session.id, user.id),
    ).resolves.toMatchObject({
      id: session.id,
      endedAt: new Date('2026-07-10T12:02:00.000Z'),
    });
  });
});

describe('BUG-293 end pre-read snapshot consistency', () => {
  it('maps a user-deletion cascade between the logical pre-reads to NOT_FOUND', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-end-user-delete-race-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const repository = new DrizzlePracticeSessionRepository(db);
    const session = await repository.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    const interleaving = {
      sessionId: session.id,
      completed: false,
      afterRead: async () => {
        await concurrent.sql.begin(async (tx) => {
          await tx`SET LOCAL lock_timeout = '2s'`;
          await tx`SET LOCAL statement_timeout = '5s'`;
          await tx`DELETE FROM users WHERE id = ${user.id}`;
        });
      },
    };
    const interleavedRepository = new DrizzlePracticeSessionRepository(
      interleaveAfterFirstSessionRead(db, interleaving),
    );

    await expect(
      interleavedRepository.end(session.id, user.id),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Practice session not found',
    });
    expect(interleaving.completed).toBe(true);
  });

  it('keeps genuinely missing normalized question state fail-loud', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-end-genuine-state-corruption-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const repository = new DrizzlePracticeSessionRepository(db);
    const session = await repository.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    await db
      .delete(schema.practiceSessionQuestionStates)
      .where(
        eq(schema.practiceSessionQuestionStates.practiceSessionId, session.id),
      );

    await expect(repository.end(session.id, user.id)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: `Practice session ${session.id} is missing normalized question state`,
    });
  });
});
