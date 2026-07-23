import { describe, expect, it } from 'vitest';
import {
  ApplicationError,
  rollbackCertainPersistenceError,
} from '@/src/application/errors';
import {
  FakeAuthGateway,
  FakeGetNextQuestionUseCase,
  FakeIdempotencyKeyRepository,
  FakeLogger,
  FakeRateLimiter,
  FakeSubmitAnswerUseCase,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import {
  type QuestionControllerDeps,
  submitAnswer,
} from './question-controller';

const questionId = '11111111-1111-1111-1111-111111111111';
const choiceId = '22222222-2222-2222-2222-222222222222';
const idempotencyKey = '33333333-3333-3333-3333-333333333333';

type QuestionControllerIdempotencyTestDeps = QuestionControllerDeps & {
  submitAnswerUseCase: FakeSubmitAnswerUseCase;
  rateLimiter: FakeRateLimiter;
};

function createDeps(overrides?: {
  rateLimiter?: FakeRateLimiter;
  submitAnswerThrows?: unknown;
}): QuestionControllerIdempotencyTestDeps {
  const user = createUser({
    email: 'user@example.com',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  });
  const now = new Date('2026-02-01T00:00:00Z');
  const subscriptionRepository = new FakeSubscriptionRepository([
    createSubscription({
      userId: user.id,
      status: 'active',
      currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
    }),
  ]);

  return {
    authGateway: new FakeAuthGateway(user),
    logger: new FakeLogger(),
    rateLimiter: overrides?.rateLimiter ?? new FakeRateLimiter(),
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(() => now),
    now: () => now,
    checkEntitlementUseCase: new CheckEntitlementUseCase(
      subscriptionRepository,
      () => now,
    ),
    getNextQuestionUseCase: new FakeGetNextQuestionUseCase(null),
    submitAnswerUseCase: new FakeSubmitAnswerUseCase(
      {
        attemptId: '44444444-4444-4444-4444-444444444444',
        isCorrect: true,
        correctChoiceId: '55555555-5555-5555-5555-555555555555',
        explanationMd: 'Because...',
        referenceMd: null,
        choiceExplanations: [],
      },
      overrides?.submitAnswerThrows,
    ),
  };
}

describe('question-controller submitAnswer idempotency', () => {
  it('does not cache RATE_LIMITED under the idempotency key', async () => {
    const deps = createDeps({
      rateLimiter: new FakeRateLimiter([
        {
          success: false,
          limit: 120,
          remaining: 0,
          retryAfterSeconds: 60,
        },
        {
          success: true,
          limit: 120,
          remaining: 119,
          retryAfterSeconds: 0,
        },
      ]),
    });
    const input = { questionId, choiceId, idempotencyKey } as const;

    const first = await submitAnswer(input, deps);
    expect(first).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });

    const second = await submitAnswer(input, deps);
    expect(second).toMatchObject({
      ok: true,
      data: { attemptId: '44444444-4444-4444-4444-444444444444' },
    });
    expect(deps.submitAnswerUseCase.inputs).toHaveLength(1);
  });

  it('keeps successful submissions idempotent when idempotencyKey is reused', async () => {
    const deps = createDeps();
    const input = { questionId, choiceId, idempotencyKey } as const;

    const first = await submitAnswer(input, deps);
    const second = await submitAnswer(input, deps);

    expect(first).toMatchObject({ ok: true });
    expect(second).toEqual(first);
    expect(deps.submitAnswerUseCase.inputs).toHaveLength(1);
  });

  it('replays a cached submission while the reused key is rate limited', async () => {
    const deps = createDeps({
      rateLimiter: new FakeRateLimiter([
        {
          success: true,
          limit: 120,
          remaining: 119,
          retryAfterSeconds: 0,
        },
        {
          success: false,
          limit: 120,
          remaining: 0,
          retryAfterSeconds: 60,
        },
      ]),
    });
    const input = { questionId, choiceId, idempotencyKey } as const;

    const first = await submitAnswer(input, deps);
    const second = await submitAnswer(input, deps);

    expect(first).toMatchObject({
      ok: true,
      data: { attemptId: '44444444-4444-4444-4444-444444444444' },
    });
    expect(second).toEqual(first);
    expect(deps.submitAnswerUseCase.inputs).toHaveLength(1);
    expect(deps.rateLimiter.inputs).toHaveLength(1);
  });

  it('keeps genuine use-case ApplicationErrors cached when idempotencyKey is reused', async () => {
    const deps = createDeps({
      rateLimiter: new FakeRateLimiter([
        {
          success: true,
          limit: 120,
          remaining: 119,
          retryAfterSeconds: 0,
        },
        {
          success: false,
          limit: 120,
          remaining: 0,
          retryAfterSeconds: 60,
        },
      ]),
      submitAnswerThrows: new ApplicationError(
        'NOT_FOUND',
        'Question not found',
      ),
    });
    const input = { questionId, choiceId, idempotencyKey } as const;

    const first = await submitAnswer(input, deps);
    const second = await submitAnswer(input, deps);

    expect(first).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Question not found' },
    });
    expect(second).toEqual(first);
    expect(deps.submitAnswerUseCase.inputs).toHaveLength(1);
    expect(deps.rateLimiter.inputs).toHaveLength(1);
  });

  it('stores and replays raw failures as the normalized public internal error', async () => {
    const deps = createDeps({
      submitAnswerThrows: new Error('database diagnostic detail'),
    });
    const input = { questionId, choiceId, idempotencyKey } as const;

    const first = await submitAnswer(input, deps);
    const second = await submitAnswer(input, deps);

    expect(first).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    });
    expect(second).toEqual(first);
    expect(deps.submitAnswerUseCase.inputs).toHaveLength(1);
    expect(deps.rateLimiter.inputs).toHaveLength(1);
  });

  it('stores and replays diagnostic ApplicationErrors as the normalized public internal error', async () => {
    const deps = createDeps({
      submitAnswerThrows: new ApplicationError(
        'INTERNAL_ERROR',
        'database diagnostic detail',
      ),
    });
    const input = { questionId, choiceId, idempotencyKey } as const;

    const first = await submitAnswer(input, deps);
    const second = await submitAnswer(input, deps);

    expect(first).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    });
    expect(second).toEqual(first);
    expect(deps.submitAnswerUseCase.inputs).toHaveLength(1);
    expect(deps.rateLimiter.inputs).toHaveLength(1);
  });

  it('re-executes after a rollback-certain failure under the same key', async () => {
    const deps = createDeps({
      submitAnswerThrows: rollbackCertainPersistenceError({
        cause: { code: '57014' },
      }),
    });
    const input = { questionId, choiceId, idempotencyKey } as const;

    await submitAnswer(input, deps);
    await submitAnswer(input, deps);

    expect(deps.submitAnswerUseCase.inputs).toHaveLength(2);
    expect(deps.rateLimiter.inputs).toHaveLength(2);
  });
});
