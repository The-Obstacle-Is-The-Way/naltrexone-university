import { and, desc, eq, sql } from 'drizzle-orm';
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
    const [row] = await this.db
      .insert(bookmarks)
      .values({ userId, questionId })
      .onConflictDoUpdate({
        target: [bookmarks.userId, bookmarks.questionId],
        set: { createdAt: sql`${bookmarks.createdAt}` },
      })
      .returning();

    if (!row) {
      throw new ApplicationError('INTERNAL_ERROR', 'Failed to insert bookmark');
    }

    return {
      userId: row.userId,
      questionId: row.questionId,
      createdAt: row.createdAt,
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
