import type {
  Attempt,
  PracticeSession,
  Question,
  Subscription,
} from '@/src/domain/entities';
import type { QuestionDifficulty } from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import type {
  AttemptMostRecentAnsweredAt,
  AttemptRepository,
  PracticeSessionRepository,
  QuestionFilters,
  QuestionRepository,
  SubscriptionRepository,
  SubscriptionUpsertInput,
} from '../ports/repositories';

type InMemoryAttempt = Attempt & { practiceSessionId: string | null };

export class FakeQuestionRepository implements QuestionRepository {
  private readonly questions: readonly Question[];

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
}

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

export class FakeAttemptRepository implements AttemptRepository {
  private attempts: InMemoryAttempt[];
  private nextId = 1;

  constructor(seed: readonly InMemoryAttempt[] = []) {
    this.attempts = [...seed];
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
    const attempt: InMemoryAttempt = {
      id: `attempt-${this.nextId++}`,
      userId: input.userId,
      questionId: input.questionId,
      practiceSessionId: input.practiceSessionId,
      selectedChoiceId: input.selectedChoiceId,
      isCorrect: input.isCorrect,
      timeSpentSeconds: input.timeSpentSeconds,
      answeredAt: new Date(),
    };
    this.attempts = [...this.attempts, attempt];
    return attempt;
  }

  async findByUserId(userId: string): Promise<readonly Attempt[]> {
    return this.attempts.filter((a) => a.userId === userId);
  }

  async findBySessionId(
    sessionId: string,
    userId: string,
  ): Promise<readonly Attempt[]> {
    return this.attempts.filter(
      (a) => a.practiceSessionId === sessionId && a.userId === userId,
    );
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
}

export class FakePracticeSessionRepository
  implements PracticeSessionRepository
{
  private sessions: readonly PracticeSession[];

  constructor(seed: readonly PracticeSession[] = []) {
    this.sessions = seed;
  }

  async findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<PracticeSession | null> {
    return (
      this.sessions.find((s) => s.id === id && s.userId === userId) ?? null
    );
  }

  async create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown;
  }): Promise<PracticeSession> {
    const params = input.paramsJson as {
      questionIds: string[];
      tagSlugs: string[];
      difficulties: QuestionDifficulty[];
    };
    const session: PracticeSession = {
      id: `session-${this.sessions.length + 1}`,
      userId: input.userId,
      mode: input.mode,
      questionIds: params.questionIds,
      tagFilters: params.tagSlugs,
      difficultyFilters: params.difficulties,
      startedAt: new Date(),
      endedAt: null,
    };

    this.sessions = [...this.sessions, session];
    return session;
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
  private readonly stripeSubscriptionIdByUserId = new Map<string, string>();
  private readonly userIdByStripeSubscriptionId = new Map<string, string>();

  constructor(subscriptions: readonly Subscription[] = []) {
    for (const sub of subscriptions) {
      this.byUserId.set(sub.userId, sub);
    }
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    return this.byUserId.get(userId) ?? null;
  }

  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<Subscription | null> {
    const userId = this.userIdByStripeSubscriptionId.get(stripeSubscriptionId);
    if (!userId) return null;
    return this.byUserId.get(userId) ?? null;
  }

  async upsert(input: SubscriptionUpsertInput): Promise<void> {
    const mappedUserId = this.userIdByStripeSubscriptionId.get(
      input.stripeSubscriptionId,
    );

    if (mappedUserId && mappedUserId !== input.userId) {
      throw new ApplicationError(
        'CONFLICT',
        'Stripe subscription id is already mapped to a different user',
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

    const previousStripeSubscriptionId = this.stripeSubscriptionIdByUserId.get(
      input.userId,
    );
    if (
      previousStripeSubscriptionId &&
      previousStripeSubscriptionId !== input.stripeSubscriptionId
    ) {
      this.userIdByStripeSubscriptionId.delete(previousStripeSubscriptionId);
    }

    this.byUserId.set(input.userId, subscription);
    this.stripeSubscriptionIdByUserId.set(
      input.userId,
      input.stripeSubscriptionId,
    );
    this.userIdByStripeSubscriptionId.set(
      input.stripeSubscriptionId,
      input.userId,
    );
  }
}
