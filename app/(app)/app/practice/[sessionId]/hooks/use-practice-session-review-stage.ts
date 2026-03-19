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
  onRetryPostExamReview: () => void;
  onViewSummary: () => void;
  onFinalizeReview: () => Promise<void>;
};

export function usePracticeSessionReviewStage(
  input: UsePracticeSessionReviewStageInput,
): UsePracticeSessionReviewStageOutput {
  const [summary, setSummary] = useState<EndPracticeSessionOutput | null>(null);
  const [pendingExamSummary, setPendingExamSummary] =
    useState<EndPracticeSessionOutput | null>(null);
  const [postExamReview, setPostExamReview] =
    useState<GetCompletedSessionQuestionsWithFeedbackOutput | null>(null);
  const [postExamReviewLoadState, setPostExamReviewLoadState] =
    useState<LoadState>({
      status: 'idle',
    });
  const [postExamReviewCurrentQuestionId, setPostExamReviewCurrentQuestionId] =
    useState<string | null>(null);
  const [navigatorReloadCount, setNavigatorReloadCount] = useState(0);
  const endSessionIdempotencyKeyRef = useRef(crypto.randomUUID());
  const finalizeExamIdempotencyKeyRef = useRef(crypto.randomUUID());

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
    async (nextSummary: EndPracticeSessionOutput | null): Promise<void> => {
      if (!nextSummary) return;

      setPostExamReview(null);
      setPostExamReviewCurrentQuestionId(null);
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
      if (!result.ok) {
        setPostExamReviewLoadState({
          status: 'error',
          message: getActionResultErrorMessage(result),
        });
        return;
      }

      setPendingExamSummary(nextSummary);
      setPostExamReview(result.data);
      setPostExamReviewCurrentQuestionId(
        result.data.rows[0]?.questionId ?? null,
      );
      setPostExamReviewLoadState({ status: 'ready' });
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
    void loadPostExamReview(pendingExamSummary);
  }, [loadPostExamReview, pendingExamSummary]);

  const onViewSummary = useCallback(() => {
    if (!pendingExamSummary) return;

    setSummary(pendingExamSummary);
    setPendingExamSummary(null);
    setPostExamReview(null);
    setPostExamReviewCurrentQuestionId(null);
    setPostExamReviewLoadState({ status: 'idle' });
  }, [pendingExamSummary]);

  const onFinalizeReview = useCallback(async (): Promise<void> => {
    if (input.sessionMode !== 'exam') {
      return reviewStage.onFinalizeReview();
    }

    const finalizedSummary = await finalizeExamSessionForPostReview();
    if (!input.isMounted()) return;
    if (!finalizedSummary) return;

    reviewStage.setReview(null);
    await loadPostExamReview(finalizedSummary);
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
    onRetryPostExamReview,
    onViewSummary,
    onFinalizeReview,
  };
}
