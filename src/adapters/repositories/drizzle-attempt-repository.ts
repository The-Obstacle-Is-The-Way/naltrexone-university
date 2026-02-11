import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  max,
  type SQL,
  sql,
} from 'drizzle-orm';
import {
  ATTEMPTS_SESSION_QUESTION_UQ,
  attempts,
  practiceSessions,
} from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  AttemptedQuestionSummary,
  AttemptedQuestionsFilters,
  AttemptMostRecentAnsweredAt,
  AttemptRepository,
  PageOptions,
  RecentAttempt,
} from '@/src/application/ports/repositories';
import type { Attempt } from '@/src/domain/entities';
import type { DrizzleDb } from '../shared/database-types';
import { toAttemptDomain, toRecentAttempt } from './attempt-row-mappers';
import {
  getPostgresConstraintName,
  isPostgresUniqueViolation,
} from './postgres-errors';

export class DrizzleAttemptRepository implements AttemptRepository {
  constructor(private readonly db: DrizzleDb) {}

  private latestAttemptRowsSubquery(userId: string) {
    return this.db
      .select({
        questionId: attempts.questionId,
        answeredAt: attempts.answeredAt,
        practiceSessionId: attempts.practiceSessionId,
        isCorrect: attempts.isCorrect,
        attemptRank:
          sql<number>`row_number() over (partition by ${attempts.questionId} order by ${attempts.answeredAt} desc, ${attempts.id} desc)`.as(
            'attempt_rank',
          ),
      })
      .from(attempts)
      .where(eq(attempts.userId, userId))
      .as('latest_attempt_rows');
  }

  private buildAttemptedQuestionsConditions(
    latestAttemptRows: ReturnType<
      DrizzleAttemptRepository['latestAttemptRowsSubquery']
    >,
    filters?: AttemptedQuestionsFilters,
  ): SQL[] {
    const conditions: SQL[] = [eq(latestAttemptRows.attemptRank, 1)];

    const resultFilter = filters?.result ?? null;
    if (resultFilter === 'correct') {
      conditions.push(eq(latestAttemptRows.isCorrect, true));
    }
    if (resultFilter === 'incorrect') {
      conditions.push(eq(latestAttemptRows.isCorrect, false));
    }

    const sourceFilter = filters?.source ?? null;
    if (sourceFilter === 'adhoc') {
      conditions.push(isNull(latestAttemptRows.practiceSessionId));
    }
    // The `practiceSessions.mode` filter requires the `leftJoin(practiceSessions, ...)` below.
    if (sourceFilter === 'tutor' || sourceFilter === 'exam') {
      conditions.push(eq(practiceSessions.mode, sourceFilter));
    }

    return conditions;
  }

  async insert(input: {
    userId: string;
    questionId: string;
    practiceSessionId: string | null;
    selectedChoiceId: string;
    isCorrect: boolean;
    timeSpentSeconds: number;
  }) {
    let row: (typeof attempts)['$inferSelect'] | undefined;
    try {
      [row] = await this.db
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
    } catch (error) {
      if (
        isPostgresUniqueViolation(error) &&
        getPostgresConstraintName(error) === ATTEMPTS_SESSION_QUESTION_UQ
      ) {
        throw new ApplicationError(
          'CONFLICT',
          'This question has already been answered in this session',
        );
      }
      throw error;
    }

    if (!row) {
      throw new ApplicationError('INTERNAL_ERROR', 'Failed to insert attempt');
    }

    return toAttemptDomain(row);
  }

  async deleteById(id: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(attempts)
      .where(and(eq(attempts.id, id), eq(attempts.userId, userId)))
      .returning({ id: attempts.id });

    return deleted.length > 0;
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

    return rows.map((row) => toAttemptDomain(row));
  }

  async findBySessionId(sessionId: string, userId: string) {
    const rows = await this.db.query.attempts.findMany({
      where: and(
        eq(attempts.practiceSessionId, sessionId),
        eq(attempts.userId, userId),
      ),
      orderBy: desc(attempts.answeredAt),
    });

    return rows.map((row) => toAttemptDomain(row));
  }

  private async countWhere(
    userId: string,
    ...conditions: SQL[]
  ): Promise<number> {
    const where =
      conditions.length === 0
        ? eq(attempts.userId, userId)
        : and(eq(attempts.userId, userId), ...conditions);

    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(attempts)
      .where(where);

    return row?.count ?? 0;
  }

  async countByUserId(userId: string): Promise<number> {
    return this.countWhere(userId);
  }

  async countCorrectByUserId(userId: string): Promise<number> {
    return this.countWhere(userId, eq(attempts.isCorrect, true));
  }

  async countByUserIdSince(userId: string, since: Date): Promise<number> {
    return this.countWhere(userId, gte(attempts.answeredAt, since));
  }

  async countCorrectByUserIdSince(
    userId: string,
    since: Date,
  ): Promise<number> {
    return this.countWhere(
      userId,
      eq(attempts.isCorrect, true),
      gte(attempts.answeredAt, since),
    );
  }

  async listRecentByUserId(
    userId: string,
    limit: number,
  ): Promise<readonly RecentAttempt[]> {
    const rows = await this.db
      .select({
        id: attempts.id,
        userId: attempts.userId,
        questionId: attempts.questionId,
        practiceSessionId: attempts.practiceSessionId,
        selectedChoiceId: attempts.selectedChoiceId,
        isCorrect: attempts.isCorrect,
        timeSpentSeconds: attempts.timeSpentSeconds,
        answeredAt: attempts.answeredAt,
        sessionMode: practiceSessions.mode,
      })
      .from(attempts)
      .leftJoin(
        practiceSessions,
        eq(attempts.practiceSessionId, practiceSessions.id),
      )
      .where(eq(attempts.userId, userId))
      .orderBy(desc(attempts.answeredAt), desc(attempts.id))
      .limit(limit);

    return rows.map((row) => toRecentAttempt(row));
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

  async listAttemptedQuestionsByUserId(
    userId: string,
    limit: number,
    offset: number,
    filters?: AttemptedQuestionsFilters,
  ): Promise<readonly AttemptedQuestionSummary[]> {
    const latestAttemptRows = this.latestAttemptRowsSubquery(userId);
    const conditions = this.buildAttemptedQuestionsConditions(
      latestAttemptRows,
      filters,
    );

    const rows = await this.db
      .select({
        questionId: latestAttemptRows.questionId,
        answeredAt: latestAttemptRows.answeredAt,
        isCorrect: latestAttemptRows.isCorrect,
        sessionId: latestAttemptRows.practiceSessionId,
        sessionMode: practiceSessions.mode,
      })
      .from(latestAttemptRows)
      .leftJoin(
        practiceSessions,
        eq(latestAttemptRows.practiceSessionId, practiceSessions.id),
      )
      .where(and(...conditions))
      .orderBy(
        desc(latestAttemptRows.answeredAt),
        desc(latestAttemptRows.questionId),
      )
      .limit(limit)
      .offset(offset);

    const result: AttemptedQuestionSummary[] = [];
    for (const row of rows) {
      if (!row.answeredAt) continue;
      result.push({
        questionId: row.questionId,
        answeredAt: row.answeredAt,
        isCorrect: row.isCorrect,
        sessionId: row.sessionId,
        sessionMode: row.sessionMode,
      });
    }

    return result;
  }

  async countAttemptedQuestionsByUserId(
    userId: string,
    filters?: AttemptedQuestionsFilters,
  ): Promise<number> {
    const latestAttemptRows = this.latestAttemptRowsSubquery(userId);
    const conditions = this.buildAttemptedQuestionsConditions(
      latestAttemptRows,
      filters,
    );

    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(latestAttemptRows)
      .leftJoin(
        practiceSessions,
        eq(latestAttemptRows.practiceSessionId, practiceSessions.id),
      )
      .where(and(...conditions));

    return row?.count ?? 0;
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
