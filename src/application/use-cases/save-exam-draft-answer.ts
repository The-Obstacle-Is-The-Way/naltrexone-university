import { ApplicationError } from '@/src/application/errors';
import type {
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { PracticeSessionQuestionState } from '@/src/domain/entities';
import { SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS } from './submit-answer';

export type SaveExamDraftAnswerInput = {
  userId: string;
  sessionId: string;
  questionId: string;
  selectedChoiceId: string;
  cumulativeMs: number;
};

export type SaveExamDraftAnswerOutput = PracticeSessionQuestionState;

export const SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS =
  SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS * 1000;

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

    const rawCumulativeMs = input.cumulativeMs;
    const cumulativeMs =
      typeof rawCumulativeMs === 'number' && Number.isFinite(rawCumulativeMs)
        ? Math.min(
            SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS,
            Math.max(0, rawCumulativeMs),
          )
        : 0;

    return this.sessions.saveDraftAnswer({
      sessionId: input.sessionId,
      userId: input.userId,
      questionId: input.questionId,
      selectedChoiceId: input.selectedChoiceId,
      cumulativeMs,
    });
  }
}
