'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import {
  type GetPracticeSessionReviewOutput,
  getPracticeSessionReview,
} from '@/src/adapters/controllers/practice-controller';

export type UsePracticeSessionReviewStageStateInput = {
  sessionId: string;
  isMounted: () => boolean;
  sessionMode: 'tutor' | 'exam' | null;
  setSessionMode: (mode: 'tutor' | 'exam' | null) => void;
  resetQuestionState: () => void;
  loadSpecificQuestion: (questionId: string) => void;
  finalizeSession: () => Promise<void>;
};

export type UsePracticeSessionReviewStageStateOutput = {
  review: GetPracticeSessionReviewOutput | null;
  setReview: Dispatch<SetStateAction<GetPracticeSessionReviewOutput | null>>;
  reviewLoadState: LoadState;
  isInReviewStage: boolean;
  onEndSession: () => void;
  onRetryReview: () => void;
  onOpenReviewQuestion: (questionId: string) => void;
  onFinalizeReview: () => Promise<void>;
};

export function usePracticeSessionReviewStageState(
  input: UsePracticeSessionReviewStageStateInput,
): UsePracticeSessionReviewStageStateOutput {
  const [review, setReview] = useState<GetPracticeSessionReviewOutput | null>(
    null,
  );
  const [reviewLoadState, setReviewLoadState] = useState<LoadState>({
    status: 'idle',
  });
  const [isInReviewStage, setIsInReviewStage] = useState(false);

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
      void input.finalizeSession();
      return;
    }

    setReview(res.data);
    setReviewLoadState({ status: 'ready' });
    setIsInReviewStage(true);
    input.setSessionMode(res.data.mode);
    input.resetQuestionState();
  }, [
    input.finalizeSession,
    input.isMounted,
    input.resetQuestionState,
    input.sessionId,
    input.setSessionMode,
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

  const onFinalizeReview = useCallback((): Promise<void> => {
    setReview(null);
    setReviewLoadState({ status: 'idle' });
    setIsInReviewStage(false);
    return input.finalizeSession();
  }, [input.finalizeSession]);

  const onEndSession = useCallback(() => {
    if (
      input.sessionMode === 'exam' ||
      isInReviewStage ||
      input.sessionMode === null
    ) {
      void loadReview();
      return;
    }
    void input.finalizeSession();
  }, [input.finalizeSession, input.sessionMode, isInReviewStage, loadReview]);

  const onRetryReview = useCallback(() => {
    void loadReview();
  }, [loadReview]);

  return {
    review,
    setReview,
    reviewLoadState,
    isInReviewStage,
    onEndSession,
    onRetryReview,
    onOpenReviewQuestion,
    onFinalizeReview,
  };
}
