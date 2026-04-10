'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createLoadNextQuestionAction,
  loadNextQuestion,
  submitAnswerForQuestion,
} from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import { maybeSaveDraftBeforeNavigation } from '@/app/(app)/app/practice/shared/question-flow-actions';
import { useQuestionFlowCore } from '@/app/(app)/app/practice/shared/use-question-flow-core';
import { runTransitionedAsyncAction } from '@/app/(app)/app/shared/transitioned-async-action';
import { reportClientError } from '@/lib/report-client-error';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SaveExamDraftAnswerOutput } from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UsePracticeSessionQuestionFlowInput = {
  sessionId: string;
  autoload?: boolean;
  isMounted: () => boolean;
  getNextQuestionFn: (
    input: unknown,
  ) => Promise<ActionResult<NextQuestion | null>>;
  submitAnswerFn: (input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>;
  saveExamDraftAnswerFn: (
    input: unknown,
  ) => Promise<ActionResult<SaveExamDraftAnswerOutput>>;
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
  onSubmit: () => Promise<SubmitAnswerOutput | null>;
  saveCurrentExamDraft: () => Promise<boolean>;
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
  const savedExamDraftsRef = useRef<
    Map<string, { selectedChoiceId: string | null; cumulativeMs: number }>
  >(new Map());
  const currentExamDraftEnteredAtRef = useRef<number | null>(null);
  const currentExamDraftCumulativeMsRef = useRef(0);

  const applySessionInfo = useCallback<
    UsePracticeSessionQuestionFlowOutput['applySessionInfo']
  >((next) => {
    setSessionInfo((prev) => {
      // applySessionInfo supports updater functions; call setSessionMode inside the setSessionInfo updater
      // to sync sessionMode with the resolved sessionInfo value.
      const resolved = typeof next === 'function' ? next(prev) : next;
      if (resolved?.mode) {
        setSessionMode(resolved.mode);
      }
      return resolved;
    });
  }, []);

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
      setSessionInfo: applySessionInfo,
      createRequestSequenceId,
      isLatestRequest,
      isMounted,
    }),
    [
      input.sessionId,
      input.getNextQuestionFn,
      applySessionInfo,
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
  useEffect(() => {
    if (input.autoload === false) return;
    onTryAgain();
  }, [input.autoload, onTryAgain]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId changes must clear session-scoped draft refs.
  useEffect(() => {
    savedExamDraftsRef.current.clear();
    currentExamDraftEnteredAtRef.current = null;
    currentExamDraftCumulativeMsRef.current = 0;
  }, [input.sessionId]);

  useEffect(() => {
    if (question?.session?.mode !== 'exam') {
      currentExamDraftEnteredAtRef.current = null;
      currentExamDraftCumulativeMsRef.current = 0;
      return;
    }

    const localDraft =
      savedExamDraftsRef.current.get(question.questionId) ?? null;
    const serverDraftSelectedChoiceId =
      question.session.draftSelectedChoiceId ?? null;
    const serverDraftCumulativeMs = question.session.draftCumulativeMs ?? 0;
    const draftSelectedChoiceId =
      serverDraftSelectedChoiceId ??
      (serverDraftCumulativeMs === 0
        ? (localDraft?.selectedChoiceId ?? null)
        : null);
    const draftCumulativeMs =
      serverDraftSelectedChoiceId !== null || serverDraftCumulativeMs > 0
        ? serverDraftCumulativeMs
        : (localDraft?.cumulativeMs ?? 0);

    savedExamDraftsRef.current.set(question.questionId, {
      selectedChoiceId: draftSelectedChoiceId,
      cumulativeMs: draftCumulativeMs,
    });
    currentExamDraftCumulativeMsRef.current = draftCumulativeMs;
    currentExamDraftEnteredAtRef.current = Date.now();
  }, [
    question?.questionId,
    question?.session?.mode,
    question?.session?.draftSelectedChoiceId,
    question?.session?.draftCumulativeMs,
  ]);

  const resetQuestionState = useCallback(() => {
    setSessionInfo(null);
    setQuestion(null);
    setSubmitResult(null);
    setSelectedChoiceId(null);
    savedExamDraftsRef.current.clear();
    currentExamDraftEnteredAtRef.current = null;
    currentExamDraftCumulativeMsRef.current = 0;
  }, [setQuestion, setSelectedChoiceId, setSubmitResult]);

  const saveCurrentExamDraft = useCallback(async (): Promise<boolean> => {
    if (!question || question.session?.mode !== 'exam') return true;

    const nowMs = Date.now();
    const enteredAtMs = currentExamDraftEnteredAtRef.current;
    const elapsedMs =
      enteredAtMs === null ? 0 : Math.max(0, nowMs - enteredAtMs);
    const currentCumulativeMs =
      currentExamDraftCumulativeMsRef.current + elapsedMs;
    const lastSavedDraft = savedExamDraftsRef.current.get(
      question.questionId,
    ) ?? {
      selectedChoiceId: question.session.draftSelectedChoiceId ?? null,
      cumulativeMs: question.session.draftCumulativeMs ?? 0,
    };

    const saved = await maybeSaveDraftBeforeNavigation({
      sessionId: input.sessionId,
      question,
      selectedChoiceId,
      currentCumulativeMs,
      lastSavedDraftSelectedChoiceId: lastSavedDraft.selectedChoiceId,
      lastSavedDraftCumulativeMs: lastSavedDraft.cumulativeMs,
      saveExamDraftAnswerFn: input.saveExamDraftAnswerFn,
      setLoadState,
      onSaved: (draft) => {
        savedExamDraftsRef.current.set(draft.questionId, {
          selectedChoiceId: draft.selectedChoiceId,
          cumulativeMs: draft.cumulativeMs,
        });
        if (draft.questionId === question.questionId) {
          setQuestion({
            ...question,
            session:
              question.session?.mode === 'exam'
                ? {
                    ...question.session,
                    draftSelectedChoiceId: draft.selectedChoiceId,
                    draftCumulativeMs: draft.cumulativeMs,
                  }
                : question.session,
          });
          currentExamDraftCumulativeMsRef.current = draft.cumulativeMs;
          currentExamDraftEnteredAtRef.current = nowMs;
        }
      },
    });

    if (!saved) return false;

    if (!selectedChoiceId) {
      currentExamDraftEnteredAtRef.current = nowMs;
    }

    return true;
  }, [
    input.saveExamDraftAnswerFn,
    input.sessionId,
    question,
    selectedChoiceId,
    setLoadState,
    setQuestion,
  ]);

  const onNavigateQuestion = useCallback(
    (questionId: string): void => {
      void runTransitionedAsyncAction({
        startTransition,
        run: async () => {
          const shouldNavigate = await saveCurrentExamDraft();
          if (!shouldNavigate) return;

          await loadNextQuestion({
            ...loadQuestionConfig,
            questionId,
          });
        },
        onUnhandledError: (error) => {
          reportClientError(error, {
            component: 'UsePracticeSessionQuestionFlow',
            action: 'navigateQuestion',
          });
        },
      });
    },
    [loadQuestionConfig, saveCurrentExamDraft, startTransition],
  );

  const onNextQuestion = useCallback((): void => {
    const fromIndex = (() => {
      const questionIndex = question?.session?.index;
      if (typeof questionIndex === 'number') return questionIndex;

      if (typeof sessionInfo?.index === 'number') return sessionInfo.index;

      return undefined;
    })();

    void runTransitionedAsyncAction({
      startTransition,
      run: async () => {
        const shouldNavigate = await saveCurrentExamDraft();
        if (!shouldNavigate) return;

        await loadNextQuestion({
          ...loadQuestionConfig,
          fromIndex,
        });
      },
      onUnhandledError: (error) => {
        reportClientError(error, {
          component: 'UsePracticeSessionQuestionFlow',
          action: 'nextQuestion',
        });
      },
    });
  }, [
    loadQuestionConfig,
    question?.session?.index,
    saveCurrentExamDraft,
    sessionInfo?.index,
    startTransition,
  ]);

  const onSubmit = useCallback((): Promise<SubmitAnswerOutput | null> => {
    // `onSuccess` is invoked synchronously within submitAnswerForQuestion before the promise resolves,
    // ensuring `captured` is populated before `.then(() => captured)` runs.
    let captured: SubmitAnswerOutput | null = null;

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
          onSuccess: (result) => {
            captured = result;
          },
          createRequestSequenceId,
          isLatestRequest,
          isMounted,
        }),
      onUnhandledError: (error) => {
        reportClientError(error, {
          component: 'UsePracticeSessionQuestionFlow',
          action: 'submitAnswer',
        });
      },
    }).then(() => captured);
  }, [
    createRequestSequenceId,
    input.sessionId,
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
    onNextQuestion,
    onNavigateQuestion,
    onSelectChoice,
    onSubmit,
    saveCurrentExamDraft,
  };
}
