import { ApplicationError } from '@/src/application/errors';
import type {
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { PracticeSessionQuestionState } from '@/src/domain/entities';

export type SaveExamDraftAnswerInput = {
  userId: string;
  sessionId: string;
  questionId: string;
  selectedChoiceId: string;
  cumulativeMs: number;
};

export type SaveExamDraftAnswerOutput = PracticeSessionQuestionState;

export class SaveExamDraftAnswerUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly sessions: PracticeSessionRepository,
  ) {}

  async execute(
    input: SaveExamDraftAnswerInput,
  ): Promise<SaveExamDraftAnswerOutput> {
    const session = await this.sessions.findByIdAndUserId(
      input.sessionId,
      input.userId,
    );
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    if (session.mode !== 'exam') {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Draft answers are only available in exam mode',
      );
    }

    if (session.endedAt) {
      throw new ApplicationError(
        'CONFLICT',
        'Cannot modify a completed session',
      );
    }

    const question = await this.questions.findPublishedById(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const selectedChoice = question.choices.find(
      (choice) => choice.id === input.selectedChoiceId,
    );
    if (!selectedChoice) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Selected choice does not belong to the question',
      );
    }

    return this.sessions.saveDraftAnswer({
      sessionId: input.sessionId,
      userId: input.userId,
      questionId: input.questionId,
      selectedChoiceId: input.selectedChoiceId,
      cumulativeMs: input.cumulativeMs,
    });
  }
}
