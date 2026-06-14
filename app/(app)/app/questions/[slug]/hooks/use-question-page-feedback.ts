import { useMemo } from 'react';
import {
  type PracticeQuestionFeedbackStatus,
  usePracticeQuestionFeedback,
} from '@/app/(app)/app/practice/hooks/use-practice-question-feedback';
import type { QuestionMode } from '@/lib/routes';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import type {
  QuestionFeedbackCategory,
  QuestionFeedbackRating,
} from '@/src/domain/value-objects';

export type QuestionPageFeedbackStatus = PracticeQuestionFeedbackStatus;

export type UseQuestionPageFeedbackInput = {
  mode?: QuestionMode | null;
  question: Pick<GetQuestionBySlugOutput, 'questionId'> | null;
  attemptId?: string | null;
  practiceSessionId?: string | null;
  isMounted: () => boolean;
};

export type UseQuestionPageFeedbackOutput = {
  rating: QuestionFeedbackRating | null;
  feedbackStatus: QuestionPageFeedbackStatus;
  onRate: (rating: QuestionFeedbackRating | null) => void;
  isReportOpen: boolean;
  openReport: (open?: boolean) => void;
  submitReport: (input: {
    category: QuestionFeedbackCategory;
    comment: string | null;
  }) => Promise<boolean>;
};

export function useQuestionPageFeedback(
  input: UseQuestionPageFeedbackInput,
): UseQuestionPageFeedbackOutput {
  const isReviewMode = input.mode === 'review';
  const questionId = input.question?.questionId ?? null;
  const question = useMemo(() => {
    if (!isReviewMode || !questionId) return null;

    return {
      questionId,
      attemptId: input.attemptId ?? null,
      practiceSessionId: input.practiceSessionId ?? null,
    };
  }, [isReviewMode, questionId, input.attemptId, input.practiceSessionId]);

  return usePracticeQuestionFeedback({
    question,
    isReviewMode,
    isMounted: input.isMounted,
  });
}
