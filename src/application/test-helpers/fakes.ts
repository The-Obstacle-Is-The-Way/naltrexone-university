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
import { ApplicationError } from '../errors';
import type {
  AuthGateway,
  CheckoutSessionInput,
  CheckoutSessionOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  PaymentGateway,
  PortalSessionInput,
  PortalSessionOutput,
  WebhookEventResult,
} from '../ports/gateways';
import type {
  AttemptMostRecentAnsweredAt,
  AttemptRepository,
  BookmarkRepository,
  MissedQuestionAttempt,
  PracticeSessionRepository,
  QuestionFilters,
  QuestionRepository,
  StripeCustomerRepository,
  StripeEventRepository,
  SubscriptionRepository,
  SubscriptionUpsertInput,
  TagRepository,
  UserRepository,
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

export class FakeAuthGateway implements AuthGateway {
  constructor(private user: User | null) {}

  async getCurrentUser(): Promise<User | null> {
    return this.user;
  }

  async requireUser(): Promise<User> {
    if (!this.user) {
      throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
    }
    return this.user;
  }
}

export class FakePaymentGateway implements PaymentGateway {
  readonly customerInputs: CreateCustomerInput[] = [];
  readonly checkoutInputs: CheckoutSessionInput[] = [];
  readonly portalInputs: PortalSessionInput[] = [];
  readonly webhookInputs: Array<{ rawBody: string; signature: string }> = [];

  private readonly stripeCustomerId: string;
  private readonly checkoutUrl: string;
  private readonly portalUrl: string;
  private readonly webhookResult: WebhookEventResult;

  constructor(input: {
    stripeCustomerId: string;
    checkoutUrl: string;
    portalUrl: string;
    webhookResult: WebhookEventResult;
  }) {
    this.stripeCustomerId = input.stripeCustomerId;
    this.checkoutUrl = input.checkoutUrl;
    this.portalUrl = input.portalUrl;
    this.webhookResult = input.webhookResult;
  }

  async createCustomer(
    input: CreateCustomerInput,
  ): Promise<CreateCustomerOutput> {
    this.customerInputs.push(input);
    return { stripeCustomerId: this.stripeCustomerId };
  }

  async createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionOutput> {
    this.checkoutInputs.push(input);
    return { url: this.checkoutUrl };
  }

  async createPortalSession(
    input: PortalSessionInput,
  ): Promise<PortalSessionOutput> {
    this.portalInputs.push(input);
    return { url: this.portalUrl };
  }

  async processWebhookEvent(
    rawBody: string,
    signature: string,
  ): Promise<WebhookEventResult> {
    this.webhookInputs.push({ rawBody, signature });
    return this.webhookResult;
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
  ): Promise<readonly Attempt[]> {
    return this.attempts
      .filter((a) => a.userId === userId)
      .slice()
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
      .slice(0, limit);
  }

  async listAnsweredAtByUserIdSince(
    userId: string,
    since: Date,
  ): Promise<readonly Date[]> {
    return this.attempts
      .filter((a) => a.userId === userId && a.answeredAt >= since)
      .map((a) => a.answeredAt);
  }

  async listMissedQuestionsByUserId(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<readonly MissedQuestionAttempt[]> {
    const mostRecentByQuestionId = new Map<string, InMemoryAttempt>();
    for (const attempt of this.attempts) {
      if (attempt.userId !== userId) continue;
      const existing = mostRecentByQuestionId.get(attempt.questionId);
      if (!existing || attempt.answeredAt > existing.answeredAt) {
        mostRecentByQuestionId.set(attempt.questionId, attempt);
      }
    }

    return [...mostRecentByQuestionId.values()]
      .filter((a) => !a.isCorrect)
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
      .slice(offset, offset + limit)
      .map((a) => ({ questionId: a.questionId, answeredAt: a.answeredAt }));
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

type StoredUser = { user: User; clerkId: string };

export class FakeUserRepository implements UserRepository {
  private readonly byClerkId = new Map<string, StoredUser>();
  private nextId = 1;

  async findByClerkId(clerkId: string): Promise<User | null> {
    const stored = this.byClerkId.get(clerkId);
    return stored?.user ?? null;
  }

  async upsertByClerkId(clerkId: string, email: string): Promise<User> {
    const existing = this.byClerkId.get(clerkId);

    if (existing) {
      if (existing.user.email === email) {
        return existing.user;
      }
      const updatedUser: User = {
        ...existing.user,
        email,
        updatedAt: new Date(),
      };
      this.byClerkId.set(clerkId, { user: updatedUser, clerkId });
      return updatedUser;
    }

    const now = new Date();
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
      createdAt: new Date(),
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

  async insert(userId: string, stripeCustomerId: string): Promise<void> {
    const existingCustomerId = this.userIdToCustomerId.get(userId);
    const existingUserId = this.customerIdToUserId.get(stripeCustomerId);

    if (existingCustomerId === stripeCustomerId && existingUserId === userId) {
      return;
    }

    if (existingCustomerId && existingCustomerId !== stripeCustomerId) {
      throw new ApplicationError(
        'CONFLICT',
        'User is already mapped to a different Stripe customer',
      );
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
    }
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    const event = this.events.get(eventId);
    if (event) {
      event.error = error;
    }
  }
}
