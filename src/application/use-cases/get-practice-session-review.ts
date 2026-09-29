import { ApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type {
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { enrichWithQuestion } from '@/src/application/shared/enrich-with-question';
import { fetchSessionOwnedQuestionsById } from '@/src/application/shared/fetch-session-owned-questions-by-id';
import {
  createPracticeSessionStateMap,
  getEffectiveSelectedChoiceId,
  requirePracticeSessionQuestionState,
} from '@/src/application/shared/practice-session-state';
import { shouldShowExplanation as sessionShouldShowExplanation } from '@/src/domain/services';
import type { QuestionDifficulty } from '@/src/domain/value-objects';

export type GetPracticeSessionReviewInput = {
  userId: string;
  sessionId: string;
};

export type AvailablePracticeSessionReviewRow = {
  isAvailable: true;
  /** Withdrawn since the learner attempted it in this ended session (ADR-021 §3). */
  withdrawn: boolean;
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: QuestionDifficulty;
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

function unavailableRow(row: {
  questionId: string;
  order: number;
  isAnswered: boolean;
  isCorrect: boolean | null;
  isOmitted: boolean;
  markedForReview: boolean;
}): PracticeSessionReviewRow {
  return {
    isAvailable: false,
    questionId: row.questionId,
    order: row.order,
    isAnswered: row.isAnswered,
    isCorrect: row.isCorrect,
    isOmitted: row.isOmitted,
    markedForReview: row.markedForReview,
  };
}

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

    // The learner's own session items as bound, whatever their status now; a
    // withdrawn one shows only where the learner attempted it and the session
    // is over (ADR-021 §3).
    const questionById = await fetchSessionOwnedQuestionsById(
      this.questions,
      session.questionStates,
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
      attempted: boolean;
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
        attempted: state.latestAnsweredAt !== null,
      });
    }

    const rows = enrichWithQuestion({
      rows: reviewSeeds,
      getQuestionId: (row) => row.questionId,
      questionsById: questionById,
      available: (row, question): PracticeSessionReviewRow => {
        const withdrawn = question.status !== 'published';
        if (withdrawn && !(session.endedAt !== null && row.attempted)) {
          return unavailableRow(row);
        }
        return {
          isAvailable: true,
          withdrawn,
          questionId: question.id,
          slug: question.slug,
          stemMd: question.stemMd,
          difficulty: question.difficulty,
          order: row.order,
          isAnswered: row.isAnswered,
          isCorrect: row.isCorrect,
          isOmitted: row.isOmitted,
          markedForReview: row.markedForReview,
        };
      },
      unavailable: unavailableRow,
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
