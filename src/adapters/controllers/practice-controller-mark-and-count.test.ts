import { describe, expect, it } from 'vitest';
import {
  ApplicationError,
  rollbackCertainPersistenceError,
} from '@/src/application/errors';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';
import {
  countAvailableQuestions,
  setPracticeSessionQuestionMark,
} from './practice-controller';
import { createDeps } from './practice-controller-test-helpers';

describe('practice-controller', () => {
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
          userId: deps._fixtures.userId,
          sessionId: input.sessionId,
          questionId: input.questionId,
          markedForReview: false,
        },
      ]);
    });

    it('returns the cached mark result when idempotencyKey is reused', async () => {
      const rateLimiter = new FakeRateLimiter();
      const deps = createDeps({
        rateLimiter,
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
      expect(rateLimiter.inputs).toHaveLength(1);
    });

    it('limits a fresh keyed mark before executing the use case', async () => {
      const rateLimiter = new FakeRateLimiter({
        success: false,
        limit: 60,
        remaining: 0,
        retryAfterSeconds: 30,
      });
      const deps = createDeps({ rateLimiter });

      const result = await setPracticeSessionQuestionMark(
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          questionId: '22222222-2222-2222-2222-222222222222',
          markedForReview: true,
          idempotencyKey: '33333333-3333-3333-3333-333333333333',
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.setPracticeSessionQuestionMarkUseCase.inputs).toEqual([]);
      expect(rateLimiter.inputs).toEqual([
        {
          key: `practice:setPracticeSessionQuestionMark:${deps._fixtures.userId}`,
          limit: 60,
          windowMs: 60_000,
        },
      ]);
    });

    it('replays a cached mark error without another limiter admission', async () => {
      const rateLimiter = new FakeRateLimiter([
        { success: true, limit: 60, remaining: 59, retryAfterSeconds: 0 },
        { success: false, limit: 60, remaining: 0, retryAfterSeconds: 30 },
      ]);
      const deps = createDeps({
        rateLimiter,
        setMarkThrows: new ApplicationError('NOT_FOUND', 'Question not found'),
      });
      const input = {
        sessionId: '11111111-1111-1111-1111-111111111111',
        questionId: '22222222-2222-2222-2222-222222222222',
        markedForReview: true,
        idempotencyKey: '33333333-3333-3333-3333-333333333333',
      } as const;

      const first = await setPracticeSessionQuestionMark(input, deps);
      const second = await setPracticeSessionQuestionMark(input, deps);

      expect(first).toEqual({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Question not found',
        },
      });
      expect(second).toEqual(first);
      expect(deps.setPracticeSessionQuestionMarkUseCase.inputs).toHaveLength(1);
      expect(rateLimiter.inputs).toHaveLength(1);
    });

    it('re-executes a mark after a rollback-certain failure under the same key', async () => {
      const deps = createDeps({
        setMarkThrows: rollbackCertainPersistenceError({
          cause: { code: '57014' },
        }),
      });
      const input = {
        sessionId: '11111111-1111-1111-1111-111111111111',
        questionId: '22222222-2222-2222-2222-222222222222',
        markedForReview: true,
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      await setPracticeSessionQuestionMark(input, deps);
      await setPracticeSessionQuestionMark(input, deps);

      expect(deps.setPracticeSessionQuestionMarkUseCase.inputs).toHaveLength(2);
    });
  });

  describe('countAvailableQuestions', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await countAvailableQuestions(
        { tagSlugs: [''], difficulties: [], statuses: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(deps.countAvailableQuestionsUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await countAvailableQuestions(
        { tagSlugs: [], difficulties: [], statuses: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.countAvailableQuestionsUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await countAvailableQuestions(
        { tagSlugs: [], difficulties: [], statuses: [] },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.countAvailableQuestionsUseCase.inputs).toEqual([]);
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const deps = createDeps({
        countThrows: new ApplicationError('NOT_FOUND', 'Questions not found'),
      });

      const result = await countAvailableQuestions(
        { tagSlugs: [], difficulties: [], statuses: [] },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Questions not found' },
      });
      expect(deps.countAvailableQuestionsUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          tagSlugs: [],
          difficulties: [],
          statuses: [],
        },
      ]);
    });

    it('returns the count from the use case when successful', async () => {
      const deps = createDeps({ countOutput: { count: 42 } });

      const result = await countAvailableQuestions(
        { tagSlugs: [], difficulties: [], statuses: ['unanswered'] },
        deps,
      );

      expect(result).toEqual({ ok: true, data: { count: 42 } });
      expect(deps.countAvailableQuestionsUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          tagSlugs: [],
          difficulties: [],
          statuses: ['unanswered'],
        },
      ]);
    });
  });
});
