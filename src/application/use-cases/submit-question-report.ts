import { ApplicationError } from '@/src/application/errors';
import type {
  AttemptRepository,
  PracticeSessionRepository,
  QuestionFeedbackRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { newQuestionReportFeedback } from '@/src/domain/entities';
import type { QuestionFeedbackCategory } from '@/src/domain/value-objects';
import { validateFeedbackContext } from './validate-feedback-context';

export type SubmitQuestionReportInput = {
  userId: string;
  questionId: string;
  attemptId: string | null;
  practiceSessionId: string | null;
  category: QuestionFeedbackCategory;
  comment: string | null;
  idempotencyKey?: string;
};

export type SubmitQuestionReportOutput = {
  feedbackId: string;
};

export class SubmitQuestionReportUseCase {
  constructor(
    private readonly feedback: QuestionFeedbackRepository,
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptRepository,
    private readonly sessions: PracticeSessionRepository,
  ) {}

  async execute(
    input: SubmitQuestionReportInput,
  ): Promise<SubmitQuestionReportOutput> {
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

    const saved = await this.feedback.record(
      newQuestionReportFeedback({
        userId: input.userId,
        questionId: input.questionId,
        attemptId: context.attemptId,
        practiceSessionId: context.practiceSessionId,
        category: input.category,
        comment: input.comment,
      }),
      input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey }
        : undefined,
    );

    if (saved.kind !== 'report') {
      throw new ApplicationError('INTERNAL_ERROR', 'Invalid report replay');
    }

    return { feedbackId: saved.id };
  }
}
