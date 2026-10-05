import { ApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type {
  AttemptSessionReader,
  PracticeSessionRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { enrichWithQuestion } from '@/src/application/shared/enrich-with-question';
import { fetchSessionOwnedQuestionsById } from '@/src/application/shared/fetch-session-owned-questions-by-id';
import {
  createPracticeSessionStateMap,
  requirePracticeSessionQuestionState,
} from '@/src/application/shared/practice-session-state';
import {
  buildShuffledChoiceViews,
  type ChoiceExplanation,
} from '@/src/application/shared/shuffled-choice-views';
import {
  isOmittedOutcome,
  type QuestionAvailability,
  type QuestionDifficulty,
  selectedChoiceIdOrNull,
  type UnavailableQuestionAvailability,
} from '@/src/domain/value-objects';

export type CompletedSessionQuestionChoice = {
  id: string;
  label: string;
  textMd: string;
};

export type AvailableCompletedSessionQuestionWithFeedbackRow = {
  isAvailable: true;
  /**
   * What the learner is told about the question now (ADR-022 Decision 1). A
   * question no longer published stays reviewable here, as answered, and the
   * view marks it (Pattern Registry F-11).
   */
  availability: QuestionAvailability;
  /**
   * Still published, but a newer revision replaced the one shown here: the
   * question was updated after the session (Pattern Registry F-12).
   */
  superseded: boolean;
  /**
   * ADR-022 Decision 4: the learner answered this revision and its answer key
   * was corrected since. Not set for a question no longer available.
   */
  answerKeyChanged: boolean;
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: QuestionDifficulty;
  order: number;
  isAnswered: boolean;
  isCorrect: boolean | null;
  isOmitted: boolean;
  markedForReview: boolean;
  choices: CompletedSessionQuestionChoice[];
  selectedChoiceId: string | null;
  correctChoiceId: string;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: ChoiceExplanation[];
};

export type UnavailableCompletedSessionQuestionWithFeedbackRow = {
  isAvailable: false;
  /**
   * The question's state, shown as its label alone (ADR-022 Decision 2); null
   * when the question is missing.
   */
  availability: UnavailableQuestionAvailability | null;
  questionId: string;
  order: number;
  isAnswered: boolean;
  isCorrect: boolean | null;
  isOmitted: boolean;
  markedForReview: boolean;
};

export type CompletedSessionQuestionWithFeedbackRow =
  | AvailableCompletedSessionQuestionWithFeedbackRow
  | UnavailableCompletedSessionQuestionWithFeedbackRow;

export type GetCompletedSessionQuestionsWithFeedbackInput = {
  userId: string;
  sessionId: string;
};

export type GetCompletedSessionQuestionsWithFeedbackOutput = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  totalCount: number;
  answeredCount: number;
  markedCount: number;
  rows: CompletedSessionQuestionWithFeedbackRow[];
};

type ReviewSeed = {
  questionId: string;
  order: number;
  isAnswered: boolean;
  isCorrect: boolean | null;
  isOmitted: boolean;
  markedForReview: boolean;
  selectedChoiceId: string | null;
};

function unavailableRow(
  row: ReviewSeed,
  availability: UnavailableQuestionAvailability | null = null,
): CompletedSessionQuestionWithFeedbackRow {
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

function warnOnCorrectnessDivergence(
  logger: Logger,
  context: {
    sessionId: string;
    questionId: string;
    attemptIsCorrect: boolean;
    stateLatestIsCorrect: boolean;
  },
): void {
  try {
    logger.warn(
      context,
      'Attempt correctness diverges from practice session question state',
    );
  } catch {
    // Best-effort detection must not change the completed-session read result.
  }
}

export class GetCompletedSessionQuestionsWithFeedbackUseCase {
  constructor(
    private readonly sessions: PracticeSessionRepository,
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptSessionReader,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: GetCompletedSessionQuestionsWithFeedbackInput,
  ): Promise<GetCompletedSessionQuestionsWithFeedbackOutput> {
    const session = await this.sessions.findByIdAndUserId(
      input.sessionId,
      input.userId,
    );
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }
    if (session.endedAt === null) {
      throw new ApplicationError(
        'CONFLICT',
        'Practice session must be completed before feedback can be loaded',
      );
    }

    // The learner's own session items, whatever their status now: a question
    // withdrawn since stays reviewable, as bound and marked, where the learner
    // answered it (ADR-021 §3, ADR-022 Decision 2).
    const questionById = await fetchSessionOwnedQuestionsById(
      this.questions,
      session.questionStates,
    );
    const attempts = await this.attempts.findBySessionId(
      input.sessionId,
      input.userId,
    );
    const attemptByQuestionId = new Map(
      attempts.map((attempt) => [attempt.questionId, attempt]),
    );
    const stateByQuestionId = createPracticeSessionStateMap(session);

    let answeredCount = 0;
    const reviewSeeds: ReviewSeed[] = [];
    for (const [i, questionId] of session.questionIds.entries()) {
      const state = requirePracticeSessionQuestionState({
        sessionId: session.id,
        questionId,
        stateByQuestionId,
      });

      const attempt = attemptByQuestionId.get(questionId);
      if (
        attempt &&
        state.latestIsCorrect !== null &&
        attempt.isCorrect !== state.latestIsCorrect
      ) {
        warnOnCorrectnessDivergence(this.logger, {
          sessionId: session.id,
          questionId,
          attemptIsCorrect: attempt.isCorrect,
          stateLatestIsCorrect: state.latestIsCorrect,
        });
      }
      const selectedChoiceId = attempt
        ? selectedChoiceIdOrNull(attempt.outcome)
        : state.latestSelectedChoiceId;
      const isOmitted = attempt ? isOmittedOutcome(attempt.outcome) : false;
      const isAnswered = selectedChoiceId !== null;
      if (isAnswered) answeredCount += 1;

      reviewSeeds.push({
        questionId,
        order: i + 1,
        isAnswered,
        isCorrect: attempt?.isCorrect ?? state.latestIsCorrect,
        isOmitted,
        markedForReview: state.markedForReview,
        selectedChoiceId,
      });
    }

    const rows = enrichWithQuestion({
      rows: reviewSeeds,
      getQuestionId: (row) => row.questionId,
      questionsById: questionById,
      available: (row, question): CompletedSessionQuestionWithFeedbackRow => {
        // ADR-022 Decision 2: a question no longer published shows only to a
        // learner who answered it; an item left unanswered or omitted stays
        // unavailable.
        if (question.availability !== 'available' && !row.isAnswered) {
          return unavailableRow(row, question.availability);
        }
        const shuffledChoices = buildShuffledChoiceViews(
          question,
          input.userId,
        );
        const correctChoice = question.choices.find(
          (choice) => choice.isCorrect,
        );
        if (!correctChoice) {
          throw new ApplicationError(
            'INTERNAL_ERROR',
            `Question ${question.id} has no correct choice`,
          );
        }

        return {
          isAvailable: true,
          availability: question.availability,
          superseded:
            question.availability === 'available' &&
            !question.isCurrentRevision,
          // ADR-022 Decision 4: an answer graded on a key corrected since,
          // whatever the question's state, as the score reads it. F-11's
          // notice still takes precedence over F-12's; the flag also keeps
          // the review ungraded (DEBT-498).
          answerKeyChanged: row.isAnswered && question.answerKeyChanged,
          questionId: question.id,
          slug: question.slug,
          stemMd: question.stemMd,
          difficulty: question.difficulty,
          order: row.order,
          isAnswered: row.isAnswered,
          isCorrect: row.isCorrect,
          isOmitted: row.isOmitted,
          markedForReview: row.markedForReview,
          choices: shuffledChoices.map((choice) => ({
            id: choice.choiceId,
            label: choice.displayLabel,
            textMd: choice.textMd,
          })),
          selectedChoiceId: row.selectedChoiceId,
          correctChoiceId: correctChoice.id,
          explanationMd: question.explanationMd,
          referenceMd: question.referenceMd ?? null,
          choiceExplanations: shuffledChoices.map((choice) => ({
            choiceId: choice.choiceId,
            displayLabel: choice.displayLabel,
            textMd: choice.textMd,
            isCorrect: choice.isCorrect,
            explanationMd: choice.explanationMd,
          })),
        };
      },
      unavailable: unavailableRow,
      logger: this.logger,
      missingQuestionMessage:
        'Completed session feedback references missing question',
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
