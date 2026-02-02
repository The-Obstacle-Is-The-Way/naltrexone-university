import { and, desc, eq } from 'drizzle-orm';
import { bookmarks } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { BookmarkRepository } from '@/src/application/ports/repositories';
import type { DrizzleDb } from '../shared/database-types';

export class DrizzleBookmarkRepository implements BookmarkRepository {
  constructor(private readonly db: DrizzleDb) {}

  async exists(userId: string, questionId: string): Promise<boolean> {
    const row = await this.db.query.bookmarks.findFirst({
      where: and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.questionId, questionId),
      ),
    });
    return !!row;
  }

  async add(userId: string, questionId: string) {
    const [inserted] = await this.db
      .insert(bookmarks)
      .values({ userId, questionId })
      .onConflictDoNothing({ target: [bookmarks.userId, bookmarks.questionId] })
      .returning();

    if (inserted) {
      return {
        userId: inserted.userId,
        questionId: inserted.questionId,
        createdAt: inserted.createdAt,
      };
    }

    const existing = await this.db.query.bookmarks.findFirst({
      where: and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.questionId, questionId),
      ),
    });

    if (!existing) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to insert bookmark (missing after conflict)',
      );
    }

    return {
      userId: existing.userId,
      questionId: existing.questionId,
      createdAt: existing.createdAt,
    };
  }

  async remove(userId: string, questionId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(bookmarks)
      .where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.questionId, questionId)),
      )
      .returning({ questionId: bookmarks.questionId });

    return deleted.length > 0;
  }

  async listByUserId(userId: string) {
    const rows = await this.db.query.bookmarks.findMany({
      where: eq(bookmarks.userId, userId),
      orderBy: desc(bookmarks.createdAt),
    });

    return rows.map((row) => ({
      userId: row.userId,
      questionId: row.questionId,
      createdAt: row.createdAt,
    }));
  }
}
