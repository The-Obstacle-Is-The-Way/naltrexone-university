// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  FinalizeExamAnswersOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/adapters/controllers/practice-controller';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import {
  resolvePostExamReviewCurrentQuestionId,
  usePracticeSessionReviewStage,
} from './use-practice-session-review-stage';

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

function createPostExamReviewRow(input: {
  questionId: string;
  order: number;
  isAvailable?: boolean;
}): GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number] {
  if (input.isAvailable === false) {
    return {
      isAvailable: false,
      questionId: input.questionId,
      order: input.order,
      isAnswered: true,
      isCorrect: false,
      isOmitted: false,
      markedForReview: false,
    };
  }

  return {
    isAvailable: true,
    questionId: input.questionId,
    slug: `${input.questionId}-slug`,
    stemMd: `Stem for ${input.questionId}`,
    difficulty: 'easy',
    order: input.order,
    isAnswered: true,
    isCorrect: true,
    isOmitted: false,
    markedForReview: false,
    choices: [{ id: `${input.questionId}-choice-1`, label: 'A', textMd: 'A' }],
    selectedChoiceId: `${input.questionId}-choice-1`,
    correctChoiceId: `${input.questionId}-choice-1`,
    explanationMd: `Explanation for ${input.questionId}`,
    referenceMd: null,
    choiceExplanations: [],
  };
}

function createPostExamReview(
  ...rows: GetCompletedSessionQuestionsWithFeedbackOutput['rows']
): GetCompletedSessionQuestionsWithFeedbackOutput {
  return {
    sessionId: fixtureSession1Id,
    mode: 'exam',
    totalCount: rows.length,
    answeredCount: rows.filter((row) => row.isAnswered).length,
    markedCount: rows.filter((row) => row.markedForReview).length,
    rows,
  };
}

describe('usePracticeSessionReviewStage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeSessionReviewStage({
        sessionId: fixtureSession1Id,
        isMounted: () => true,
        sessionInfo: null,
        questionId: null,
        submitResult: null,
        sessionMode: null,
        setSessionMode: () => undefined,
        setLoadState: () => undefined,
        resetQuestionState: () => undefined,
        loadSpecificQuestion: () => undefined,
        saveCurrentExamDraft: async () => true,
        endPracticeSessionFn: async (): Promise<
          ActionResult<EndPracticeSessionOutput>
        > => {
          throw new Error('not used');
        },
        finalizeExamAnswersFn: async (): Promise<
          ActionResult<FinalizeExamAnswersOutput>
        > => {
          throw new Error('not used');
        },
        getPracticeSessionReviewFn: async (): Promise<
          ActionResult<GetPracticeSessionReviewOutput>
        > => {
          throw new Error('not used');
        },
        getCompletedSessionQuestionsWithFeedbackFn: async (): Promise<
          ActionResult<never>
        > => {
          throw new Error('not used');
        },
        getPracticeSessionSummaryFn: async (): Promise<
          ActionResult<EndPracticeSessionOutput>
        > => {
          throw new Error('not used');
        },
      }),
    );

    expect(output.summary).toBeNull();
    expect(typeof output.setSummary).toBe('function');
    expect(output.postExamSummary).toBeNull();
    expect(output.examResultsSubstage).toBeNull();
    expect(output.postExamReview).toBeNull();
    expect(output.postExamReviewLoadState).toEqual({ status: 'idle' });
    expect(output.postExamReviewCurrentQuestionId).toBeNull();
    expect(output.summaryReview).toBeNull();
    expect(output.summaryReviewLoadState).toEqual({ status: 'idle' });
    expect(output.review).toBeNull();
    expect(typeof output.setReview).toBe('function');
    expect(output.reviewLoadState).toEqual({ status: 'idle' });
    expect(output.navigator).toBeNull();
    expect(output.navigatorLoadState).toEqual({ status: 'idle' });
    expect(output.isInReviewStage).toBe(false);
    expect(typeof output.onEndSession).toBe('function');
    expect(typeof output.onOpenReviewQuestion).toBe('function');
    expect(typeof output.onNavigatePostExamReviewQuestion).toBe('function');
    expect(typeof output.onReenterPostExamReview).toBe('function');
    expect(typeof output.onRetryPostExamReview).toBe('function');
    expect(typeof output.onViewSummary).toBe('function');
    expect(typeof output.onFinalizeReview).toBe('function');
    expect(typeof output.onRetryNavigator).toBe('function');
    expect(typeof output.onRetryReview).toBe('function');
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
