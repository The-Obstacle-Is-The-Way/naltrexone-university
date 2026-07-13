'use client';

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from 'react';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import {
  getActionResultPracticeSessionConflictReason,
  STATE_CHANGED_CONCURRENTLY_NOTICE,
} from '@/app/(app)/app/practice/shared/question-flow-actions';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from '@/app/(app)/app/shared/error-message-helpers';
import { STANDARD_MUTATION_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import { useNotification } from '@/components/ui/notification-provider';
import {
  reportClientError,
  shouldReportClientError,
} from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  IdempotentActionNames,
  rotateIdempotencyKeyAfterDeterminateError,
} from '@/src/adapters/controllers/shared/idempotency-error-policy';
import { PracticeSessionConflictReasons } from '@/src/application/errors';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';

const MARK_FOR_REVIEW_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;

export type SetPracticeSessionQuestionMarkFn = (input: {
  sessionId: string;
  questionId: string;
  markedForReview: boolean;
  idempotencyKey?: string;
}) => Promise<
  ActionResult<{
    questionId: string;
    markedForReview: boolean;
  }>
>;

type UsePracticeSessionMarkForReviewInput = {
  question: NextQuestion | null;
  sessionMode: 'tutor' | 'exam' | null;
  sessionInfo: NextQuestion['session'];
  sessionId: string;
  applySessionInfo: (
    next:
      | NextQuestion['session']
      | ((prev: NextQuestion['session']) => NextQuestion['session']),
  ) => void;
  setLoadState: (state: LoadState) => void;
  setReview: Dispatch<SetStateAction<GetPracticeSessionReviewOutput | null>>;
  isMounted: () => boolean;
  setPracticeSessionQuestionMarkFn: SetPracticeSessionQuestionMarkFn;
};

export function usePracticeSessionMarkForReview(
  input: UsePracticeSessionMarkForReviewInput,
): {
  isMarkingForReview: boolean;
  onToggleMarkForReview: () => Promise<void>;
} {
  const [isMarkingForReview, setIsMarkingForReview] = useState(false);
  const { notify } = useNotification();
  const isMarkingRef = useRef(false);
  const markRequestIdempotencyKeyRef = useRef<string | null>(null);
  const currentQuestionIdRef = useRef<string | null>(null);
  currentQuestionIdRef.current = input.question?.questionId ?? null;

  const onToggleMarkForReview = useCallback(async () => {
    if (!input.question) return;
    if (input.sessionMode !== 'exam') return;
    if (isMarkingRef.current) return;
    if (!input.sessionInfo) return;

    const requestQuestionId = input.question.questionId;
    const markedForReview = !input.sessionInfo.isMarkedForReview;
    isMarkingRef.current = true;
    setIsMarkingForReview(true);

    let res: Awaited<ReturnType<SetPracticeSessionQuestionMarkFn>>;
    if (!markRequestIdempotencyKeyRef.current) {
      markRequestIdempotencyKeyRef.current = crypto.randomUUID();
    }

    const requestIdempotencyKey = markRequestIdempotencyKeyRef.current;

    try {
      res = await withTimeout(
        input.setPracticeSessionQuestionMarkFn({
          sessionId: input.sessionId,
          questionId: input.question.questionId,
          markedForReview,
          idempotencyKey: requestIdempotencyKey,
        }),
        MARK_FOR_REVIEW_TIMEOUT_MS,
      );
    } catch (error) {
      if (!input.isMounted()) return;
      reportClientError(error, {
        component: 'UsePracticeSessionMarkForReview',
        action: 'toggleMarkForReview',
      });
      if (currentQuestionIdRef.current === requestQuestionId) {
        input.setLoadState({
          status: 'error',
          message: getThrownErrorMessage(error),
        });
      }
      isMarkingRef.current = false;
      setIsMarkingForReview(false);
      return;
    }
    if (!input.isMounted()) return;

    if (!res.ok) {
      rotateIdempotencyKeyAfterDeterminateError(
        IdempotentActionNames.QuestionMark,
        res.error,
        () => {
          markRequestIdempotencyKeyRef.current = null;
        },
      );
      const reason = getActionResultPracticeSessionConflictReason(res);
      if (reason === PracticeSessionConflictReasons.StateChangedConcurrently) {
        notify({
          message: STATE_CHANGED_CONCURRENTLY_NOTICE,
          tone: 'info',
        });
        isMarkingRef.current = false;
        setIsMarkingForReview(false);
        return;
      }

      if (shouldReportClientError(res.error)) {
        reportClientError(res.error, {
          component: 'UsePracticeSessionMarkForReview',
          action: 'toggleMarkForReview',
        });
      }
      if (currentQuestionIdRef.current === requestQuestionId) {
        input.setLoadState({
          status: 'error',
          message: getActionResultErrorMessage(res),
        });
      }
      isMarkingRef.current = false;
      setIsMarkingForReview(false);
      return;
    }

    if (currentQuestionIdRef.current === requestQuestionId) {
      input.applySessionInfo((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          isMarkedForReview: res.data.markedForReview,
        };
      });
    }

    input.setReview((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((row) => {
        if (row.questionId !== res.data.questionId) return row;
        return { ...row, markedForReview: res.data.markedForReview };
      });
      return {
        ...prev,
        rows,
        markedCount: rows.filter((row) => row.markedForReview).length,
      };
    });

    markRequestIdempotencyKeyRef.current = null;
    isMarkingRef.current = false;
    setIsMarkingForReview(false);
  }, [
    input.isMounted,
    input.question,
    input.sessionId,
    input.sessionInfo,
    input.sessionMode,
    input.setLoadState,
    input.setReview,
    input.applySessionInfo,
    input.setPracticeSessionQuestionMarkFn,
    notify,
  ]);

  return { isMarkingForReview, onToggleMarkForReview };
}
