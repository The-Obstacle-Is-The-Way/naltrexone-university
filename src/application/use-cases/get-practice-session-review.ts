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
import type {
  QuestionAvailability,
  QuestionDifficulty,
  UnavailableQuestionAvailability,
} from '@/src/domain/value-objects';

export type GetPracticeSessionReviewInput = {
  userId: string;
  sessionId: string;
};

export type AvailablePracticeSessionReviewRow = {
  isAvailable: true;
  /**
   * What the learner is told about the question now (ADR-022 Decision 1). One
   * no longer published shows only where the learner answered it in this
   * ended session (ADR-021 §3, ADR-022 Decision 2).
   */
  availability: QuestionAvailability;
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
  /**
   * The question's state, shown as its label alone (ADR-022 Decision 2); null
   * when the question is missing.
   */
  availability: UnavailableQuestionAvailability | null;
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

function unavailableRow(
  row: {
    questionId: string;
    order: number;
    isAnswered: boolean;
    isCorrect: boolean | null;
    isOmitted: boolean;
    markedForReview: boolean;
  },
  availability: UnavailableQuestionAvailability | null = null,
): PracticeSessionReviewRow {
  return {
    isAvailable: false,
    availability,
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
    // withdrawn one shows only where the learner answered it and the session
    // is over (ADR-021 §3). An omitted item is not an answer (ADR-022
    // Decision 2).
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
      answered: boolean;
    };

    let answeredCount = 0;
    const reviewSeeds: ReviewSeed[] = [];
    for (const [i, questionId] of session.questionIds.entries()) {
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
        answered: state.latestSelectedChoiceId !== null,
      });
    }

    const rows = enrichWithQuestion({
      rows: reviewSeeds,
      getQuestionId: (row) => row.questionId,
      questionsById: questionById,
      available: (row, question): PracticeSessionReviewRow => {
        const unavailable = question.availability !== 'available';
        if (unavailable && !(session.endedAt !== null && row.answered)) {
          return unavailableRow(row, question.availability);
        }
        return {
          isAvailable: true,
          availability: question.availability,
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
