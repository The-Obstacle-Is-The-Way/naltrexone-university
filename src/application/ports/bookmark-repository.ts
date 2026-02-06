import type { Bookmark } from '@/src/domain/entities';

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
