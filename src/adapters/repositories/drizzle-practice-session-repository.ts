import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  PRACTICE_SESSIONS_USER_INCOMPLETE_UQ,
  practiceSessions,
} from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';
import type {
  PracticeSession,
  PracticeSessionQuestionState,
} from '@/src/domain/entities';
import type { PracticeMode } from '@/src/domain/value-objects';
import type { DrizzleDb } from '../shared/database-types';
import {
  getPostgresConstraintName,
  isPostgresUniqueViolation,
} from './postgres-errors';
import {
  type NormalizedPracticeSessionParamsJson,
  parsePracticeSessionParamsJson,
  toDomainPracticeSessionQuestionStates,
} from './practice-session-params';
import { updatePracticeSessionQuestionState } from './practice-session-question-state-updater';

type PracticeSessionRow = typeof practiceSessions.$inferSelect;

export class DrizzlePracticeSessionRepository
  implements PracticeSessionRepository
{
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private toDomain(
    row: PracticeSessionRow,
    params: NormalizedPracticeSessionParamsJson,
  ): PracticeSession {
    return {
      id: row.id,
      userId: row.userId,
      mode: row.mode,
      questionIds: params.questionIds,
      questionStates: toDomainPracticeSessionQuestionStates(params),
      tagFilters: params.tagSlugs,
      difficultyFilters: params.difficulties,
      startedAt: row.startedAt,
      endedAt: row.endedAt ?? null,
    };
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

  async findByIdAndUserId(id: string, userId: string) {
    const row = await this.db.query.practiceSessions.findFirst({
      where: and(
        eq(practiceSessions.id, id),
        eq(practiceSessions.userId, userId),
      ),
    });

    if (!row) return null;

    const params = parsePracticeSessionParamsJson(
      row.paramsJson,
      'INTERNAL_ERROR',
    );
    return this.toDomain(row, params);
  }

  async findLatestIncompleteByUserId(
    userId: string,
  ): Promise<PracticeSession | null> {
    const row = await this.db.query.practiceSessions.findFirst({
      where: and(
        eq(practiceSessions.userId, userId),
        isNull(practiceSessions.endedAt),
      ),
      orderBy: (table, { desc }) => [desc(table.startedAt)],
    });

    if (!row) return null;

    const params = parsePracticeSessionParamsJson(
      row.paramsJson,
      'INTERNAL_ERROR',
    );
    return this.toDomain(row, params);
  }

  async findCompletedByUserId(
    userId: string,
    limit: number,
    offset: number,
    mode?: PracticeMode | null,
  ) {
    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(practiceSessions)
      .where(this.completedSessionCondition(userId, mode));
    const total = countRow?.count ?? 0;

    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 0;
    const safeOffset = Number.isInteger(offset) ? Math.max(0, offset) : 0;

    if (safeLimit === 0 || total === 0) {
      return { rows: [], total };
    }

    const rows = await this.db.query.practiceSessions.findMany({
      where: this.completedSessionCondition(userId, mode),
      orderBy: (table, { desc }) => [
        desc(table.endedAt),
        desc(table.startedAt),
      ],
      limit: safeLimit,
      offset: safeOffset,
    });

    return {
      rows: rows.map((row) => {
        const params = parsePracticeSessionParamsJson(
          row.paramsJson,
          'INTERNAL_ERROR',
        );
        return this.toDomain(row, params);
      }),
      total,
    };
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

    let row: PracticeSessionRow | undefined;
    try {
      [row] = await this.db
        .insert(practiceSessions)
        .values({
          userId: input.userId,
          mode: input.mode,
          paramsJson: params,
        })
        .returning();
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
      throw error;
    }

    if (!row) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to create practice session',
      );
    }

    return this.toDomain(row, params);
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
      findByIdAndUserId: this.findByIdAndUserId.bind(this),
      sessionId: input.sessionId,
      userId: input.userId,
      questionId: input.questionId,
      updateFn: (current) => ({
        ...current,
        latestSelectedChoiceId: input.selectedChoiceId,
        latestIsCorrect: input.isCorrect,
        latestAnsweredAt: input.answeredAt,
      }),
      failureMessage: 'Failed to persist practice session answer state',
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
      findByIdAndUserId: this.findByIdAndUserId.bind(this),
      sessionId: input.sessionId,
      userId: input.userId,
      questionId: input.questionId,
      updateFn: (current) => ({
        ...current,
        markedForReview: input.markedForReview,
      }),
      failureMessage: 'Failed to persist practice session review mark',
    });
  }

  async end(id: string, userId: string) {
    const existing = await this.findByIdAndUserId(id, userId);
    if (!existing) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    if (existing.endedAt) {
      throw new ApplicationError('CONFLICT', 'Practice session already ended');
    }

    const endedAt = this.now();
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

    const params = parsePracticeSessionParamsJson(
      updated.paramsJson,
      'INTERNAL_ERROR',
    );
    return this.toDomain(updated, params);
  }
}
