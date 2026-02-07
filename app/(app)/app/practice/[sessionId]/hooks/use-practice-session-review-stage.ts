'use client';

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { endSession } from '@/app/(app)/app/practice/[sessionId]/practice-session-page-logic';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import {
  type EndPracticeSessionOutput,
  endPracticeSession,
  type GetPracticeSessionReviewOutput,
  getPracticeSessionReview,
} from '@/src/adapters/controllers/practice-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';

export type UsePracticeSessionReviewStageInput = {
  sessionId: string;
  isMounted: () => boolean;
  sessionInfo: NextQuestion['session'];
  questionId: string | null;
  submitResult: SubmitAnswerOutput | null;
  sessionMode: 'tutor' | 'exam' | null;
  setSessionMode: (mode: 'tutor' | 'exam' | null) => void;
  setLoadState: (state: LoadState) => void;
  setQuestion: (question: NextQuestion | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSelectedChoiceId: (choiceId: string | null) => void;
  loadSpecificQuestion: (questionId: string) => void;
};

export type UsePracticeSessionReviewStageOutput = {
  summary: EndPracticeSessionOutput | null;
  summaryReview: GetPracticeSessionReviewOutput | null;
  summaryReviewLoadState: LoadState;
  review: GetPracticeSessionReviewOutput | null;
  setReview: Dispatch<SetStateAction<GetPracticeSessionReviewOutput | null>>;
  reviewLoadState: LoadState;
  navigator: GetPracticeSessionReviewOutput | null;
  isInReviewStage: boolean;
  onEndSession: () => void;
  onRetryReview: () => void;
  onOpenReviewQuestion: (questionId: string) => void;
  onFinalizeReview: () => void;
};

export function usePracticeSessionReviewStage(
  input: UsePracticeSessionReviewStageInput,
): UsePracticeSessionReviewStageOutput {
  const [summary, setSummary] = useState<EndPracticeSessionOutput | null>(null);
  const [summaryReview, setSummaryReview] =
    useState<GetPracticeSessionReviewOutput | null>(null);
  const [summaryReviewLoadState, setSummaryReviewLoadState] =
    useState<LoadState>({
      status: 'idle',
    });
  const [review, setReview] = useState<GetPracticeSessionReviewOutput | null>(
    null,
  );
  const [navigator, setNavigator] =
    useState<GetPracticeSessionReviewOutput | null>(null);
  const [reviewLoadState, setReviewLoadState] = useState<LoadState>({
    status: 'idle',
  });
  const [isInReviewStage, setIsInReviewStage] = useState(false);
  const endSessionIdempotencyKeyRef = useRef(crypto.randomUUID());

  const finalizeSession = useCallback(
    () =>
      endSession({
        sessionId: input.sessionId,
        endSessionIdempotencyKey: endSessionIdempotencyKeyRef.current,
        endPracticeSessionFn: endPracticeSession,
        setLoadState: input.setLoadState,
        setSummary,
        setQuestion: input.setQuestion,
        setSubmitResult: input.setSubmitResult,
        setSelectedChoiceId: input.setSelectedChoiceId,
        isMounted: input.isMounted,
      }),
    [
      input.sessionId,
      input.setLoadState,
      input.setQuestion,
      input.setSelectedChoiceId,
      input.setSubmitResult,
      input.isMounted,
    ],
  );

  const loadReview = useCallback(async (): Promise<void> => {
    setReviewLoadState({ status: 'loading' });

    let res: Awaited<ReturnType<typeof getPracticeSessionReview>>;
    try {
      res = await getPracticeSessionReview({ sessionId: input.sessionId });
    } catch (error) {
      if (!input.isMounted()) return;
      setReviewLoadState({
        status: 'error',
        message: getThrownErrorMessage(error),
      });
      return;
    }
    if (!input.isMounted()) return;

    if (!res.ok) {
      setReviewLoadState({
        status: 'error',
        message: getActionResultErrorMessage(res),
      });
      return;
    }

    if (res.data.mode !== 'exam') {
      setReview(null);
      setReviewLoadState({ status: 'idle' });
      setIsInReviewStage(false);
      input.setSessionMode(res.data.mode);
      void finalizeSession();
      return;
    }

    setReview(res.data);
    setReviewLoadState({ status: 'ready' });
    setIsInReviewStage(true);
    input.setSessionMode(res.data.mode);
    input.setQuestion(null);
    input.setSubmitResult(null);
    input.setSelectedChoiceId(null);
  }, [
    input.sessionId,
    input.isMounted,
    input.setQuestion,
    input.setSelectedChoiceId,
    input.setSessionMode,
    input.setSubmitResult,
    finalizeSession,
  ]);

  const onOpenReviewQuestion = useCallback(
    (questionId: string): void => {
      setReview(null);
      setReviewLoadState({ status: 'idle' });
      setIsInReviewStage(true);
      input.loadSpecificQuestion(questionId);
    },
    [input.loadSpecificQuestion],
  );

  const onFinalizeReview = useCallback(() => {
    setReview(null);
    setReviewLoadState({ status: 'idle' });
    setIsInReviewStage(false);
    void finalizeSession();
  }, [finalizeSession]);

  const onEndSession = useCallback(() => {
    if (
      input.sessionMode === 'exam' ||
      isInReviewStage ||
      input.sessionMode === null
    ) {
      void loadReview();
      return;
    }
    void finalizeSession();
  }, [input.sessionMode, isInReviewStage, loadReview, finalizeSession]);

  const onRetryReview = useCallback(() => {
    void loadReview();
  }, [loadReview]);

  useEffect(() => {
    if (!summary) {
      setSummaryReview(null);
      setSummaryReviewLoadState({ status: 'idle' });
      return;
    }

    let mounted = true;
    setSummaryReview(null);
    setSummaryReviewLoadState({ status: 'loading' });

    void (async () => {
      let res: Awaited<ReturnType<typeof getPracticeSessionReview>>;
      try {
        res = await getPracticeSessionReview({ sessionId: input.sessionId });
      } catch (error) {
        if (!mounted || !input.isMounted()) return;
        setSummaryReviewLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
        return;
      }
      if (!mounted || !input.isMounted()) return;
      if (!res.ok) {
        setSummaryReviewLoadState({
          status: 'error',
          message: getActionResultErrorMessage(res),
        });
        return;
      }

      setSummaryReview(res.data);
      setSummaryReviewLoadState({ status: 'ready' });
    })();

    return () => {
      mounted = false;
    };
  }, [summary, input.sessionId, input.isMounted]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: navigator must refresh when the current question and answer state change.
  useEffect(() => {
    if (summary || isInReviewStage || !input.sessionInfo) {
      setNavigator(null);
      return;
    }

    let mounted = true;
    void (async () => {
      let res: Awaited<ReturnType<typeof getPracticeSessionReview>>;
      try {
        res = await getPracticeSessionReview({ sessionId: input.sessionId });
      } catch {
        if (!mounted || !input.isMounted()) return;
        return;
      }
      if (!mounted || !input.isMounted()) return;
      if (!res.ok) return;
      setNavigator(res.data);
    })();

    return () => {
      mounted = false;
    };
  }, [
    summary,
    isInReviewStage,
    input.sessionInfo,
    input.sessionId,
    input.questionId,
    input.submitResult,
    input.isMounted,
  ]);

  return {
    summary,
    summaryReview,
    summaryReviewLoadState,
    review,
    setReview,
    reviewLoadState,
    navigator,
    isInReviewStage,
    onEndSession,
    onRetryReview,
    onOpenReviewQuestion,
    onFinalizeReview,
  };
}
