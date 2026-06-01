import type { QuestionFeedbackRepository } from '@/src/application/ports/repositories';
import type { QuestionFeedbackRating } from '@/src/domain/value-objects';

export type GetQuestionRatingInput = {
  userId: string;
  questionId: string;
};

export type GetQuestionRatingOutput = {
  rating: QuestionFeedbackRating | null;
};

export class GetQuestionRatingUseCase {
  constructor(private readonly feedback: QuestionFeedbackRepository) {}

  async execute(
    input: GetQuestionRatingInput,
  ): Promise<GetQuestionRatingOutput> {
    const latest = await this.feedback.findLatestRatingByUser(
      input.userId,
      input.questionId,
    );

    return { rating: latest?.rating ?? null };
  }
}
