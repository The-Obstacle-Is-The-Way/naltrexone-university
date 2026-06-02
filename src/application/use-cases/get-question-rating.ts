import { ApplicationError } from '@/src/application/errors';
import type {
  QuestionFeedbackRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { QuestionFeedbackRating } from '@/src/domain/value-objects';

export type GetQuestionRatingInput = {
  userId: string;
  questionId: string;
};

export type GetQuestionRatingOutput = {
  rating: QuestionFeedbackRating | null;
};

export class GetQuestionRatingUseCase {
  constructor(
    private readonly feedback: QuestionFeedbackRepository,
    private readonly questions: QuestionRepository,
  ) {}

  async execute(
    input: GetQuestionRatingInput,
  ): Promise<GetQuestionRatingOutput> {
    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const latest = await this.feedback.findLatestRatingByUser(
      input.userId,
      input.questionId,
    );

    return { rating: latest?.rating ?? null };
  }
}
