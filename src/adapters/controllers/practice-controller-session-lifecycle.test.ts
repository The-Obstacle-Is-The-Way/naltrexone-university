import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';
import type { FinalizeExamAnswersOutput } from '@/src/application/use-cases';
import {
  endPracticeSession,
  finalizeExamAnswers,
  startPracticeSession,
} from './practice-controller';
import { createDeps } from './practice-controller-test-helpers';

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

    it('returns VALIDATION_ERROR when statuses include legacy marked', async () => {
      const deps = createDeps();

      const result = await startPracticeSession(
        {
          mode: 'tutor',
          count: 10,
          tagSlugs: [],
          difficulties: [],
          statuses: ['marked'],
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { statuses: expect.any(Array) },
        },
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
        startOutput: {
          sessionId: '22222222-2222-2222-2222-222222222222',
          requestedCount: 2,
          actualCount: 2,
        },
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
        data: {
          sessionId: '22222222-2222-2222-2222-222222222222',
          requestedCount: 2,
          actualCount: 2,
        },
      });
      expect(deps.startPracticeSessionUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          mode: 'exam',
          count: 2,
          tagSlugs: ['opioids'],
          difficulties: ['easy', 'medium'],
          statuses: [],
        },
      ]);
    });

    it('forwards bookmarked status to the use case', async () => {
      const deps = createDeps({
        startOutput: {
          sessionId: '22222222-2222-2222-2222-222222222222',
          requestedCount: 1,
          actualCount: 1,
        },
      });

      const result = await startPracticeSession(
        {
          mode: 'tutor',
          count: 1,
          tagSlugs: [],
          difficulties: [],
          statuses: ['bookmarked'],
        },
        deps,
      );

      expect(result).toEqual({
        ok: true,
        data: {
          sessionId: '22222222-2222-2222-2222-222222222222',
          requestedCount: 1,
          actualCount: 1,
        },
      });
      expect(deps.startPracticeSessionUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          mode: 'tutor',
          count: 1,
          tagSlugs: [],
          difficulties: [],
          statuses: ['bookmarked'],
        },
      ]);
    });

    it('returns the cached result when idempotencyKey is reused', async () => {
      const deps = createDeps({
        startOutput: {
          sessionId: '22222222-2222-2222-2222-222222222222',
          requestedCount: 1,
          actualCount: 1,
        },
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
        data: {
          sessionId: '22222222-2222-2222-2222-222222222222',
          requestedCount: 1,
          actualCount: 1,
        },
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
        sessionId: '22222222-2222-2222-2222-222222222222',
        endedAt: '2026-02-01T00:00:00.000Z',
        mode: 'tutor',
        questionCount: 2,
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
        {
          userId: deps._fixtures.userId,
          sessionId: '11111111-1111-1111-1111-111111111111',
        },
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
          mode: 'tutor',
          questionCount: 2,
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
          mode: 'tutor',
          questionCount: 2,
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

  describe('finalizeExamAnswers', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await finalizeExamAnswers({ sessionId: 'bad' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { sessionId: expect.any(Array) },
        },
      });
      expect(deps.finalizeExamAnswersUseCase.inputs).toEqual([]);
    });

    it('returns exam summary when use case succeeds', async () => {
      const finalizeOutput = {
        sessionId: '22222222-2222-2222-2222-222222222223',
        endedAt: '2026-02-01T00:00:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 60,
        },
      } as const;

      const deps = createDeps({ finalizeOutput });

      const result = await finalizeExamAnswers(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toEqual({ ok: true, data: finalizeOutput });
      expect(deps.finalizeExamAnswersUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          sessionId: '11111111-1111-1111-1111-111111111111',
        },
      ]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await finalizeExamAnswers(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.finalizeExamAnswersUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await finalizeExamAnswers(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.finalizeExamAnswersUseCase.inputs).toEqual([]);
    });

    it('returns the cached summary when idempotencyKey is reused', async () => {
      const deps = createDeps({
        finalizeOutput: {
          sessionId: '22222222-2222-2222-2222-222222222222',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
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

      const first = await finalizeExamAnswers(input, deps);
      const second = await finalizeExamAnswers(input, deps);

      expect(first).toEqual({
        ok: true,
        data: {
          sessionId: '22222222-2222-2222-2222-222222222222',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 2,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 60,
          },
        },
      });
      expect(second).toEqual(first);
      expect(deps.finalizeExamAnswersUseCase.inputs).toHaveLength(1);
    });

    it('returns VALIDATION_ERROR when finalize output is invalid without idempotency', async () => {
      const deps = createDeps({
        finalizeOutput: {
          sessionId: '22222222-2222-2222-2222-222222222222',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: -1,
          totals: {
            answered: 2,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 60,
          },
        } as unknown as FinalizeExamAnswersOutput,
      });

      const result = await finalizeExamAnswers(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
        },
      });
    });
  });
});
