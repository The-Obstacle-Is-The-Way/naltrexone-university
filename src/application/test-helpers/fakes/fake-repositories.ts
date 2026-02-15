import { ApplicationError } from '@/src/application/errors';
import type {
  AttemptedQuestionSummary,
  AttemptedQuestionsFilters,
  AttemptMostRecentAnsweredAt,
  AttemptRepository,
  BookmarkRepository,
  IdempotencyKeyError,
  IdempotencyKeyRecord,
  IdempotencyKeyRepository,
  PageOptions,
  PracticeSessionRepository,
  QuestionFilters,
  QuestionRepository,
  StripeCustomerRepository,
  StripeEventRepository,
  SubscriptionRepository,
  SubscriptionUpsertInput,
  TagRepository,
  UpsertUserByClerkIdOptions,
  UserRepository,
} from '@/src/application/ports/repositories';
import type {
  Attempt,
  Bookmark,
  PracticeSession,
  Question,
  Subscription,
  Tag,
  User,
} from '@/src/domain/entities';
import type { QuestionDifficulty } from '@/src/domain/value-objects';

type InMemoryAttempt = Attempt & {
  practiceSessionId: string | null;
  sessionMode?: 'tutor' | 'exam' | null;
};

function matchesDifficulty(
  difficulty: QuestionDifficulty,
  filter: readonly QuestionDifficulty[],
): boolean {
  if (filter.length === 0) return true;
  return filter.includes(difficulty);
}

function matchesTags(question: Question, tagSlugs: readonly string[]): boolean {
  if (tagSlugs.length === 0) return true;
  const slugs = new Set(question.tags.map((t) => t.slug));
  return tagSlugs.some((slug) => slugs.has(slug));
}

export class FakeQuestionRepository implements QuestionRepository {
  private readonly questions: readonly Question[];
  readonly findPublishedByIdsCalls: string[][] = [];
  readonly listPublishedCandidateIdsCalls: QuestionFilters[] = [];
  readonly countPublishedCandidateIdsCalls: QuestionFilters[] = [];

  constructor(questions: readonly Question[]) {
    this.questions = questions;
  }

  async findPublishedById(id: string): Promise<Question | null> {
    const found = this.questions.find((q) => q.id === id);
    if (!found) return null;
    if (found.status !== 'published') return null;
    return found;
  }

  async findPublishedBySlug(slug: string): Promise<Question | null> {
    const found = this.questions.find((q) => q.slug === slug);
    if (!found) return null;
    if (found.status !== 'published') return null;
    return found;
  }

  async findPublishedByIds(
    ids: readonly string[],
  ): Promise<readonly Question[]> {
    this.findPublishedByIdsCalls.push([...ids]);
    const byId = new Map(
      this.questions
        .filter((q) => q.status === 'published')
        .map((q) => [q.id, q]),
    );
    return ids.map((id) => byId.get(id)).filter((q): q is Question => !!q);
  }

  async listPublishedCandidateIds(
    filters: QuestionFilters,
  ): Promise<readonly string[]> {
    this.listPublishedCandidateIdsCalls.push(filters);
    const matches = this.questions
      .filter((q) => q.status === 'published')
      .filter((q) => matchesDifficulty(q.difficulty, filters.difficulties))
      .filter((q) => matchesTags(q, filters.tagSlugs))
      .slice()
      .sort((a, b) => {
        // Deterministic order: createdAt desc, then id asc
        const created = b.createdAt.getTime() - a.createdAt.getTime();
        if (created !== 0) return created;
        return a.id.localeCompare(b.id);
      });

    return matches.map((q) => q.id);
  }

  async countPublishedCandidateIds(filters: QuestionFilters): Promise<number> {
    this.countPublishedCandidateIdsCalls.push(filters);

    return this.questions
      .filter((q) => q.status === 'published')
      .filter((q) => matchesDifficulty(q.difficulty, filters.difficulties))
      .filter((q) => matchesTags(q, filters.tagSlugs)).length;
  }
}

export class FakeAttemptRepository implements AttemptRepository {
  private attempts: InMemoryAttempt[];
  private nextId = 1;
  private readonly questionsById: Map<string, Question> | null;

  constructor(
    seed: readonly InMemoryAttempt[] = [],
    deps?: { questions?: readonly Question[] },
  ) {
    this.attempts = [...seed];
    this.questionsById = deps?.questions
      ? new Map(deps.questions.map((q) => [q.id, q]))
      : null;
    for (const attempt of this.attempts) {
      const match = /^attempt-(\d+)$/.exec(attempt.id);
      if (match) {
        const n = Number(match[1]);
        if (Number.isFinite(n)) this.nextId = Math.max(this.nextId, n + 1);
      }
    }
  }

  async insert(input: {
    userId: string;
    questionId: string;
    practiceSessionId: string | null;
    selectedChoiceId: string;
    isCorrect: boolean;
    timeSpentSeconds: number;
  }): Promise<Attempt> {
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
          'This question has already been answered in this session',
        );
      }
    }

    const attempt: InMemoryAttempt = {
      id: `attempt-${this.nextId++}`,
      userId: input.userId,
      questionId: input.questionId,
      practiceSessionId: input.practiceSessionId,
      sessionMode: null,
      selectedChoiceId: input.selectedChoiceId,
      isCorrect: input.isCorrect,
      timeSpentSeconds: input.timeSpentSeconds,
      answeredAt: new Date(),
    };
    this.attempts = [...this.attempts, attempt];
    return attempt;
  }

  async deleteById(id: string, userId: string): Promise<boolean> {
    const before = this.attempts.length;
    this.attempts = this.attempts.filter(
      (attempt) => !(attempt.id === id && attempt.userId === userId),
    );
    return this.attempts.length < before;
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
      (a) => a.userId === userId && a.questionId === questionId,
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
    return this.attempts.filter((a) => a.userId === userId).length;
  }

  async countCorrectByUserId(userId: string): Promise<number> {
    return this.attempts.filter((a) => a.userId === userId && a.isCorrect)
      .length;
  }

  async countByUserIdSince(userId: string, since: Date): Promise<number> {
    return this.attempts.filter(
      (a) => a.userId === userId && a.answeredAt >= since,
    ).length;
  }

  async countCorrectByUserIdSince(
    userId: string,
    since: Date,
  ): Promise<number> {
    return this.attempts.filter(
      (a) => a.userId === userId && a.answeredAt >= since && a.isCorrect,
    ).length;
  }

  async listRecentByUserId(
    userId: string,
    limit: number,
  ): Promise<readonly (Attempt & { sessionMode: 'tutor' | 'exam' | null })[]> {
    return this.attempts
      .filter((a) => a.userId === userId)
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
      .filter((a) => a.userId === userId && a.answeredAt >= since)
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
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
      .slice(offset, offset + limit)
      .map((a) => ({
        questionId: a.questionId,
        answeredAt: a.answeredAt,
        isCorrect: a.isCorrect,
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

    if (!this.questionsById) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'FakeAttemptRepository requires questions metadata to filter by difficulty or tagSlug',
      );
    }

    return filteredBySource.filter((attempt) => {
      const question = this.questionsById?.get(attempt.questionId);
      if (!question) return false;
      if (question.status !== 'published') return false;

      if (difficulty && question.difficulty !== difficulty) return false;
      if (tagSlug && !question.tags.some((tag) => tag.slug === tagSlug))
        return false;

      return true;
    });
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

export class FakePracticeSessionRepository
  implements PracticeSessionRepository
{
  private sessions: readonly PracticeSession[];
  readonly createInputs: Array<{
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown;
  }> = [];

  constructor(seed: readonly PracticeSession[] = []) {
    this.sessions = seed.map((session) =>
      this.withNormalizedQuestionStates(session),
    );
  }

  private withNormalizedQuestionStates(
    session: PracticeSession,
  ): PracticeSession {
    const existingByQuestionId = new Map(
      session.questionStates.map((state) => [state.questionId, state]),
    );
    return {
      ...session,
      questionStates: session.questionIds.map((questionId) => {
        const existing = existingByQuestionId.get(questionId);
        if (existing) return existing;
        return {
          questionId,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        };
      }),
    };
  }

  private updateSession(
    id: string,
    mapFn: (session: PracticeSession) => PracticeSession,
  ): void {
    this.sessions = this.sessions.map((session) =>
      session.id === id ? mapFn(session) : session,
    );
  }

  private async getActiveSession(
    sessionId: string,
    userId: string,
  ): Promise<PracticeSession> {
    const session = await this.findByIdAndUserId(sessionId, userId);
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }
    if (session.endedAt) {
      throw new ApplicationError('CONFLICT', 'Practice session already ended');
    }
    return session;
  }

  private requireQuestionState(
    session: PracticeSession,
    questionId: string,
  ): PracticeSession['questionStates'][number] {
    const state = session.questionStates.find(
      (s) => s.questionId === questionId,
    );
    if (!state) {
      throw new ApplicationError(
        'NOT_FOUND',
        'Question is not part of this practice session',
      );
    }
    return state;
  }

  async findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<PracticeSession | null> {
    const found = this.sessions.find((s) => s.id === id && s.userId === userId);
    if (!found) return null;
    return this.withNormalizedQuestionStates(found);
  }

  async findLatestIncompleteByUserId(
    userId: string,
  ): Promise<PracticeSession | null> {
    const incomplete = this.sessions
      .filter((s) => s.userId === userId && s.endedAt === null)
      .slice()
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    return incomplete[0] ?? null;
  }

  async findCompletedByUserId(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ rows: readonly PracticeSession[]; total: number }> {
    const normalizedLimit = Number.isFinite(limit) ? Math.floor(limit) : 0;
    const normalizedOffset = Number.isFinite(offset) ? Math.floor(offset) : 0;
    const safeLimit = Math.max(0, normalizedLimit);
    const safeOffset = Math.max(0, normalizedOffset);

    const completed = this.sessions
      .filter((s) => s.userId === userId && s.endedAt !== null)
      .slice()
      .sort((a, b) => {
        const endedDelta =
          (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0);
        if (endedDelta !== 0) return endedDelta;
        return b.startedAt.getTime() - a.startedAt.getTime();
      });

    return {
      rows:
        safeLimit === 0
          ? []
          : completed.slice(safeOffset, safeOffset + safeLimit),
      total: completed.length,
    };
  }

  async create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown;
  }): Promise<PracticeSession> {
    this.createInputs.push(input);
    const params = input.paramsJson as {
      questionIds: string[];
      tagSlugs: string[];
      difficulties: QuestionDifficulty[];
      questionStates?: Array<{
        questionId: string;
        markedForReview: boolean;
        latestSelectedChoiceId: string | null;
        latestIsCorrect: boolean | null;
        latestAnsweredAt: string | null;
      }>;
    };
    const statesByQuestionId = new Map(
      (params.questionStates ?? []).map((state) => [state.questionId, state]),
    );
    const session: PracticeSession = {
      id: `session-${this.sessions.length + 1}`,
      userId: input.userId,
      mode: input.mode,
      questionIds: params.questionIds,
      questionStates: params.questionIds.map((questionId) => {
        const state = statesByQuestionId.get(questionId);
        return {
          questionId,
          markedForReview: state?.markedForReview ?? false,
          latestSelectedChoiceId: state?.latestSelectedChoiceId ?? null,
          latestIsCorrect: state?.latestIsCorrect ?? null,
          latestAnsweredAt: state?.latestAnsweredAt
            ? new Date(state.latestAnsweredAt)
            : null,
        };
      }),
      tagFilters: params.tagSlugs,
      difficultyFilters: params.difficulties,
      startedAt: new Date(),
      endedAt: null,
    };

    this.sessions = [...this.sessions, session];
    return session;
  }

  async recordQuestionAnswer(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    selectedChoiceId: string;
    isCorrect: boolean;
    answeredAt: Date;
  }): Promise<PracticeSession['questionStates'][number]> {
    const session = await this.getActiveSession(input.sessionId, input.userId);
    this.requireQuestionState(session, input.questionId);

    let updatedState: PracticeSession['questionStates'][number] | null = null;
    this.updateSession(input.sessionId, (existing) => {
      const next = this.withNormalizedQuestionStates(existing);
      const questionStates = next.questionStates.map((state) => {
        if (state.questionId !== input.questionId) return state;
        updatedState = {
          ...state,
          latestSelectedChoiceId: input.selectedChoiceId,
          latestIsCorrect: input.isCorrect,
          latestAnsweredAt: input.answeredAt,
        };
        return updatedState;
      });
      return { ...next, questionStates };
    });

    if (!updatedState) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to persist practice session answer state',
      );
    }
    return updatedState;
  }

  async setQuestionMarkedForReview(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    markedForReview: boolean;
  }): Promise<PracticeSession['questionStates'][number]> {
    const session = await this.getActiveSession(input.sessionId, input.userId);
    this.requireQuestionState(session, input.questionId);

    let updatedState: PracticeSession['questionStates'][number] | null = null;
    this.updateSession(input.sessionId, (existing) => {
      const next = this.withNormalizedQuestionStates(existing);
      const questionStates = next.questionStates.map((state) => {
        if (state.questionId !== input.questionId) return state;
        updatedState = {
          ...state,
          markedForReview: input.markedForReview,
        };
        return updatedState;
      });
      return { ...next, questionStates };
    });

    if (!updatedState) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to persist practice session review mark',
      );
    }
    return updatedState;
  }

  async end(id: string, userId: string): Promise<PracticeSession> {
    const existing = await this.findByIdAndUserId(id, userId);
    if (!existing) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    if (existing.endedAt) {
      throw new ApplicationError('CONFLICT', 'Practice session already ended');
    }

    const ended: PracticeSession = { ...existing, endedAt: new Date() };
    this.sessions = this.sessions.map((s) => (s.id === id ? ended : s));
    return ended;
  }
}

export class FakeSubscriptionRepository implements SubscriptionRepository {
  private readonly byUserId = new Map<string, Subscription>();
  private readonly externalSubscriptionIdByUserId = new Map<string, string>();
  private readonly userIdByExternalSubscriptionId = new Map<string, string>();

  constructor(subscriptions: readonly Subscription[] = []) {
    for (const sub of subscriptions) {
      this.byUserId.set(sub.userId, sub);
    }
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    return this.byUserId.get(userId) ?? null;
  }

  async findByExternalSubscriptionId(
    externalSubscriptionId: string,
  ): Promise<Subscription | null> {
    const userId = this.userIdByExternalSubscriptionId.get(
      externalSubscriptionId,
    );
    if (!userId) return null;
    return this.byUserId.get(userId) ?? null;
  }

  async upsert(input: SubscriptionUpsertInput): Promise<void> {
    const mappedUserId = this.userIdByExternalSubscriptionId.get(
      input.externalSubscriptionId,
    );

    if (mappedUserId && mappedUserId !== input.userId) {
      throw new ApplicationError(
        'CONFLICT',
        'External subscription id is already mapped to a different user',
      );
    }

    const now = new Date();
    const existing = this.byUserId.get(input.userId);
    const subscription: Subscription = {
      id: existing?.id ?? `subscription-${this.byUserId.size + 1}`,
      userId: input.userId,
      plan: input.plan,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const previousExternalSubscriptionId =
      this.externalSubscriptionIdByUserId.get(input.userId);
    if (
      previousExternalSubscriptionId &&
      previousExternalSubscriptionId !== input.externalSubscriptionId
    ) {
      this.userIdByExternalSubscriptionId.delete(
        previousExternalSubscriptionId,
      );
    }

    this.byUserId.set(input.userId, subscription);
    this.externalSubscriptionIdByUserId.set(
      input.userId,
      input.externalSubscriptionId,
    );
    this.userIdByExternalSubscriptionId.set(
      input.externalSubscriptionId,
      input.userId,
    );
  }
}

type StoredUser = { user: User; clerkId: string };

export class FakeUserRepository implements UserRepository {
  private readonly byClerkId = new Map<string, StoredUser>();
  private nextId = 1;
  private lastObservedAtMs: number | null = null;

  async findByClerkId(clerkId: string): Promise<User | null> {
    const stored = this.byClerkId.get(clerkId);
    return stored?.user ?? null;
  }

  async upsertByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ): Promise<User> {
    const observedAt =
      options?.observedAt ??
      (() => {
        const nowMs = Date.now();
        const observedAtMs =
          this.lastObservedAtMs === null
            ? nowMs
            : Math.max(nowMs, this.lastObservedAtMs + 1);
        this.lastObservedAtMs = observedAtMs;
        return new Date(observedAtMs);
      })();

    this.lastObservedAtMs = Math.max(
      this.lastObservedAtMs ?? 0,
      observedAt.getTime(),
    );
    const existing = this.byClerkId.get(clerkId);

    if (existing) {
      if (existing.user.email === email) {
        return existing.user;
      }

      if (existing.user.updatedAt >= observedAt) {
        return existing.user;
      }
      const updatedUser: User = {
        ...existing.user,
        email,
        updatedAt: observedAt,
      };
      this.byClerkId.set(clerkId, { user: updatedUser, clerkId });
      return updatedUser;
    }

    const now = observedAt;
    const newUser: User = {
      id: `user-${this.nextId++}`,
      email,
      createdAt: now,
      updatedAt: now,
    };
    this.byClerkId.set(clerkId, { user: newUser, clerkId });
    return newUser;
  }

  async deleteByClerkId(clerkId: string): Promise<boolean> {
    return this.byClerkId.delete(clerkId);
  }
}

export class FakeBookmarkRepository implements BookmarkRepository {
  private readonly bookmarks = new Map<string, Bookmark>();

  constructor(
    seed: readonly Bookmark[] = [],
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const bookmark of seed) {
      this.bookmarks.set(
        this.key(bookmark.userId, bookmark.questionId),
        bookmark,
      );
    }
  }

  private key(userId: string, questionId: string): string {
    return `${userId}:${questionId}`;
  }

  async exists(userId: string, questionId: string): Promise<boolean> {
    return this.bookmarks.has(this.key(userId, questionId));
  }

  async add(userId: string, questionId: string): Promise<Bookmark> {
    const k = this.key(userId, questionId);
    const existing = this.bookmarks.get(k);
    if (existing) {
      return existing;
    }

    const bookmark: Bookmark = {
      userId,
      questionId,
      createdAt: this.now(),
    };
    this.bookmarks.set(k, bookmark);
    return bookmark;
  }

  async remove(userId: string, questionId: string): Promise<boolean> {
    const k = this.key(userId, questionId);
    return this.bookmarks.delete(k);
  }

  async listByUserId(userId: string): Promise<readonly Bookmark[]> {
    const result: Bookmark[] = [];
    for (const bookmark of this.bookmarks.values()) {
      if (bookmark.userId === userId) {
        result.push(bookmark);
      }
    }
    return result;
  }
}

export class FakeTagRepository implements TagRepository {
  private readonly tags: readonly Tag[];

  constructor(tags: readonly Tag[] = []) {
    this.tags = tags;
  }

  async listAll(): Promise<readonly Tag[]> {
    return this.tags;
  }
}

export class FakeStripeCustomerRepository implements StripeCustomerRepository {
  private readonly userIdToCustomerId = new Map<string, string>();
  private readonly customerIdToUserId = new Map<string, string>();

  async findByUserId(
    userId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    const customerId = this.userIdToCustomerId.get(userId);
    if (!customerId) return null;
    return { stripeCustomerId: customerId };
  }

  async insert(
    userId: string,
    stripeCustomerId: string,
    options?: { conflictStrategy?: 'strict' | 'authoritative' },
  ): Promise<void> {
    const conflictStrategy = options?.conflictStrategy ?? 'strict';
    const existingCustomerId = this.userIdToCustomerId.get(userId);
    const existingUserId = this.customerIdToUserId.get(stripeCustomerId);

    if (existingCustomerId === stripeCustomerId && existingUserId === userId) {
      return;
    }

    if (existingCustomerId && existingCustomerId !== stripeCustomerId) {
      if (conflictStrategy !== 'authoritative') {
        throw new ApplicationError(
          'CONFLICT',
          'User is already mapped to a different Stripe customer',
        );
      }
      this.customerIdToUserId.delete(existingCustomerId);
    }

    if (existingUserId && existingUserId !== userId) {
      throw new ApplicationError(
        'CONFLICT',
        'Stripe customer is already mapped to a different user',
      );
    }

    this.userIdToCustomerId.set(userId, stripeCustomerId);
    this.customerIdToUserId.set(stripeCustomerId, userId);
  }
}

type StoredStripeEvent = {
  type: string;
  processedAt: Date | null;
  error: string | null;
};

export class FakeStripeEventRepository implements StripeEventRepository {
  private readonly events = new Map<string, StoredStripeEvent>();

  async claim(eventId: string, type: string): Promise<boolean> {
    if (this.events.has(eventId)) {
      return false;
    }

    this.events.set(eventId, {
      type,
      processedAt: null,
      error: null,
    });
    return true;
  }

  async peek(
    eventId: string,
  ): Promise<{ processedAt: Date | null; error: string | null } | null> {
    const event = this.events.get(eventId);
    if (!event) return null;
    return { processedAt: event.processedAt, error: event.error };
  }

  async lock(
    eventId: string,
  ): Promise<{ processedAt: Date | null; error: string | null }> {
    const event = this.events.get(eventId);
    if (!event) {
      throw new ApplicationError('NOT_FOUND', 'Event not found');
    }
    return { processedAt: event.processedAt, error: event.error };
  }

  async markProcessed(eventId: string): Promise<void> {
    const event = this.events.get(eventId);
    if (event) {
      event.processedAt = new Date();
      event.error = null;
    }
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    const event = this.events.get(eventId);
    if (event) {
      event.processedAt = null;
      event.error = error;
    }
  }

  async pruneProcessedBefore(cutoff: Date, limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit <= 0) return 0;

    const toDelete = [...this.events.entries()]
      .filter(([, event]) => event.processedAt && event.processedAt < cutoff)
      .sort((a, b) => {
        const aTime = a[1].processedAt?.getTime() ?? 0;
        const bTime = b[1].processedAt?.getTime() ?? 0;
        return aTime - bTime;
      })
      .slice(0, limit);

    for (const [eventId] of toDelete) {
      this.events.delete(eventId);
    }

    return toDelete.length;
  }
}

type InMemoryIdempotencyRecord = {
  resultJson: unknown;
  error: IdempotencyKeyError | null;
  expiresAt: Date;
};

export class FakeIdempotencyKeyRepository implements IdempotencyKeyRepository {
  private readonly records = new Map<string, InMemoryIdempotencyRecord>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private toKey(userId: string, action: string, key: string): string {
    return `${userId}:${action}:${key}`;
  }

  async claim(input: {
    userId: string;
    action: string;
    key: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const id = this.toKey(input.userId, input.action, input.key);
    const existing = this.records.get(id);
    if (existing && existing.expiresAt.getTime() >= this.now().getTime()) {
      return false;
    }

    this.records.set(id, {
      resultJson: null,
      error: null,
      expiresAt: input.expiresAt,
    });
    return true;
  }

  async find(
    userId: string,
    action: string,
    key: string,
  ): Promise<IdempotencyKeyRecord | null> {
    const id = this.toKey(userId, action, key);
    const existing = this.records.get(id);
    if (!existing) return null;

    if (existing.expiresAt.getTime() < this.now().getTime()) {
      return null;
    }

    return existing;
  }

  async storeResult(input: {
    userId: string;
    action: string;
    key: string;
    resultJson: unknown;
  }): Promise<void> {
    const id = this.toKey(input.userId, input.action, input.key);
    const existing = this.records.get(id);
    if (!existing) {
      throw new ApplicationError('NOT_FOUND', 'Idempotency key not found');
    }

    this.records.set(id, {
      ...existing,
      resultJson: input.resultJson,
      error: null,
    });
  }

  async storeError(input: {
    userId: string;
    action: string;
    key: string;
    error: IdempotencyKeyError;
  }): Promise<void> {
    const id = this.toKey(input.userId, input.action, input.key);
    const existing = this.records.get(id);
    if (!existing) {
      throw new ApplicationError('NOT_FOUND', 'Idempotency key not found');
    }

    this.records.set(id, {
      ...existing,
      resultJson: null,
      error: input.error,
    });
  }

  async pruneExpiredBefore(cutoff: Date, limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit <= 0) {
      return 0;
    }

    const rows = Array.from(this.records.entries())
      .filter(([, record]) => record.expiresAt.getTime() < cutoff.getTime())
      .sort(([, a], [, b]) => a.expiresAt.getTime() - b.expiresAt.getTime())
      .slice(0, limit);

    for (const [id] of rows) {
      this.records.delete(id);
    }

    return rows.length;
  }
}
