import { ApplicationError } from '@/src/application/errors';
import type {
  QuestionFeedbackRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { newQuestionRatingFeedback } from '@/src/domain/entities';
import type { QuestionFeedbackRating } from '@/src/domain/value-objects';

export type RateQuestionInput = {
  userId: string;
  questionId: string;
  attemptId: string | null;
  practiceSessionId: string | null;
  rating: QuestionFeedbackRating | null;
};

export type RateQuestionOutput = {
  rating: QuestionFeedbackRating | null;
};

export class RateQuestionUseCase {
  constructor(
    private readonly feedback: QuestionFeedbackRepository,
    private readonly questions: QuestionRepository,
  ) {}

  async execute(input: RateQuestionInput): Promise<RateQuestionOutput> {
    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    await this.feedback.record(
      newQuestionRatingFeedback({
        userId: input.userId,
        questionId: input.questionId,
        attemptId: input.attemptId,
        practiceSessionId: input.practiceSessionId,
        rating: input.rating,
      }),
    );

    return { rating: input.rating };
  }
}
