import type { ApplicationErrorCode } from '@/src/application/errors';
import type {
  Attempt,
  Bookmark,
  PracticeSession,
  Question,
  Subscription,
  Tag,
  User,
} from '@/src/domain/entities';
import type {
  QuestionDifficulty,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/src/domain/value-objects';

export type QuestionFilters = {
  tagSlugs: readonly string[];
  difficulties: readonly QuestionDifficulty[];
};

export type PageOptions = {
  limit: number;
  offset: number;
};

export interface QuestionRepository {
  findPublishedById(id: string): Promise<Question | null>;
  findPublishedBySlug(slug: string): Promise<Question | null>;
  findPublishedByIds(ids: readonly string[]): Promise<readonly Question[]>;

  /**
   * Return candidate question ids for "next question" selection.
   *
   * Requirements:
   * - Only returns `questions.status='published'`.
   * - Applies filters deterministically.
   * - Returns ids in a deterministic order (repository defines ordering).
   */
  listPublishedCandidateIds(
    filters: QuestionFilters,
  ): Promise<readonly string[]>;
}

export type AttemptInsertInput = {
  userId: string;
  questionId: string;
  practiceSessionId: string | null;
  selectedChoiceId: string;
  isCorrect: boolean;
  timeSpentSeconds: number;
};

export type AttemptMostRecentAnsweredAt = {
  questionId: string;
  answeredAt: Date;
};

export type MissedQuestionAttempt = {
  questionId: string;
  answeredAt: Date;
};

export interface AttemptWriter {
  insert(input: AttemptInsertInput): Promise<Attempt>;
}

export interface AttemptHistoryReader {
  findByUserId(userId: string, page: PageOptions): Promise<readonly Attempt[]>;
}

export interface AttemptSessionReader {
  findBySessionId(
    sessionId: string,
    userId: string,
  ): Promise<readonly Attempt[]>;
}

export interface AttemptStatsReader {
  countByUserId(userId: string): Promise<number>;
  countCorrectByUserId(userId: string): Promise<number>;

  countByUserIdSince(userId: string, since: Date): Promise<number>;
  countCorrectByUserIdSince(userId: string, since: Date): Promise<number>;

  listRecentByUserId(
    userId: string,
    limit: number,
  ): Promise<readonly Attempt[]>;

  /**
   * Return answeredAt timestamps for attempts within a date range.
   * Intended for streak computation; repository may return a subset of columns.
   */
  listAnsweredAtByUserIdSince(
    userId: string,
    since: Date,
  ): Promise<readonly Date[]>;
}

export interface AttemptMissedQuestionsReader {
  /**
   * Paginated missed question IDs based on the user's most recent attempt
   * per question (only included when the most recent attempt is incorrect).
   */
  listMissedQuestionsByUserId(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<readonly MissedQuestionAttempt[]>;

  /**
   * Total missed question count based on the user's most recent attempt per question.
   */
  countMissedQuestionsByUserId(userId: string): Promise<number>;
}

export interface AttemptMostRecentAnsweredAtReader {
  /**
   * For each question id, return the most recent answeredAt (max) for this user.
   * Missing entries imply "never attempted".
   */
  findMostRecentAnsweredAtByQuestionIds(
    userId: string,
    questionIds: readonly string[],
  ): Promise<readonly AttemptMostRecentAnsweredAt[]>;
}

export interface AttemptRepository
  extends AttemptWriter,
    AttemptHistoryReader,
    AttemptSessionReader,
    AttemptStatsReader,
    AttemptMissedQuestionsReader,
    AttemptMostRecentAnsweredAtReader {}

export interface PracticeSessionRepository {
  findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<PracticeSession | null>;
  create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown; // adapter validates + persists exact shape
  }): Promise<PracticeSession>;
  end(id: string, userId: string): Promise<PracticeSession>;
}

export interface BookmarkRepository {
  exists(userId: string, questionId: string): Promise<boolean>;
  add(userId: string, questionId: string): Promise<Bookmark>;
  /**
   * Remove the bookmark if it exists.
   *
   * Returns:
   * - true when a bookmark was removed
   * - false when it was already absent
   */
  remove(userId: string, questionId: string): Promise<boolean>;
  listByUserId(userId: string): Promise<readonly Bookmark[]>;
}

export interface TagRepository {
  listAll(): Promise<readonly Tag[]>;
}

export type SubscriptionUpsertInput = {
  userId: string;
  externalSubscriptionId: string; // opaque external id
  plan: SubscriptionPlan; // domain plan (monthly/annual)
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
};

export interface SubscriptionRepository {
  findByUserId(userId: string): Promise<Subscription | null>;

  findByExternalSubscriptionId(
    externalSubscriptionId: string,
  ): Promise<Subscription | null>;

  upsert(input: SubscriptionUpsertInput): Promise<void>;
}

export interface StripeCustomerRepository {
  findByUserId(userId: string): Promise<{ stripeCustomerId: string } | null>;

  /**
   * Persist a 1:1 mapping between internal users and Stripe customers.
   *
   * Constraints:
   * - One internal user → one Stripe customer (unique by `userId`)
   * - One Stripe customer → one internal user (unique by `stripeCustomerId`)
   *
   * Behavior:
   * - Idempotent if the same mapping already exists.
   * - Rejects conflicting mappings.
   *
   * Expected failure:
   * - Throws `ApplicationError('CONFLICT', ...)` when the requested mapping
   *   conflicts with existing data.
   */
  insert(userId: string, stripeCustomerId: string): Promise<void>;
}

export interface StripeEventRepository {
  /**
   * Insert the event row if missing (idempotent).
   * Returns true if the row was inserted (claimed), false if it already existed.
   */
  claim(eventId: string, type: string): Promise<boolean>;

  /**
   * Lock the event row for exclusive processing and return its current state.
   *
   * IMPORTANT: This must be called inside a transaction.
   */
  lock(eventId: string): Promise<{
    processedAt: Date | null;
    error: string | null;
  }>;

  markProcessed(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string): Promise<void>;

  /**
   * Delete old, successfully-processed webhook events to keep the table bounded.
   *
   * Constraints:
   * - Only deletes rows where `processedAt` is not null.
   * - Deletes at most `limit` rows per call.
   *
   * Returns:
   * - Number of rows deleted.
   */
  pruneProcessedBefore(cutoff: Date, limit: number): Promise<number>;
}

/**
 * Optional metadata for ordering concurrent updates.
 *
 * - `observedAt` should represent the source-of-truth timestamp for the email
 *   value (e.g., Clerk `updated_at`).
 */
export type UpsertUserByClerkIdOptions = {
  observedAt?: Date;
};

export interface UserRepository {
  /**
   * Find a user by their external Clerk ID.
   */
  findByClerkId(clerkId: string): Promise<User | null>;

  /**
   * Upsert a user by their Clerk ID.
   *
   * - If user doesn't exist, creates a new user row.
   * - If user exists with same email, returns existing user.
   * - If user exists with different email, updates the email.
   *
   * This handles race conditions with ON CONFLICT gracefully.
   */
  upsertByClerkId(
    clerkId: string,
    email: string,
    options?: UpsertUserByClerkIdOptions,
  ): Promise<User>;

  /**
   * Delete a user by their external Clerk ID.
   *
   * Returns:
   * - true when a user row was deleted
   * - false when no user row existed
   */
  deleteByClerkId(clerkId: string): Promise<boolean>;
}

export type IdempotencyKeyError = {
  code: ApplicationErrorCode;
  message: string;
};

export type IdempotencyKeyRecord = {
  resultJson: unknown | null;
  error: IdempotencyKeyError | null;
  expiresAt: Date;
};

export interface IdempotencyKeyRepository {
  /**
   * Attempt to claim an idempotency key for exclusive execution.
   *
   * Returns:
   * - true when the key was inserted (caller should execute the operation)
   * - false when the key already exists (caller should read and reuse result)
   */
  claim(input: {
    userId: string;
    action: string;
    key: string;
    expiresAt: Date;
  }): Promise<boolean>;

  /**
   * Read an existing idempotency record.
   *
   * Returns null when:
   * - no record exists, or
   * - the record has expired
   */
  find(
    userId: string,
    action: string,
    key: string,
  ): Promise<IdempotencyKeyRecord | null>;

  storeResult(input: {
    userId: string;
    action: string;
    key: string;
    resultJson: unknown;
  }): Promise<void>;

  storeError(input: {
    userId: string;
    action: string;
    key: string;
    error: IdempotencyKeyError;
  }): Promise<void>;

  pruneExpiredBefore(cutoff: Date, limit: number): Promise<number>;
}
