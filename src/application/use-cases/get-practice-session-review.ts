import type { Logger } from '@/src/application/ports/logger';
import type {
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { ApplicationError } from '../errors';

export type GetPracticeSessionReviewInput = {
  userId: string;
  sessionId: string;
};

export type AvailablePracticeSessionReviewRow = {
  isAvailable: true;
  questionId: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  order: number; // 1-based
  isAnswered: boolean;
  isCorrect: boolean | null;
  markedForReview: boolean;
};

export type UnavailablePracticeSessionReviewRow = {
  isAvailable: false;
  questionId: string;
  order: number; // 1-based
  isAnswered: boolean;
  isCorrect: boolean | null;
  markedForReview: boolean;
};

export type PracticeSessionReviewRow =
  | AvailablePracticeSessionReviewRow
  | UnavailablePracticeSessionReviewRow;

export type GetPracticeSessionReviewOutput = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  totalCount: number;
  answeredCount: number;
  markedCount: number;
  rows: PracticeSessionReviewRow[];
};

export class GetPracticeSessionReviewUseCase {
  constructor(
    private readonly sessions: PracticeSessionRepository,
    private readonly questions: QuestionRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: GetPracticeSessionReviewInput,
  ): Promise<GetPracticeSessionReviewOutput> {
    const session = await this.sessions.findByIdAndUserId(
      input.sessionId,
      input.userId,
    );
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    const questionIds = [...session.questionIds];
    const questions = await this.questions.findPublishedByIds(questionIds);
    const questionById = new Map(
      questions.map((question) => [question.id, question]),
    );

    const rows: PracticeSessionReviewRow[] = [];
    for (let i = 0; i < session.questionStates.length; i += 1) {
      const state = session.questionStates[i];
      if (!state) continue;

      const question = questionById.get(state.questionId);
      if (!question) {
        this.logger.warn(
          { questionId: state.questionId },
          'Practice session review references missing question',
        );
        rows.push({
          isAvailable: false,
          questionId: state.questionId,
          order: i + 1,
          isAnswered: state.latestSelectedChoiceId !== null,
          isCorrect: state.latestIsCorrect,
          markedForReview: state.markedForReview,
        });
        continue;
      }

      rows.push({
        isAvailable: true,
        questionId: question.id,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        order: i + 1,
        isAnswered: state.latestSelectedChoiceId !== null,
        isCorrect: state.latestIsCorrect,
        markedForReview: state.markedForReview,
      });
    }

    return {
      sessionId: session.id,
      mode: session.mode,
      totalCount: session.questionIds.length,
      answeredCount: session.questionStates.filter(
        (state) => state.latestSelectedChoiceId !== null,
      ).length,
      markedCount: session.questionStates.filter(
        (state) => state.markedForReview,
      ).length,
      rows,
    };
  }
}
