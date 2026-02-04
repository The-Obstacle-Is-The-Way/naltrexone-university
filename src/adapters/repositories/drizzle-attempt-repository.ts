import { and, desc, eq, gte, inArray, max, sql } from 'drizzle-orm';
import { attempts } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  AttemptMostRecentAnsweredAt,
  AttemptRepository,
  MissedQuestionAttempt,
  PageOptions,
} from '@/src/application/ports/repositories';
import type { Attempt } from '@/src/domain/entities';
import type { DrizzleDb } from '../shared/database-types';

export class DrizzleAttemptRepository implements AttemptRepository {
  constructor(private readonly db: DrizzleDb) {}

  private requireSelectedChoiceId(row: {
    id?: string | null;
    selectedChoiceId?: string | null;
  }): string {
    if (!row.selectedChoiceId) {
      const idPart = row.id ? ` ${row.id}` : '';
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Attempt${idPart} selectedChoiceId must not be null`,
      );
    }

    return row.selectedChoiceId;
  }

  private toDomain(row: {
    id: string;
    userId: string;
    questionId: string;
    practiceSessionId: string | null;
    selectedChoiceId: string | null;
    isCorrect: boolean;
    timeSpentSeconds: number;
    answeredAt: Date;
  }): Attempt {
    const selectedChoiceId = this.requireSelectedChoiceId(row);

    return {
      id: row.id,
      userId: row.userId,
      questionId: row.questionId,
      practiceSessionId: row.practiceSessionId ?? null,
      selectedChoiceId,
      isCorrect: row.isCorrect,
      timeSpentSeconds: row.timeSpentSeconds,
      answeredAt: row.answeredAt,
    };
  }

  async insert(input: {
    userId: string;
    questionId: string;
    practiceSessionId: string | null;
    selectedChoiceId: string;
    isCorrect: boolean;
    timeSpentSeconds: number;
  }) {
    const [row] = await this.db
      .insert(attempts)
      .values({
        userId: input.userId,
        questionId: input.questionId,
        practiceSessionId: input.practiceSessionId,
        selectedChoiceId: input.selectedChoiceId,
        isCorrect: input.isCorrect,
        timeSpentSeconds: input.timeSpentSeconds,
      })
      .returning();

    if (!row) {
      throw new ApplicationError('INTERNAL_ERROR', 'Failed to insert attempt');
    }

    return this.toDomain(row);
  }

  async findByUserId(
    userId: string,
    page: PageOptions,
  ): Promise<readonly Attempt[]> {
    const limit = Number.isFinite(page.limit) ? Math.floor(page.limit) : 0;
    const offset = Number.isFinite(page.offset) ? Math.floor(page.offset) : 0;

    const safeLimit = Math.max(0, limit);
    if (safeLimit === 0) return [];

    const safeOffset = Math.max(0, offset);

    const rows = await this.db.query.attempts.findMany({
      where: eq(attempts.userId, userId),
      orderBy: desc(attempts.answeredAt),
      limit: safeLimit,
      offset: safeOffset,
    });

    return rows.map((row) => this.toDomain(row));
  }

  async findBySessionId(sessionId: string, userId: string) {
    const rows = await this.db.query.attempts.findMany({
      where: and(
        eq(attempts.practiceSessionId, sessionId),
        eq(attempts.userId, userId),
      ),
      orderBy: desc(attempts.answeredAt),
    });

    return rows.map((row) => this.toDomain(row));
  }

  async countByUserId(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(attempts)
      .where(eq(attempts.userId, userId));

    return row?.count ?? 0;
  }

  async countCorrectByUserId(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.isCorrect, true)));

    return row?.count ?? 0;
  }

  async countByUserIdSince(userId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), gte(attempts.answeredAt, since)));

    return row?.count ?? 0;
  }

  async countCorrectByUserIdSince(
    userId: string,
    since: Date,
  ): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(attempts)
      .where(
        and(
          eq(attempts.userId, userId),
          eq(attempts.isCorrect, true),
          gte(attempts.answeredAt, since),
        ),
      );

    return row?.count ?? 0;
  }

  async listRecentByUserId(
    userId: string,
    limit: number,
  ): Promise<readonly Attempt[]> {
    const rows = await this.db.query.attempts.findMany({
      where: eq(attempts.userId, userId),
      orderBy: desc(attempts.answeredAt),
      limit,
    });

    return rows.map((row) => this.toDomain(row));
  }

  async listAnsweredAtByUserIdSince(
    userId: string,
    since: Date,
  ): Promise<readonly Date[]> {
    const rows = await this.db.query.attempts.findMany({
      columns: { answeredAt: true },
      where: and(eq(attempts.userId, userId), gte(attempts.answeredAt, since)),
      orderBy: desc(attempts.answeredAt),
    });

    return rows.map((row) => row.answeredAt);
  }

  async listMissedQuestionsByUserId(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<readonly MissedQuestionAttempt[]> {
    const latestAttemptByQuestion = this.db
      .select({
        questionId: attempts.questionId,
        answeredAt: max(attempts.answeredAt).as('max_answered_at'),
      })
      .from(attempts)
      .where(eq(attempts.userId, userId))
      .groupBy(attempts.questionId)
      .as('latest_attempt_by_question');

    const rows = await this.db
      .select({
        questionId: latestAttemptByQuestion.questionId,
        answeredAt: latestAttemptByQuestion.answeredAt,
      })
      .from(latestAttemptByQuestion)
      .innerJoin(
        attempts,
        and(
          eq(attempts.userId, userId),
          eq(attempts.questionId, latestAttemptByQuestion.questionId),
          eq(attempts.answeredAt, latestAttemptByQuestion.answeredAt),
        ),
      )
      .where(eq(attempts.isCorrect, false))
      .orderBy(desc(latestAttemptByQuestion.answeredAt))
      .limit(limit)
      .offset(offset);

    const result: MissedQuestionAttempt[] = [];
    for (const row of rows) {
      if (!row.answeredAt) continue;
      result.push({ questionId: row.questionId, answeredAt: row.answeredAt });
    }

    return result;
  }

  async findMostRecentAnsweredAtByQuestionIds(
    userId: string,
    questionIds: readonly string[],
  ): Promise<readonly AttemptMostRecentAnsweredAt[]> {
    if (questionIds.length === 0) return [];

    const rows = await this.db
      .select({
        questionId: attempts.questionId,
        answeredAt: max(attempts.answeredAt).as('answered_at'),
      })
      .from(attempts)
      .where(
        and(
          eq(attempts.userId, userId),
          inArray(attempts.questionId, [...questionIds]),
        ),
      )
      .groupBy(attempts.questionId);

    const result: AttemptMostRecentAnsweredAt[] = [];
    for (const row of rows) {
      if (!row.answeredAt) continue;
      result.push({ questionId: row.questionId, answeredAt: row.answeredAt });
    }

    return result;
  }
}
