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
  const [question, setQuestionState] = useState<NextQuestion | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [submitResult, setSubmitResultState] =
    useState<SubmitAnswerOutput | null>(null);
  const questionRef = useRef<NextQuestion | null>(null);
  const draftSelectedChoicesRef = useRef<Map<string, string>>(new Map());
  const [loadState, setLoadStateState] = useState<LoadState>({
    status: 'idle',
  });
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

  const updateDraftSelectedChoices = useCallback(
    (update: (prev: Map<string, string>) => Map<string, string>) => {
      draftSelectedChoicesRef.current = update(draftSelectedChoicesRef.current);
    },
    [],
  );

  const setQuestion = useCallback((nextQuestion: NextQuestion | null) => {
    questionRef.current = nextQuestion;
    setQuestionState(nextQuestion);
    if (!nextQuestion) {
      setIsAnswered(false);
    }
  }, []);

  const setSubmitResult = useCallback((result: SubmitAnswerOutput | null) => {
    setSubmitResultState(result);
    if (result) {
      setIsAnswered(true);
    }
  }, []);

  const syncQuestionStateFromDraftOrSession = useCallback(
    (nextQuestion: NextQuestion | null) => {
      if (!nextQuestion) {
        setSelectedChoiceId(null);
        setIsAnswered(false);
        setSubmitResult(null);
        return;
      }

      const sessionSelectedChoiceId =
        nextQuestion.session?.latestSelectedChoiceId;
      if (typeof sessionSelectedChoiceId === 'string') {
        setSelectedChoiceId(sessionSelectedChoiceId);
        setIsAnswered(true);

        const prev = nextQuestion.session?.previousSubmission;
        if (prev) {
          const sessionIsCorrect =
            nextQuestion.session?.latestIsCorrect ?? null;
          const isCorrect =
            typeof sessionIsCorrect === 'boolean'
              ? sessionIsCorrect
              : typeof prev.correctChoiceId === 'string'
                ? prev.correctChoiceId === sessionSelectedChoiceId
                : false;

          setSubmitResult({
            attemptId: 'restored',
            isCorrect,
            correctChoiceId: prev.correctChoiceId,
            explanationMd: prev.explanationMd,
            choiceExplanations: prev.choiceExplanations,
          });
        } else {
          setSubmitResult(null);
        }

        updateDraftSelectedChoices((prev) => {
          if (!prev.has(nextQuestion.questionId)) return prev;
          const next = new Map(prev);
          next.delete(nextQuestion.questionId);
          return next;
        });
        return;
      }

      setSelectedChoiceId(
        draftSelectedChoicesRef.current.get(nextQuestion.questionId) ?? null,
      );
      setIsAnswered(false);
      setSubmitResult(null);
    },
    [updateDraftSelectedChoices, setSubmitResult],
  );

  const setLoadState = useCallback(
    (state: LoadState) => {
      setLoadStateState(state);

      if (state.status === 'loading') {
        setIsAnswered(false);
        return;
      }

      if (state.status !== 'ready') return;

      syncQuestionStateFromDraftOrSession(questionRef.current);
    },
    [syncQuestionStateFromDraftOrSession],
  );

  const onSelectChoice = useCallback(
    (choiceId: string) => {
      if (!question) return;

      const changed = selectChoiceIfAllowed(
        { isAnswered, submitResult },
        setSelectedChoiceId,
        choiceId,
      );
      if (!changed) return;

      updateDraftSelectedChoices((prev) => {
        const next = new Map(prev);
        next.set(question.questionId, choiceId);
        return next;
      });
    },
    [isAnswered, question, submitResult, updateDraftSelectedChoices],
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
