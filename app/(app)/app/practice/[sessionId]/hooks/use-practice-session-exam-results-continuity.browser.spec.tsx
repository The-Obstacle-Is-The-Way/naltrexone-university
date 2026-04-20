import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
} from '@/src/adapters/controllers/practice-controller';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionExamResultsContinuity } from './use-practice-session-exam-results-continuity';
import {
  createPostExamReview,
  createPostExamReviewRow,
  createSummary,
} from './use-practice-session-exam-results-continuity.fixtures';

type GetCompletedSessionQuestionsWithFeedbackFn = Parameters<
  typeof usePracticeSessionExamResultsContinuity
>[0]['getCompletedSessionQuestionsWithFeedbackFn'];

async function renderContinuityHook(input?: {
  initialSummary?: EndPracticeSessionOutput | null;
  getCompletedSessionQuestionsWithFeedbackFn?: GetCompletedSessionQuestionsWithFeedbackFn;
}) {
  const initialSummary = input?.initialSummary ?? null;
  const getCompletedSessionQuestionsWithFeedbackFn =
    input?.getCompletedSessionQuestionsWithFeedbackFn ?? vi.fn();
  const isMounted = () => true;

  return renderHook(() => {
    const [summary, setSummaryState] =
      useState<EndPracticeSessionOutput | null>(initialSummary);

    return usePracticeSessionExamResultsContinuity({
      summary,
      setSummaryState,
      isMounted,
      sessionId: 'session-1',
      getCompletedSessionQuestionsWithFeedbackFn,
    });
  });
}

describe('usePracticeSessionExamResultsContinuity (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets untargeted cached summary re-entry to the first available row instead of the persisted cursor', async () => {
    const review = createPostExamReview(
      createPostExamReviewRow({
        questionId: 'q1',
        order: 1,
        isAvailable: false,
      }),
      createPostExamReviewRow({ questionId: 'q2', order: 2 }),
      createPostExamReviewRow({ questionId: 'q3', order: 3 }),
    );
    const getCompletedSessionQuestionsWithFeedbackFn = vi
      .fn<GetCompletedSessionQuestionsWithFeedbackFn>()
      .mockResolvedValue(ok(review));
    const harness = await renderContinuityHook({
      getCompletedSessionQuestionsWithFeedbackFn,
    });

    await harness.result.current.enterPostExamReview(createSummary());
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe('q2');

    harness.result.current.onNavigatePostExamReviewQuestion('q3');
    await expect
      .poll(() => harness.result.current.postExamReviewCurrentQuestionId)
      .toBe('q3');

    harness.result.current.onViewSummary();
    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview();

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('post_exam_review');
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe('q2');
    expect(getCompletedSessionQuestionsWithFeedbackFn).toHaveBeenCalledTimes(1);
  });

  it('preserves the requested cached summary re-entry row when a specific question id is provided', async () => {
    const review = createPostExamReview(
      createPostExamReviewRow({ questionId: 'q1', order: 1 }),
      createPostExamReviewRow({ questionId: 'q2', order: 2 }),
      createPostExamReviewRow({ questionId: 'q3', order: 3 }),
    );
    const harness = await renderContinuityHook({
      getCompletedSessionQuestionsWithFeedbackFn: vi
        .fn<GetCompletedSessionQuestionsWithFeedbackFn>()
        .mockResolvedValue(ok(review)),
    });

    await harness.result.current.enterPostExamReview(createSummary());
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');

    harness.result.current.onNavigatePostExamReviewQuestion('q3');
    harness.result.current.onViewSummary();
    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview('q2');

    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('post_exam_review');
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe('q2');
  });

  it('resets untargeted lazy-hydrated summary re-entry to the first available row even when the persisted cursor points later in the review', async () => {
    const review = createPostExamReview(
      createPostExamReviewRow({
        questionId: 'q1',
        order: 1,
        isAvailable: false,
      }),
      createPostExamReviewRow({ questionId: 'q2', order: 2 }),
      createPostExamReviewRow({ questionId: 'q3', order: 3 }),
    );
    const reviewLoad =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
    const getCompletedSessionQuestionsWithFeedbackFn = vi.fn(
      async () => reviewLoad.promise,
    );
    const harness = await renderContinuityHook({
      getCompletedSessionQuestionsWithFeedbackFn,
    });

    harness.result.current.setSummary(createSummary());
    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onNavigatePostExamReviewQuestion('q3');
    await expect
      .poll(() => harness.result.current.postExamReviewCurrentQuestionId)
      .toBe('q3');

    harness.result.current.onReenterPostExamReview();
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('loading');

    reviewLoad.resolve(ok(review));
    await reviewLoad.promise;

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe('q2');
    expect(harness.result.current.examResultsSubstage).toBe('post_exam_review');
  });

  it('preserves the requested lazy-hydrated summary re-entry row when a specific question id is provided', async () => {
    const review = createPostExamReview(
      createPostExamReviewRow({ questionId: 'q1', order: 1 }),
      createPostExamReviewRow({ questionId: 'q2', order: 2 }),
      createPostExamReviewRow({ questionId: 'q3', order: 3 }),
    );
    const reviewLoad =
      createDeferred<
        ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>
      >();
    const harness = await renderContinuityHook({
      getCompletedSessionQuestionsWithFeedbackFn: vi.fn(
        async () => reviewLoad.promise,
      ),
    });

    harness.result.current.setSummary(createSummary());
    harness.result.current.onNavigatePostExamReviewQuestion('q3');
    await expect
      .poll(() => harness.result.current.examResultsSubstage)
      .toBe('session_summary');

    harness.result.current.onReenterPostExamReview('q2');
    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('loading');

    reviewLoad.resolve(ok(review));
    await reviewLoad.promise;

    await expect
      .poll(() => harness.result.current.postExamReviewLoadState.status)
      .toBe('ready');
    expect(harness.result.current.postExamReviewCurrentQuestionId).toBe('q2');
    expect(harness.result.current.examResultsSubstage).toBe('post_exam_review');
  });
});
