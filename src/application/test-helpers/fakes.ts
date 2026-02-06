import { ApplicationError } from '@/src/application/errors';
import type { Logger, LoggerContext } from '@/src/application/ports/logger';
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
import type { GetBookmarksInput, GetBookmarksOutput } from '../ports/bookmarks';
import type {
  AuthGateway,
  CheckoutSessionInput,
  CheckoutSessionOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  PaymentGateway,
  PaymentGatewayRequestOptions,
  PortalSessionInput,
  PortalSessionOutput,
  RateLimiter,
  RateLimitInput,
  RateLimitResult,
  WebhookEventResult,
} from '../ports/gateways';
import type {
  AttemptMostRecentAnsweredAt,
  AttemptRepository,
  BookmarkRepository,
  IdempotencyKeyError,
  IdempotencyKeyRecord,
  IdempotencyKeyRepository,
  MissedQuestionAttempt,
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
} from '../ports/repositories';
import type { UseCase } from '../ports/use-cases';
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionOutput,
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
  EndPracticeSessionInput,
  EndPracticeSessionOutput,
  GetIncompletePracticeSessionInput,
  GetIncompletePracticeSessionOutput,
  GetMissedQuestionsInput,
  GetMissedQuestionsOutput,
  GetNextQuestionInput,
  GetNextQuestionOutput,
  GetPracticeSessionReviewInput,
  GetPracticeSessionReviewOutput,
  GetUserStatsInput,
  SetPracticeSessionQuestionMarkInput,
  SetPracticeSessionQuestionMarkOutput,
  StartPracticeSessionInput,
  StartPracticeSessionOutput,
  SubmitAnswerInput,
  SubmitAnswerOutput,
  ToggleBookmarkInput,
  ToggleBookmarkOutput,
  UserStatsOutput,
} from '../use-cases';

type InMemoryAttempt = Attempt & { practiceSessionId: string | null };

type LoggerCall = { context: LoggerContext; msg: string };

export class FakeLogger implements Logger {
  readonly debugCalls: LoggerCall[] = [];
  readonly infoCalls: LoggerCall[] = [];
  readonly warnCalls: LoggerCall[] = [];
  readonly errorCalls: LoggerCall[] = [];

  debug(context: LoggerContext, msg: string): void {
    this.debugCalls.push({ context, msg });
  }

  info(context: LoggerContext, msg: string): void {
    this.infoCalls.push({ context, msg });
  }

  warn(context: LoggerContext, msg: string): void {
    this.warnCalls.push({ context, msg });
  }

  error(context: LoggerContext, msg: string): void {
    this.errorCalls.push({ context, msg });
  }
}

export class FakeQuestionRepository implements QuestionRepository {
  private readonly questions: readonly Question[];
  readonly findPublishedByIdsCalls: string[][] = [];

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

export class FakeRateLimiter implements RateLimiter {
  readonly inputs: RateLimitInput[] = [];
  private readonly results: Array<RateLimitResult | Error>;

  constructor(
    result?: RateLimitResult | Error | readonly (RateLimitResult | Error)[],
  ) {
    this.results = result
      ? Array.isArray(result)
        ? [...result]
        : [result]
      : [];
  }

  async limit(input: RateLimitInput): Promise<RateLimitResult> {
    this.inputs.push(input);
    const next = this.results.shift();
    if (next instanceof Error) throw next;
    if (next) return next;

    return {
      success: true,
      limit: input.limit,
      remaining: Math.max(0, input.limit - 1),
      retryAfterSeconds: 0,
    };
  }
}

export class FakePaymentGateway implements PaymentGateway {
  readonly customerInputs: CreateCustomerInput[] = [];
  readonly customerOptions: Array<PaymentGatewayRequestOptions | undefined> =
    [];
  readonly checkoutInputs: CheckoutSessionInput[] = [];
  readonly checkoutOptions: Array<PaymentGatewayRequestOptions | undefined> =
    [];
  readonly portalInputs: PortalSessionInput[] = [];
  readonly portalOptions: Array<PaymentGatewayRequestOptions | undefined> = [];
  readonly webhookInputs: Array<{ rawBody: string; signature: string }> = [];

  private readonly externalCustomerId: string;
  private readonly checkoutUrl: string;
  private readonly portalUrl: string;
  private readonly webhookResult: WebhookEventResult;

  constructor(input: {
    externalCustomerId: string;
    checkoutUrl: string;
    portalUrl: string;
    webhookResult: WebhookEventResult;
  }) {
    this.externalCustomerId = input.externalCustomerId;
    this.checkoutUrl = input.checkoutUrl;
    this.portalUrl = input.portalUrl;
    this.webhookResult = input.webhookResult;
  }

  async createCustomer(
    input: CreateCustomerInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<CreateCustomerOutput> {
    this.customerInputs.push(input);
    this.customerOptions.push(options);
    return { externalCustomerId: this.externalCustomerId };
  }

  async createCheckoutSession(
    input: CheckoutSessionInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<CheckoutSessionOutput> {
    this.checkoutInputs.push(input);
    this.checkoutOptions.push(options);
    return { url: this.checkoutUrl };
  }

  async createPortalSession(
    input: PortalSessionInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<PortalSessionOutput> {
    this.portalInputs.push(input);
    this.portalOptions.push(options);
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

export class FakeToggleBookmarkUseCase
  implements UseCase<ToggleBookmarkInput, ToggleBookmarkOutput>
{
  readonly inputs: ToggleBookmarkInput[] = [];

  constructor(
    private readonly output: ToggleBookmarkOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: ToggleBookmarkInput): Promise<ToggleBookmarkOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetBookmarksUseCase
  implements UseCase<GetBookmarksInput, GetBookmarksOutput>
{
  readonly inputs: GetBookmarksInput[] = [];

  constructor(
    private readonly output: GetBookmarksOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: GetBookmarksInput): Promise<GetBookmarksOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeStartPracticeSessionUseCase
  implements UseCase<StartPracticeSessionInput, StartPracticeSessionOutput>
{
  readonly inputs: StartPracticeSessionInput[] = [];

  constructor(
    private readonly output: StartPracticeSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: StartPracticeSessionInput,
  ): Promise<StartPracticeSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeEndPracticeSessionUseCase
  implements UseCase<EndPracticeSessionInput, EndPracticeSessionOutput>
{
  readonly inputs: EndPracticeSessionInput[] = [];

  constructor(
    private readonly output: EndPracticeSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: EndPracticeSessionInput,
  ): Promise<EndPracticeSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeCreateCheckoutSessionUseCase
  implements UseCase<CreateCheckoutSessionInput, CreateCheckoutSessionOutput>
{
  readonly inputs: CreateCheckoutSessionInput[] = [];

  constructor(
    private readonly output: CreateCheckoutSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: CreateCheckoutSessionInput,
  ): Promise<CreateCheckoutSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeCreatePortalSessionUseCase
  implements UseCase<CreatePortalSessionInput, CreatePortalSessionOutput>
{
  readonly inputs: CreatePortalSessionInput[] = [];

  constructor(
    private readonly output: CreatePortalSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: CreatePortalSessionInput,
  ): Promise<CreatePortalSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetMissedQuestionsUseCase
  implements UseCase<GetMissedQuestionsInput, GetMissedQuestionsOutput>
{
  readonly inputs: GetMissedQuestionsInput[] = [];

  constructor(
    private readonly output: GetMissedQuestionsOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: GetMissedQuestionsInput,
  ): Promise<GetMissedQuestionsOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetIncompletePracticeSessionUseCase
  implements
    UseCase<
      GetIncompletePracticeSessionInput,
      GetIncompletePracticeSessionOutput
    >
{
  readonly inputs: GetIncompletePracticeSessionInput[] = [];

  constructor(
    private readonly output: GetIncompletePracticeSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: GetIncompletePracticeSessionInput,
  ): Promise<GetIncompletePracticeSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetPracticeSessionReviewUseCase
  implements
    UseCase<GetPracticeSessionReviewInput, GetPracticeSessionReviewOutput>
{
  readonly inputs: GetPracticeSessionReviewInput[] = [];

  constructor(
    private readonly output: GetPracticeSessionReviewOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: GetPracticeSessionReviewInput,
  ): Promise<GetPracticeSessionReviewOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetUserStatsUseCase
  implements UseCase<GetUserStatsInput, UserStatsOutput>
{
  readonly inputs: GetUserStatsInput[] = [];

  constructor(
    private readonly output: UserStatsOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: GetUserStatsInput): Promise<UserStatsOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeGetNextQuestionUseCase
  implements UseCase<GetNextQuestionInput, GetNextQuestionOutput>
{
  readonly inputs: GetNextQuestionInput[] = [];

  constructor(
    private readonly output: GetNextQuestionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: GetNextQuestionInput): Promise<GetNextQuestionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeSubmitAnswerUseCase
  implements UseCase<SubmitAnswerInput, SubmitAnswerOutput>
{
  readonly inputs: SubmitAnswerInput[] = [];

  constructor(
    private readonly output: SubmitAnswerOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

export class FakeSetPracticeSessionQuestionMarkUseCase
  implements
    UseCase<
      SetPracticeSessionQuestionMarkInput,
      SetPracticeSessionQuestionMarkOutput
    >
{
  readonly inputs: SetPracticeSessionQuestionMarkInput[] = [];

  constructor(
    private readonly output: SetPracticeSessionQuestionMarkOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: SetPracticeSessionQuestionMarkInput,
  ): Promise<SetPracticeSessionQuestionMarkOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

type InMemoryIdempotencyRecord = {
  resultJson: unknown | null;
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
      .slice()
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
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
      if (!existing || this.isLaterAttempt(attempt, existing)) {
        mostRecentByQuestionId.set(attempt.questionId, attempt);
      }
    }

    return [...mostRecentByQuestionId.values()]
      .filter((a) => !a.isCorrect)
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
      .slice(offset, offset + limit)
      .map((a) => ({ questionId: a.questionId, answeredAt: a.answeredAt }));
  }

  async countMissedQuestionsByUserId(userId: string): Promise<number> {
    const mostRecentByQuestionId = new Map<string, InMemoryAttempt>();
    for (const attempt of this.attempts) {
      if (attempt.userId !== userId) continue;
      const existing = mostRecentByQuestionId.get(attempt.questionId);
      if (!existing || this.isLaterAttempt(attempt, existing)) {
        mostRecentByQuestionId.set(attempt.questionId, attempt);
      }
    }

    return [...mostRecentByQuestionId.values()].filter((a) => !a.isCorrect)
      .length;
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
