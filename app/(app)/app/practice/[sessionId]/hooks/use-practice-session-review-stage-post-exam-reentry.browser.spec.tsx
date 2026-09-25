import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetCompletedSessionQuestionsWithFeedbackOutput } from '@/src/adapters/controllers/practice-controller';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
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
  flushDeferredSettlement,
  getCompletedSessionQuestionsWithFeedbackMock,
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

  it('re-enters post-exam review without a question id at the first available row instead of the current reviewed question', async () => {
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
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview();

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('post_exam_review');
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      fixtureQ1Id,
    );
    expect(getCompletedSessionQuestionsWithFeedbackMock).toHaveBeenCalledTimes(
      1,
    );
  });

  it('re-enters post-exam review on the specifically requested summary question', async () => {
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
    harness.result.current.onViewSummary();

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview(fixtureQ2Id);

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('post_exam_review');
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      fixtureQ2Id,
    );
  });

  it('falls back to the first available reviewed question on untargeted re-entry when the current cursor points at an unavailable row', async () => {
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
      ok(
        createPostExamReview(
          createPostExamReviewRow({
            questionId: fixtureQ1Id,
            order: 1,
            isAvailable: false,
          }),
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
    harness.result.current.onNavigatePostExamReviewQuestion(fixtureQ1Id);
    harness.result.current.onViewSummary();

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview();

    await expect
      .poll(() => harness.result.current.postExamReviewCurrentQuestionId)
      .toBe(fixtureQ2Id);
  });

  it('lazy-hydrates completed feedback to the first available row when summary re-entry has no preserved post-exam review payload', async () => {
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok(
        createPostExamReview(
          createPostExamReviewRow({
            questionId: fixtureQ1Id,
            order: 1,
            isAvailable: false,
          }),
          createPostExamReviewRow({ questionId: fixtureQ2Id, order: 2 }),
        ),
      ),
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.setSummary({
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
    });

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    expect(getCompletedSessionQuestionsWithFeedbackMock).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      fixtureQ2Id,
    );
    expect(harness.result.current.examResultsSubstage).toBe('post_exam_review');
  });

  it('does not start a duplicate post-exam review load while summary re-entry hydration is already in flight', async () => {
    const reviewLoad =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [],
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockImplementation(
      async () => reviewLoad.promise,
    );

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    harness.result.current.setSummary({
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
    });

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview();
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('loading');
    expect(getCompletedSessionQuestionsWithFeedbackMock).toHaveBeenCalledTimes(
      1,
    );

    harness.result.current.onReenterPostExamReview();
    expect(getCompletedSessionQuestionsWithFeedbackMock).toHaveBeenCalledTimes(
      1,
    );

    reviewLoad.resolve(ok(createPostExamReview(fixtureQ2Id)));
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
  });

  it('preserves the deferred exam summary when post-exam review loading fails so retry and summary recovery still work', async () => {
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: fixtureSession1Id,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 1,
        totals: {
          answered: 1,
          correct: 0,
          accuracy: 0,
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
    getCompletedSessionQuestionsWithFeedbackMock
      .mockRejectedValueOnce(new Error('Review fetch failed'))
      .mockResolvedValueOnce(
        ok({
          sessionId: fixtureSession1Id,
          mode: 'exam',
          totalCount: 1,
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
              isCorrect: false,
              isOmitted: false,
              markedForReview: false,
              choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
              selectedChoiceId: 'c1',
              correctChoiceId: 'c2',
              explanationMd: 'Because B is correct.',
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
      .toBe('error');
    expect(harness.result.current.postExamSummary?.sessionId).toBe(
      fixtureSession1Id,
    );

    harness.result.current.onRetryPostExamReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.postExamReview?.sessionId).toBe(
      fixtureSession1Id,
    );

    harness.result.current.onViewSummary();

    await expect
      .poll(() => harness.result.current.summary?.sessionId ?? null)
      .toBe(fixtureSession1Id);
  });

  it("keeps retry request B's success when stale retry request A rejects afterward", async () => {
    const retryA =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
    const retryB =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
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
    getCompletedSessionQuestionsWithFeedbackMock
      .mockRejectedValueOnce(new Error('Initial review fetch failed'))
      .mockImplementationOnce(async () => retryA.promise)
      .mockImplementationOnce(async () => retryB.promise);

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('error');

    harness.result.current.onRetryPostExamReview();
    harness.result.current.onRetryPostExamReview();

    await expect
      .poll(
        () => getCompletedSessionQuestionsWithFeedbackMock.mock.calls.length,
      )
      .toBe(3);

    retryB.resolve(ok(createPostExamReview('question-b')));
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState)
      .toEqual({ status: 'ready' });
    expect(harness.result.current.postExamReview?.rows[0]?.questionId).toBe(
      'question-b',
    );
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      'question-b',
    );

    retryA.reject(new Error('Stale retry failed'));
    await flushDeferredSettlement();

    expect(harness.result.current.postExamReviewLoadState).toEqual({
      status: 'ready',
    });
    expect(harness.result.current.postExamReview?.rows[0]?.questionId).toBe(
      'question-b',
    );
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe(
      'question-b',
    );
  });

  it("preserves retry request B's error when stale retry request A succeeds afterward", async () => {
    const retryA =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
    const retryB =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
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
    getCompletedSessionQuestionsWithFeedbackMock
      .mockRejectedValueOnce(new Error('Initial review fetch failed'))
      .mockImplementationOnce(async () => retryA.promise)
      .mockImplementationOnce(async () => retryB.promise);

    const input = createInput('exam');
    const harness = await renderHook(() =>
      usePracticeSessionReviewStage(input),
    );

    await harness.result.current.onFinalizeReview();

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('error');

    harness.result.current.onRetryPostExamReview();
    harness.result.current.onRetryPostExamReview();

    await expect
      .poll(
        () => getCompletedSessionQuestionsWithFeedbackMock.mock.calls.length,
      )
      .toBe(3);

    retryB.reject(new Error('Latest retry failed'));
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState)
      .toEqual({ status: 'error', message: 'Latest retry failed' });
    expect(harness.result.current.postExamReview).toBeNull();
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBeNull();

    retryA.resolve(ok(createPostExamReview('question-a')));
    await flushDeferredSettlement();

    expect(harness.result.current.postExamReviewLoadState).toEqual({
      status: 'error',
      message: 'Latest retry failed',
    });
    expect(harness.result.current.postExamReview).toBeNull();
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBeNull();
  });
});
