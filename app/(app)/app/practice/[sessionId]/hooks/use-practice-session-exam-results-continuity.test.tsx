// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
} from '@/src/adapters/controllers/practice-controller';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionExamResultsContinuity } from './use-practice-session-exam-results-continuity';

type ContinuityOutput = ReturnType<
  typeof usePracticeSessionExamResultsContinuity
>;
type GetCompletedSessionQuestionsWithFeedbackFn = Parameters<
  typeof usePracticeSessionExamResultsContinuity
>[0]['getCompletedSessionQuestionsWithFeedbackFn'];

function createSummary(
  input?: Partial<EndPracticeSessionOutput>,
): EndPracticeSessionOutput {
  return {
    sessionId: 'session-1',
    endedAt: '2026-02-07T00:20:00.000Z',
    mode: 'exam',
    questionCount: 3,
    totals: {
      answered: 3,
      correct: 2,
      accuracy: 2 / 3,
      durationSeconds: 180,
    },
    ...input,
  };
}

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
    markedForReview: false,
    choices: [
      { id: `${input.questionId}-choice-1`, label: 'A', textMd: 'Choice A' },
    ],
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
    sessionId: 'session-1',
    mode: 'exam',
    totalCount: rows.length,
    answeredCount: rows.filter((row) => row.isAnswered).length,
    markedCount: rows.filter((row) => row.markedForReview).length,
    rows,
  };
}

const liveHookCleanups: Array<() => Promise<void>> = [];

async function renderLiveContinuityHook(input?: {
  initialSummary?: EndPracticeSessionOutput | null;
  getCompletedSessionQuestionsWithFeedbackFn?: GetCompletedSessionQuestionsWithFeedbackFn;
}) {
  let current: ContinuityOutput | null = null;

  function Harness() {
    const [summary, setSummaryState] =
      useState<EndPracticeSessionOutput | null>(input?.initialSummary ?? null);

    current = usePracticeSessionExamResultsContinuity({
      summary,
      setSummaryState,
      isMounted: () => true,
      sessionId: 'session-1',
      getCompletedSessionQuestionsWithFeedbackFn:
        input?.getCompletedSessionQuestionsWithFeedbackFn ?? vi.fn(),
    });

    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  liveHookCleanups.push(cleanup);

  await act(async () => {
    root.render(<Harness />);
  });

  const getCurrent = () => {
    if (!current) {
      throw new Error('Expected hook output to be available');
    }
    return current;
  };

  return {
    get current() {
      return getCurrent();
    },
    async run<T>(callback: () => T | Promise<T>): Promise<T> {
      let value: T | undefined;
      await act(async () => {
        value = await callback();
      });
      if (value === undefined) {
        return undefined as T;
      }
      return value;
    },
  };
}

describe('usePracticeSessionExamResultsContinuity', () => {
  afterEach(async () => {
    while (liveHookCleanups.length > 0) {
      const cleanup = liveHookCleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
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
    const harness = await renderLiveContinuityHook({
      getCompletedSessionQuestionsWithFeedbackFn,
    });

    await harness.run(async () => {
      await harness.current.enterPostExamReview(createSummary());
    });
    expect(harness.current.postExamReviewCurrentQuestionId).toBe('q2');

    await harness.run(async () => {
      harness.current.onNavigatePostExamReviewQuestion('q3');
    });
    expect(harness.current.postExamReviewCurrentQuestionId).toBe('q3');

    await harness.run(async () => {
      harness.current.onViewSummary();
    });
    expect(harness.current.examResultsSubstage).toBe('session_summary');

    await harness.run(async () => {
      harness.current.onReenterPostExamReview();
    });

    expect(harness.current.postExamReviewCurrentQuestionId).toBe('q2');
    expect(harness.current.examResultsSubstage).toBe('post_exam_review');
    expect(getCompletedSessionQuestionsWithFeedbackFn).toHaveBeenCalledTimes(1);
  });

  it('preserves the requested cached summary re-entry row when a specific question id is provided', async () => {
    const review = createPostExamReview(
      createPostExamReviewRow({ questionId: 'q1', order: 1 }),
      createPostExamReviewRow({ questionId: 'q2', order: 2 }),
      createPostExamReviewRow({ questionId: 'q3', order: 3 }),
    );
    const harness = await renderLiveContinuityHook({
      getCompletedSessionQuestionsWithFeedbackFn: vi
        .fn<GetCompletedSessionQuestionsWithFeedbackFn>()
        .mockResolvedValue(ok(review)),
    });

    await harness.run(async () => {
      await harness.current.enterPostExamReview(createSummary());
    });
    await harness.run(async () => {
      harness.current.onNavigatePostExamReviewQuestion('q3');
      harness.current.onViewSummary();
    });
    expect(harness.current.examResultsSubstage).toBe('session_summary');

    await harness.run(async () => {
      harness.current.onReenterPostExamReview('q2');
    });

    expect(harness.current.postExamReviewCurrentQuestionId).toBe('q2');
    expect(harness.current.examResultsSubstage).toBe('post_exam_review');
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
    const harness = await renderLiveContinuityHook({
      getCompletedSessionQuestionsWithFeedbackFn,
    });

    await harness.run(async () => {
      harness.current.setSummary(createSummary());
    });
    await harness.run(async () => {
      harness.current.onNavigatePostExamReviewQuestion('q3');
    });
    expect(harness.current.postExamReviewCurrentQuestionId).toBe('q3');

    await harness.run(async () => {
      harness.current.onReenterPostExamReview();
    });
    expect(harness.current.postExamReviewLoadState).toEqual({
      status: 'loading',
    });

    await harness.run(async () => {
      reviewLoad.resolve(ok(review));
      await reviewLoad.promise;
    });

    expect(harness.current.postExamReviewCurrentQuestionId).toBe('q2');
    expect(harness.current.postExamReviewLoadState).toEqual({
      status: 'ready',
    });
    expect(harness.current.examResultsSubstage).toBe('post_exam_review');
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
    const harness = await renderLiveContinuityHook({
      getCompletedSessionQuestionsWithFeedbackFn: vi.fn(
        async () => reviewLoad.promise,
      ),
    });

    await harness.run(async () => {
      harness.current.setSummary(createSummary());
      harness.current.onNavigatePostExamReviewQuestion('q3');
    });

    await harness.run(async () => {
      harness.current.onReenterPostExamReview('q2');
    });
    expect(harness.current.postExamReviewLoadState).toEqual({
      status: 'loading',
    });

    await harness.run(async () => {
      reviewLoad.resolve(ok(review));
      await reviewLoad.promise;
    });

    expect(harness.current.postExamReviewCurrentQuestionId).toBe('q2');
    expect(harness.current.postExamReviewLoadState).toEqual({
      status: 'ready',
    });
    expect(harness.current.examResultsSubstage).toBe('post_exam_review');
  });
});
