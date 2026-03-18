import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  FinalizeExamAnswersOutput,
  GetPracticeSessionReviewOutput,
  GetPracticeSessionSummaryOutput,
} from '@/src/adapters/controllers/practice-controller';
import { ok } from '@/tests/test-helpers/ok';
import {
  type UsePracticeSessionReviewStageInput,
  usePracticeSessionReviewStage,
} from './use-practice-session-review-stage';

const endPracticeSessionMock =
  vi.fn<(input: unknown) => Promise<ActionResult<EndPracticeSessionOutput>>>();
const finalizeExamAnswersMock =
  vi.fn<(input: unknown) => Promise<ActionResult<FinalizeExamAnswersOutput>>>();
const getPracticeSessionReviewMock =
  vi.fn<
    (input: unknown) => Promise<ActionResult<GetPracticeSessionReviewOutput>>
  >();
const getPracticeSessionSummaryMock =
  vi.fn<
    (input: unknown) => Promise<ActionResult<GetPracticeSessionSummaryOutput>>
  >();
const saveCurrentExamDraftMock = vi.fn<() => Promise<boolean>>();

function createInput(sessionMode: 'tutor' | 'exam') {
  return {
    sessionId: 'session-1',
    isMounted: () => true,
    sessionInfo: null as UsePracticeSessionReviewStageInput['sessionInfo'],
    questionId: null,
    submitResult: null,
    sessionMode,
    setSessionMode: vi.fn(),
    setLoadState: vi.fn(),
    resetQuestionState: vi.fn(),
    loadSpecificQuestion: vi.fn(),
    endPracticeSessionFn: endPracticeSessionMock,
    finalizeExamAnswersFn: finalizeExamAnswersMock,
    getPracticeSessionReviewFn: getPracticeSessionReviewMock,
    getPracticeSessionSummaryFn: getPracticeSessionSummaryMock,
    saveCurrentExamDraft: saveCurrentExamDraftMock,
  };
}

describe('usePracticeSessionReviewStage (browser)', () => {
  beforeEach(() => {
    saveCurrentExamDraftMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    endPracticeSessionMock.mockReset();
    finalizeExamAnswersMock.mockReset();
    getPracticeSessionReviewMock.mockReset();
    getPracticeSessionSummaryMock.mockReset();
    saveCurrentExamDraftMock.mockReset();
  });

  it('finalizes tutor sessions and loads summary review data', async () => {
    endPracticeSessionMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
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
        sessionId: 'session-1',
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
      .toBe('session-1');
    await expect
      .poll(() => harness.result.current.summaryReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.summaryReview?.sessionId).toBe('session-1');
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
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'q1',
            slug: 'q-1',
            stemMd: 'Stem 1',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
          {
            isAvailable: true,
            questionId: 'q2',
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }),
    );

    const input = createInput('exam');
    input.sessionInfo = {
      sessionId: 'session-1',
      mode: 'exam',
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
    expect(harness.result.current.navigator?.sessionId).toBe('session-1');
  });

  it('finalizes exam review via finalizeExamAnswers instead of endPracticeSession', async () => {
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [],
      }),
    );
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
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

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();

    await expect
      .poll(() => harness.result.current.summary?.sessionId ?? null)
      .toBe('session-1');
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
    expect(endPracticeSessionMock).not.toHaveBeenCalled();
  });

  it('saves the current exam draft before entering review stage', async () => {
    const callOrder: string[] = [];
    saveCurrentExamDraftMock.mockImplementation(async () => {
      callOrder.push('save');
      return true;
    });
    getPracticeSessionReviewMock.mockImplementation(async () => {
      callOrder.push('review');
      return ok({
        sessionId: 'session-1',
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
