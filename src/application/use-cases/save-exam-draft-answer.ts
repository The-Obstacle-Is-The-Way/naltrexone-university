import { ApplicationError } from '@/src/application/errors';
import type {
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { PracticeSessionQuestionState } from '@/src/domain/entities';
import { isExamExpired, MS_PER_SECOND } from '@/src/domain/services';
import { SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS } from './submit-answer';

export type SaveExamDraftAnswerInput = {
  userId: string;
  sessionId: string;
  questionId: string;
  selectedChoiceId: string | null;
  cumulativeMs: number;
};

export type SaveExamDraftAnswerOutput = PracticeSessionQuestionState;

export const SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS =
  SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS * MS_PER_SECOND;

export class SaveExamDraftAnswerUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly sessions: PracticeSessionRepository,
    private readonly now: () => Date = () => new Date(),
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

    if (isExamExpired(session, this.now())) {
      throw new ApplicationError('CONFLICT', 'Exam time has expired');
    }

    const questionBelongsToSession = session.questionStates.some(
      (state) => state.questionId === input.questionId,
    );
    if (!questionBelongsToSession) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const question = await this.questions.findByIdForSession(input.questionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const selectedChoiceBelongsToQuestion =
      input.selectedChoiceId === null ||
      question.choices.some((choice) => choice.id === input.selectedChoiceId);
    if (!selectedChoiceBelongsToQuestion) {
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
