import type { Question } from '@/src/domain/entities';
import {
  computeExamDeadline,
  createSeed,
  isExamExpired,
  selectNextQuestionId,
  shouldShowExplanation,
  shuffleWithSeed,
} from '@/src/domain/services';
import type {
  PracticeMode,
  QuestionDifficulty,
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

export type GetNextQuestionOutput = NextQuestion | null;

export type ExpiredExamFinalizer = {
  execute: (input: { userId: string; sessionId: string }) => Promise<unknown>;
};

export class GetNextQuestionUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptMostRecentAnsweredAtReader,
    private readonly sessions: PracticeSessionRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly expiredExamFinalizer?: ExpiredExamFinalizer,
  ) {}

  async execute(input: GetNextQuestionInput): Promise<GetNextQuestionOutput> {
    if ('sessionId' in input && typeof input.sessionId === 'string') {
      return this.executeForSession(
        input.userId,
        input.sessionId,
        input.questionId,
        input.fromIndex,
      );
    }

    if (!('filters' in input) || !input.filters) {
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

    const targetQuestionId = (() => {
      if (typeof questionId === 'string') return questionId;

      const startIndex =
        typeof fromIndex === 'number' && Number.isInteger(fromIndex)
          ? Math.max(-1, Math.min(fromIndex, orderedStates.length - 1))
          : -1;

      const nextUnanswered =
        orderedStates
          .slice(startIndex + 1)
          .find((state) => !getEffectiveSelectedChoiceId(session, state))
          ?.questionId ?? null;

      if (nextUnanswered) return nextUnanswered;
      if (startIndex === -1) return null;

      const wrappedUnanswered =
        orderedStates
          .slice(0, startIndex)
          .find((state) => !getEffectiveSelectedChoiceId(session, state))
          ?.questionId ?? null;

      if (wrappedUnanswered) return wrappedUnanswered;

      const currentState = orderedStates[startIndex];
      if (
        currentState &&
        !getEffectiveSelectedChoiceId(session, currentState)
      ) {
        return currentState.questionId;
      }

      return null;
    })();

    if (!targetQuestionId) return null;

    const targetIndex = session.questionIds.indexOf(targetQuestionId);
    if (targetIndex === -1) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const targetState = orderedStates[targetIndex];
    if (!targetState) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const question = await this.questions.findPublishedById(targetQuestionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
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
    if (candidateIds.length === 0) return null;

    const now = this.now();
    const utcDayStartMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const seed = createSeed(userId, utcDayStartMs);
    const canonicalCandidateIds = candidateIds.slice().sort();
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
      session: null,
    };
  }
}
