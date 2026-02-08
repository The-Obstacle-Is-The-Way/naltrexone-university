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
  createLoadNextQuestionAction,
  loadNextQuestion,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import {
  canSubmitAnswer,
  type LoadState,
  selectChoiceIfAllowed,
} from '@/app/(app)/app/practice/practice-page-logic';
import { runTransitionedAsyncAction } from '@/app/(app)/app/practice/shared/question-flow-actions';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UsePracticeSessionQuestionFlowInput = {
  sessionId: string;
  isMounted: () => boolean;
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
};

export type UsePracticeSessionQuestionFlowOutput = {
  sessionInfo: NextQuestion['session'];
  sessionMode: 'tutor' | 'exam' | null;
  loadState: LoadState;
  question: NextQuestion | null;
  selectedChoiceId: string | null;
  submitResult: SubmitAnswerOutput | null;
  isPending: boolean;
  canSubmit: boolean;
  applySessionInfo: (
    next:
      | NextQuestion['session']
      | ((prev: NextQuestion['session']) => NextQuestion['session']),
  ) => void;
  setSessionMode: (mode: 'tutor' | 'exam' | null) => void;
  setLoadState: (state: LoadState) => void;
  resetQuestionState: () => void;
  onTryAgain: () => void;
  onNextQuestion: () => void;
  onNavigateQuestion: (questionId: string) => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => Promise<void>;
};

export function usePracticeSessionQuestionFlow(
  input: UsePracticeSessionQuestionFlowInput,
): UsePracticeSessionQuestionFlowOutput {
  const [question, setQuestion] = useState<NextQuestion | null>(null);
  const [sessionInfo, setSessionInfo] = useState<NextQuestion['session']>(null);
  const [sessionMode, setSessionMode] = useState<'tutor' | 'exam' | null>(null);
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

  const createIdempotencyKey = useCallback(() => crypto.randomUUID(), []);

  const createRequestSequenceId = useCallback(() => {
    latestQuestionRequestId.current += 1;
    return latestQuestionRequestId.current;
  }, []);

  const isLatestRequest = useCallback(
    (requestId: number) => requestId === latestQuestionRequestId.current,
    [],
  );

  const loadQuestionConfig = useMemo(
    () => ({
      sessionId: input.sessionId,
      getNextQuestionFn: input.getNextQuestionFn,
      createIdempotencyKey,
      nowMs: Date.now,
      setLoadState,
      setSelectedChoiceId,
      setSubmitResult,
      setSubmitIdempotencyKey,
      setQuestionLoadedAt,
      setQuestion,
      setSessionInfo,
      createRequestSequenceId,
      isLatestRequest,
      isMounted: () => isMountedFnRef.current(),
    }),
    [
      input.sessionId,
      input.getNextQuestionFn,
      createIdempotencyKey,
      createRequestSequenceId,
      isLatestRequest,
    ],
  );

  const onTryAgain = useMemo(
    () =>
      createLoadNextQuestionAction({
        startTransition,
        ...loadQuestionConfig,
      }),
    [loadQuestionConfig],
  );

  // Load the first question on mount and whenever the sessionId changes.
  useEffect(onTryAgain, [onTryAgain]);

  useEffect(() => {
    if (!sessionInfo?.mode) return;
    setSessionMode(sessionInfo.mode);
  }, [sessionInfo?.mode]);

  const applySessionInfo = useCallback<
    UsePracticeSessionQuestionFlowOutput['applySessionInfo']
  >((next) => {
    setSessionInfo(next);
  }, []);

  const resetQuestionState = useCallback(() => {
    setQuestion(null);
    setSubmitResult(null);
    setSelectedChoiceId(null);
  }, []);

  const onNavigateQuestion = useCallback(
    (questionId: string): void => {
      startTransition(() => {
        void loadNextQuestion({
          ...loadQuestionConfig,
          questionId,
        });
      });
    },
    [loadQuestionConfig],
  );

  const canSubmit = useMemo(() => {
    return canSubmitAnswer({
      loadState,
      question,
      selectedChoiceId,
      submitResult,
    });
  }, [loadState, question, selectedChoiceId, submitResult]);

  const onSubmit = useCallback(() => {
    return runTransitionedAsyncAction({
      startTransition,
      run: () =>
        submitAnswerForQuestion({
          sessionId: input.sessionId,
          question,
          selectedChoiceId,
          questionLoadedAtMs: questionLoadedAt,
          submitIdempotencyKey,
          submitAnswerFn: input.submitAnswerFn,
          nowMs: Date.now,
          setLoadState,
          setSubmitResult,
          isMounted: () => isMountedFnRef.current(),
        }),
    });
  }, [
    question,
    questionLoadedAt,
    selectedChoiceId,
    input.sessionId,
    submitIdempotencyKey,
    input.submitAnswerFn,
  ]);

  const onSelectChoice = useCallback(
    (choiceId: string) => {
      selectChoiceIfAllowed(submitResult, setSelectedChoiceId, choiceId);
    },
    [submitResult],
  );

  return {
    sessionInfo,
    sessionMode,
    setSessionMode,
    loadState,
    question,
    selectedChoiceId,
    submitResult,
    isPending,
    canSubmit,
    applySessionInfo,
    setLoadState,
    resetQuestionState,
    onTryAgain,
    onNextQuestion: onTryAgain,
    onNavigateQuestion,
    onSelectChoice,
    onSubmit,
  };
}
