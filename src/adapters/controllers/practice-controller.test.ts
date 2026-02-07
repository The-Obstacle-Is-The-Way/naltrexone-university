// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { RateLimiter } from '@/src/application/ports/gateways';
import {
  FakeAuthGateway,
  FakeEndPracticeSessionUseCase,
  FakeGetIncompletePracticeSessionUseCase,
  FakeGetPracticeSessionReviewUseCase,
  FakeGetSessionHistoryUseCase,
  FakeIdempotencyKeyRepository,
  FakeRateLimiter,
  FakeSetPracticeSessionQuestionMarkUseCase,
  FakeStartPracticeSessionUseCase,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import type {
  EndPracticeSessionOutput,
  GetPracticeSessionReviewOutput,
  GetSessionHistoryOutput,
  SetPracticeSessionQuestionMarkOutput,
  StartPracticeSessionOutput,
} from '@/src/application/use-cases';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import {
  endPracticeSession,
  getIncompletePracticeSession,
  getPracticeSessionReview,
  getSessionHistory,
  type PracticeControllerDeps,
  setPracticeSessionQuestionMark,
  startPracticeSession,
} from './practice-controller';

type PracticeControllerTestDeps = PracticeControllerDeps & {
  getIncompletePracticeSessionUseCase: FakeGetIncompletePracticeSessionUseCase;
  startPracticeSessionUseCase: FakeStartPracticeSessionUseCase;
  endPracticeSessionUseCase: FakeEndPracticeSessionUseCase;
  getPracticeSessionReviewUseCase: FakeGetPracticeSessionReviewUseCase;
  getSessionHistoryUseCase: FakeGetSessionHistoryUseCase;
  setPracticeSessionQuestionMarkUseCase: FakeSetPracticeSessionQuestionMarkUseCase;
};

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  rateLimiter?: RateLimiter;
  startOutput?: StartPracticeSessionOutput;
  startThrows?: unknown;
  endOutput?: EndPracticeSessionOutput;
  endThrows?: unknown;
  reviewOutput?: GetPracticeSessionReviewOutput;
  reviewThrows?: unknown;
  sessionHistoryOutput?: GetSessionHistoryOutput;
  sessionHistoryThrows?: unknown;
  setMarkOutput?: SetPracticeSessionQuestionMarkOutput;
  setMarkThrows?: unknown;
  incompleteOutput?: {
    sessionId: string;
    mode: 'tutor' | 'exam';
    answeredCount: number;
    totalCount: number;
    startedAt: string;
  } | null;
  incompleteThrows?: unknown;
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
    overrides?.rateLimiter ?? new FakeRateLimiter();

  const startPracticeSessionUseCase = new FakeStartPracticeSessionUseCase(
    overrides?.startOutput ?? {
      sessionId: '22222222-2222-2222-2222-222222222222',
    },
    overrides?.startThrows,
  );

  const endPracticeSessionUseCase = new FakeEndPracticeSessionUseCase(
    overrides?.endOutput ?? {
      sessionId: '22222222-2222-2222-2222-222222222222',
      endedAt: '2026-02-01T00:00:00.000Z',
      totals: { answered: 0, correct: 0, accuracy: 0, durationSeconds: 0 },
    },
    overrides?.endThrows,
  );

  const getPracticeSessionReviewUseCase =
    new FakeGetPracticeSessionReviewUseCase(
      overrides?.reviewOutput ?? {
        sessionId: '22222222-2222-2222-2222-222222222222',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
      },
      overrides?.reviewThrows,
    );

  const setPracticeSessionQuestionMarkUseCase =
    new FakeSetPracticeSessionQuestionMarkUseCase(
      overrides?.setMarkOutput ?? {
        questionId: '33333333-3333-3333-3333-333333333333',
        markedForReview: true,
      },
      overrides?.setMarkThrows,
    );

  const getSessionHistoryUseCase = new FakeGetSessionHistoryUseCase(
    overrides?.sessionHistoryOutput ?? {
      rows: [],
      total: 0,
      limit: 20,
      offset: 0,
    },
    overrides?.sessionHistoryThrows,
  );

  const getIncompletePracticeSessionUseCase =
    new FakeGetIncompletePracticeSessionUseCase(
      overrides?.incompleteOutput ?? null,
      overrides?.incompleteThrows,
    );

  return {
    authGateway,
    rateLimiter,
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(now),
    checkEntitlementUseCase,
    getIncompletePracticeSessionUseCase,
    startPracticeSessionUseCase,
    endPracticeSessionUseCase,
    getPracticeSessionReviewUseCase,
    getSessionHistoryUseCase,
    setPracticeSessionQuestionMarkUseCase,
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
        rateLimiter: new FakeRateLimiter({
          success: false,
          limit: 20,
          remaining: 0,
          retryAfterSeconds: 60,
        }),
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
      const deps = createDeps({
        startOutput: { sessionId: '22222222-2222-2222-2222-222222222222' },
      });

      const result = await startPracticeSession(
        {
          mode: 'exam',
          count: 2,
          tagSlugs: ['opioids'],
          difficulties: ['easy', 'medium'],
        },
        deps,
      );

      expect(result).toEqual({
        ok: true,
        data: { sessionId: '22222222-2222-2222-2222-222222222222' },
      });
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
      const deps = createDeps({
        startOutput: { sessionId: '22222222-2222-2222-2222-222222222222' },
      });

      const input = {
        mode: 'tutor',
        count: 1,
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
        tagSlugs: [],
        difficulties: [],
      } as const;

      const first = await startPracticeSession(input, deps);
      const second = await startPracticeSession(input, deps);

      expect(first).toEqual({
        ok: true,
        data: { sessionId: '22222222-2222-2222-2222-222222222222' },
      });
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

    it('returns the cached summary when idempotencyKey is reused', async () => {
      const deps = createDeps({
        endOutput: {
          sessionId: '22222222-2222-2222-2222-222222222222',
          endedAt: '2026-02-01T00:00:00.000Z',
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 60,
          },
        },
      });

      const input = {
        sessionId: '11111111-1111-1111-1111-111111111111',
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await endPracticeSession(input, deps);
      const second = await endPracticeSession(input, deps);

      expect(first).toEqual({
        ok: true,
        data: {
          sessionId: '22222222-2222-2222-2222-222222222222',
          endedAt: '2026-02-01T00:00:00.000Z',
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 60,
          },
        },
      });
      expect(second).toEqual(first);
      expect(deps.endPracticeSessionUseCase.inputs).toHaveLength(1);
    });
  });

  describe('getIncompletePracticeSession', () => {
    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await getIncompletePracticeSession({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.getIncompletePracticeSessionUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getIncompletePracticeSession({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.getIncompletePracticeSessionUseCase.inputs).toEqual([]);
    });

    it('returns null when no incomplete session exists', async () => {
      const deps = createDeps({ incompleteOutput: null });

      const result = await getIncompletePracticeSession({}, deps);

      expect(result).toEqual({ ok: true, data: null });
      expect(deps.getIncompletePracticeSessionUseCase.inputs).toEqual([
        { userId: 'user_1' },
      ]);
    });

    it('returns incomplete session progress when use case succeeds', async () => {
      const deps = createDeps({
        incompleteOutput: {
          sessionId: '11111111-1111-1111-1111-111111111111',
          mode: 'exam',
          answeredCount: 3,
          totalCount: 20,
          startedAt: '2026-02-05T00:00:00.000Z',
        },
      });

      const result = await getIncompletePracticeSession({}, deps);

      expect(result).toEqual({
        ok: true,
        data: {
          sessionId: '11111111-1111-1111-1111-111111111111',
          mode: 'exam',
          answeredCount: 3,
          totalCount: 20,
          startedAt: '2026-02-05T00:00:00.000Z',
        },
      });
      expect(deps.getIncompletePracticeSessionUseCase.inputs).toEqual([
        { userId: 'user_1' },
      ]);
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const deps = createDeps({
        incompleteThrows: new ApplicationError(
          'NOT_FOUND',
          'Practice session not found',
        ),
      });

      const result = await getIncompletePracticeSession({}, deps);

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Practice session not found' },
      });
    });
  });

  describe('getPracticeSessionReview', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getPracticeSessionReview({ sessionId: 'bad' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { sessionId: expect.any(Array) },
        },
      });
      expect(deps.getPracticeSessionReviewUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await getPracticeSessionReview(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.getPracticeSessionReviewUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getPracticeSessionReview(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.getPracticeSessionReviewUseCase.inputs).toEqual([]);
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const deps = createDeps({
        reviewThrows: new ApplicationError(
          'NOT_FOUND',
          'Practice session not found',
        ),
      });

      const result = await getPracticeSessionReview(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Practice session not found' },
      });
    });

    it('returns review payload when use case succeeds', async () => {
      const deps = createDeps({
        reviewOutput: {
          sessionId: '11111111-1111-1111-1111-111111111111',
          mode: 'exam',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 1,
          rows: [
            {
              isAvailable: true,
              questionId: '22222222-2222-2222-2222-222222222222',
              stemMd: 'Stem',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: false,
              markedForReview: true,
            },
          ],
        },
      });

      const sessionId = '11111111-1111-1111-1111-111111111111';
      const result = await getPracticeSessionReview({ sessionId }, deps);

      expect(result).toMatchObject({
        ok: true,
        data: { sessionId, markedCount: 1 },
      });
      expect(deps.getPracticeSessionReviewUseCase.inputs).toEqual([
        { userId: 'user_1', sessionId },
      ]);
    });
  });

  describe('getSessionHistory', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getSessionHistory({ limit: 0, offset: -1 }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(deps.getSessionHistoryUseCase.inputs).toEqual([]);
    });

    it('returns session history when use case succeeds', async () => {
      const deps = createDeps({
        sessionHistoryOutput: {
          rows: [
            {
              sessionId: '11111111-1111-1111-1111-111111111111',
              mode: 'exam',
              questionCount: 20,
              answered: 20,
              correct: 15,
              accuracy: 0.75,
              durationSeconds: 1800,
              startedAt: '2026-02-05T00:00:00.000Z',
              endedAt: '2026-02-05T00:30:00.000Z',
            },
          ],
          total: 1,
          limit: 20,
          offset: 0,
        },
      });

      const result = await getSessionHistory({ limit: 20, offset: 0 }, deps);

      expect(result).toEqual({
        ok: true,
        data: {
          rows: [
            {
              sessionId: '11111111-1111-1111-1111-111111111111',
              mode: 'exam',
              questionCount: 20,
              answered: 20,
              correct: 15,
              accuracy: 0.75,
              durationSeconds: 1800,
              startedAt: '2026-02-05T00:00:00.000Z',
              endedAt: '2026-02-05T00:30:00.000Z',
            },
          ],
          total: 1,
          limit: 20,
          offset: 0,
        },
      });
      expect(deps.getSessionHistoryUseCase.inputs).toEqual([
        { userId: 'user_1', limit: 20, offset: 0 },
      ]);
    });
  });

  describe('setPracticeSessionQuestionMark', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await setPracticeSessionQuestionMark(
        {
          sessionId: 'bad',
          questionId: 'bad',
          markedForReview: true,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: {
            sessionId: expect.any(Array),
            questionId: expect.any(Array),
          },
        },
      });
      expect(deps.setPracticeSessionQuestionMarkUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await setPracticeSessionQuestionMark(
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          markedForReview: true,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.setPracticeSessionQuestionMarkUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await setPracticeSessionQuestionMark(
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          markedForReview: true,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.setPracticeSessionQuestionMarkUseCase.inputs).toEqual([]);
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const deps = createDeps({
        setMarkThrows: new ApplicationError(
          'NOT_FOUND',
          'Practice session not found',
        ),
      });

      const result = await setPracticeSessionQuestionMark(
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          markedForReview: true,
        },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Practice session not found' },
      });
    });

    it('returns updated mark state when use case succeeds', async () => {
      const deps = createDeps({
        setMarkOutput: {
          questionId: '22222222-2222-2222-2222-222222222222',
          markedForReview: false,
        },
      });

      const input = {
        sessionId: '11111111-1111-1111-1111-111111111111',
        questionId: '22222222-2222-2222-2222-222222222222',
        markedForReview: false,
      };

      const result = await setPracticeSessionQuestionMark(input, deps);

      expect(result).toEqual({
        ok: true,
        data: {
          questionId: input.questionId,
          markedForReview: false,
        },
      });
      expect(deps.setPracticeSessionQuestionMarkUseCase.inputs).toEqual([
        {
          userId: 'user_1',
          sessionId: input.sessionId,
          questionId: input.questionId,
          markedForReview: false,
        },
      ]);
    });

    it('returns the cached mark result when idempotencyKey is reused', async () => {
      const deps = createDeps({
        setMarkOutput: {
          questionId: '22222222-2222-2222-2222-222222222222',
          markedForReview: true,
        },
      });

      const input = {
        sessionId: '11111111-1111-1111-1111-111111111111',
        questionId: '22222222-2222-2222-2222-222222222222',
        markedForReview: true,
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await setPracticeSessionQuestionMark(input, deps);
      const second = await setPracticeSessionQuestionMark(input, deps);

      expect(first).toEqual({
        ok: true,
        data: {
          questionId: '22222222-2222-2222-2222-222222222222',
          markedForReview: true,
        },
      });
      expect(second).toEqual(first);
      expect(deps.setPracticeSessionQuestionMarkUseCase.inputs).toHaveLength(1);
    });
  });
});
