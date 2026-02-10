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
} from '@/app/(app)/app/practice/practice-page-logic';
import { selectChoiceIfAllowed } from '@/app/(app)/app/shared/question-guards';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UseQuestionFlowCoreInput = {
  isMounted: () => boolean;
};

/**
 * Shared state for question flows.
 *
 * Low-level setters are intentionally exposed for advanced consumers; prefer
 * driving state through higher-level helpers where available.
 */
export type UseQuestionFlowCoreOutput = {
  question: NextQuestion | null;
  setQuestion: (question: NextQuestion | null) => void;
  selectedChoiceId: string | null;
  setSelectedChoiceId: (choiceId: string | null) => void;
  isAnswered: boolean;
  setIsAnswered: (answered: boolean) => void;
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
  const [isAnswered, setIsAnswered] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitAnswerOutput | null>(
    null,
  );
  const [draftSelectedChoices, setDraftSelectedChoices] = useState<
    Map<string, string>
  >(() => new Map());
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
      isAnswered,
      submitResult,
    });
  }, [isAnswered, loadState, question, selectedChoiceId, submitResult]);

  useEffect(() => {
    if (!submitResult) return;
    setIsAnswered(true);
  }, [submitResult]);

  useEffect(() => {
    if (loadState.status === 'loading') {
      setIsAnswered(false);
      return;
    }

    if (loadState.status !== 'ready') return;

    if (!question) {
      setIsAnswered(false);
      return;
    }

    const sessionSelectedChoiceId = question.session?.latestSelectedChoiceId;
    if (typeof sessionSelectedChoiceId === 'string') {
      setSelectedChoiceId(sessionSelectedChoiceId);
      setIsAnswered(true);
      setDraftSelectedChoices((prev) => {
        if (!prev.has(question.questionId)) return prev;
        const next = new Map(prev);
        next.delete(question.questionId);
        return next;
      });
      return;
    }

    setSelectedChoiceId(draftSelectedChoices.get(question.questionId) ?? null);
    setIsAnswered(false);
  }, [draftSelectedChoices, loadState.status, question]);

  const onSelectChoice = useCallback(
    (choiceId: string) => {
      if (!question) return;

      const changed = selectChoiceIfAllowed(
        { isAnswered, submitResult },
        setSelectedChoiceId,
        choiceId,
      );
      if (!changed) return;

      setDraftSelectedChoices((prev) => {
        const next = new Map(prev);
        next.set(question.questionId, choiceId);
        return next;
      });
    },
    [isAnswered, question, submitResult],
  );

  return {
    question,
    setQuestion,
    selectedChoiceId,
    setSelectedChoiceId,
    isAnswered,
    setIsAnswered,
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
