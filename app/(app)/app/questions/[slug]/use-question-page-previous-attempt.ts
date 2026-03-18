import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type LoadState,
  loadPreviousAttempt,
  type ReviewHydrationState,
  type SessionUnansweredReveal,
} from '@/app/(app)/app/questions/[slug]/question-page-logic';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import { getPreviousAttempt } from '@/src/adapters/controllers/question-view-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UseQuestionPagePreviousAttemptInput = {
  mode?: 'review' | null;
  attemptId?: string;
  sessionId?: string;
  loadState: LoadState;
  question: GetQuestionBySlugOutput | null;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSessionUnansweredReveal: (reveal: SessionUnansweredReveal | null) => void;
  isMounted: () => boolean;
  startTransition: (fn: () => void) => void;
};

export type UseQuestionPagePreviousAttemptOutput = {
  isLoadingPreviousAttempt: boolean;
  reviewHydrationState: ReviewHydrationState | null;
  resetReviewHydrationState: () => void;
};

export function useQuestionPagePreviousAttempt(
  input: UseQuestionPagePreviousAttemptInput,
): UseQuestionPagePreviousAttemptOutput {
  const [isLoadingPreviousAttempt, setIsLoadingPreviousAttempt] = useState(
    input.mode === 'review',
  );
  const [reviewHydrationState, setReviewHydrationState] =
    useState<ReviewHydrationState | null>(
      input.mode === 'review' ? 'no_prior_attempt' : null,
    );
  const latestPreviousAttemptRequestId = useRef(0);
  const activePreviousAttemptRequestId = useRef<number | null>(null);
  const latestQuestionIdRef = useRef(input.question?.questionId ?? null);
  latestQuestionIdRef.current = input.question?.questionId ?? null;
  const previousModeRef = useRef(input.mode);
  const isMountedRef = useRef(input.isMounted);
  isMountedRef.current = input.isMounted;
  const startTransitionRef = useRef(input.startTransition);
  startTransitionRef.current = input.startTransition;
  const didModeChange = previousModeRef.current !== input.mode;
  previousModeRef.current = input.mode;

  useEffect(() => {
    const isMounted = () => isMountedRef.current();
    const question = input.question;

    latestPreviousAttemptRequestId.current += 1;
    const requestId = latestPreviousAttemptRequestId.current;
    const requestQuestionId = latestQuestionIdRef.current;
    const clearPreviousAttemptLoadingIfActive = () => {
      if (activePreviousAttemptRequestId.current === null) return;
      activePreviousAttemptRequestId.current = null;
      if (isMounted()) {
        setIsLoadingPreviousAttempt(false);
      }
    };

    if (input.mode !== 'review') {
      clearPreviousAttemptLoadingIfActive();
      return;
    }
    if (input.loadState.status !== 'ready') {
      clearPreviousAttemptLoadingIfActive();
      return;
    }
    if (!question) {
      clearPreviousAttemptLoadingIfActive();
      if (isMounted()) {
        setIsLoadingPreviousAttempt(false);
        setReviewHydrationState('no_prior_attempt');
      }
      return;
    }

    activePreviousAttemptRequestId.current = requestId;
    setIsLoadingPreviousAttempt(true);
    setReviewHydrationState('no_prior_attempt');

    startTransitionRef.current(() => {
      void loadPreviousAttempt({
        questionId: question.questionId,
        attemptId: input.attemptId,
        sessionId: input.sessionId,
        getPreviousAttemptFn: getPreviousAttempt,
        setSelectedChoiceId: input.setSelectedChoiceId,
        setSubmitResult: input.setSubmitResult,
        setSessionUnansweredReveal: input.setSessionUnansweredReveal,
        setReviewHydrationState,
        isMounted,
        isStale: () =>
          latestPreviousAttemptRequestId.current !== requestId ||
          latestQuestionIdRef.current !== requestQuestionId,
      }).finally(() => {
        if (!isMounted()) return;
        if (latestPreviousAttemptRequestId.current !== requestId) return;
        if (latestQuestionIdRef.current !== requestQuestionId) return;
        if (activePreviousAttemptRequestId.current !== requestId) return;
        activePreviousAttemptRequestId.current = null;
        setIsLoadingPreviousAttempt(false);
      });
    });
  }, [
    input.mode,
    input.attemptId,
    input.sessionId,
    input.loadState.status,
    input.question,
    input.setSelectedChoiceId,
    input.setSubmitResult,
    input.setSessionUnansweredReveal,
  ]);

  const effectiveIsLoadingPreviousAttempt = didModeChange
    ? input.mode === 'review'
    : input.mode === 'review'
      ? isLoadingPreviousAttempt
      : false;
  const effectiveReviewHydrationState = didModeChange
    ? input.mode === 'review'
      ? 'no_prior_attempt'
      : null
    : input.mode === 'review'
      ? reviewHydrationState
      : null;

  const resetReviewHydrationState = useMemo(() => {
    return () => {
      setIsLoadingPreviousAttempt(false);
      setReviewHydrationState('no_prior_attempt');
    };
  }, []);

  return {
    isLoadingPreviousAttempt: effectiveIsLoadingPreviousAttempt,
    reviewHydrationState: effectiveReviewHydrationState,
    resetReviewHydrationState,
  };
}
