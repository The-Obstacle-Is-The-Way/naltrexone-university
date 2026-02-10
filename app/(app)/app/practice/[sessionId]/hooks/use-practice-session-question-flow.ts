'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createLoadNextQuestionAction,
  loadNextQuestion,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import { runTransitionedAsyncAction } from '@/app/(app)/app/practice/shared/question-flow-actions';
import { useQuestionFlowCore } from '@/app/(app)/app/practice/shared/use-question-flow-core';
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
  isAnswered: boolean;
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
  const {
    question,
    setQuestion,
    selectedChoiceId,
    setSelectedChoiceId,
    isAnswered,
    submitResult,
    setSubmitResult,
    loadState,
    setLoadState,
    isPending,
    startTransition,
    questionLoadedAt,
    submitIdempotencyKey,
    setQuestionLoadedAt,
    setSubmitIdempotencyKey,
    createIdempotencyKey,
    createRequestSequenceId,
    isLatestRequest,
    isMounted,
    canSubmit,
    onSelectChoice,
  } = useQuestionFlowCore({ isMounted: input.isMounted });

  const [sessionInfo, setSessionInfo] = useState<NextQuestion['session']>(null);
  const [sessionMode, setSessionMode] = useState<'tutor' | 'exam' | null>(null);

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
      isMounted,
    }),
    [
      input.sessionId,
      input.getNextQuestionFn,
      createIdempotencyKey,
      createRequestSequenceId,
      isLatestRequest,
      isMounted,
      setLoadState,
      setQuestion,
      setQuestionLoadedAt,
      setSelectedChoiceId,
      setSubmitIdempotencyKey,
      setSubmitResult,
    ],
  );

  const onTryAgain = useMemo(
    () =>
      createLoadNextQuestionAction({
        startTransition,
        ...loadQuestionConfig,
      }),
    [loadQuestionConfig, startTransition],
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
  }, [setQuestion, setSelectedChoiceId, setSubmitResult]);

  const onNavigateQuestion = useCallback(
    (questionId: string): void => {
      startTransition(() => {
        void loadNextQuestion({
          ...loadQuestionConfig,
          questionId,
        });
      });
    },
    [loadQuestionConfig, startTransition],
  );

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
          isMounted,
        }),
    });
  }, [
    input.sessionId,
    input.submitAnswerFn,
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
    sessionInfo,
    sessionMode,
    setSessionMode,
    loadState,
    question,
    selectedChoiceId,
    isAnswered,
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
