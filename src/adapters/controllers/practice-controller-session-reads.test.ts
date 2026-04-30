// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MAX_PAGINATION_OFFSET } from '@/src/adapters/shared/validation-limits';
import { ApplicationError } from '@/src/application/errors';
import {
  getCompletedSessionQuestionsWithFeedback,
  getIncompletePracticeSession,
  getPracticeSessionReview,
  getPracticeSessionSummary,
  getSessionHistory,
} from './practice-controller';
import { createDeps } from './practice-controller-test-helpers';

describe('practice-controller', () => {
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
              slug: 'question-1',
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

  describe('getCompletedSessionQuestionsWithFeedback', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getCompletedSessionQuestionsWithFeedback(
        { sessionId: 'bad' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { sessionId: expect.any(Array) },
        },
      });
      expect(
        deps.getCompletedSessionQuestionsWithFeedbackUseCase.inputs,
      ).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await getCompletedSessionQuestionsWithFeedback(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(
        deps.getCompletedSessionQuestionsWithFeedbackUseCase.inputs,
      ).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getCompletedSessionQuestionsWithFeedback(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(
        deps.getCompletedSessionQuestionsWithFeedbackUseCase.inputs,
      ).toEqual([]);
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const sessionId = '11111111-1111-1111-1111-111111111111';
      const deps = createDeps({
        completedQuestionsThrows: new ApplicationError(
          'NOT_FOUND',
          'Practice session not found',
        ),
      });

      const result = await getCompletedSessionQuestionsWithFeedback(
        { sessionId },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Practice session not found' },
      });
      expect(
        deps.getCompletedSessionQuestionsWithFeedbackUseCase.inputs,
      ).toEqual([{ userId: 'user_1', sessionId }]);
    });

    it('returns completed feedback rows when the use case succeeds', async () => {
      const deps = createDeps({
        completedQuestionsOutput: {
          sessionId: '11111111-1111-1111-1111-111111111111',
          mode: 'exam',
          totalCount: 1,
          answeredCount: 1,
          markedCount: 0,
          rows: [
            {
              isAvailable: true,
              questionId: '22222222-2222-2222-2222-222222222222',
              slug: 'question-1',
              stemMd: 'Stem',
              difficulty: 'easy',
              order: 1,
              isAnswered: true,
              isCorrect: false,
              markedForReview: false,
              choices: [
                {
                  id: '33333333-3333-3333-3333-333333333333',
                  label: 'A',
                  textMd: 'Choice A',
                },
              ],
              selectedChoiceId: '33333333-3333-3333-3333-333333333333',
              correctChoiceId: '44444444-4444-4444-4444-444444444444',
              explanationMd: 'Explanation',
              referenceMd: null,
              choiceExplanations: [],
            },
          ],
        },
      });

      const sessionId = '11111111-1111-1111-1111-111111111111';
      const result = await getCompletedSessionQuestionsWithFeedback(
        { sessionId },
        deps,
      );

      expect(result).toMatchObject({
        ok: true,
        data: { sessionId, answeredCount: 1 },
      });
      expect(
        deps.getCompletedSessionQuestionsWithFeedbackUseCase.inputs,
      ).toEqual([{ userId: 'user_1', sessionId }]);
    });
  });

  describe('getPracticeSessionSummary', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getPracticeSessionSummary(
        { sessionId: 'bad' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { sessionId: expect.any(Array) },
        },
      });
      expect(deps.getPracticeSessionSummaryUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await getPracticeSessionSummary(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.getPracticeSessionSummaryUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getPracticeSessionSummary(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.getPracticeSessionSummaryUseCase.inputs).toEqual([]);
    });

    it('returns CONFLICT when the use case rejects active sessions', async () => {
      const deps = createDeps({
        summaryThrows: new ApplicationError(
          'CONFLICT',
          'Practice session has not ended',
        ),
      });

      const result = await getPracticeSessionSummary(
        { sessionId: '11111111-1111-1111-1111-111111111111' },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'CONFLICT', message: 'Practice session has not ended' },
      });
    });

    it('returns NOT_FOUND when the use case cannot find the session', async () => {
      const deps = createDeps({
        summaryThrows: new ApplicationError(
          'NOT_FOUND',
          'Practice session not found',
        ),
      });

      const sessionId = '11111111-1111-1111-1111-111111111111';
      const result = await getPracticeSessionSummary({ sessionId }, deps);

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Practice session not found' },
      });
      expect(deps.getPracticeSessionSummaryUseCase.inputs).toEqual([
        { userId: 'user_1', sessionId },
      ]);
    });

    it('returns summary payload when use case succeeds', async () => {
      const deps = createDeps({
        summaryOutput: {
          sessionId: '11111111-1111-1111-1111-111111111111',
          endedAt: '2026-02-01T00:00:00.000Z',
          mode: 'exam',
          questionCount: 0,
          totals: { answered: 0, correct: 0, accuracy: 0, durationSeconds: 0 },
        },
      });

      const sessionId = '11111111-1111-1111-1111-111111111111';
      const result = await getPracticeSessionSummary({ sessionId }, deps);

      expect(result).toMatchObject({
        ok: true,
        data: { sessionId, questionCount: 0 },
      });
      expect(deps.getPracticeSessionSummaryUseCase.inputs).toEqual([
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

    it('returns VALIDATION_ERROR when offset exceeds the maximum', async () => {
      const deps = createDeps();

      const result = await getSessionHistory(
        { limit: 20, offset: MAX_PAGINATION_OFFSET + 1 },
        deps,
      );

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
              firstQuestionSlug: 'question-1',
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
              firstQuestionSlug: 'question-1',
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
        { userId: 'user_1', limit: 20, offset: 0, mode: null },
      ]);
    });

    it('passes optional mode filter to session history use case', async () => {
      const deps = createDeps();

      const result = await getSessionHistory(
        { limit: 20, offset: 0, mode: 'tutor' },
        deps,
      );

      expect(result).toMatchObject({ ok: true });
      expect(deps.getSessionHistoryUseCase.inputs).toEqual([
        { userId: 'user_1', limit: 20, offset: 0, mode: 'tutor' },
      ]);
    });
  });
});
