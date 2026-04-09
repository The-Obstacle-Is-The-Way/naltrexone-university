'use client';

import { useCallback, useRef, useState } from 'react';
import {
  type ExamResultsSubstage,
  resolvePostExamReviewCurrentQuestionId,
  usePracticeSessionExamResultsContinuity,
} from '@/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity';
import { usePracticeSessionNavigator } from '@/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-navigator';
import { usePracticeSessionReviewStageState } from '@/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state';
import { usePracticeSessionSummaryReview } from '@/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-summary-review';
import { endSession } from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import { getThrownErrorMessage } from '@/app/(app)/app/practice/practice-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import { reportClientError } from '@/lib/report-client-error';
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

export { resolvePostExamReviewCurrentQuestionId };
export type { ExamResultsSubstage };

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

export function usePracticeSessionReviewStage(
  input: UsePracticeSessionReviewStageInput,
) {
  const [summary, setSummaryState] = useState<EndPracticeSessionOutput | null>(
    null,
  );
  const [navigatorReloadCount, setNavigatorReloadCount] = useState(0);
  const endSessionIdempotencyKeyRef = useRef(crypto.randomUUID());
  const finalizeExamIdempotencyKeyRef = useRef(crypto.randomUUID());
  const examResults = usePracticeSessionExamResultsContinuity({
    summary,
    setSummaryState,
    isMounted: input.isMounted,
    sessionId: input.sessionId,
    getCompletedSessionQuestionsWithFeedbackFn:
      input.getCompletedSessionQuestionsWithFeedbackFn,
  });
  const endTutorSession = useCallback(
    () =>
      endSession({
        sessionId: input.sessionId,
        endSessionIdempotencyKey: endSessionIdempotencyKeyRef.current,
        finalizeSessionFn: input.endPracticeSessionFn,
        getPracticeSessionSummaryFn: input.getPracticeSessionSummaryFn,
        setLoadState: input.setLoadState,
        setSummary: examResults.setSummary,
        resetQuestionState: input.resetQuestionState,
        rotateIdempotencyKey: () => {
          endSessionIdempotencyKeyRef.current = crypto.randomUUID();
        },
        isMounted: input.isMounted,
      }),
    [
      examResults.setSummary,
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
        setSummary: examResults.setSummary,
        resetQuestionState: input.resetQuestionState,
        rotateIdempotencyKey: () => {
          finalizeExamIdempotencyKeyRef.current = crypto.randomUUID();
        },
        isMounted: input.isMounted,
      }),
    [
      examResults.setSummary,
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
  const onFinalizeReview = useCallback(async (): Promise<void> => {
    if (input.sessionMode !== 'exam') {
      return reviewStage.onFinalizeReview();
    }
    const finalizedSummary = await finalizeExamSessionForPostReview();
    if (!input.isMounted()) return;
    if (!finalizedSummary) return;
    reviewStage.setReview(null);
    await examResults.enterPostExamReview(finalizedSummary);
  }, [
    examResults.enterPostExamReview,
    finalizeExamSessionForPostReview,
    input.isMounted,
    input.sessionMode,
    reviewStage,
  ]);

  return {
    summary,
    setSummary: examResults.setSummary,
    postExamSummary: examResults.postExamSummary,
    examResultsSubstage: examResults.examResultsSubstage,
    postExamReview: examResults.postExamReview,
    postExamReviewLoadState: examResults.postExamReviewLoadState,
    postExamReviewCurrentQuestionId:
      examResults.postExamReviewCurrentQuestionId,
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
    onNavigatePostExamReviewQuestion:
      examResults.onNavigatePostExamReviewQuestion,
    onReenterPostExamReview: examResults.onReenterPostExamReview,
    onRetryPostExamReview: examResults.onRetryPostExamReview,
    onViewSummary: examResults.onViewSummary,
    onFinalizeReview,
  };
}
