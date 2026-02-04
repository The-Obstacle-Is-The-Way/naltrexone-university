// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { RateLimiter } from '@/src/application/ports/gateways';
import {
  FakeAuthGateway,
  FakeEndPracticeSessionUseCase,
  FakeIdempotencyKeyRepository,
  FakeStartPracticeSessionUseCase,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import type {
  EndPracticeSessionOutput,
  StartPracticeSessionOutput,
} from '@/src/application/use-cases';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import {
  endPracticeSession,
  type PracticeControllerDeps,
  startPracticeSession,
} from './practice-controller';

type PracticeControllerTestDeps = PracticeControllerDeps & {
  startPracticeSessionUseCase: FakeStartPracticeSessionUseCase;
  endPracticeSessionUseCase: FakeEndPracticeSessionUseCase;
};

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  rateLimiter?: RateLimiter;
  startOutput?: StartPracticeSessionOutput;
  startThrows?: unknown;
  endOutput?: EndPracticeSessionOutput;
  endThrows?: unknown;
  now?: () => Date;
}): PracticeControllerTestDeps {
  const user =
    overrides?.user === undefined
      ? createUser({
          id: 'user_1',
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;

  const now = overrides?.now ?? (() => new Date('2026-02-01T00:00:00Z'));

  const authGateway = new FakeAuthGateway(user);

  const subscriptionRepository = new FakeSubscriptionRepository(
    overrides?.isEntitled === false
      ? []
      : [
          createSubscription({
            userId: user?.id ?? 'user_1',
            status: 'active',
            currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
          }),
        ],
  );

  const checkEntitlementUseCase = new CheckEntitlementUseCase(
    subscriptionRepository,
    now,
  );

  const rateLimiter: RateLimiter =
    overrides?.rateLimiter ??
    ({
      limit: async () => ({
        success: true,
        limit: 20,
        remaining: 19,
        retryAfterSeconds: 0,
      }),
    } satisfies RateLimiter);

  const startPracticeSessionUseCase = new FakeStartPracticeSessionUseCase(
    overrides?.startOutput ?? { sessionId: 'session_123' },
    overrides?.startThrows,
  );

  const endPracticeSessionUseCase = new FakeEndPracticeSessionUseCase(
    overrides?.endOutput ?? {
      sessionId: 'session_123',
      endedAt: '2026-02-01T00:00:00.000Z',
      totals: { answered: 0, correct: 0, accuracy: 0, durationSeconds: 0 },
    },
    overrides?.endThrows,
  );

  return {
    authGateway,
    rateLimiter,
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(now),
    checkEntitlementUseCase,
    startPracticeSessionUseCase,
    endPracticeSessionUseCase,
    now,
  };
}

describe('practice-controller', () => {
  describe('startPracticeSession', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await startPracticeSession(
        { mode: 'tutor', count: 0, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(deps.startPracticeSessionUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await startPracticeSession(
        { mode: 'tutor', count: 10, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.startPracticeSessionUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await startPracticeSession(
        { mode: 'tutor', count: 10, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.startPracticeSessionUseCase.inputs).toEqual([]);
    });

    it('returns RATE_LIMITED when rate limited', async () => {
      const deps = createDeps({
        rateLimiter: {
          limit: async () => ({
            success: false,
            limit: 20,
            remaining: 0,
            retryAfterSeconds: 60,
          }),
        },
      });

      const result = await startPracticeSession(
        { mode: 'tutor', count: 10, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.startPracticeSessionUseCase.inputs).toEqual([]);
    });

    it('returns sessionId when use case succeeds', async () => {
      const deps = createDeps({ startOutput: { sessionId: 'session_123' } });

      const result = await startPracticeSession(
        {
          mode: 'exam',
          count: 2,
          tagSlugs: ['opioids'],
          difficulties: ['easy', 'medium'],
        },
        deps,
      );

      expect(result).toEqual({ ok: true, data: { sessionId: 'session_123' } });
      expect(deps.startPracticeSessionUseCase.inputs).toEqual([
        {
          userId: 'user_1',
          mode: 'exam',
          count: 2,
          tagSlugs: ['opioids'],
          difficulties: ['easy', 'medium'],
        },
      ]);
    });

    it('returns the cached result when idempotencyKey is reused', async () => {
      const deps = createDeps({ startOutput: { sessionId: 'session_123' } });

      const input = {
        mode: 'tutor',
        count: 1,
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
        tagSlugs: [],
        difficulties: [],
      } as const;

      const first = await startPracticeSession(input, deps);
      const second = await startPracticeSession(input, deps);

      expect(first).toEqual({ ok: true, data: { sessionId: 'session_123' } });
      expect(second).toEqual(first);
      expect(deps.startPracticeSessionUseCase.inputs).toHaveLength(1);
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const deps = createDeps({
        startThrows: new ApplicationError('NOT_FOUND', 'No questions found'),
      });

      const result = await startPracticeSession(
        { mode: 'tutor', count: 10, tagSlugs: [], difficulties: [] },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'No questions found' },
      });
    });
  });

  describe('endPracticeSession', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await endPracticeSession({ sessionId: 'bad' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { sessionId: expect.any(Array) },
        },
      });
      expect(deps.endPracticeSessionUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await endPracticeSession(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.endPracticeSessionUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await endPracticeSession(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.endPracticeSessionUseCase.inputs).toEqual([]);
    });

    it('returns session summary when use case succeeds', async () => {
      const endOutput = {
        sessionId: 'session_123',
        endedAt: '2026-02-01T00:00:00.000Z',
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 60,
        },
      } as const;

      const deps = createDeps({ endOutput });

      const result = await endPracticeSession(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toEqual({ ok: true, data: endOutput });
      expect(deps.endPracticeSessionUseCase.inputs).toEqual([
        { userId: 'user_1', sessionId: '11111111-1111-1111-1111-111111111111' },
      ]);
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const deps = createDeps({
        endThrows: new ApplicationError(
          'NOT_FOUND',
          'Practice session not found',
        ),
      });

      const result = await endPracticeSession(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Practice session not found' },
      });
    });
  });
});
