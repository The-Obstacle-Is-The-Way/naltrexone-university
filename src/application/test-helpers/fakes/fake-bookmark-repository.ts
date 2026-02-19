import type { BookmarkRepository } from '@/src/application/ports/repositories';
import type { Bookmark } from '@/src/domain/entities';

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
