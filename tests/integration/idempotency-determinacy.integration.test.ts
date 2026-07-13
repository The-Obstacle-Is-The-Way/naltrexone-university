import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  type QuestionControllerDeps,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import {
  shouldCacheQuestionMarkError,
  shouldCacheSubmitAnswerError,
} from '@/src/adapters/controllers/shared/idempotency-error-policy';
import { DrizzleIdempotencyKeyRepository } from '@/src/adapters/repositories/drizzle-idempotency-key-repository';
import { toRollbackCertainPersistenceError } from '@/src/adapters/repositories/postgres-errors';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import { practiceSessionAlreadyEndedError } from '@/src/application/errors';
import {
  FakeAuthGateway,
  FakeGetNextQuestionUseCase,
  FakeLogger,
  FakeRateLimiter,
  FakeSubmitAnswerUseCase,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import {
  createUser as createDomainUser,
  createSubscription,
} from '@/src/domain/test-helpers';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql: connection } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(connection);
});

async function throwRealStatementCancellation(): Promise<never> {
  try {
    await connection.begin(async (tx) => {
      await tx`select set_config('statement_timeout', '25ms', true)`;
      await tx`select pg_sleep(0.1)`;
    });
  } catch (error) {
    const rollbackCertainError = toRollbackCertainPersistenceError(error);
    if (rollbackCertainError) throw rollbackCertainError;
    throw error;
  }

  throw new Error('Expected Postgres to cancel the statement');
}

describe('idempotency determinacy with real Postgres', () => {
  it.each([
    ['submit answer', 'question:submitAnswer', shouldCacheSubmitAnswerError],
    [
      'question mark',
      'practice:setPracticeSessionQuestionMark',
      shouldCacheQuestionMarkError,
    ],
  ] as const)('aborts and re-executes %s after rollback-certain 57014', async (_name, action, shouldCacheError) => {
    const user = await createUser(db, cleanup);
    const repo = new DrizzleIdempotencyKeyRepository(db);
    const logger = new FakeLogger();
    const key = randomUUID();
    const now = () => new Date('2026-07-13T00:00:00.000Z');
    let executionCount = 0;
    let injectCancellation = true;
    const execute = async () => {
      executionCount += 1;
      if (injectCancellation) {
        injectCancellation = false;
        return throwRealStatementCancellation();
      }
      return { committed: true };
    };

    const first = withIdempotency({
      repo,
      logger,
      userId: user.id,
      action,
      key,
      now,
      shouldCacheError,
      execute,
    });

    await expect(first).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      determinacy: 'rollback_certain',
    });
    await expect(repo.find(user.id, action, key)).resolves.toBeNull();

    await expect(
      withIdempotency({
        repo,
        logger,
        userId: user.id,
        action,
        key,
        now,
        shouldCacheError,
        execute,
      }),
    ).resolves.toEqual({ committed: true });
    expect(executionCount).toBe(2);
  });

  it('replays a cached terminal submit ActionResult without re-execution', async () => {
    const persistedUser = await createUser(db, cleanup);
    const user = createDomainUser({
      id: persistedUser.id,
      email: persistedUser.email,
    });
    const submitAnswerUseCase = new FakeSubmitAnswerUseCase(
      {
        attemptId: randomUUID(),
        isCorrect: true,
        correctChoiceId: randomUUID(),
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      },
      practiceSessionAlreadyEndedError(),
    );
    const now = new Date('2026-07-13T00:00:00.000Z');
    const deps: QuestionControllerDeps = {
      authGateway: new FakeAuthGateway(user),
      logger: new FakeLogger(),
      rateLimiter: new FakeRateLimiter(),
      idempotencyKeyRepository: new DrizzleIdempotencyKeyRepository(db),
      now: () => now,
      checkEntitlementUseCase: new CheckEntitlementUseCase(
        new FakeSubscriptionRepository([
          createSubscription({
            userId: user.id,
            status: 'active',
            currentPeriodEnd: new Date('2027-01-01T00:00:00.000Z'),
          }),
        ]),
        () => now,
      ),
      getNextQuestionUseCase: new FakeGetNextQuestionUseCase(null),
      submitAnswerUseCase,
    };
    const input = {
      questionId: randomUUID(),
      choiceId: randomUUID(),
      idempotencyKey: randomUUID(),
    };

    const first = await submitAnswer(input, deps);
    const replay = await submitAnswer(input, deps);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        details: { reason: 'practice_session_already_ended' },
      },
    });
    expect(submitAnswerUseCase.inputs).toHaveLength(1);
  });
});
