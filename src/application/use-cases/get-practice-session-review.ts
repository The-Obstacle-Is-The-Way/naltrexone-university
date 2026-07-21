import { ApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type {
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { enrichWithQuestion } from '@/src/application/shared/enrich-with-question';
import { fetchQuestionsById } from '@/src/application/shared/fetch-questions-by-id';
import {
  createPracticeSessionStateMap,
  getEffectiveSelectedChoiceId,
  requirePracticeSessionQuestionState,
} from '@/src/application/shared/practice-session-state';
import { shouldShowExplanation as sessionShouldShowExplanation } from '@/src/domain/services';

export type GetPracticeSessionReviewInput = {
  userId: string;
  sessionId: string;
};

export type AvailablePracticeSessionReviewRow = {
  isAvailable: true;
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  order: number; // 1-based
  isAnswered: boolean;
  isCorrect: boolean | null;
  isOmitted: boolean;
  markedForReview: boolean;
};

export type UnavailablePracticeSessionReviewRow = {
  isAvailable: false;
  questionId: string;
  order: number; // 1-based
  isAnswered: boolean;
  isCorrect: boolean | null;
  isOmitted: boolean;
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

    const questionById = await fetchQuestionsById(
      this.questions,
      session.questionIds,
    );
    const shouldShowCorrectness = sessionShouldShowExplanation(session);
    const stateByQuestionId = createPracticeSessionStateMap(session);

    type ReviewSeed = {
      questionId: string;
      order: number;
      isAnswered: boolean;
      isCorrect: boolean | null;
      isOmitted: boolean;
      markedForReview: boolean;
    };

    let answeredCount = 0;
    const reviewSeeds: ReviewSeed[] = [];
    for (let i = 0; i < session.questionIds.length; i += 1) {
      const questionId = session.questionIds[i];
      if (!questionId) continue;

      const state = requirePracticeSessionQuestionState({
        sessionId: session.id,
        questionId,
        stateByQuestionId,
      });
      const isAnswered = getEffectiveSelectedChoiceId(session, state) !== null;
      const isOmitted =
        session.mode === 'exam' &&
        session.endedAt !== null &&
        state.latestSelectedChoiceId === null &&
        state.latestIsCorrect === false &&
        state.latestAnsweredAt !== null;
      if (isAnswered) answeredCount += 1;

      reviewSeeds.push({
        questionId,
        order: i + 1,
        isAnswered,
        isCorrect: shouldShowCorrectness ? state.latestIsCorrect : null,
        isOmitted,
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
        slug: question.slug,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        order: row.order,
        isAnswered: row.isAnswered,
        isCorrect: row.isCorrect,
        isOmitted: row.isOmitted,
        markedForReview: row.markedForReview,
      }),
      unavailable: (row): PracticeSessionReviewRow => ({
        isAvailable: false,
        questionId: row.questionId,
        order: row.order,
        isAnswered: row.isAnswered,
        isCorrect: row.isCorrect,
        isOmitted: row.isOmitted,
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
      answeredCount,
      markedCount: rows.filter((row) => row.markedForReview).length,
      rows,
    };
  }
}
