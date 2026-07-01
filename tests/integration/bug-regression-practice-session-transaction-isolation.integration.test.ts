import { randomUUID } from 'node:crypto';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { createContainer } from '@/lib/container';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';
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
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
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
    await container.createFinalizeExamAnswersUseCase().execute({
      userId: user.id,
      sessionId: session.id,
    });

    expect(observedIsolationLevels.length).toBeGreaterThan(1);
    expect(observedTransactionDepths).toContain(1);
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
    expect(state).toEqual({
      markedForReview: true,
      latestSelectedChoiceId: question.correctChoiceId,
    });
  });
});
