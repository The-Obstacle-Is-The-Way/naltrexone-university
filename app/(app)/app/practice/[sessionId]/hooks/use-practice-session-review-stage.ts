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
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  EndPracticeSessionOutput,
  GetPracticeSessionReviewOutput,
} from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

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
  endPracticeSessionFn: (
    input: unknown,
  ) => Promise<ActionResult<EndPracticeSessionOutput>>;
  getPracticeSessionReviewFn: (
    input: unknown,
  ) => Promise<ActionResult<GetPracticeSessionReviewOutput>>;
  getPracticeSessionSummaryFn: (
    input: unknown,
  ) => Promise<ActionResult<EndPracticeSessionOutput>>;
};

export type UsePracticeSessionReviewStageOutput = {
  summary: EndPracticeSessionOutput | null;
  setSummary: Dispatch<SetStateAction<EndPracticeSessionOutput | null>>;
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
  onFinalizeReview: () => Promise<void>;
};

export function usePracticeSessionReviewStage(
  input: UsePracticeSessionReviewStageInput,
): UsePracticeSessionReviewStageOutput {
  const [summary, setSummary] = useState<EndPracticeSessionOutput | null>(null);
  const [navigatorReloadCount, setNavigatorReloadCount] = useState(0);
  const endSessionIdempotencyKeyRef = useRef(crypto.randomUUID());

  const finalizeSession = useCallback(
    () =>
      endSession({
        sessionId: input.sessionId,
        endSessionIdempotencyKey: endSessionIdempotencyKeyRef.current,
        endPracticeSessionFn: input.endPracticeSessionFn,
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
      input.sessionId,
      input.setLoadState,
      input.resetQuestionState,
      input.isMounted,
    ],
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

  return {
    summary,
    setSummary,
    summaryReview,
    summaryReviewLoadState,
    review: reviewStage.review,
    setReview: reviewStage.setReview,
    reviewLoadState: reviewStage.reviewLoadState,
    navigator,
    navigatorLoadState,
    isInReviewStage: reviewStage.isInReviewStage,
    onEndSession: reviewStage.onEndSession,
    onRetryReview: reviewStage.onRetryReview,
    onRetryNavigator,
    onOpenReviewQuestion: reviewStage.onOpenReviewQuestion,
    onFinalizeReview: reviewStage.onFinalizeReview,
  };
}
