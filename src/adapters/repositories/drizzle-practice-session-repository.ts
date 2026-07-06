// WHY large-file: this repository centralizes practice-session persistence invariants and transaction helpers so session state transitions stay consistent across use cases.
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  PRACTICE_SESSIONS_USER_INCOMPLETE_UQ,
  practiceSessionQuestionStates,
  practiceSessions,
} from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';
import type {
  PracticeSession,
  PracticeSessionQuestionState,
} from '@/src/domain/entities';
import {
  type AnswerOutcome,
  type PracticeMode,
  selectedChoiceIdOrNull,
} from '@/src/domain/value-objects';
import type { DrizzleDb } from '../shared/database-types';
import {
  getPostgresConstraintName,
  isPostgresUniqueViolation,
} from './postgres-errors';
import {
  type PracticeSessionParamsJson,
  parsePracticeSessionParamsJson,
} from './practice-session-params';
import {
  toDomainQuestionState,
  updatePracticeSessionQuestionState,
} from './practice-session-question-state-updater';

type PracticeSessionRow = typeof practiceSessions.$inferSelect;
type PracticeSessionQuestionStateRow =
  typeof practiceSessionQuestionStates.$inferSelect;

class CorruptPracticeSessionRowError extends ApplicationError {
  constructor(cause: ApplicationError) {
    super('INTERNAL_ERROR', cause.message, cause.fieldErrors, { cause });
    this.name = 'CorruptPracticeSessionRowError';
  }
}

export class DrizzlePracticeSessionRepository
  implements PracticeSessionRepository
{
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
    private readonly logger?: Logger,
  ) {}

  private toDomain(
    row: PracticeSessionRow,
    params: PracticeSessionParamsJson,
    questionStateRows: readonly PracticeSessionQuestionStateRow[],
  ): PracticeSession {
    return {
      id: row.id,
      userId: row.userId,
      mode: row.mode,
      questionIds: params.questionIds,
      questionStates: this.toOrderedDomainQuestionStates(
        row.id,
        params,
        questionStateRows,
      ),
      tagFilters: params.tagSlugs,
      difficultyFilters: params.difficulties,
      startedAt: row.startedAt,
      endedAt: row.endedAt ?? null,
    };
  }

  private toOrderedDomainQuestionStates(
    sessionId: string,
    params: PracticeSessionParamsJson,
    rows: readonly PracticeSessionQuestionStateRow[],
  ): PracticeSessionQuestionState[] {
    if (rows.length > params.questionIds.length) {
      throw new CorruptPracticeSessionRowError(
        new ApplicationError(
          'INTERNAL_ERROR',
          `Practice session ${sessionId} has inconsistent normalized question state`,
        ),
      );
    }
    if (rows.length < params.questionIds.length) {
      throw new CorruptPracticeSessionRowError(
        new ApplicationError(
          'INTERNAL_ERROR',
          `Practice session ${sessionId} is missing normalized question state`,
        ),
      );
    }

    const rowsByQuestionId = new Map(rows.map((row) => [row.questionId, row]));
    return params.questionIds.map((questionId, position) => {
      const row = rowsByQuestionId.get(questionId);
      if (!row || row.position !== position) {
        throw new CorruptPracticeSessionRowError(
          new ApplicationError(
            'INTERNAL_ERROR',
            `Practice session ${sessionId} is missing normalized question state`,
          ),
        );
      }
      return toDomainQuestionState(row);
    });
  }

  private async loadQuestionStateRowsBySessionIds(
    db: DrizzleDb,
    sessionIds: readonly string[],
  ): Promise<Map<string, PracticeSessionQuestionStateRow[]>> {
    const rowsBySessionId = new Map<
      string,
      PracticeSessionQuestionStateRow[]
    >();
    if (sessionIds.length === 0) return rowsBySessionId;

    const rows = await db
      .select()
      .from(practiceSessionQuestionStates)
      .where(
        inArray(practiceSessionQuestionStates.practiceSessionId, sessionIds),
      )
      .orderBy(
        asc(practiceSessionQuestionStates.practiceSessionId),
        asc(practiceSessionQuestionStates.position),
      );

    for (const row of rows) {
      const existing = rowsBySessionId.get(row.practiceSessionId);
      if (existing) {
        existing.push(row);
      } else {
        rowsBySessionId.set(row.practiceSessionId, [row]);
      }
    }

    return rowsBySessionId;
  }

  private completedSessionCondition(
    userId: string,
    mode?: PracticeMode | null,
  ) {
    return and(
      eq(practiceSessions.userId, userId),
      isNotNull(practiceSessions.endedAt),
      mode ? eq(practiceSessions.mode, mode) : undefined,
    );
  }

  private async inRepeatableRead<T>(
    action: (db: DrizzleDb) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((tx) => action(tx as unknown as DrizzleDb), {
      isolationLevel: 'repeatable read',
    });
  }

  private async findRowByIdAndUserId(
    db: DrizzleDb,
    id: string,
    userId: string,
  ): Promise<PracticeSessionRow | null> {
    const row = await db.query.practiceSessions.findFirst({
      where: and(
        eq(practiceSessions.id, id),
        eq(practiceSessions.userId, userId),
      ),
    });

    return row ?? null;
  }

  private parsePersistedParamsJson(value: unknown): PracticeSessionParamsJson {
    try {
      return parsePracticeSessionParamsJson(value, 'INTERNAL_ERROR');
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        error.code === 'INTERNAL_ERROR'
      ) {
        throw new CorruptPracticeSessionRowError(error);
      }
      throw error;
    }
  }

  private async toDomainFromRow(
    db: DrizzleDb,
    row: PracticeSessionRow,
  ): Promise<PracticeSession> {
    const params = this.parsePersistedParamsJson(row.paramsJson);
    const stateRowsBySessionId = await this.loadQuestionStateRowsBySessionIds(
      db,
      [row.id],
    );
    return this.toDomain(row, params, stateRowsBySessionId.get(row.id) ?? []);
  }

  private async toDomainFromListRow(
    db: DrizzleDb,
    row: PracticeSessionRow,
  ): Promise<PracticeSession> {
    return this.toDomainFromRow(db, row);
  }

  private toCompletedDomainFromListRow(input: {
    row: PracticeSessionRow;
    stateRows: readonly PracticeSessionQuestionStateRow[];
  }): PracticeSession {
    const params = this.parsePersistedParamsJson(input.row.paramsJson);
    return this.toDomain(input.row, params, input.stateRows);
  }

  private isCorruptPracticeSessionRowError(
    error: unknown,
  ): error is CorruptPracticeSessionRowError {
    return error instanceof CorruptPracticeSessionRowError;
  }

  private logSkippedCorruptPracticeSessionRow(input: {
    row: PracticeSessionRow;
    msg: string;
    mode?: PracticeMode | null;
    error: unknown;
  }): void {
    this.logger?.warn(
      {
        sessionId: input.row.id,
        mode: input.mode ?? null,
        rowMode: input.row.mode,
        error: input.error,
      },
      input.msg,
    );
  }

  private initialQuestionStateRows(input: {
    sessionId: string;
    questionIds: readonly string[];
  }): Array<typeof practiceSessionQuestionStates.$inferInsert> {
    return input.questionIds.map((questionId, position) => ({
      practiceSessionId: input.sessionId,
      questionId,
      position,
      markedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      latestAnsweredAt: null,
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
    }));
  }

  async findByIdAndUserId(id: string, userId: string) {
    return this.inRepeatableRead(async (db) => {
      const row = await this.findRowByIdAndUserId(db, id, userId);
      if (!row) return null;
      return this.toDomainFromRow(db, row);
    });
  }

  async findLatestIncompleteByUserId(
    userId: string,
  ): Promise<PracticeSession | null> {
    return this.inRepeatableRead(async (db) => {
      const row = await db.query.practiceSessions.findFirst({
        where: and(
          eq(practiceSessions.userId, userId),
          isNull(practiceSessions.endedAt),
        ),
        orderBy: (table, { desc }) => [desc(table.startedAt)],
      });

      if (!row) return null;

      try {
        return await this.toDomainFromListRow(db, row);
      } catch (error) {
        if (!this.isCorruptPracticeSessionRowError(error)) {
          throw error;
        }
        this.logSkippedCorruptPracticeSessionRow({
          row,
          msg: 'Skipping corrupt incomplete practice session row',
          error,
        });
        return null;
      }
    });
  }

  async findCompletedByUserId(
    userId: string,
    limit: number,
    offset: number,
    mode?: PracticeMode | null,
  ) {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 0;
    const safeOffset = Number.isInteger(offset) ? Math.max(0, offset) : 0;

    return this.db.transaction(
      async (tx) => {
        const [countRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(practiceSessions)
          .where(this.completedSessionCondition(userId, mode));
        const total = countRow?.count ?? 0;

        if (safeLimit === 0 || total === 0) {
          return { rows: [], total };
        }

        const rows = await tx.query.practiceSessions.findMany({
          where: this.completedSessionCondition(userId, mode),
          orderBy: (table, { desc }) => [
            desc(table.endedAt),
            desc(table.startedAt),
          ],
          limit: safeLimit,
          offset: safeOffset,
        });
        const stateRowsBySessionId =
          await this.loadQuestionStateRowsBySessionIds(
            tx as unknown as DrizzleDb,
            rows.map((row) => row.id),
          );

        const domainRows: PracticeSession[] = [];
        for (const row of rows) {
          try {
            domainRows.push(
              this.toCompletedDomainFromListRow({
                row,
                stateRows: stateRowsBySessionId.get(row.id) ?? [],
              }),
            );
          } catch (error) {
            if (!this.isCorruptPracticeSessionRowError(error)) {
              throw error;
            }
            this.logSkippedCorruptPracticeSessionRow({
              row,
              msg: 'Skipping corrupt completed practice session row',
              mode: mode ?? null,
              error,
            });
          }
        }

        return {
          rows: domainRows,
          total,
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  async create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown;
  }) {
    const params = parsePracticeSessionParamsJson(
      input.paramsJson,
      'VALIDATION_ERROR',
    );

    let created:
      | {
          row: PracticeSessionRow;
          stateRows: PracticeSessionQuestionStateRow[];
          params: PracticeSessionParamsJson;
        }
      | undefined;
    try {
      created = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(practiceSessions)
          .values({
            userId: input.userId,
            mode: input.mode,
            paramsJson: params,
          })
          .returning();

        if (!row) return undefined;

        const stateRows = await tx
          .insert(practiceSessionQuestionStates)
          .values(
            this.initialQuestionStateRows({
              sessionId: row.id,
              questionIds: params.questionIds,
            }),
          )
          .returning();

        return { row, stateRows, params };
      });
    } catch (error) {
      if (
        isPostgresUniqueViolation(error) &&
        getPostgresConstraintName(error) ===
          PRACTICE_SESSIONS_USER_INCOMPLETE_UQ
      ) {
        throw new ApplicationError(
          'CONFLICT',
          'You already have an incomplete practice session. Resume or abandon it before starting a new one.',
        );
      }
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to create practice session',
        undefined,
        { cause: error },
      );
    }

    if (!created) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to create practice session',
      );
    }

    return this.toDomain(created.row, created.params, created.stateRows);
  }

  async recordQuestionAnswer(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    selectedChoiceId: string;
    isCorrect: boolean;
    answeredAt: Date;
  }): Promise<PracticeSessionQuestionState> {
    return updatePracticeSessionQuestionState({
      db: this.db,
      now: this.now,
      sessionId: input.sessionId,
      userId: input.userId,
      questionId: input.questionId,
      updateFn: (current) => ({
        ...current,
        latestSelectedChoiceId: input.selectedChoiceId,
        latestIsCorrect: input.isCorrect,
        latestAnsweredAt: input.answeredAt,
      }),
    });
  }

  async saveDraftAnswer(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    selectedChoiceId: string | null;
    cumulativeMs: number;
  }): Promise<PracticeSessionQuestionState> {
    const savedAt = this.now();

    return updatePracticeSessionQuestionState({
      db: this.db,
      now: this.now,
      sessionId: input.sessionId,
      userId: input.userId,
      questionId: input.questionId,
      updateFn: (current) => {
        if (
          (current.draftSavedAt && current.draftSavedAt > savedAt) ||
          input.cumulativeMs < current.draftCumulativeMs
        ) {
          return current;
        }

        return {
          ...current,
          draftSelectedChoiceId: input.selectedChoiceId,
          draftSavedAt: savedAt,
          draftCumulativeMs: input.cumulativeMs,
        };
      },
    });
  }

  async finalizeDraftAnswer(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    outcome: AnswerOutcome;
    isCorrect: boolean;
    answeredAt: Date;
  }): Promise<PracticeSessionQuestionState> {
    return updatePracticeSessionQuestionState({
      db: this.db,
      now: this.now,
      sessionId: input.sessionId,
      userId: input.userId,
      questionId: input.questionId,
      updateFn: (current) => ({
        ...current,
        latestSelectedChoiceId: selectedChoiceIdOrNull(input.outcome),
        latestIsCorrect: input.isCorrect,
        latestAnsweredAt: input.answeredAt,
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
      }),
    });
  }

  async setQuestionMarkedForReview(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    markedForReview: boolean;
  }): Promise<PracticeSessionQuestionState> {
    return updatePracticeSessionQuestionState({
      db: this.db,
      now: this.now,
      sessionId: input.sessionId,
      userId: input.userId,
      questionId: input.questionId,
      updateFn: (current) => ({
        ...current,
        markedForReview: input.markedForReview,
      }),
    });
  }

  async discard(id: string, userId: string): Promise<void> {
    await this.db.transaction(
      async (tx) => {
        await tx.delete(practiceSessionQuestionStates).where(
          and(
            eq(practiceSessionQuestionStates.practiceSessionId, id),
            sql`exists (
              select 1
              from ${practiceSessions}
              where ${practiceSessions.id} = ${practiceSessionQuestionStates.practiceSessionId}
                and ${practiceSessions.userId} = ${userId}
                and ${practiceSessions.endedAt} is null
            )`,
          ),
        );

        await tx
          .delete(practiceSessions)
          .where(
            and(
              eq(practiceSessions.id, id),
              eq(practiceSessions.userId, userId),
              isNull(practiceSessions.endedAt),
            ),
          );
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  async end(id: string, userId: string, explicitEndedAt?: Date) {
    const existingRow = await this.findRowByIdAndUserId(this.db, id, userId);
    if (!existingRow) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    if (existingRow.endedAt) {
      throw new ApplicationError('CONFLICT', 'Practice session already ended');
    }

    const existingSession = await this.toDomainFromRow(this.db, existingRow);
    const endedAt = explicitEndedAt ?? this.now();
    const [updated] = await this.db
      .update(practiceSessions)
      .set({ endedAt })
      .where(
        and(
          eq(practiceSessions.id, id),
          eq(practiceSessions.userId, userId),
          isNull(practiceSessions.endedAt),
        ),
      )
      .returning();

    if (!updated) {
      const current = await this.findByIdAndUserId(id, userId);
      if (!current) {
        throw new ApplicationError('NOT_FOUND', 'Practice session not found');
      }
      if (current.endedAt) {
        throw new ApplicationError(
          'CONFLICT',
          'Practice session already ended',
        );
      }
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to end practice session',
      );
    }

    return { ...existingSession, endedAt };
  }
}
