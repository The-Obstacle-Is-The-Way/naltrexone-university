import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  createLoadNextQuestionAction,
  type LoadState,
  type PracticeFilters,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/practice-page-logic';
import { runTransitionedAsyncAction } from '@/app/(app)/app/practice/shared/question-flow-actions';
import { useQuestionFlowCore } from '@/app/(app)/app/practice/shared/use-question-flow-core';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UsePracticeQuestionAnswerFlowInput = {
  filters: PracticeFilters;
  isMounted: () => boolean;
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
};

export type UsePracticeQuestionAnswerFlowOutput = {
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  isAnswered: boolean;
  submitResult: SubmitAnswerOutput | null;
  loadState: LoadState;
  isPending: boolean;
  canSubmit: boolean;
  questionAreaRef: React.RefObject<HTMLDivElement | null>;
  onTryAgain: () => void;
  onSubmit: () => Promise<void>;
  onSelectChoice: (choiceId: string) => void;
  onNextQuestion: () => void;
};

export function getFocusRecoveryTransition(input: {
  status: LoadState['status'];
  pendingFocus: boolean;
}): {
  pendingFocus: boolean;
  shouldFocus: boolean;
} {
  if (input.status === 'error') {
    return { pendingFocus: true, shouldFocus: false };
  }

  if (input.status === 'ready' && input.pendingFocus) {
    return { pendingFocus: false, shouldFocus: true };
  }

  return {
    pendingFocus: input.pendingFocus,
    shouldFocus: false,
  };
}

export function usePracticeQuestionAnswerFlow(
  input: UsePracticeQuestionAnswerFlowInput,
): UsePracticeQuestionAnswerFlowOutput {
  const {
    question,
    selectedChoiceId,
    isAnswered,
    submitResult,
    loadState,
    isPending,
    startTransition,
    questionLoadedAt,
    submitIdempotencyKey,
    setLoadState,
    setSelectedChoiceId,
    setSubmitResult,
    setSubmitIdempotencyKey,
    setQuestionLoadedAt,
    setQuestion,
    createIdempotencyKey,
    createRequestSequenceId,
    isLatestRequest,
    isMounted,
    canSubmit,
    onSelectChoice,
  } = useQuestionFlowCore({ isMounted: input.isMounted });
  const questionAreaRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusAfterError = useRef(false);

  const onTryAgain = useMemo(
    () =>
      createLoadNextQuestionAction({
        startTransition,
        getNextQuestionFn: input.getNextQuestionFn,
        filters: input.filters,
        createIdempotencyKey,
        nowMs: Date.now,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
        createRequestSequenceId,
        isLatestRequest,
        isMounted,
      }),
    [
      createIdempotencyKey,
      createRequestSequenceId,
      input.filters,
      input.getNextQuestionFn,
      isLatestRequest,
      isMounted,
      setLoadState,
      setQuestion,
      setQuestionLoadedAt,
      setSelectedChoiceId,
      setSubmitIdempotencyKey,
      setSubmitResult,
      startTransition,
    ],
  );

  useEffect(onTryAgain, [onTryAgain]);

  // Focus the question area after recovering from an error.
  // Handles both direct error->ready and error->loading->ready transitions.
  useEffect(() => {
    const transition = getFocusRecoveryTransition({
      status: loadState.status,
      pendingFocus: pendingFocusAfterError.current,
    });
    pendingFocusAfterError.current = transition.pendingFocus;
    if (transition.shouldFocus) {
      questionAreaRef.current?.focus();
    }
  }, [loadState.status]);

  const onSubmit = useCallback(() => {
    return runTransitionedAsyncAction({
      startTransition,
      run: () =>
        submitAnswerForQuestion({
          question,
          selectedChoiceId,
          questionLoadedAtMs: questionLoadedAt,
          submitIdempotencyKey,
          submitAnswerFn: input.submitAnswerFn,
          nowMs: Date.now,
          setLoadState,
          setSubmitResult,
          createRequestSequenceId,
          isLatestRequest,
          isMounted,
        }),
    });
  }, [
    createRequestSequenceId,
    input.submitAnswerFn,
    isLatestRequest,
    isMounted,
    question,
    questionLoadedAt,
    selectedChoiceId,
    submitIdempotencyKey,
    setLoadState,
    setSubmitResult,
    startTransition,
  ]);

  return {
    question,
    selectedChoiceId,
    isAnswered,
    submitResult,
    loadState,
    isPending,
    canSubmit,
    questionAreaRef,
    onTryAgain,
    onSubmit,
    onSelectChoice,
    onNextQuestion: onTryAgain,
  };
}
