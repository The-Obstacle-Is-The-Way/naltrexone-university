import { ApplicationError } from '@/src/application/errors';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';
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
  constructor(private readonly sessions: PracticeSessionRepository) {}

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

    return this.sessions.saveDraftAnswer({
      sessionId: input.sessionId,
      userId: input.userId,
      questionId: input.questionId,
      selectedChoiceId: input.selectedChoiceId,
      cumulativeMs: input.cumulativeMs,
    });
  }
}
