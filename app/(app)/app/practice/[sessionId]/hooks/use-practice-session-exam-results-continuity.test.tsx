// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import {
  resolvePostExamReviewCurrentQuestionId,
  usePracticeSessionExamResultsContinuity,
} from './use-practice-session-exam-results-continuity';
import {
  createPostExamReview,
  createPostExamReviewRow,
} from './use-practice-session-exam-results-continuity.fixtures';

describe('usePracticeSessionExamResultsContinuity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeSessionExamResultsContinuity({
        summary: null,
        setSummaryState: () => undefined,
        isMounted: () => true,
        sessionId: 'session-1',
        getCompletedSessionQuestionsWithFeedbackFn: vi.fn(),
      }),
    );

    expect(typeof output.setSummary).toBe('function');
    expect(output.postExamSummary).toBeNull();
    expect(output.examResultsSubstage).toBeNull();
    expect(output.postExamReview).toBeNull();
    expect(output.postExamReviewLoadState).toEqual({ status: 'idle' });
    expect(output.postExamReviewCurrentQuestionId).toBeNull();
    expect(typeof output.onNavigatePostExamReviewQuestion).toBe('function');
    expect(typeof output.onReenterPostExamReview).toBe('function');
    expect(typeof output.onRetryPostExamReview).toBe('function');
    expect(typeof output.onViewSummary).toBe('function');
    expect(typeof output.enterPostExamReview).toBe('function');
  });

  it('prefers the specifically requested available question over the persisted cursor', () => {
    const review = createPostExamReview(
      createPostExamReviewRow({ questionId: 'q1', order: 1 }),
      createPostExamReviewRow({ questionId: 'q2', order: 2 }),
    );
    expect(
      resolvePostExamReviewCurrentQuestionId(review, {
        requestedQuestionId: 'q2',
        persistedQuestionId: 'q1',
      }),
    ).toBe('q2');
  });

  it('falls back to the persisted available question when the requested row is unavailable', () => {
    const review = createPostExamReview(
      createPostExamReviewRow({
        questionId: 'q1',
        order: 1,
        isAvailable: false,
      }),
      createPostExamReviewRow({ questionId: 'q2', order: 2 }),
    );

    expect(
      resolvePostExamReviewCurrentQuestionId(review, {
        requestedQuestionId: 'q1',
        persistedQuestionId: 'q2',
      }),
    ).toBe('q2');
  });

  it('falls back to the first available row when the requested and persisted cursors are unavailable', () => {
    const review = createPostExamReview(
      createPostExamReviewRow({
        questionId: 'q1',
        order: 1,
        isAvailable: false,
      }),
      createPostExamReviewRow({
        questionId: 'q2',
        order: 2,
        isAvailable: false,
      }),
      createPostExamReviewRow({ questionId: 'q3', order: 3 }),
    );

    expect(
      resolvePostExamReviewCurrentQuestionId(review, {
        requestedQuestionId: 'q1',
        persistedQuestionId: 'q2',
      }),
    ).toBe('q3');
  });

  it('falls back to the first row when no review rows are available', () => {
    const review = createPostExamReview(
      createPostExamReviewRow({
        questionId: 'q1',
        order: 1,
        isAvailable: false,
      }),
      createPostExamReviewRow({
        questionId: 'q2',
        order: 2,
        isAvailable: false,
      }),
    );

    expect(
      resolvePostExamReviewCurrentQuestionId(review, {
        requestedQuestionId: 'missing',
        persistedQuestionId: 'also-missing',
      }),
    ).toBe('q1');
  });
});
