import type {
  NewQuestionFeedback,
  QuestionFeedback,
  QuestionRatingFeedback,
} from '@/src/domain/entities';

export type QuestionFeedbackRecordOptions = {
  idempotencyKey?: string;
};

export interface QuestionFeedbackRepository {
  record(
    event: NewQuestionFeedback,
    options?: QuestionFeedbackRecordOptions,
  ): Promise<QuestionFeedback>;
  /**
   * Latest rating-kind event for (user, question); null if none.
   * Drives thumbs-up/thumbs-down hydration.
   */
  findLatestRatingByUser(
    userId: string,
    questionId: string,
  ): Promise<QuestionRatingFeedback | null>;
}
