import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type FeedbackQuestionContext,
  type FeedbackRequestToken,
  rateQuestionForQuestion,
  submitReportForQuestion,
} from '@/app/(app)/app/shared/question-feedback-actions';
import { STANDARD_READ_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import {
  reportClientError,
  shouldReportClientError,
} from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import {
  getQuestionRating,
  rateQuestion,
  submitQuestionReport,
} from '@/src/adapters/controllers/question-feedback-controller';
import type {
  QuestionFeedbackCategory,
  QuestionFeedbackRating,
} from '@/src/domain/value-objects';

const QUESTION_RATING_LOOKUP_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;

export type PracticeQuestionFeedbackStatus =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'error';

export type UsePracticeQuestionFeedbackInput = {
  question: FeedbackQuestionContext | null;
  isReviewMode: boolean;
  isMounted: () => boolean;
};

export type UsePracticeQuestionFeedbackOutput = {
  rating: QuestionFeedbackRating | null;
  feedbackStatus: PracticeQuestionFeedbackStatus;
  onRate: (rating: QuestionFeedbackRating | null) => void;
  isReportOpen: boolean;
  openReport: (open?: boolean) => void;
  submitReport: (input: {
    category: QuestionFeedbackCategory;
    comment: string | null;
  }) => Promise<boolean>;
};

export function usePracticeQuestionFeedback(
  input: UsePracticeQuestionFeedbackInput,
): UsePracticeQuestionFeedbackOutput {
  const [rating, setRating] = useState<QuestionFeedbackRating | null>(null);
  const [feedbackStatus, setFeedbackStatus] =
    useState<PracticeQuestionFeedbackStatus>('idle');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const latestRatingLookupRequestId = useRef(0);
  const feedbackStateVersionRef = useRef(0);
  const ratingRequestTokensRef = useRef<Map<string, FeedbackRequestToken>>(
    new Map(),
  );
  const reportRequestTokensRef = useRef<Map<string, FeedbackRequestToken>>(
    new Map(),
  );
  const isMountedRef = useRef(input.isMounted);
  isMountedRef.current = input.isMounted;
  const questionId = input.question?.questionId ?? null;
  const attemptId = input.question?.attemptId ?? null;
  const practiceSessionId = input.question?.practiceSessionId ?? null;

  const questionContext = useMemo<FeedbackQuestionContext | null>(() => {
    if (!input.isReviewMode || !questionId) return null;

    return {
      questionId,
      attemptId,
      practiceSessionId,
    };
  }, [input.isReviewMode, questionId, attemptId, practiceSessionId]);

  useEffect(() => {
    const isMounted = () => isMountedRef.current();

    if (!questionContext) {
      latestRatingLookupRequestId.current += 1;
      feedbackStateVersionRef.current += 1;
      setRating(null);
      setFeedbackStatus('idle');
      setIsReportOpen(false);
      return;
    }

    latestRatingLookupRequestId.current += 1;
    const requestId = latestRatingLookupRequestId.current;
    feedbackStateVersionRef.current += 1;
    const stateVersion = feedbackStateVersionRef.current;
    const questionId = questionContext.questionId;

    setRating(null);
    setFeedbackStatus('loading');

    void withTimeout(
      getQuestionRating({ questionId }),
      QUESTION_RATING_LOOKUP_TIMEOUT_MS,
    )
      .then((result) => {
        if (!isMounted()) return;
        if (latestRatingLookupRequestId.current !== requestId) return;
        if (feedbackStateVersionRef.current !== stateVersion) return;

        if (!result.ok) {
          if (shouldReportClientError(result.error)) {
            reportClientError(result.error, {
              component: 'UsePracticeQuestionFeedback',
              action: 'loadQuestionRating',
            });
          }
          setFeedbackStatus('error');
          return;
        }

        setRating(result.data.rating);
        setFeedbackStatus('idle');
      })
      .catch((error: unknown) => {
        if (!isMounted()) return;
        if (latestRatingLookupRequestId.current !== requestId) return;
        if (feedbackStateVersionRef.current !== stateVersion) return;

        reportClientError(error, {
          component: 'UsePracticeQuestionFeedback',
          action: 'loadQuestionRating',
        });
        setFeedbackStatus('error');
      });
  }, [questionContext]);

  const onRate = useCallback(
    (nextRating: QuestionFeedbackRating | null) => {
      if (!questionContext) return;

      feedbackStateVersionRef.current += 1;
      const stateVersion = feedbackStateVersionRef.current;
      const questionId = questionContext.questionId;

      void rateQuestionForQuestion({
        question: questionContext,
        currentRating: rating,
        nextRating,
        ratingRequestToken:
          ratingRequestTokensRef.current.get(questionId) ?? null,
        createIdempotencyKey: () => crypto.randomUUID(),
        setRatingRequestToken: (token) => {
          ratingRequestTokensRef.current.set(questionId, token);
        },
        rateQuestionFn: rateQuestion,
        setRating: (nextRatingState) => {
          if (!isMountedRef.current()) return;
          if (feedbackStateVersionRef.current !== stateVersion) return;
          setRating(nextRatingState);
        },
        setFeedbackStatus: (status) => {
          if (!isMountedRef.current()) return;
          if (feedbackStateVersionRef.current !== stateVersion) return;
          setFeedbackStatus(status);
        },
        logError: (_message, error) => {
          reportClientError(error, {
            component: 'UsePracticeQuestionFeedback',
            action: 'rateQuestion',
          });
        },
        isMounted: () => isMountedRef.current(),
      });
    },
    [questionContext, rating],
  );

  const openReport = useCallback((open = true) => {
    setIsReportOpen(open);
  }, []);

  const submitReport = useCallback(
    async (report: {
      category: QuestionFeedbackCategory;
      comment: string | null;
    }): Promise<boolean> => {
      if (!questionContext) return false;

      const questionId = questionContext.questionId;
      return submitReportForQuestion({
        question: questionContext,
        category: report.category,
        comment: report.comment,
        reportRequestToken:
          reportRequestTokensRef.current.get(questionId) ?? null,
        createIdempotencyKey: () => crypto.randomUUID(),
        setReportRequestToken: (token) => {
          reportRequestTokensRef.current.set(questionId, token);
        },
        submitQuestionReportFn: submitQuestionReport,
        logError: (_message, context) => {
          reportClientError(context, {
            component: 'UsePracticeQuestionFeedback',
            action: 'submitQuestionReport',
          });
        },
        isMounted: () => isMountedRef.current(),
      });
    },
    [questionContext],
  );

  return {
    rating,
    feedbackStatus,
    onRate,
    isReportOpen,
    openReport,
    submitReport,
  };
}
