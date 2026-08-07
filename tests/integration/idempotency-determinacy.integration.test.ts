import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  type QuestionControllerDeps,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import {
  shouldCacheQuestionMarkError,
  shouldCacheStartPracticeSessionError,
  shouldCacheSubmitAnswerError,
} from '@/src/adapters/controllers/shared/idempotency-error-policy';
import { DrizzleIdempotencyKeyRepository } from '@/src/adapters/repositories/drizzle-idempotency-key-repository';
import { toRollbackCertainPersistenceError } from '@/src/adapters/repositories/postgres-errors';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import {
  ApplicationError,
  practiceSessionAlreadyEndedError,
} from '@/src/application/errors';
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
  await connection.begin(async (tx) => {
    try {
      await tx`select set_config('statement_timeout', '25ms', true)`;
      await tx`select pg_sleep(0.1)`;
    } catch (error) {
      const rollbackCertainError = toRollbackCertainPersistenceError(error, {
        phase: 'transaction_body',
      });
      throw rollbackCertainError ?? error;
    }
  });

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
    [
      'start practice session',
      'practice:startPracticeSession',
      shouldCacheStartPracticeSessionError,
    ],
  ] as const)(
    'aborts and re-executes %s after rollback-certain 57014',
    async (_name, action, shouldCacheError) => {
      const user = await createUser(db, cleanup);
      const repo = new DrizzleIdempotencyKeyRepository(db);
      const logger = new FakeLogger();
      const key = randomUUID();
      const now = () => new Date();
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
    },
  );

  it('aborts and re-executes session start after a transient internal error', async () => {
    const user = await createUser(db, cleanup);
    const repo = new DrizzleIdempotencyKeyRepository(db);
    const logger = new FakeLogger();
    const key = randomUUID();
    const action = 'practice:startPracticeSession';
    const now = () => new Date();
    let executionCount = 0;
    const execute = async () => {
      executionCount += 1;
      if (executionCount === 1) {
        throw new ApplicationError('INTERNAL_ERROR', 'database unavailable');
      }
      return { sessionId: randomUUID() };
    };

    // Pre-policy, the wrapper default cached this transient error for the
    // full TTL and the client's preserved key replayed it on every Start
    // click — the session-start dead-end this policy exists to prevent.
    await expect(
      withIdempotency({
        repo,
        logger,
        userId: user.id,
        action,
        key,
        now,
        shouldCacheError: shouldCacheStartPracticeSessionError,
        execute,
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    await expect(repo.find(user.id, action, key)).resolves.toBeNull();

    const retry = await withIdempotency({
      repo,
      logger,
      userId: user.id,
      action,
      key,
      now,
      shouldCacheError: shouldCacheStartPracticeSessionError,
      execute,
    });
    expect(retry).toMatchObject({ sessionId: expect.any(String) });
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
    // A live timestamp: the stored outcome's 24h TTL is evaluated against the
    // database clock, so a pinned past date turns this test into a time bomb.
    const now = new Date();
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
