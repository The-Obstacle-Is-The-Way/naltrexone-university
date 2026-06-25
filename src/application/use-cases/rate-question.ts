import { ApplicationError } from '@/src/application/errors';
import type {
  AttemptRepository,
  PracticeSessionRepository,
  QuestionFeedbackRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { newQuestionRatingFeedback } from '@/src/domain/entities';
import type { QuestionFeedbackRating } from '@/src/domain/value-objects';
import { validateFeedbackContext } from './validate-feedback-context';

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
    private readonly attempts: AttemptRepository,
    private readonly sessions: PracticeSessionRepository,
  ) {}

  async execute(input: RateQuestionInput): Promise<RateQuestionOutput> {
    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const context = await validateFeedbackContext(
      {
        userId: input.userId,
        questionId: input.questionId,
        attemptId: input.attemptId,
        practiceSessionId: input.practiceSessionId,
      },
      { attempts: this.attempts, sessions: this.sessions },
    );

    await this.feedback.record(
      newQuestionRatingFeedback({
        userId: input.userId,
        questionId: input.questionId,
        attemptId: context.attemptId,
        practiceSessionId: context.practiceSessionId,
        rating: input.rating,
      }),
    );

    return { rating: input.rating };
  }
}
