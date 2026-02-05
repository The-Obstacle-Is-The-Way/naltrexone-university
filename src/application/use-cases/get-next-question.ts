import type { Question } from '@/src/domain/entities';
import {
  computeSessionProgress,
  createQuestionSeed,
  getNextQuestionId,
  selectNextQuestionId,
  shuffleWithSeed,
} from '@/src/domain/services';
import {
  AllChoiceLabels,
  type PracticeMode,
  type QuestionDifficulty,
} from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import type {
  AttemptMostRecentAnsweredAtReader,
  AttemptSessionReader,
  PracticeSessionRepository,
  QuestionRepository,
} from '../ports/repositories';

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
  };
};

export type GetNextQuestionInput =
  | { userId: string; sessionId: string; filters?: never }
  | {
      userId: string;
      sessionId?: never;
      filters: { tagSlugs: string[]; difficulties: QuestionDifficulty[] };
    };

export type GetNextQuestionOutput = NextQuestion | null;

export class GetNextQuestionUseCase {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly attempts: AttemptSessionReader &
      AttemptMostRecentAnsweredAtReader,
    private readonly sessions: PracticeSessionRepository,
  ) {}

  async execute(input: GetNextQuestionInput): Promise<GetNextQuestionOutput> {
    if ('sessionId' in input && typeof input.sessionId === 'string') {
      return this.executeForSession(input.userId, input.sessionId);
    }

    return this.executeForFilters(input.userId, input.filters);
  }

  private mapChoicesForOutput(
    question: Question,
    userId: string,
  ): PublicChoice[] {
    // Deterministic shuffle: the same user sees a stable choice order for a given question.
    // Stable pre-sort makes the shuffle reproducible regardless of DB row ordering.
    const seed = createQuestionSeed(userId, question.id);
    const stableInput = question.choices.slice().sort((a, b) => {
      const bySortOrder = a.sortOrder - b.sortOrder;
      if (bySortOrder !== 0) return bySortOrder;
      return a.id.localeCompare(b.id);
    });
    const shuffledChoices = shuffleWithSeed(stableInput, seed);

    return shuffledChoices.map((c, index) => {
      const displayLabel = AllChoiceLabels[index];
      if (!displayLabel) {
        throw new ApplicationError(
          'INTERNAL_ERROR',
          `Question ${question.id} has too many choices`,
        );
      }

      return {
        id: c.id,
        label: displayLabel,
        textMd: c.textMd,
        sortOrder: index + 1,
      };
    });
  }

  private async executeForSession(
    userId: string,
    sessionId: string,
  ): Promise<GetNextQuestionOutput> {
    const session = await this.sessions.findByIdAndUserId(sessionId, userId);
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    const attempts = await this.attempts.findBySessionId(sessionId, userId);
    const answeredQuestionIds = attempts.map((a) => a.questionId);

    const nextQuestionId = getNextQuestionId(session, answeredQuestionIds);
    if (!nextQuestionId) return null;

    const question = await this.questions.findPublishedById(nextQuestionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    const sessionQuestionIds = new Set(session.questionIds);
    const answeredCount = new Set(
      answeredQuestionIds.filter((id) => sessionQuestionIds.has(id)),
    ).size;
    const progress = computeSessionProgress(session, answeredCount);

    return {
      questionId: question.id,
      slug: question.slug,
      stemMd: question.stemMd,
      difficulty: question.difficulty,
      choices: this.mapChoicesForOutput(question, userId),
      session: {
        sessionId: session.id,
        mode: session.mode,
        index: progress.current,
        total: progress.total,
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
