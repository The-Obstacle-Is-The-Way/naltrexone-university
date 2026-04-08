'use client';

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from 'react';
import { usePracticeSessionNavigator } from '@/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-navigator';
import { usePracticeSessionReviewStageState } from '@/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state';
import { usePracticeSessionSummaryReview } from '@/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-summary-review';
import { endSession } from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import { STANDARD_READ_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import { reportClientError } from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  FinalizeExamAnswersOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
  GetPracticeSessionReviewOutput,
  GetPracticeSessionSummaryOutput,
} from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

type SessionIdInput = { sessionId: string };
type EndPracticeSessionActionInput = SessionIdInput & {
  idempotencyKey?: string;
};
type FinalizeExamAnswersActionInput = SessionIdInput & {
  idempotencyKey?: string;
};

const POST_EXAM_REVIEW_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;

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

export type UsePracticeSessionReviewStageInput = {
  sessionId: string;
  isMounted: () => boolean;
  sessionInfo: NextQuestion['session'];
  questionId: string | null;
  submitResult: SubmitAnswerOutput | null;
  sessionMode: 'tutor' | 'exam' | null;
  setSessionMode: (mode: 'tutor' | 'exam' | null) => void;
  setLoadState: (state: LoadState) => void;
  resetQuestionState: () => void;
  loadSpecificQuestion: (questionId: string) => void;
  saveCurrentExamDraft: () => Promise<boolean>;
  endPracticeSessionFn: (
    input: EndPracticeSessionActionInput,
  ) => Promise<ActionResult<EndPracticeSessionOutput>>;
  finalizeExamAnswersFn: (
    input: FinalizeExamAnswersActionInput,
  ) => Promise<ActionResult<FinalizeExamAnswersOutput>>;
  getPracticeSessionReviewFn: (
    input: SessionIdInput,
  ) => Promise<ActionResult<GetPracticeSessionReviewOutput>>;
  getCompletedSessionQuestionsWithFeedbackFn: (
    input: SessionIdInput,
  ) => Promise<ActionResult<GetCompletedSessionQuestionsWithFeedbackOutput>>;
  getPracticeSessionSummaryFn: (
    input: SessionIdInput,
  ) => Promise<ActionResult<GetPracticeSessionSummaryOutput>>;
};

export type UsePracticeSessionReviewStageOutput = {
  summary: EndPracticeSessionOutput | null;
  setSummary: Dispatch<SetStateAction<EndPracticeSessionOutput | null>>;
  postExamSummary: EndPracticeSessionOutput | null;
  examResultsSubstage: ExamResultsSubstage | null;
  postExamReview: GetCompletedSessionQuestionsWithFeedbackOutput | null;
  postExamReviewLoadState: LoadState;
  postExamReviewCurrentQuestionId: string | null;
  summaryReview: GetPracticeSessionReviewOutput | null;
  summaryReviewLoadState: LoadState;
  review: GetPracticeSessionReviewOutput | null;
  setReview: Dispatch<SetStateAction<GetPracticeSessionReviewOutput | null>>;
  reviewLoadState: LoadState;
  navigator: GetPracticeSessionReviewOutput | null;
  navigatorLoadState: LoadState;
  isInReviewStage: boolean;
  onEndSession: () => void;
  onRetryReview: () => void;
  onRetryNavigator: () => void;
  onOpenReviewQuestion: (questionId: string) => void;
  onNavigatePostExamReviewQuestion: (questionId: string) => void;
  onReenterPostExamReview: (questionId?: string) => void;
  onRetryPostExamReview: () => void;
  onViewSummary: () => void;
  onFinalizeReview: () => Promise<void>;
};

export function usePracticeSessionReviewStage(
  input: UsePracticeSessionReviewStageInput,
): UsePracticeSessionReviewStageOutput {
  const [summary, setSummaryState] = useState<EndPracticeSessionOutput | null>(
    null,
  );
  const [pendingExamSummary, setPendingExamSummary] =
    useState<EndPracticeSessionOutput | null>(null);
  const [examResultsSubstage, setExamResultsSubstage] =
    useState<ExamResultsSubstage | null>(null);
  const [postExamReview, setPostExamReview] =
    useState<GetCompletedSessionQuestionsWithFeedbackOutput | null>(null);
  const [postExamReviewLoadState, setPostExamReviewLoadState] =
    useState<LoadState>({
      status: 'idle',
    });
  const [postExamReviewCurrentQuestionId, setPostExamReviewCurrentQuestionId] =
    useState<string | null>(null);
  const [navigatorReloadCount, setNavigatorReloadCount] = useState(0);
  const summaryRef = useRef<EndPracticeSessionOutput | null>(null);
  const latestPostExamReviewRequestIdRef = useRef(0);
  const endSessionIdempotencyKeyRef = useRef(crypto.randomUUID());
  const finalizeExamIdempotencyKeyRef = useRef(crypto.randomUUID());
  summaryRef.current = summary;
  const setSummary = useCallback<
    Dispatch<SetStateAction<EndPracticeSessionOutput | null>>
  >((nextSummary) => {
    const resolvedSummary =
      typeof nextSummary === 'function'
        ? nextSummary(summaryRef.current)
        : nextSummary;

    setSummaryState(resolvedSummary);

    if (resolvedSummary?.mode === 'exam') {
      setExamResultsSubstage('session_summary');
      return;
    }

    setExamResultsSubstage(null);
  }, []);

  const endTutorSession = useCallback(
    () =>
      endSession({
        sessionId: input.sessionId,
        endSessionIdempotencyKey: endSessionIdempotencyKeyRef.current,
        finalizeSessionFn: input.endPracticeSessionFn,
        getPracticeSessionSummaryFn: input.getPracticeSessionSummaryFn,
        setLoadState: input.setLoadState,
        setSummary,
        resetQuestionState: input.resetQuestionState,
        rotateIdempotencyKey: () => {
          endSessionIdempotencyKeyRef.current = crypto.randomUUID();
        },
        isMounted: input.isMounted,
      }),
    [
      input.endPracticeSessionFn,
      input.getPracticeSessionSummaryFn,
      input.isMounted,
      input.resetQuestionState,
      input.sessionId,
      input.setLoadState,
      setSummary,
    ],
  );

  const finalizeExamSession = useCallback(
    () =>
      endSession({
        sessionId: input.sessionId,
        endSessionIdempotencyKey: finalizeExamIdempotencyKeyRef.current,
        finalizeSessionFn: input.finalizeExamAnswersFn,
        getPracticeSessionSummaryFn: input.getPracticeSessionSummaryFn,
        setLoadState: input.setLoadState,
        setSummary,
        resetQuestionState: input.resetQuestionState,
        rotateIdempotencyKey: () => {
          finalizeExamIdempotencyKeyRef.current = crypto.randomUUID();
        },
        isMounted: input.isMounted,
      }),
    [
      input.finalizeExamAnswersFn,
      input.getPracticeSessionSummaryFn,
      input.isMounted,
      input.resetQuestionState,
      input.sessionId,
      input.setLoadState,
      setSummary,
    ],
  );

  const finalizeExamSessionForPostReview = useCallback(async () => {
    let finalizedSummary: EndPracticeSessionOutput | null = null;

    await endSession({
      sessionId: input.sessionId,
      endSessionIdempotencyKey: finalizeExamIdempotencyKeyRef.current,
      finalizeSessionFn: input.finalizeExamAnswersFn,
      getPracticeSessionSummaryFn: input.getPracticeSessionSummaryFn,
      setLoadState: input.setLoadState,
      setSummary: (nextSummary) => {
        finalizedSummary = nextSummary;
      },
      resetQuestionState: input.resetQuestionState,
      rotateIdempotencyKey: () => {
        finalizeExamIdempotencyKeyRef.current = crypto.randomUUID();
      },
      isMounted: input.isMounted,
    });

    return finalizedSummary;
  }, [
    input.finalizeExamAnswersFn,
    input.getPracticeSessionSummaryFn,
    input.isMounted,
    input.resetQuestionState,
    input.sessionId,
    input.setLoadState,
  ]);

  const finalizeSession = useCallback(
    () =>
      input.sessionMode === 'exam' ? finalizeExamSession() : endTutorSession(),
    [endTutorSession, finalizeExamSession, input.sessionMode],
  );

  const reviewStage = usePracticeSessionReviewStageState({
    sessionId: input.sessionId,
    isMounted: input.isMounted,
    sessionMode: input.sessionMode,
    setSessionMode: input.setSessionMode,
    resetQuestionState: input.resetQuestionState,
    loadSpecificQuestion: input.loadSpecificQuestion,
    finalizeSession,
    getPracticeSessionReviewFn: input.getPracticeSessionReviewFn,
  });

  const loadPostExamReview = useCallback(
    async (
      nextSummary: EndPracticeSessionOutput | null,
      options?: {
        requestedQuestionId?: string | null;
        persistedQuestionId?: string | null;
        nextSubstageOnSuccess?: ExamResultsSubstage | null;
      },
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
          POST_EXAM_REVIEW_TIMEOUT_MS,
        );
      } catch (error) {
        if (!input.isMounted()) return;
        if (requestId !== latestPostExamReviewRequestIdRef.current) return;
        reportClientError(error, {
          component: 'UsePracticeSessionReviewStage',
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

  const onRetryNavigator = useCallback(() => {
    setNavigatorReloadCount((prev) => prev + 1);
  }, []);

  const { summaryReview, summaryReviewLoadState } =
    usePracticeSessionSummaryReview({
      summary,
      sessionId: input.sessionId,
      isMounted: input.isMounted,
      getPracticeSessionReviewFn: input.getPracticeSessionReviewFn,
    });

  const { navigator, navigatorLoadState } = usePracticeSessionNavigator({
    summary,
    isInReviewStage: reviewStage.isInReviewStage,
    sessionInfo: input.sessionInfo,
    sessionId: input.sessionId,
    questionId: input.questionId,
    submitResult: input.submitResult,
    navigatorReloadCount,
    getPracticeSessionReviewFn: input.getPracticeSessionReviewFn,
    isMounted: input.isMounted,
  });

  const onEndSession = useCallback(() => {
    void (async () => {
      try {
        if (input.sessionMode === 'exam') {
          const saved = await input.saveCurrentExamDraft();
          if (!saved) return;
        }
      } catch (error) {
        if (!input.isMounted()) return;
        reportClientError(error, {
          component: 'UsePracticeSessionReviewStage',
          action: 'saveCurrentExamDraftBeforeReview',
        });
        input.setLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
        return;
      }

      reviewStage.onEndSession();
    })();
  }, [
    input.isMounted,
    input.saveCurrentExamDraft,
    input.sessionMode,
    input.setLoadState,
    reviewStage.onEndSession,
  ]);

  const onNavigatePostExamReviewQuestion = useCallback((questionId: string) => {
    setPostExamReviewCurrentQuestionId(questionId);
  }, []);

  const onRetryPostExamReview = useCallback(() => {
    void loadPostExamReview(pendingExamSummary ?? summary, {
      persistedQuestionId: postExamReviewCurrentQuestionId,
      nextSubstageOnSuccess: 'post_exam_review',
    });
  }, [
    loadPostExamReview,
    pendingExamSummary,
    postExamReviewCurrentQuestionId,
    summary,
  ]);

  const onViewSummary = useCallback(() => {
    const nextSummary = pendingExamSummary ?? summary;
    if (!nextSummary) return;

    setPendingExamSummary(nextSummary);
    setSummary(nextSummary);
    setExamResultsSubstage('session_summary');
  }, [pendingExamSummary, setSummary, summary]);

  const onReenterPostExamReview = useCallback(
    (questionId?: string) => {
      const nextSummary = pendingExamSummary ?? summary;
      if (!nextSummary) return;

      if (postExamReview) {
        setPendingExamSummary(nextSummary);
        setPostExamReviewCurrentQuestionId(
          resolvePostExamReviewCurrentQuestionId(postExamReview, {
            requestedQuestionId: questionId ?? null,
            persistedQuestionId: postExamReviewCurrentQuestionId,
          }),
        );
        setExamResultsSubstage('post_exam_review');
        return;
      }

      if (postExamReviewLoadState.status === 'loading') return;

      void loadPostExamReview(nextSummary, {
        requestedQuestionId: questionId ?? null,
        persistedQuestionId: postExamReviewCurrentQuestionId,
        nextSubstageOnSuccess: 'post_exam_review',
      });
    },
    [
      loadPostExamReview,
      pendingExamSummary,
      postExamReview,
      postExamReviewCurrentQuestionId,
      postExamReviewLoadState.status,
      summary,
    ],
  );

  const onFinalizeReview = useCallback(async (): Promise<void> => {
    if (input.sessionMode !== 'exam') {
      return reviewStage.onFinalizeReview();
    }

    const finalizedSummary = await finalizeExamSessionForPostReview();
    if (!input.isMounted()) return;
    if (!finalizedSummary) return;

    reviewStage.setReview(null);
    setExamResultsSubstage('post_exam_review');
    await loadPostExamReview(finalizedSummary, {
      nextSubstageOnSuccess: 'post_exam_review',
    });
  }, [
    finalizeExamSessionForPostReview,
    input.isMounted,
    input.sessionMode,
    loadPostExamReview,
    reviewStage,
  ]);

  return {
    summary,
    setSummary,
    postExamSummary: pendingExamSummary,
    examResultsSubstage,
    postExamReview,
    postExamReviewLoadState,
    postExamReviewCurrentQuestionId,
    summaryReview,
    summaryReviewLoadState,
    review: reviewStage.review,
    setReview: reviewStage.setReview,
    reviewLoadState: reviewStage.reviewLoadState,
    navigator,
    navigatorLoadState,
    isInReviewStage: reviewStage.isInReviewStage,
    onEndSession,
    onRetryReview: reviewStage.onRetryReview,
    onRetryNavigator,
    onOpenReviewQuestion: reviewStage.onOpenReviewQuestion,
    onNavigatePostExamReviewQuestion,
    onReenterPostExamReview,
    onRetryPostExamReview,
    onViewSummary,
    onFinalizeReview,
  };
}
