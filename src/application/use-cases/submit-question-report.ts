import { ApplicationError } from '@/src/application/errors';
import type {
  QuestionFeedbackRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { newQuestionReportFeedback } from '@/src/domain/entities';
import type { QuestionFeedbackCategory } from '@/src/domain/value-objects';

export type SubmitQuestionReportInput = {
  userId: string;
  questionId: string;
  attemptId: string | null;
  practiceSessionId: string | null;
  category: QuestionFeedbackCategory;
  comment: string | null;
};

export type SubmitQuestionReportOutput = {
  feedbackId: string;
};

export class SubmitQuestionReportUseCase {
  constructor(
    private readonly feedback: QuestionFeedbackRepository,
    private readonly questions: QuestionRepository,
  ) {}

  async execute(
    input: SubmitQuestionReportInput,
  ): Promise<SubmitQuestionReportOutput> {
    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const saved = await this.feedback.record(newQuestionReportFeedback(input));
    return { feedbackId: saved.id };
  }
}
