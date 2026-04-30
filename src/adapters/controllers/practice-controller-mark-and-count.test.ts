import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
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
          userId: 'user_1',
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
          userId: 'user_1',
          tagSlugs: [],
          difficulties: [],
          statuses: ['unanswered'],
        },
      ]);
    });
  });
});
