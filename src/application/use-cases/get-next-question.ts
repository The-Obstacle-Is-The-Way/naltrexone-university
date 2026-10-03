import type { Question } from '@/src/domain/entities';
import {
  computeExamDeadline,
  countsIfEndedNow,
  createSeed,
  isExamExpired,
  selectNextQuestionId,
  shouldShowExplanation,
  shuffleWithSeed,
} from '@/src/domain/services';
import type {
  PracticeMode,
  QuestionDifficulty,
  UnavailableQuestionAvailability,
} from '@/src/domain/value-objects';
import { ApplicationError, practiceSessionAlreadyEndedError } from '../errors';
import type {
  AttemptMostRecentAnsweredAtReader,
  PracticeSessionRepository,
  QuestionFilters,
  QuestionRepository,
} from '../ports/repositories';
import {
  createPracticeSessionStateMap,
  getEffectiveSelectedChoiceId,
  requirePracticeSessionQuestionState,
} from '../shared/practice-session-state';
import {
  buildShuffledChoiceViews,
  type ChoiceExplanation,
  type ShuffledChoiceView,
} from '../shared/shuffled-choice-views';

export type PublicChoice = {
  id: string;
  label: string;
  textMd: string;
  sortOrder: number;
};

export type PreviousSubmission = {
  correctChoiceId: string;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: ChoiceExplanation[];
};

export type NextQuestion = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: QuestionDifficulty;
  choices: PublicChoice[];
  /**
   * A newer revision replaced the one shown: the session keeps the revision
   * its item was bound to (Pattern Registry F-12).
   */
  superseded: boolean;
  /**
   * The current revision keys another answer than the one shown, so an
   * answer here is graded on a corrected key and won't be scored (ADR-022
   * Decision 4).
   */
  answerKeyChanged: boolean;
  session: null | {
    sessionId: string;
    mode: PracticeMode;
    index: number; // 0-based index within session
    total: number;
    deadlineAt: string | null;
    isMarkedForReview?: boolean;
    latestSelectedChoiceId?: string | null;
    latestIsCorrect?: boolean | null;
    draftSelectedChoiceId?: string | null;
    draftCumulativeMs?: number;
    previousSubmission?: PreviousSubmission;
  };
};

export type GetNextQuestionInput =
  | {
      userId: string;
      sessionId: string;
      questionId?: string;
      fromIndex?: number;
      filters?: never;
    }
  | {
      userId: string;
      sessionId?: never;
      questionId?: never;
      filters: QuestionFilters;
    };

/**
 * A session item whose question became unavailable after the session began
 * (ADR-021 §3, ADR-022 Decision 5): its state, its place in the session and
 * none of its content, so the page can show the notice (Pattern Registry F-11)
 * and move on.
 */
export type UnavailableSessionQuestion = {
  unavailable: true;
  availability: UnavailableQuestionAvailability;
  /**
   * Whether the item would count toward the score if the session ended now
   * (ADR-022 Decision 5, as amended): only a tutor answer already given, on a
   * question retired since.
   */
  countsIfEndedNow: boolean;
  questionId: string;
  session: {
    sessionId: string;
    mode: PracticeMode;
    index: number; // 0-based index within session
    total: number;
    deadlineAt: string | null;
    isMarkedForReview: boolean;
  };
};

export type GetNextQuestionOutput =
  | NextQuestion
  | UnavailableSessionQuestion
  | null;

export type ExpiredExamFinalizer = {
  execute: (input: { userId: string; sessionId: string }) => Promise<unknown>;
};

function isInteger(value: number | undefined): value is number {
  return Number.isInteger(value);
}

export class GetNextQuestionUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptMostRecentAnsweredAtReader,
    private readonly sessions: PracticeSessionRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly expiredExamFinalizer?: ExpiredExamFinalizer,
  ) {}

  async execute(input: GetNextQuestionInput): Promise<GetNextQuestionOutput> {
    if (input.sessionId !== undefined) {
      return this.executeForSession(
        input.userId,
        input.sessionId,
        input.questionId,
        input.fromIndex,
      );
    }

    if (!input.filters) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Either sessionId or filters must be provided',
      );
    }

    return this.executeForFilters(input.userId, input.filters);
  }

  private mapChoiceViewsForOutput(
    choiceViews: readonly ShuffledChoiceView[],
  ): PublicChoice[] {
    return choiceViews.map((choice) => ({
      id: choice.choiceId,
      label: choice.displayLabel,
      textMd: choice.textMd,
      sortOrder: choice.sortOrder,
    }));
  }

  private buildPreviousSubmission(
    question: Question,
    choiceViews: readonly ShuffledChoiceView[],
  ): PreviousSubmission {
    const correctChoice = question.choices.find((c) => c.isCorrect);
    if (!correctChoice) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Question ${question.id} has no correct choice`,
      );
    }

    return {
      correctChoiceId: correctChoice.id,
      explanationMd: question.explanationMd,
      referenceMd: question.referenceMd,
      choiceExplanations: choiceViews.map((choice) => ({
        choiceId: choice.choiceId,
        displayLabel: choice.displayLabel,
        textMd: choice.textMd,
        isCorrect: choice.isCorrect,
        explanationMd: choice.explanationMd,
      })),
    };
  }

  private async executeForSession(
    userId: string,
    sessionId: string,
    questionId?: string,
    fromIndex?: number,
  ): Promise<GetNextQuestionOutput> {
    const session = await this.sessions.findByIdAndUserId(sessionId, userId);
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }
    if (session.endedAt) {
      throw practiceSessionAlreadyEndedError();
    }
    if (isExamExpired(session, this.now())) {
      if (!this.expiredExamFinalizer) {
        throw new ApplicationError(
          'INTERNAL_ERROR',
          'Expired exam finalizer is not configured',
        );
      }
      await this.expiredExamFinalizer.execute({ userId, sessionId });
      return null;
    }

    const stateByQuestionId = createPracticeSessionStateMap(session);
    const orderedStates = session.questionIds.map((id) => {
      return requirePracticeSessionQuestionState({
        sessionId: session.id,
        questionId: id,
        stateByQuestionId,
      });
    });

    // The item asked for, or else the first unanswered item after fromIndex,
    // wrapping around to the start and ending at fromIndex itself.
    const startIndex = isInteger(fromIndex) ? Math.max(-1, fromIndex) : -1;
    const targetQuestionId =
      questionId ??
      [
        ...orderedStates.slice(startIndex + 1),
        // Stryker disable next-line MethodExpression: the items after fromIndex hold no unanswered item by then, so repeating them changes nothing
        ...orderedStates.slice(0, startIndex + 1),
      ].find((state) => !getEffectiveSelectedChoiceId(session, state))
        ?.questionId ??
      null;

    if (!targetQuestionId) return null;

    // Also undefined for a question the session does not hold.
    const targetIndex = session.questionIds.indexOf(targetQuestionId);
    const targetState = orderedStates[targetIndex];
    if (!targetState) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    // The item shows the revision it was bound to (ADR-021). A question that
    // became unavailable since the session began can't be answered, so it
    // comes back with its state, its place in the session and none of its
    // content (§3, ADR-022 Decision 5, F-11).
    const question = await this.questions.findByIdForSession(targetState);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }
    if (question.availability !== 'available') {
      return {
        unavailable: true,
        availability: question.availability,
        countsIfEndedNow: countsIfEndedNow({
          mode: session.mode,
          answered: targetState.latestSelectedChoiceId !== null,
          availability: question.availability,
        }),
        questionId: question.id,
        session: {
          sessionId: session.id,
          mode: session.mode,
          index: targetIndex,
          total: session.questionIds.length,
          deadlineAt: computeExamDeadline(session)?.toISOString() ?? null,
          isMarkedForReview: targetState.markedForReview,
        },
      };
    }

    const choiceViews = buildShuffledChoiceViews(question, userId);
    const choices = this.mapChoiceViewsForOutput(choiceViews);
    const isAnswered =
      typeof getEffectiveSelectedChoiceId(session, targetState) === 'string';
    const isTutor = session.mode === 'tutor';
    const showCorrectness = shouldShowExplanation(session);
    const previousSubmission =
      isAnswered && isTutor
        ? this.buildPreviousSubmission(question, choiceViews)
        : null;

    return {
      questionId: question.id,
      slug: question.slug,
      stemMd: question.stemMd,
      difficulty: question.difficulty,
      choices,
      superseded: !question.isCurrentRevision,
      answerKeyChanged: question.answerKeyChanged,
      session: {
        sessionId: session.id,
        mode: session.mode,
        index: targetIndex,
        total: session.questionIds.length,
        deadlineAt: computeExamDeadline(session)?.toISOString() ?? null,
        isMarkedForReview: targetState.markedForReview,
        latestSelectedChoiceId: targetState.latestSelectedChoiceId,
        latestIsCorrect: showCorrectness ? targetState.latestIsCorrect : null,
        ...(session.mode === 'exam'
          ? {
              draftSelectedChoiceId: getEffectiveSelectedChoiceId(
                session,
                targetState,
              ),
              draftCumulativeMs: targetState.draftCumulativeMs,
            }
          : {}),
        ...(previousSubmission ? { previousSubmission } : {}),
      },
    };
  }

  private async executeForFilters(
    userId: string,
    filters: QuestionFilters,
  ): Promise<GetNextQuestionOutput> {
    const candidateIds = await this.questions.listPublishedCandidateIds({
      ...filters,
      userId,
    });

    const now = this.now();
    const utcDayStartMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const seed = createSeed(userId, utcDayStartMs);
    const canonicalCandidateIds = candidateIds.toSorted();
    const orderedCandidateIds = shuffleWithSeed(canonicalCandidateIds, seed);

    const mostRecent =
      await this.attempts.findMostRecentAnsweredAtByQuestionIds(
        userId,
        orderedCandidateIds,
      );
    const byQuestionId = new Map(
      mostRecent.map((r) => [r.questionId, r.answeredAt]),
    );

    const selectedId = selectNextQuestionId(orderedCandidateIds, byQuestionId);
    if (!selectedId) return null;

    const question = await this.questions.findPublishedById(selectedId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const choices = this.mapChoiceViewsForOutput(
      buildShuffledChoiceViews(question, userId),
    );

    return {
      questionId: question.id,
      slug: question.slug,
      stemMd: question.stemMd,
      difficulty: question.difficulty,
      choices,
      superseded: !question.isCurrentRevision,
      answerKeyChanged: question.answerKeyChanged,
      session: null,
    };
  }
}
