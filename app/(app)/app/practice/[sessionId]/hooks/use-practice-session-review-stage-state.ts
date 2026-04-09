'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useRef, useState } from 'react';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/practice/practice-logic';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import { STANDARD_READ_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import {
  reportClientError,
  shouldReportClientError,
} from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetPracticeSessionReviewOutput } from '@/src/adapters/controllers/practice-controller';
import type { GetPracticeSessionReviewInput as GetPracticeSessionReviewUseCaseInput } from '@/src/application/use-cases';

const SESSION_REVIEW_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;

export type UsePracticeSessionReviewStageStateInput = {
  sessionId: string;
  isMounted: () => boolean;
  sessionMode: 'tutor' | 'exam' | null;
  setSessionMode: (mode: 'tutor' | 'exam' | null) => void;
  resetQuestionState: () => void;
  loadSpecificQuestion: (questionId: string) => void;
  finalizeSession: () => Promise<void>;
  getPracticeSessionReviewFn: (
    input: Pick<GetPracticeSessionReviewUseCaseInput, 'sessionId'>,
  ) => Promise<ActionResult<GetPracticeSessionReviewOutput>>;
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
  const isLoadingReviewRef = useRef(false);
  const finalizeSessionSafely = useCallback((): void => {
    void input.finalizeSession().catch((error) => {
      if (!input.isMounted()) return;
      reportClientError(error, {
        component: 'UsePracticeSessionReviewStageState',
        action: 'finalizeSession',
      });
      setReviewLoadState({
        status: 'error',
        message: getThrownErrorMessage(error),
      });
    });
  }, [input.finalizeSession, input.isMounted]);

  const loadReview = useCallback(async (): Promise<void> => {
    if (isLoadingReviewRef.current) return;
    isLoadingReviewRef.current = true;
    setReviewLoadState({ status: 'loading' });

    try {
      let res: Awaited<ReturnType<typeof input.getPracticeSessionReviewFn>>;
      try {
        res = await withTimeout(
          input.getPracticeSessionReviewFn({ sessionId: input.sessionId }),
          SESSION_REVIEW_TIMEOUT_MS,
        );
      } catch (error) {
        if (!input.isMounted()) return;
        reportClientError(error, {
          component: 'UsePracticeSessionReviewStageState',
          action: 'loadReview',
        });
        setReviewLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
        return;
      }
      if (!input.isMounted()) return;

      if (!res.ok) {
        if (shouldReportClientError(res.error)) {
          reportClientError(res.error, {
            component: 'UsePracticeSessionReviewStageState',
            action: 'loadReview',
          });
        }
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
        finalizeSessionSafely();
        return;
      }

      setReview(res.data);
      setReviewLoadState({ status: 'ready' });
      setIsInReviewStage(true);
      input.setSessionMode(res.data.mode);
      input.resetQuestionState();
    } finally {
      isLoadingReviewRef.current = false;
    }
  }, [
    input.getPracticeSessionReviewFn,
    input.isMounted,
    input.resetQuestionState,
    input.sessionId,
    input.setSessionMode,
    finalizeSessionSafely,
  ]);

  const onOpenReviewQuestion = useCallback(
    (questionId: string): void => {
      setReview(null);
      setReviewLoadState({ status: 'idle' });
      setIsInReviewStage(false);
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
    finalizeSessionSafely();
  }, [input.sessionMode, isInReviewStage, loadReview, finalizeSessionSafely]);

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
