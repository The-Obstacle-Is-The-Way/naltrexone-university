import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ExamDraftSaveResult } from '@/app/(app)/app/practice/shared/question-flow-actions';
import { ok } from '@/tests/test-helpers/ok';

import { usePracticeSessionReviewStage } from './use-practice-session-review-stage';
import {
  createInput,
  createPostExamReview,
  createPostExamReviewRow,
  endPracticeSessionMock,
  finalizeExamAnswersMock,
  fixtureQ1Id,
  fixtureQ2Id,
  fixtureSession1Id,
  getCompletedSessionQuestionsWithFeedbackMock,
  getCurrentExamDraftMock,
  getPracticeSessionReviewMock,
  getPracticeSessionSummaryMock,
  saveCurrentExamDraftMock,
} from './use-practice-session-review-stage-test-helpers';

describe('usePracticeSessionReviewStage (browser)', () => {
  beforeEach(() => {
    saveCurrentExamDraftMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    endPracticeSessionMock.mockReset();
    finalizeExamAnswersMock.mockReset();
    getPracticeSessionReviewMock.mockReset();
    getPracticeSessionSummaryMock.mockReset();
    getCompletedSessionQuestionsWithFeedbackMock.mockReset();
    saveCurrentExamDraftMock.mockReset();
  });

  it('finalizes tutor sessions and loads summary review data', async () => {
    endPracticeSessionMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'tutor',
        questionCount: 10,
        totals: {
          answered: 10,
          correct: 8,
          accuracy: 0.8,
          durationSeconds: 1200,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 10,
        markedCount: 0,
        rows: [],
      }),
    );

    const input = createInput('tutor');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => harness.result.current.summary?.sessionId ?? null)
      .toBe(fixtureSession1Id);
    await expect
      .poll(() => harness.result.current.summaryReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.summaryReview?.sessionId).toBe(
      fixtureSession1Id,
    );
  });

  it('awaits tutor finalization from the finalize-review callback', async () => {
    endPracticeSessionMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'tutor',
        questionCount: 10,
        totals: {
          answered: 10,
          correct: 8,
          accuracy: 0.8,
          durationSeconds: 1200,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 10,
        markedCount: 0,
        rows: [],
      }),
    );

    const input = createInput('tutor');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    const finalized = await harness.result.current.onFinalizeReview();
    expect(finalized).toBe(true);

    await expect
      .poll(() => harness.result.current.summary?.sessionId ?? null)
      .toBe(fixtureSession1Id);
    expect(endPracticeSessionMock).toHaveBeenCalledTimes(1);
    expect(finalizeExamAnswersMock).not.toHaveBeenCalled();
  });

  it('sets review load error when exam review loading throws', async () => {
    getPracticeSessionReviewMock.mockRejectedValue(
      new Error('Review load failed'),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => harness.result.current.reviewLoadState.status)
      .toBe('error');
    expect(harness.result.current.reviewLoadState).toEqual({
      status: 'error',
      message: 'Review load failed',
    });
  });

  it('sets navigator error state and retries navigator fetch when requested', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    getPracticeSessionReviewMock.mockRejectedValueOnce(
      new Error('Navigator load failed'),
    );
    getPracticeSessionReviewMock.mockResolvedValueOnce(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: fixtureQ1Id,
            slug: 'q-1',
            stemMd: 'Stem 1',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
          {
            isAvailable: true,
            questionId: fixtureQ2Id,
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }),
    );

    const input = createInput('exam');
    input.sessionInfo = {
      sessionId: fixtureSession1Id,
      mode: 'exam',

      deadlineAt: '2099-05-22T12:02:24.000Z',

      index: 0,
      total: 2,
      isMarkedForReview: false,
    };

    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await expect
      .poll(() => harness.result.current.navigatorLoadState.status)
      .toBe('error');
    expect(harness.result.current.navigatorLoadState).toEqual({
      status: 'error',
      message: 'Navigator load failed',
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(harness.result.current.navigator).toBeNull();

    harness.result.current.onRetryNavigator();

    await expect
      .poll(() => harness.result.current.navigatorLoadState.status)
      .toBe('ready');
    expect(harness.result.current.navigator?.sessionId).toBe(fixtureSession1Id);
  });

  it('finalizes exam review via finalizeExamAnswers instead of endPracticeSession', async () => {
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [],
      }),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.summary).toBeNull();
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
    expect(endPracticeSessionMock).not.toHaveBeenCalled();
  });

  it('enters post-exam review after finalizing an exam instead of showing summary immediately', async () => {
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: fixtureQ1Id,
            slug: 'q-1',
            stemMd: 'Stem 1',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
            markedForReview: false,
            choices: [
              { id: 'c1', label: 'A', textMd: 'Choice A' },
              { id: 'c2', label: 'B', textMd: 'Choice B' },
            ],
            selectedChoiceId: 'c1',
            correctChoiceId: 'c2',
            explanationMd: 'Because B is correct.',
            referenceMd: 'Reference 1',
            choiceExplanations: [],
          },
          {
            isAvailable: true,
            questionId: fixtureQ2Id,
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
            choices: [{ id: 'c3', label: 'A', textMd: 'Choice A' }],
            selectedChoiceId: 'c3',
            correctChoiceId: 'c3',
            explanationMd: 'Because A is correct.',
            referenceMd: null,
            choiceExplanations: [],
          },
        ],
      }),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.summary).toBeNull();
    expect(harness.result.current.postExamReview?.sessionId).toBe(
      fixtureSession1Id,
    );
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      fixtureQ1Id,
    );
  });

  it('switches to session summary without clearing completed feedback or the current reviewed question', async () => {
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 1,
        totals: {
          answered: 1,
          correct: 1,
          accuracy: 1,
          durationSeconds: 60,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok(
        createPostExamReview(
          createPostExamReviewRow({ questionId: fixtureQ1Id, order: 1 }),
          createPostExamReviewRow({ questionId: fixtureQ2Id, order: 2 }),
        ),
      ),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    harness.result.current.onNavigatePostExamReviewQuestion(fixtureQ2Id);

    harness.result.current.onViewSummary();

    await expect
      .poll(() => harness.result.current.summary?.sessionId ?? null)
      .toBe(fixtureSession1Id);
    await expect
      .poll(() => harness.result.current.summaryReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.examResultsSubstage).toBe('session_summary');
    expect(harness.result.current.postExamReview?.sessionId).toBe(
      fixtureSession1Id,
    );
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      fixtureQ2Id,
    );
  });
  it('saves the current exam draft before entering review stage', async () => {
    const callOrder: string[] = [];
    saveCurrentExamDraftMock.mockImplementation(async () => {
      callOrder.push('save');
      return { ok: true };
    });
    getPracticeSessionReviewMock.mockImplementation(async () => {
      callOrder.push('review');
      return ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      });
    });

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect
      .poll(() => harness.result.current.reviewLoadState.status)
      .toBe('ready');
    expect(callOrder).toEqual(['save', 'review']);
  });

  it('finalizes with the captured exam draft when the current exam draft save fails with a conflict', async () => {
    saveCurrentExamDraftMock.mockResolvedValue({
      ok: false,
      code: 'CONFLICT',
      reason: 'exam_time_expired',
    } as ExamDraftSaveResult);
    getCurrentExamDraftMock.mockReturnValueOnce({
      questionId: fixtureQ1Id,
      selectedChoiceId: 'choice-1',
      cumulativeMs: 30_000,
    });
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 10,
        totals: {
          answered: 1,
          correct: 1,
          accuracy: 1,
          durationSeconds: 1200,
        },
      }),
    );
    getPracticeSessionSummaryMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 10,
        totals: {
          answered: 1,
          correct: 1,
          accuracy: 1,
          durationSeconds: 1200,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
      }),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect.poll(() => finalizeExamAnswersMock.mock.calls.length).toBe(1);
    expect(finalizeExamAnswersMock).toHaveBeenCalledWith({
      sessionId: fixtureSession1Id,
      idempotencyKey: expect.any(String),
      finalDraftAnswer: {
        questionId: fixtureQ1Id,
        selectedChoiceId: 'choice-1',
        cumulativeMs: 30_000,
      },
    });
    await expect
      .poll(() => harness.result.current.summary?.totals.answered)
      .toBe(1);
  });

  it('does not finalize when the current exam draft save fails with a transient state-write conflict', async () => {
    saveCurrentExamDraftMock.mockResolvedValue({
      ok: false,
      code: 'CONFLICT',
      reason: 'practice_session_state_changed_concurrently',
    } as ExamDraftSaveResult);
    getCurrentExamDraftMock.mockReturnValueOnce({
      questionId: fixtureQ1Id,
      selectedChoiceId: 'choice-1',
      cumulativeMs: 30_000,
    });

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect.poll(() => saveCurrentExamDraftMock.mock.calls.length).toBe(1);
    expect(finalizeExamAnswersMock).not.toHaveBeenCalled();
    expect(getPracticeSessionReviewMock).not.toHaveBeenCalled();
    await expect.poll(() => harness.result.current.isInReviewStage).toBe(false);
    expect(harness.result.current.reviewLoadState).toEqual({ status: 'idle' });
  });

  it('does not finalize or enter review when the current exam draft save fails without a conflict', async () => {
    saveCurrentExamDraftMock.mockResolvedValue({
      ok: false,
      code: 'INTERNAL_ERROR',
    });

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect.poll(() => saveCurrentExamDraftMock.mock.calls.length).toBe(1);
    expect(finalizeExamAnswersMock).not.toHaveBeenCalled();
    expect(getPracticeSessionReviewMock).not.toHaveBeenCalled();
    await expect.poll(() => harness.result.current.isInReviewStage).toBe(false);
    expect(harness.result.current.reviewLoadState).toEqual({ status: 'idle' });
  });

  it('reports draft-save exceptions and does not enter the review stage', async () => {
    saveCurrentExamDraftMock.mockRejectedValue(new Error('Draft save failed'));

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.onEndSession();

    await expect.poll(() => saveCurrentExamDraftMock.mock.calls.length).toBe(1);
    expect(getPracticeSessionReviewMock).not.toHaveBeenCalled();
    await expect.poll(() => harness.result.current.isInReviewStage).toBe(false);
    expect(harness.result.current.reviewLoadState).toEqual({ status: 'idle' });
  });
});
