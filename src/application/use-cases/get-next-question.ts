import type { Question } from '@/src/domain/entities';
import { getNextQuestionId } from '@/src/domain/services';
import type {
  PracticeMode,
  QuestionDifficulty,
} from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import type {
  AttemptRepository,
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
    private readonly attempts: AttemptRepository,
    private readonly sessions: PracticeSessionRepository,
  ) {}

  async execute(input: GetNextQuestionInput): Promise<GetNextQuestionOutput> {
    if ('sessionId' in input && typeof input.sessionId === 'string') {
      return this.executeForSession(input.userId, input.sessionId);
    }

    return this.executeForFilters(input.userId, input.filters);
  }

  private mapChoicesForOutput(question: Question): PublicChoice[] {
    return [...question.choices]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        id: c.id,
        label: c.label,
        textMd: c.textMd,
        sortOrder: c.sortOrder,
      }));
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

    const index = session.questionIds.indexOf(nextQuestionId);
    if (index === -1) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Session ${session.id} is missing next question id ${nextQuestionId}`,
      );
    }

    const question = await this.questions.findPublishedById(nextQuestionId);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    return {
      questionId: question.id,
      slug: question.slug,
      stemMd: question.stemMd,
      difficulty: question.difficulty,
      choices: this.mapChoicesForOutput(question),
      session: {
        sessionId: session.id,
        mode: session.mode,
        index,
        total: session.questionIds.length,
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

    let selectedId: string | null = null;

    // Prefer a never-attempted question in repository-defined deterministic order.
    for (const questionId of candidateIds) {
      if (!byQuestionId.has(questionId)) {
        selectedId = questionId;
        break;
      }
    }

    // If all attempted, pick the question with the oldest last attempt timestamp.
    if (!selectedId) {
      let oldestQuestionId: string | null = null;
      let oldestAnsweredAt: Date | null = null;

      for (const questionId of candidateIds) {
        const answeredAt = byQuestionId.get(questionId);
        if (!answeredAt) continue;

        if (!oldestAnsweredAt || answeredAt < oldestAnsweredAt) {
          oldestAnsweredAt = answeredAt;
          oldestQuestionId = questionId;
        }
      }

      selectedId = oldestQuestionId;
    }

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
      choices: this.mapChoicesForOutput(question),
      session: null,
    };
  }
}
