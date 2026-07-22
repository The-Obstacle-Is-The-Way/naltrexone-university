import type { Bookmark } from '@/src/domain/entities';
import type { QuestionDifficulty } from '@/src/domain/value-objects';

export type AvailableBookmarkSummary = {
  isAvailable: true;
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: QuestionDifficulty;
  bookmarkedAt: Date;
};

export type UnavailableBookmarkSummary = {
  isAvailable: false;
  questionId: string;
  bookmarkedAt: Date;
};

export type BookmarkSummary =
  | AvailableBookmarkSummary
  | UnavailableBookmarkSummary;

export interface BookmarkRepository {
  exists(userId: string, questionId: string): Promise<boolean>;
  /**
   * Add the bookmark if absent and return the persisted row.
   *
   * Implementations must be idempotent for an existing `(userId, questionId)`
   * pair, including concurrent calls that race to create the same bookmark.
   */
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
  listSummariesByUserId(userId: string): Promise<readonly BookmarkSummary[]>;
  listQuestionIdsByUserId(userId: string): Promise<readonly string[]>;
}
