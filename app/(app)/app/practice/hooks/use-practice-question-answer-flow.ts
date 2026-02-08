import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  canSubmitAnswer,
  createLoadNextQuestionAction,
  type LoadState,
  type PracticeFilters,
  selectChoiceIfAllowed,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/practice-page-logic';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UsePracticeQuestionAnswerFlowInput = {
  filters: PracticeFilters;
  isMounted: () => boolean;
};

export type UsePracticeQuestionAnswerFlowOutput = {
  question: NextQuestion | null;
  selectedChoiceId: string | null;
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
  const [question, setQuestion] = useState<NextQuestion | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitAnswerOutput | null>(
    null,
  );
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const [questionLoadedAt, setQuestionLoadedAt] = useState<number | null>(null);
  const [submitIdempotencyKey, setSubmitIdempotencyKey] = useState<
    string | null
  >(null);
  const latestQuestionRequestId = useRef(0);
  const questionAreaRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusAfterError = useRef(false);

  const onTryAgain = useMemo(
    () =>
      createLoadNextQuestionAction({
        startTransition,
        getNextQuestionFn: getNextQuestion,
        filters: input.filters,
        createIdempotencyKey: () => crypto.randomUUID(),
        nowMs: Date.now,
        setLoadState,
        setSelectedChoiceId,
        setSubmitResult,
        setSubmitIdempotencyKey,
        setQuestionLoadedAt,
        setQuestion,
        createRequestSequenceId: () => {
          latestQuestionRequestId.current += 1;
          return latestQuestionRequestId.current;
        },
        isLatestRequest: (requestId) =>
          requestId === latestQuestionRequestId.current,
        isMounted: input.isMounted,
      }),
    [input.filters, input.isMounted],
  );

  useEffect(onTryAgain, [onTryAgain]);

  // DEBT-166: Focus the question area after recovering from an error.
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

  const canSubmit = useMemo(() => {
    return canSubmitAnswer({
      loadState,
      question,
      selectedChoiceId,
      submitResult,
    });
  }, [loadState, question, selectedChoiceId, submitResult]);

  const onSubmit = useMemo(
    () =>
      submitAnswerForQuestion.bind(null, {
        question,
        selectedChoiceId,
        questionLoadedAtMs: questionLoadedAt,
        submitIdempotencyKey,
        submitAnswerFn: submitAnswer,
        nowMs: Date.now,
        setLoadState,
        setSubmitResult,
        isMounted: input.isMounted,
      }),
    [
      question,
      questionLoadedAt,
      selectedChoiceId,
      submitIdempotencyKey,
      input.isMounted,
    ],
  );

  const onSelectChoice = useMemo(
    () => selectChoiceIfAllowed.bind(null, submitResult, setSelectedChoiceId),
    [submitResult],
  );

  return {
    question,
    selectedChoiceId,
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
