import { ApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type {
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { enrichWithQuestion } from '../shared/enrich-with-question';

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

    const questions = await this.questions.findPublishedByIds(
      session.questionIds,
    );
    const questionById = new Map(
      questions.map((question) => [question.id, question]),
    );
    const stateByQuestionId = new Map(
      session.questionStates.map((state) => [state.questionId, state]),
    );

    type ReviewSeed = {
      questionId: string;
      order: number;
      isAnswered: boolean;
      isCorrect: boolean | null;
      markedForReview: boolean;
    };

    const reviewSeeds: ReviewSeed[] = [];
    for (let i = 0; i < session.questionIds.length; i += 1) {
      const questionId = session.questionIds[i];
      if (!questionId) continue;

      const state = stateByQuestionId.get(questionId) ?? {
        questionId,
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
      };

      reviewSeeds.push({
        questionId,
        order: i + 1,
        isAnswered: state.latestSelectedChoiceId !== null,
        isCorrect: state.latestIsCorrect,
        markedForReview: state.markedForReview,
      });
    }

    const rows = enrichWithQuestion({
      rows: reviewSeeds,
      getQuestionId: (row) => row.questionId,
      questionsById: questionById,
      available: (row, question): PracticeSessionReviewRow => ({
        isAvailable: true,
        questionId: question.id,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        order: row.order,
        isAnswered: row.isAnswered,
        isCorrect: row.isCorrect,
        markedForReview: row.markedForReview,
      }),
      unavailable: (row): PracticeSessionReviewRow => ({
        isAvailable: false,
        questionId: row.questionId,
        order: row.order,
        isAnswered: row.isAnswered,
        isCorrect: row.isCorrect,
        markedForReview: row.markedForReview,
      }),
      logger: this.logger,
      missingQuestionMessage:
        'Practice session review references missing question',
    });

    return {
      sessionId: session.id,
      mode: session.mode,
      totalCount: session.questionIds.length,
      answeredCount: rows.filter((row) => row.isAnswered).length,
      markedCount: rows.filter((row) => row.markedForReview).length,
      rows,
    };
  }
}
