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

const {
  fixtureQuestion1Id,
  fixtureQuestion2Id,
  fixtureQuestion3Id,
  fixtureSession1Id,
} = vi.hoisted(() => ({
  fixtureQuestion1Id: crypto.randomUUID(),
  fixtureQuestion2Id: crypto.randomUUID(),
  fixtureQuestion3Id: crypto.randomUUID(),
  fixtureSession1Id: crypto.randomUUID(),
}));

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
        sessionId: fixtureSession1Id,
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
      createPostExamReviewRow({ questionId: fixtureQuestion1Id, order: 1 }),
      createPostExamReviewRow({ questionId: fixtureQuestion2Id, order: 2 }),
    );
    expect(
      resolvePostExamReviewCurrentQuestionId(review, {
        requestedQuestionId: fixtureQuestion2Id,
        persistedQuestionId: fixtureQuestion1Id,
      }),
    ).toBe(fixtureQuestion2Id);
  });

  it('falls back to the persisted available question when the requested row is unavailable', () => {
    const review = createPostExamReview(
      createPostExamReviewRow({
        questionId: fixtureQuestion1Id,
        order: 1,
        isAvailable: false,
      }),
      createPostExamReviewRow({ questionId: fixtureQuestion2Id, order: 2 }),
    );

    expect(
      resolvePostExamReviewCurrentQuestionId(review, {
        requestedQuestionId: fixtureQuestion1Id,
        persistedQuestionId: fixtureQuestion2Id,
      }),
    ).toBe(fixtureQuestion2Id);
  });

  it('falls back to the first available row when the requested and persisted cursors are unavailable', () => {
    const review = createPostExamReview(
      createPostExamReviewRow({
        questionId: fixtureQuestion1Id,
        order: 1,
        isAvailable: false,
      }),
      createPostExamReviewRow({
        questionId: fixtureQuestion2Id,
        order: 2,
        isAvailable: false,
      }),
      createPostExamReviewRow({ questionId: fixtureQuestion3Id, order: 3 }),
    );

    expect(
      resolvePostExamReviewCurrentQuestionId(review, {
        requestedQuestionId: fixtureQuestion1Id,
        persistedQuestionId: fixtureQuestion2Id,
      }),
    ).toBe(fixtureQuestion3Id);
  });

  it('falls back to the first row when no review rows are available', () => {
    const review = createPostExamReview(
      createPostExamReviewRow({
        questionId: fixtureQuestion1Id,
        order: 1,
        isAvailable: false,
      }),
      createPostExamReviewRow({
        questionId: fixtureQuestion2Id,
        order: 2,
        isAvailable: false,
      }),
    );

    expect(
      resolvePostExamReviewCurrentQuestionId(review, {
        requestedQuestionId: 'missing',
        persistedQuestionId: 'also-missing',
      }),
    ).toBe(fixtureQuestion1Id);
  });
});
