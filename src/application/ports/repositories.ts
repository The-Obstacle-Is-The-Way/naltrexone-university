import type {
  Attempt,
  Bookmark,
  PracticeSession,
  Question,
  Subscription,
  Tag,
} from '@/src/domain/entities';
import type { QuestionDifficulty } from '@/src/domain/value-objects';

export type QuestionFilters = {
  tagSlugs: readonly string[];
  difficulties: readonly QuestionDifficulty[];
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

export interface AttemptRepository {
  insert(input: AttemptInsertInput): Promise<Attempt>;

  findByUserId(userId: string): Promise<readonly Attempt[]>;
  findBySessionId(
    sessionId: string,
    userId: string,
  ): Promise<readonly Attempt[]>;

  /**
   * For each question id, return the most recent answeredAt (max) for this user.
   * Missing entries imply "never attempted".
   */
  findMostRecentAnsweredAtByQuestionIds(
    userId: string,
    questionIds: readonly string[],
  ): Promise<readonly AttemptMostRecentAnsweredAt[]>;
}

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
  remove(userId: string, questionId: string): Promise<void>;
  listByUserId(userId: string): Promise<readonly Bookmark[]>;
}

export interface TagRepository {
  listAll(): Promise<readonly Tag[]>;
}

export interface SubscriptionRepository {
  findByUserId(userId: string): Promise<Subscription | null>;
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
   * Return true if the event was already successfully processed.
   */
  isProcessed(eventId: string): Promise<boolean>;

  /**
   * Insert the event row if missing (idempotent).
   */
  ensure(eventId: string, type: string): Promise<void>;

  markProcessed(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string): Promise<void>;
}
