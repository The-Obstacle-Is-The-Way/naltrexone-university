import type {
  QuestionFeedbackCategory,
  QuestionFeedbackRating,
} from '../value-objects';

export type QuestionFeedbackContext = {
  readonly userId: string;
  readonly questionId: string;
  readonly attemptId: string | null;
  readonly practiceSessionId: string | null;
};

export type PersistedQuestionFeedback = {
  readonly id: string;
  readonly createdAt: Date;
};

export type QuestionRatingFeedback = QuestionFeedbackContext &
  PersistedQuestionFeedback & {
    readonly kind: 'rating';
    readonly rating: QuestionFeedbackRating | null;
    readonly category: null;
    readonly comment: null;
  };

export type QuestionReportFeedback = QuestionFeedbackContext &
  PersistedQuestionFeedback & {
    readonly kind: 'report';
    readonly rating: null;
    readonly category: QuestionFeedbackCategory;
    readonly comment: string | null;
  };

export type QuestionFeedback = QuestionRatingFeedback | QuestionReportFeedback;

export type NewQuestionFeedback =
  | Omit<QuestionRatingFeedback, keyof PersistedQuestionFeedback>
  | Omit<QuestionReportFeedback, keyof PersistedQuestionFeedback>;

export function newQuestionRatingFeedback(
  input: QuestionFeedbackContext & {
    readonly rating: QuestionFeedbackRating | null;
  },
): NewQuestionFeedback {
  return {
    ...input,
    kind: 'rating',
    category: null,
    comment: null,
  };
}

export function newQuestionReportFeedback(
  input: QuestionFeedbackContext & {
    readonly category: QuestionFeedbackCategory;
    readonly comment: string | null;
  },
): NewQuestionFeedback {
  return {
    ...input,
    kind: 'report',
    rating: null,
  };
}
