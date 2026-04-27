import {
  and,
  asc,
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
  questions,
  questionTags,
  tags,
} from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  AttemptedQuestionSummary,
  AttemptedQuestionsFilters,
  AttemptedQuestionsSort,
  AttemptMostRecentAnsweredAt,
  AttemptRepository,
  PageOptions,
  RecentAttempt,
} from '@/src/application/ports/repositories';
import type { Attempt, AttemptRetryOrigin } from '@/src/domain/entities';
import type { DrizzleDb } from '../shared/database-types';
import { toAttemptDomain, toRecentAttempt } from './attempt-row-mappers';
import {
  getPostgresConstraintName,
  isPostgresUniqueViolation,
} from './postgres-errors';
import { getActiveExamVisibilityCondition } from './shared/active-exam-visibility';
import { latestAttemptRankSql } from './shared/latest-attempt-rank-sql';

const SESSION_ATTEMPT_READ_LIMIT = 500;

// WHY: This file exceeds the 300-line soft guideline intentionally.
// DEBT-234 enforces a warning threshold at 350 lines; DEBT-224 keeps 300 as the design guideline.
// It is a deep module (Ousterhout) with a single responsibility: implement the full AttemptRepository query and write surface against Drizzle for attempt/history workflows.
// Splitting would duplicate shared SQL/filter semantics across files and increase risk of inconsistent paging, filtering, and latest-attempt ranking behavior.
// Reviewed in DEBT-224 audit (2026-02-18).
export class DrizzleAttemptRepository implements AttemptRepository {
  constructor(private readonly db: DrizzleDb) {}

  private latestAttemptRowsSubquery(userId: string) {
    return this.db
      .select({
        questionId: attempts.questionId,
        answeredAt: attempts.answeredAt,
        practiceSessionId: attempts.practiceSessionId,
        isCorrect: attempts.isCorrect,
        attemptRank: latestAttemptRankSql({
          questionId: attempts.questionId,
          answeredAt: attempts.answeredAt,
          id: attempts.id,
        }).as('attempt_rank'),
      })
      .from(attempts)
      .leftJoin(
        practiceSessions,
        eq(attempts.practiceSessionId, practiceSessions.id),
      )
      .where(
        and(eq(attempts.userId, userId), getActiveExamVisibilityCondition()),
      )
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

    const difficulty = filters?.difficulty ?? null;
    const tagSlug = filters?.tagSlug ?? null;
    if (difficulty || tagSlug) {
      // Attempted-question difficulty/tags are derived from published question metadata.
      // This matches History's available-row semantics (unpublished questions have no metadata).
      conditions.push(eq(questions.status, 'published'));
    }

    if (difficulty) {
      conditions.push(eq(questions.difficulty, difficulty));
    }

    if (tagSlug) {
      conditions.push(eq(tags.slug, tagSlug));
    }

    return conditions;
  }

  private getAttemptedQuestionsOrderBy(
    latestAttemptRows: ReturnType<
      DrizzleAttemptRepository['latestAttemptRowsSubquery']
    >,
    sort: AttemptedQuestionsSort | null,
  ): SQL[] {
    const byRecency = [
      desc(latestAttemptRows.answeredAt),
      desc(latestAttemptRows.questionId),
    ] as const;

    if (!sort || sort === 'recent') {
      return [...byRecency];
    }

    if (sort === 'incorrect-first') {
      return [
        asc(
          sql<number>`CASE WHEN ${latestAttemptRows.isCorrect} THEN 1 ELSE 0 END`,
        ),
        ...byRecency,
      ];
    }

    if (sort === 'correct-first') {
      return [
        asc(
          sql<number>`CASE WHEN ${latestAttemptRows.isCorrect} THEN 0 ELSE 1 END`,
        ),
        ...byRecency,
      ];
    }

    return [
      asc(sql<number>`CASE
        WHEN ${questions.status} = 'published' AND ${questions.difficulty} = 'hard' THEN 0
        WHEN ${questions.status} = 'published' AND ${questions.difficulty} = 'medium' THEN 1
        ELSE 2
      END`),
      ...byRecency,
    ];
  }

  async insert(input: {
    userId: string;
    questionId: string;
    practiceSessionId: string | null;
    selectedChoiceId: string;
    isCorrect: boolean;
    timeSpentSeconds: number;
    retryOfAttemptId?: string | null;
    retryOrigin?: AttemptRetryOrigin | null;
    retrySessionId?: string | null;
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
          retryOfAttemptId: input.retryOfAttemptId ?? null,
          retryOrigin: input.retryOrigin ?? null,
          retrySessionId: input.retrySessionId ?? null,
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
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to insert attempt',
        undefined,
        { cause: error },
      );
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
    const safeLimit =
      Number.isInteger(page.limit) && page.limit > 0 ? page.limit : 0;
    if (safeLimit === 0) return [];

    const safeOffset = Number.isInteger(page.offset)
      ? Math.max(0, page.offset)
      : 0;

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
      orderBy: [desc(attempts.answeredAt), desc(attempts.id)],
      limit: SESSION_ATTEMPT_READ_LIMIT,
    });

    return rows.map((row) => toAttemptDomain(row));
  }

  async findLatestByUserAndQuestion(
    userId: string,
    questionId: string,
  ): Promise<Attempt | null> {
    const [row] = await this.db
      .select()
      .from(attempts)
      .leftJoin(
        practiceSessions,
        eq(attempts.practiceSessionId, practiceSessions.id),
      )
      .where(
        and(
          eq(attempts.userId, userId),
          eq(attempts.questionId, questionId),
          getActiveExamVisibilityCondition(),
        ),
      )
      .orderBy(desc(attempts.answeredAt), desc(attempts.id))
      .limit(1);

    if (!row) return null;

    return toAttemptDomain(row.attempts);
  }

  async findByIdAndUserId(
    attemptId: string,
    userId: string,
  ): Promise<Attempt | null> {
    const [row] = await this.db
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
      .limit(1);

    return row ? toAttemptDomain(row) : null;
  }

  async findBySessionIdAndQuestionId(
    sessionId: string,
    userId: string,
    questionId: string,
  ): Promise<Attempt | null> {
    const [row] = await this.db
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.practiceSessionId, sessionId),
          eq(attempts.userId, userId),
          eq(attempts.questionId, questionId),
        ),
      )
      .limit(1);

    return row ? toAttemptDomain(row) : null;
  }

  private async countWhere(
    userId: string,
    ...conditions: SQL[]
  ): Promise<number> {
    const where = and(
      eq(attempts.userId, userId),
      getActiveExamVisibilityCondition(),
      ...conditions,
    );

    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(attempts)
      .leftJoin(
        practiceSessions,
        eq(attempts.practiceSessionId, practiceSessions.id),
      )
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
        retryOfAttemptId: attempts.retryOfAttemptId,
        retryOrigin: attempts.retryOrigin,
        retrySessionId: attempts.retrySessionId,
        answeredAt: attempts.answeredAt,
        sessionMode: practiceSessions.mode,
      })
      .from(attempts)
      .leftJoin(
        practiceSessions,
        eq(attempts.practiceSessionId, practiceSessions.id),
      )
      .where(
        and(eq(attempts.userId, userId), getActiveExamVisibilityCondition()),
      )
      .orderBy(desc(attempts.answeredAt), desc(attempts.id))
      .limit(limit);

    return rows.map((row) => toRecentAttempt(row));
  }

  async listAnsweredAtByUserIdSince(
    userId: string,
    since: Date,
  ): Promise<readonly Date[]> {
    const rows = await this.db
      .select({ answeredAt: attempts.answeredAt })
      .from(attempts)
      .leftJoin(
        practiceSessions,
        eq(attempts.practiceSessionId, practiceSessions.id),
      )
      .where(
        and(
          eq(attempts.userId, userId),
          gte(attempts.answeredAt, since),
          getActiveExamVisibilityCondition(),
        ),
      )
      .orderBy(desc(attempts.answeredAt));

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

    const tagSlug = filters?.tagSlug ?? null;
    const sort = filters?.sort ?? null;
    const baseQuery = this.db
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
      .leftJoin(questions, eq(latestAttemptRows.questionId, questions.id));

    const query = tagSlug
      ? baseQuery
          .leftJoin(questionTags, eq(questions.id, questionTags.questionId))
          .leftJoin(tags, eq(questionTags.tagId, tags.id))
      : baseQuery;

    const rows = await query
      .where(and(...conditions))
      .orderBy(...this.getAttemptedQuestionsOrderBy(latestAttemptRows, sort))
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

    const tagSlug = filters?.tagSlug ?? null;
    const baseQuery = this.db
      .select({
        count: sql<number>`count(distinct ${latestAttemptRows.questionId})::int`,
      })
      .from(latestAttemptRows)
      .leftJoin(
        practiceSessions,
        eq(latestAttemptRows.practiceSessionId, practiceSessions.id),
      )
      .leftJoin(questions, eq(latestAttemptRows.questionId, questions.id));

    const query = tagSlug
      ? baseQuery
          .leftJoin(questionTags, eq(questions.id, questionTags.questionId))
          .leftJoin(tags, eq(questionTags.tagId, tags.id))
      : baseQuery;

    const [row] = await query.where(and(...conditions));

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
      .leftJoin(
        practiceSessions,
        eq(attempts.practiceSessionId, practiceSessions.id),
      )
      .where(
        and(
          eq(attempts.userId, userId),
          inArray(attempts.questionId, [...questionIds]),
          getActiveExamVisibilityCondition(),
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
