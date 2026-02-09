'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  canSubmitAnswer,
  type LoadState,
  selectChoiceIfAllowed,
} from '@/app/(app)/app/practice/practice-page-logic';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UseQuestionFlowCoreInput = {
  isMounted: () => boolean;
};

export type UseQuestionFlowCoreOutput = {
  question: NextQuestion | null;
  setQuestion: (question: NextQuestion | null) => void;
  selectedChoiceId: string | null;
  setSelectedChoiceId: (choiceId: string | null) => void;
  submitResult: SubmitAnswerOutput | null;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  loadState: LoadState;
  setLoadState: (state: LoadState) => void;
  isPending: boolean;
  startTransition: (fn: () => void) => void;
  questionLoadedAt: number | null;
  setQuestionLoadedAt: (loadedAtMs: number | null) => void;
  submitIdempotencyKey: string | null;
  setSubmitIdempotencyKey: (key: string | null) => void;
  createIdempotencyKey: () => string;
  createRequestSequenceId: () => number;
  isLatestRequest: (requestId: number) => boolean;
  isMounted: () => boolean;
  canSubmit: boolean;
  onSelectChoice: (choiceId: string) => void;
};

export function useQuestionFlowCore(
  input: UseQuestionFlowCoreInput,
): UseQuestionFlowCoreOutput {
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
  const isMountedFnRef = useRef(input.isMounted);

  useEffect(() => {
    isMountedFnRef.current = input.isMounted;
  }, [input.isMounted]);

  const isMounted = useCallback(() => isMountedFnRef.current(), []);

  const createIdempotencyKey = useCallback(() => crypto.randomUUID(), []);

  const createRequestSequenceId = useCallback(() => {
    latestQuestionRequestId.current += 1;
    return latestQuestionRequestId.current;
  }, []);

  const isLatestRequest = useCallback(
    (requestId: number) => requestId === latestQuestionRequestId.current,
    [],
  );

  const canSubmit = useMemo(() => {
    return canSubmitAnswer({
      loadState,
      question,
      selectedChoiceId,
      submitResult,
    });
  }, [loadState, question, selectedChoiceId, submitResult]);

  const onSelectChoice = useCallback(
    (choiceId: string) => {
      selectChoiceIfAllowed(submitResult, setSelectedChoiceId, choiceId);
    },
    [submitResult],
  );

  return {
    question,
    setQuestion,
    selectedChoiceId,
    setSelectedChoiceId,
    submitResult,
    setSubmitResult,
    loadState,
    setLoadState,
    isPending,
    startTransition,
    questionLoadedAt,
    setQuestionLoadedAt,
    submitIdempotencyKey,
    setSubmitIdempotencyKey,
    createIdempotencyKey,
    createRequestSequenceId,
    isLatestRequest,
    isMounted,
    canSubmit,
    onSelectChoice,
  };
}
