import {
  ApplicationError,
  AttemptConflictMessages,
} from '@/src/application/errors';
import type {
  AttemptedQuestionSummary,
  AttemptedQuestionsFilters,
  AttemptedQuestionsSort,
  AttemptInsertInput,
  AttemptMostRecentAnsweredAt,
  AttemptRepository,
  AttemptScore,
  PageOptions,
} from '@/src/application/ports/repositories';
import type { Attempt, Question } from '@/src/domain/entities';
import { createAttempt } from '@/src/domain/entities/attempt';
import { countsTowardScore } from '@/src/domain/services';
import { isOmittedOutcome } from '@/src/domain/value-objects';
import { listedRevisions } from './fake-question-repository';

type InMemoryAttempt = Attempt & {
  practiceSessionId: string | null;
  sessionMode?: 'tutor' | 'exam' | null;
  sessionEndedAt?: Date | null;
};

export class FakeAttemptRepository implements AttemptRepository {
  private attempts: InMemoryAttempt[];
  // Question metadata for the attempted-list filters, listed as for
  // `FakeQuestionRepository`: several revisions of a question, current first.
  private readonly questions: readonly Question[] | null;

  // ADR-022 Amendment (DEBT-494): session items recorded at their session's
  // end as having had no fair chance, as `${practiceSessionId}:${questionId}`.
  private readonly itemsWithoutFairChance: ReadonlySet<string>;

  constructor(
    seed: readonly InMemoryAttempt[] = [],
    deps?: {
      questions?: readonly Question[];
      itemsWithoutFairChance?: readonly {
        practiceSessionId: string;
        questionId: string;
      }[];
    },
  ) {
    this.attempts = [...seed];
    this.questions = deps?.questions ? listedRevisions(deps.questions) : null;
    this.itemsWithoutFairChance = new Set(
      (deps?.itemsWithoutFairChance ?? []).map(
        (item) => `${item.practiceSessionId}:${item.questionId}`,
      ),
    );
  }

  // ADR-021: the revision the attempt answered. A listed question without it
  // is a broken fixture, as the adapter's composite key allows none.
  private answeredQuestion(attempt: InMemoryAttempt): Question | undefined {
    const revisions = (this.questions ?? []).filter(
      (q) => q.id === attempt.questionId,
    );
    if (revisions.length === 0) return undefined;
    const answered = revisions.find(
      (q) => q.revisionId === attempt.questionRevisionId,
    );
    if (!answered) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Revision ${attempt.questionRevisionId} is not a revision of question ${attempt.questionId}`,
      );
    }
    return answered;
  }

  async insert(input: AttemptInsertInput): Promise<Attempt> {
    // BUG-105: Enforce session+question uniqueness (mirrors DB partial unique index)
    if (input.practiceSessionId !== null) {
      const duplicate = this.attempts.find(
        (a) =>
          a.practiceSessionId === input.practiceSessionId &&
          a.questionId === input.questionId,
      );
      if (duplicate) {
        throw new ApplicationError(
          'CONFLICT',
          AttemptConflictMessages.AlreadyAnsweredInSession,
        );
      }
    }

    if (isOmittedOutcome(input.outcome) && input.isCorrect) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Omitted attempts must be incorrect',
      );
    }

    const attempt: InMemoryAttempt = createAttempt({
      id: crypto.randomUUID(),
      userId: input.userId,
      questionId: input.questionId,
      questionRevisionId: input.questionRevisionId,
      practiceSessionId: input.practiceSessionId,
      outcome: input.outcome,
      isCorrect: input.isCorrect,
      timeSpentSeconds: input.timeSpentSeconds,
      retryOfAttemptId: input.retryOfAttemptId ?? null,
      retryOrigin: input.retryOrigin ?? null,
      retrySessionId: input.retrySessionId ?? null,
      answeredAt: input.answeredAt ?? new Date(),
    });
    const storedAttempt = {
      ...attempt,
      sessionMode: null,
      sessionEndedAt: null,
    };
    this.attempts = [...this.attempts, storedAttempt];
    return storedAttempt;
  }

  async findByUserId(
    userId: string,
    page: PageOptions,
  ): Promise<readonly Attempt[]> {
    const limit = Number.isFinite(page.limit) ? Math.floor(page.limit) : 0;
    const offset = Number.isFinite(page.offset) ? Math.floor(page.offset) : 0;

    const safeLimit = Math.max(0, limit);
    if (safeLimit === 0) return [];

    const start = Math.max(0, offset);
    const end = start + safeLimit;

    return this.attempts
      .filter((a) => a.userId === userId)
      .slice()
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
      .slice(start, end);
  }

  async findBySessionId(
    sessionId: string,
    userId: string,
  ): Promise<readonly Attempt[]> {
    return this.attempts.filter(
      (a) => a.practiceSessionId === sessionId && a.userId === userId,
    );
  }

  async findLatestByUserAndQuestion(
    userId: string,
    questionId: string,
  ): Promise<Attempt | null> {
    const matching = this.attempts.filter(
      (a) =>
        a.userId === userId &&
        a.questionId === questionId &&
        !this.isHiddenByActiveExam(a),
    );
    if (matching.length === 0) return null;

    matching.sort((a, b) => {
      const byDate = b.answeredAt.getTime() - a.answeredAt.getTime();
      if (byDate !== 0) return byDate;
      return b.id.localeCompare(a.id);
    });

    return matching[0] ?? null;
  }

  async findByIdAndUserId(
    attemptId: string,
    userId: string,
  ): Promise<Attempt | null> {
    return (
      this.attempts.find((a) => a.id === attemptId && a.userId === userId) ??
      null
    );
  }

  async findBySessionIdAndQuestionId(
    sessionId: string,
    userId: string,
    questionId: string,
  ): Promise<Attempt | null> {
    return (
      this.attempts.find(
        (a) =>
          a.practiceSessionId === sessionId &&
          a.userId === userId &&
          a.questionId === questionId,
      ) ?? null
    );
  }

  async countByUserId(userId: string): Promise<number> {
    return this.attempts.filter(
      (a) => a.userId === userId && !this.isHiddenByActiveExam(a),
    ).length;
  }

  async countByUserIdSince(userId: string, since: Date): Promise<number> {
    return this.attempts.filter(
      (a) =>
        a.userId === userId &&
        a.answeredAt >= since &&
        !this.isHiddenByActiveExam(a),
    ).length;
  }

  // ADR-022 Decision 3, as amended by DEBT-494: an attempt counts when its
  // session item had a fair chance and its question's content is not in
  // doubt. An attempt whose question is not listed counts neither way, as
  // the adapter's cascade leaves no attempt without its question.
  async scoreByUserId(
    userId: string,
    since: Date | null,
  ): Promise<AttemptScore> {
    if (!this.questions) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'FakeAttemptRepository requires questions metadata to score attempts',
      );
    }
    const visible = this.attempts.filter(
      (a) =>
        a.userId === userId &&
        (since === null || a.answeredAt >= since) &&
        !this.isHiddenByActiveExam(a),
    );
    let scored = 0;
    let correct = 0;
    const unscored = new Set<string>();
    for (const attempt of visible) {
      const question = this.answeredQuestion(attempt);
      if (!question) continue;
      const counts = countsTowardScore({
        fairChanceAtEnd: this.itemsWithoutFairChance.has(
          `${attempt.practiceSessionId}:${attempt.questionId}`,
        )
          ? false
          : null,
        availability: question.availability,
      });
      if (counts) {
        scored += 1;
        if (attempt.isCorrect) correct += 1;
      } else {
        unscored.add(attempt.questionId);
      }
    }
    return { scored, correct, unscoredQuestions: unscored.size };
  }

  async listRecentByUserId(
    userId: string,
    limit: number,
  ): Promise<readonly (Attempt & { sessionMode: 'tutor' | 'exam' | null })[]> {
    return this.attempts
      .filter((a) => a.userId === userId && !this.isHiddenByActiveExam(a))
      .slice()
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
      .slice(0, limit)
      .map((attempt) => ({
        ...attempt,
        sessionMode: attempt.sessionMode ?? null,
      }));
  }

  async listAnsweredAtByUserIdSince(
    userId: string,
    since: Date,
  ): Promise<readonly Date[]> {
    return this.attempts
      .filter(
        (a) =>
          a.userId === userId &&
          a.answeredAt >= since &&
          !this.isHiddenByActiveExam(a),
      )
      .slice()
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
      .map((a) => a.answeredAt);
  }

  async listAttemptedQuestionsByUserId(
    userId: string,
    limit: number,
    offset: number,
    filters?: AttemptedQuestionsFilters,
  ): Promise<readonly AttemptedQuestionSummary[]> {
    return this.getFilteredAttemptedCandidates(userId, filters)
      .sort((a, b) => this.compareAttemptedCandidates(a, b, filters?.sort))
      .slice(offset, offset + limit)
      .map((a) => ({
        questionId: a.questionId,
        questionRevisionId: a.questionRevisionId,
        answeredAt: a.answeredAt,
        isCorrect: a.isCorrect,
        isOmitted: isOmittedOutcome(a.outcome),
        sessionId: a.practiceSessionId,
        sessionMode: a.sessionMode ?? null,
      }));
  }

  async countAttemptedQuestionsByUserId(
    userId: string,
    filters?: AttemptedQuestionsFilters,
  ): Promise<number> {
    return this.getFilteredAttemptedCandidates(userId, filters).length;
  }

  private getFilteredAttemptedCandidates(
    userId: string,
    filters?: AttemptedQuestionsFilters,
  ): InMemoryAttempt[] {
    const mostRecentByQuestionId = new Map<string, InMemoryAttempt>();
    for (const attempt of this.attempts) {
      if (attempt.userId !== userId) continue;
      if (this.isHiddenByActiveExam(attempt)) continue;
      const existing = mostRecentByQuestionId.get(attempt.questionId);
      if (!existing || this.isLaterAttempt(attempt, existing)) {
        mostRecentByQuestionId.set(attempt.questionId, attempt);
      }
    }

    const candidates = [...mostRecentByQuestionId.values()];

    const result = filters?.result ?? null;
    const filteredByResult =
      result === 'correct'
        ? candidates.filter((a) => a.isCorrect)
        : result === 'incorrect'
          ? candidates.filter((a) => !a.isCorrect)
          : candidates;

    const source = filters?.source ?? null;
    const filteredBySource =
      source === 'adhoc'
        ? filteredByResult.filter((a) => a.practiceSessionId === null)
        : source === 'tutor' || source === 'exam'
          ? filteredByResult.filter(
              (a) => a.practiceSessionId !== null && a.sessionMode === source,
            )
          : filteredByResult;

    const difficulty = filters?.difficulty ?? null;
    const tagSlug = filters?.tagSlug ?? null;
    if (!difficulty && !tagSlug) return filteredBySource;

    if (!this.questions) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'FakeAttemptRepository requires questions metadata to filter by difficulty or tagSlug',
      );
    }

    return filteredBySource.filter((attempt) => {
      const question = this.answeredQuestion(attempt);
      if (!question) return false;
      if (question.status !== 'published') return false;

      if (difficulty && question.difficulty !== difficulty) return false;
      if (tagSlug && !question.tags.some((tag) => tag.slug === tagSlug))
        return false;

      return true;
    });
  }

  private compareAttemptedCandidates(
    a: InMemoryAttempt,
    b: InMemoryAttempt,
    sort: AttemptedQuestionsSort | null | undefined,
  ): number {
    const byRecency =
      b.answeredAt.getTime() - a.answeredAt.getTime() ||
      b.questionId.localeCompare(a.questionId);

    if (!sort || sort === 'recent') {
      return byRecency;
    }

    if (sort === 'incorrect-first') {
      if (a.isCorrect !== b.isCorrect) {
        return a.isCorrect ? 1 : -1;
      }
      return byRecency;
    }

    if (sort === 'correct-first') {
      if (a.isCorrect !== b.isCorrect) {
        return a.isCorrect ? -1 : 1;
      }
      return byRecency;
    }

    const difficultyRankDiff =
      this.getDifficultySortRank(a) - this.getDifficultySortRank(b);
    if (difficultyRankDiff !== 0) {
      return difficultyRankDiff;
    }

    return byRecency;
  }

  private getDifficultySortRank(attempt: InMemoryAttempt): number {
    const question = this.answeredQuestion(attempt);
    const difficulty =
      question && question.status === 'published'
        ? question.difficulty
        : 'easy';
    if (difficulty === 'hard') return 0;
    if (difficulty === 'medium') return 1;
    return 2;
  }

  async findMostRecentAnsweredAtByQuestionIds(
    userId: string,
    questionIds: readonly string[],
  ): Promise<readonly AttemptMostRecentAnsweredAt[]> {
    const questionIdSet = new Set(questionIds);
    const mostRecentByQuestionId = new Map<string, Date>();

    for (const attempt of this.attempts) {
      if (attempt.userId !== userId) continue;
      if (!questionIdSet.has(attempt.questionId)) continue;
      if (this.isHiddenByActiveExam(attempt)) continue;

      const current = mostRecentByQuestionId.get(attempt.questionId);
      if (!current || attempt.answeredAt > current) {
        mostRecentByQuestionId.set(attempt.questionId, attempt.answeredAt);
      }
    }

    return [...mostRecentByQuestionId.entries()].map(
      ([questionId, answeredAt]) => ({
        questionId,
        answeredAt,
      }),
    );
  }

  getAll(): readonly InMemoryAttempt[] {
    return this.attempts;
  }

  private isHiddenByActiveExam(attempt: InMemoryAttempt): boolean {
    return (
      attempt.practiceSessionId !== null &&
      attempt.sessionMode === 'exam' &&
      attempt.sessionEndedAt === null
    );
  }

  private isLaterAttempt(
    attempt: InMemoryAttempt,
    existing: InMemoryAttempt,
  ): boolean {
    const attemptTimestamp = attempt.answeredAt.getTime();
    const existingTimestamp = existing.answeredAt.getTime();
    if (attemptTimestamp !== existingTimestamp) {
      return attemptTimestamp > existingTimestamp;
    }

    return attempt.id.localeCompare(existing.id) > 0;
  }
}
