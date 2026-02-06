import type { Question } from '@/src/domain/entities';
import { selectNextQuestionId } from '@/src/domain/services';
import type {
  PracticeMode,
  QuestionDifficulty,
} from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import type {
  AttemptMostRecentAnsweredAtReader,
  PracticeSessionRepository,
  QuestionRepository,
} from '../ports/repositories';
import { buildShuffledChoiceViews } from '../shared/shuffled-choice-views';

export type PublicChoice = {
  id: string;
  label: string;
  textMd: string;
  sortOrder: number;
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
    isMarkedForReview?: boolean;
  };
};

export type GetNextQuestionInput =
  | { userId: string; sessionId: string; questionId?: string; filters?: never }
  | {
      userId: string;
      sessionId?: never;
      questionId?: never;
      filters: { tagSlugs: string[]; difficulties: QuestionDifficulty[] };
    };

export type GetNextQuestionOutput = NextQuestion | null;

export class GetNextQuestionUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptMostRecentAnsweredAtReader,
    private readonly sessions: PracticeSessionRepository,
  ) {}

  async execute(input: GetNextQuestionInput): Promise<GetNextQuestionOutput> {
    if ('sessionId' in input && typeof input.sessionId === 'string') {
      return this.executeForSession(
        input.userId,
        input.sessionId,
        input.questionId,
      );
    }

    return this.executeForFilters(input.userId, input.filters);
  }

  private mapChoicesForOutput(
    question: Question,
    userId: string,
  ): PublicChoice[] {
    return buildShuffledChoiceViews(question, userId).map((choice) => ({
      id: choice.choiceId,
      label: choice.displayLabel,
      textMd: choice.textMd,
      sortOrder: choice.sortOrder,
    }));
  }

  private async executeForSession(
    userId: string,
    sessionId: string,
    questionId?: string,
  ): Promise<GetNextQuestionOutput> {
    const session = await this.sessions.findByIdAndUserId(sessionId, userId);
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    const stateByQuestionId = new Map(
      session.questionStates.map((state) => [state.questionId, state]),
    );
    const orderedStates = session.questionIds.map((id) => {
      return (
        stateByQuestionId.get(id) ?? {
          questionId: id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        }
      );
    });

    const targetQuestionId =
      typeof questionId === 'string'
        ? questionId
        : (orderedStates.find((state) => !state.latestSelectedChoiceId)
            ?.questionId ?? null);

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

    return {
      questionId: question.id,
      slug: question.slug,
      stemMd: question.stemMd,
      difficulty: question.difficulty,
      choices: this.mapChoicesForOutput(question, userId),
      session: {
        sessionId: session.id,
        mode: session.mode,
        index: targetIndex,
        total: session.questionIds.length,
        isMarkedForReview: targetState.markedForReview,
      },
    };
  }

  private async executeForFilters(
    userId: string,
    filters: { tagSlugs: string[]; difficulties: QuestionDifficulty[] },
  ): Promise<GetNextQuestionOutput> {
    const candidateIds =
      await this.questions.listPublishedCandidateIds(filters);
    if (candidateIds.length === 0) return null;

    const mostRecent =
      await this.attempts.findMostRecentAnsweredAtByQuestionIds(
        userId,
        candidateIds,
      );
    const byQuestionId = new Map(
      mostRecent.map((r) => [r.questionId, r.answeredAt]),
    );

    const selectedId = selectNextQuestionId(candidateIds, byQuestionId);
    if (!selectedId) return null;

    const question = await this.questions.findPublishedById(selectedId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    return {
      questionId: question.id,
      slug: question.slug,
      stemMd: question.stemMd,
      difficulty: question.difficulty,
      choices: this.mapChoicesForOutput(question, userId),
      session: null,
    };
  }
}
