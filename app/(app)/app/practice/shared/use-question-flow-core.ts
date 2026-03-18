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

export const RESTORED_ATTEMPT_ID = 'restored';

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
  setSubmitResult: (
    result: SubmitAnswerOutput | null,
    questionId?: string | null,
  ) => void;
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
  const [selectedChoiceId, setSelectedChoiceIdState] = useState<string | null>(
    null,
  );
  const [isAnswered, setIsAnsweredState] = useState(false);
  const [submitResult, setSubmitResultState] =
    useState<SubmitAnswerOutput | null>(null);
  const questionRef = useRef<NextQuestion | null>(null);
  const selectedChoiceIdRef = useRef<string | null>(null);
  const isAnsweredRef = useRef(false);
  const submitResultRef = useRef<SubmitAnswerOutput | null>(null);
  const lastSynchronizedQuestionIdRef = useRef<string | null>(null);
  const submitResultQuestionIdRef = useRef<string | null>(null);
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

  const setSelectedChoiceId = useCallback((choiceId: string | null) => {
    selectedChoiceIdRef.current = choiceId;
    setSelectedChoiceIdState(choiceId);
  }, []);

  const setIsAnswered = useCallback((answered: boolean) => {
    isAnsweredRef.current = answered;
    setIsAnsweredState(answered);
  }, []);

  const setQuestion = useCallback(
    (nextQuestion: NextQuestion | null) => {
      questionRef.current = nextQuestion;
      setQuestionState(nextQuestion);
      if (!nextQuestion) {
        setIsAnswered(false);
      }
    },
    [setIsAnswered],
  );

  const setSubmitResult = useCallback<
    UseQuestionFlowCoreOutput['setSubmitResult']
  >(
    (result, questionId) => {
      submitResultRef.current = result;
      setSubmitResultState(result);

      if (result) {
        submitResultQuestionIdRef.current =
          typeof questionId === 'string'
            ? questionId
            : (questionRef.current?.questionId ?? null);
        setIsAnswered(true);
        return;
      }

      submitResultQuestionIdRef.current = null;
    },
    [setIsAnswered],
  );

  const syncQuestionStateFromDraftOrSession = useCallback(
    (nextQuestion: NextQuestion | null) => {
      if (!nextQuestion) {
        setSelectedChoiceId(null);
        setIsAnswered(false);
        setSubmitResult(null);
        lastSynchronizedQuestionIdRef.current = null;
        return;
      }

      const isActiveExamQuestion = nextQuestion.session?.mode === 'exam';
      if (
        isActiveExamQuestion &&
        lastSynchronizedQuestionIdRef.current === nextQuestion.questionId &&
        selectedChoiceIdRef.current !== null &&
        !isAnsweredRef.current &&
        submitResultRef.current === null
      ) {
        return;
      }

      const examDraftSelectedChoiceId =
        nextQuestion.session?.draftSelectedChoiceId;
      if (
        isActiveExamQuestion &&
        typeof examDraftSelectedChoiceId === 'string'
      ) {
        setSelectedChoiceId(examDraftSelectedChoiceId);
        setIsAnswered(false);
        setSubmitResult(null);
        lastSynchronizedQuestionIdRef.current = nextQuestion.questionId;
        return;
      }

      const latestSelectedChoiceId =
        nextQuestion.session?.latestSelectedChoiceId;
      if (typeof latestSelectedChoiceId === 'string') {
        setSelectedChoiceId(latestSelectedChoiceId);
        setIsAnswered(true);

        const prev = nextQuestion.session?.previousSubmission;
        if (prev) {
          const sessionIsCorrect =
            nextQuestion.session?.latestIsCorrect ?? null;
          const isCorrect =
            typeof sessionIsCorrect === 'boolean'
              ? sessionIsCorrect
              : prev.correctChoiceId === latestSelectedChoiceId;

          setSubmitResult(
            {
              attemptId: RESTORED_ATTEMPT_ID,
              isCorrect,
              correctChoiceId: prev.correctChoiceId,
              explanationMd: prev.explanationMd,
              referenceMd: prev.referenceMd ?? null,
              choiceExplanations: prev.choiceExplanations,
            },
            nextQuestion.questionId,
          );
        } else {
          setSubmitResult(null);
        }
        lastSynchronizedQuestionIdRef.current = nextQuestion.questionId;
        return;
      }

      setSelectedChoiceId(null);
      lastSynchronizedQuestionIdRef.current = nextQuestion.questionId;

      if (submitResultQuestionIdRef.current === nextQuestion.questionId) {
        return;
      }

      setIsAnswered(false);
      setSubmitResult(null);
    },
    [setIsAnswered, setSelectedChoiceId, setSubmitResult],
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
    [setIsAnswered, syncQuestionStateFromDraftOrSession],
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
    },
    [isAnswered, question, submitResult, setSelectedChoiceId],
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
