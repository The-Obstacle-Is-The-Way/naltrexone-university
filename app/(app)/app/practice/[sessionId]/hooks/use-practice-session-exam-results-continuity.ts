'use client';

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from 'react';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/shared/error-message-helpers';
import { STANDARD_READ_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import { reportClientError } from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
} from '@/src/adapters/controllers/practice-controller';

type GetCompletedSessionQuestionsWithFeedbackFn = (input: {
  sessionId: string;
}) => Promise<ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>>;
type LoadPostExamReviewOptions = {
  requestedQuestionId?: string | null;
  persistedQuestionId?: string | null;
  nextSubstageOnSuccess?: ExamResultsSubstage | null;
};

export type ExamResultsSubstage = 'post_exam_review' | 'session_summary';

export function resolvePostExamReviewCurrentQuestionId(
  review: GetCompletedSessionQuestionsWithFeedbackOutput,
  input: {
    requestedQuestionId?: string | null;
    persistedQuestionId?: string | null;
  },
): string | null {
  const requestedQuestionId = input.requestedQuestionId ?? null;
  const persistedQuestionId = input.persistedQuestionId ?? null;
  if (requestedQuestionId) {
    const requestedRow = review.rows.find(
      (row) => row.questionId === requestedQuestionId && row.isAvailable,
    );
    if (requestedRow) return requestedRow.questionId;
  }

  if (persistedQuestionId) {
    const persistedRow = review.rows.find(
      (row) => row.questionId === persistedQuestionId && row.isAvailable,
    );
    if (persistedRow) return persistedRow.questionId;
  }

  return (
    review.rows.find((row) => row.isAvailable)?.questionId ??
    review.rows[0]?.questionId ??
    null
  );
}

export function usePracticeSessionExamResultsContinuity(input: {
  summary: EndPracticeSessionOutput | null;
  setSummaryState: Dispatch<SetStateAction<EndPracticeSessionOutput | null>>;
  isMounted: () => boolean;
  sessionId: string;
  getCompletedSessionQuestionsWithFeedbackFn: GetCompletedSessionQuestionsWithFeedbackFn;
}) {
  const [pendingExamSummary, setPendingExamSummary] =
    useState<EndPracticeSessionOutput | null>(null);
  const [examResultsSubstage, setExamResultsSubstage] =
    useState<ExamResultsSubstage | null>(null);
  const [postExamReview, setPostExamReview] =
    useState<GetCompletedSessionQuestionsWithFeedbackOutput | null>(null);
  const [postExamReviewLoadState, setPostExamReviewLoadState] =
    useState<LoadState>({ status: 'idle' });
  const [postExamReviewCurrentQuestionId, setPostExamReviewCurrentQuestionId] =
    useState<string | null>(null);
  const summaryRef = useRef(input.summary);
  const latestPostExamReviewRequestIdRef = useRef(0);
  summaryRef.current = input.summary;
  const setSummary = useCallback<
    Dispatch<SetStateAction<EndPracticeSessionOutput | null>>
  >(
    (nextSummary) => {
      const resolvedSummary =
        typeof nextSummary === 'function'
          ? nextSummary(summaryRef.current)
          : nextSummary;
      input.setSummaryState(resolvedSummary);
      if (resolvedSummary?.mode === 'exam') {
        setExamResultsSubstage('session_summary');
        return;
      }
      setExamResultsSubstage(null);
    },
    [input.setSummaryState],
  );

  const loadPostExamReview = useCallback(
    async (
      nextSummary: EndPracticeSessionOutput | null,
      options?: LoadPostExamReviewOptions,
    ): Promise<void> => {
      if (!nextSummary) return;

      latestPostExamReviewRequestIdRef.current += 1;
      const requestId = latestPostExamReviewRequestIdRef.current;
      setPendingExamSummary(nextSummary);
      setPostExamReviewLoadState({ status: 'loading' });

      let result: Awaited<
        ReturnType<typeof input.getCompletedSessionQuestionsWithFeedbackFn>
      >;
      try {
        result = await withTimeout(
          input.getCompletedSessionQuestionsWithFeedbackFn({
            sessionId: input.sessionId,
          }),
          STANDARD_READ_TIMEOUT_MS,
        );
      } catch (error) {
        if (!input.isMounted()) return;
        if (requestId !== latestPostExamReviewRequestIdRef.current) return;
        reportClientError(error, {
          component: 'UsePracticeSessionExamResultsContinuity',
          action: 'loadPostExamReview',
        });
        setPostExamReviewLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
        return;
      }

      if (!input.isMounted()) return;
      if (requestId !== latestPostExamReviewRequestIdRef.current) return;
      if (!result.ok) {
        setPostExamReviewLoadState({
          status: 'error',
          message: getActionResultErrorMessage(result),
        });
        return;
      }

      setPostExamReview(result.data);
      setPostExamReviewCurrentQuestionId(
        resolvePostExamReviewCurrentQuestionId(result.data, {
          requestedQuestionId: options?.requestedQuestionId ?? null,
          persistedQuestionId: options?.persistedQuestionId ?? null,
        }),
      );
      setPostExamReviewLoadState({ status: 'ready' });
      if (options?.nextSubstageOnSuccess) {
        setExamResultsSubstage(options.nextSubstageOnSuccess);
      }
    },
    [
      input.getCompletedSessionQuestionsWithFeedbackFn,
      input.isMounted,
      input.sessionId,
    ],
  );

  const onNavigatePostExamReviewQuestion = useCallback(
    (questionId: string) => setPostExamReviewCurrentQuestionId(questionId),
    [],
  );

  const onRetryPostExamReview = useCallback(() => {
    void loadPostExamReview(pendingExamSummary ?? input.summary, {
      persistedQuestionId: postExamReviewCurrentQuestionId,
      nextSubstageOnSuccess: 'post_exam_review',
    });
  }, [
    input.summary,
    loadPostExamReview,
    pendingExamSummary,
    postExamReviewCurrentQuestionId,
  ]);

  const onViewSummary = useCallback(() => {
    const nextSummary = pendingExamSummary ?? input.summary;
    if (!nextSummary) return;
    setPendingExamSummary(nextSummary);
    setSummary(nextSummary);
  }, [input.summary, pendingExamSummary, setSummary]);

  const onReenterPostExamReview = useCallback(
    (questionId?: string) => {
      const nextSummary = pendingExamSummary ?? input.summary;
      if (!nextSummary) return;

      if (postExamReview) {
        setPendingExamSummary(nextSummary);
        setPostExamReviewCurrentQuestionId(
          resolvePostExamReviewCurrentQuestionId(postExamReview, {
            requestedQuestionId: questionId ?? null,
            persistedQuestionId: questionId
              ? postExamReviewCurrentQuestionId
              : null,
          }),
        );
        setExamResultsSubstage('post_exam_review');
        return;
      }
      if (postExamReviewLoadState.status === 'loading') return;
      void loadPostExamReview(nextSummary, {
        requestedQuestionId: questionId ?? null,
        persistedQuestionId: questionId
          ? postExamReviewCurrentQuestionId
          : null,
        nextSubstageOnSuccess: 'post_exam_review',
      });
    },
    [
      input.summary,
      loadPostExamReview,
      pendingExamSummary,
      postExamReview,
      postExamReviewCurrentQuestionId,
      postExamReviewLoadState.status,
    ],
  );

  const enterPostExamReview = useCallback(
    async (summary: EndPracticeSessionOutput | null): Promise<void> => {
      if (!summary) return;
      setExamResultsSubstage('post_exam_review');
      await loadPostExamReview(summary, {
        nextSubstageOnSuccess: 'post_exam_review',
      });
    },
    [loadPostExamReview],
  );

  return {
    setSummary,
    postExamSummary: pendingExamSummary,
    examResultsSubstage,
    postExamReview,
    postExamReviewLoadState,
    postExamReviewCurrentQuestionId,
    onNavigatePostExamReviewQuestion,
    onReenterPostExamReview,
    onRetryPostExamReview,
    onViewSummary,
    enterPostExamReview,
  };
}
