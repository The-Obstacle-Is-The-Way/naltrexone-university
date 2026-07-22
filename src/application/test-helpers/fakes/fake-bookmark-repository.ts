import type { BookmarkSummary } from '@/src/application/ports/bookmark-repository';
import type { BookmarkRepository } from '@/src/application/ports/repositories';
import type { Bookmark } from '@/src/domain/entities';
import type { QuestionDifficulty } from '@/src/domain/value-objects';

export class FakeBookmarkRepository implements BookmarkRepository {
  private readonly bookmarks = new Map<string, Bookmark>();

  constructor(
    seed: readonly Bookmark[] = [],
    private readonly now: () => Date = () => new Date(),
    private readonly publishedQuestionSummariesById: ReadonlyMap<
      string,
      { slug: string; stemMd: string; difficulty: QuestionDifficulty }
    > = new Map(),
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
    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listQuestionIdsByUserId(userId: string): Promise<readonly string[]> {
    return (await this.listByUserId(userId)).map(
      (bookmark) => bookmark.questionId,
    );
  }

  async listSummariesByUserId(
    userId: string,
  ): Promise<readonly BookmarkSummary[]> {
    return (await this.listByUserId(userId)).map((bookmark) => {
      const question = this.publishedQuestionSummariesById.get(
        bookmark.questionId,
      );
      if (!question) {
        return {
          isAvailable: false,
          questionId: bookmark.questionId,
          bookmarkedAt: bookmark.createdAt,
        };
      }
      return {
        isAvailable: true,
        questionId: bookmark.questionId,
        slug: question.slug,
        stemMd: question.stemMd,
        difficulty: question.difficulty,
        bookmarkedAt: bookmark.createdAt,
      };
    });
  }
}
