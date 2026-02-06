import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { practiceSessions } from '@/db/schema';
import {
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,
  MAX_PRACTICE_SESSION_QUESTIONS,
  MAX_PRACTICE_SESSION_TAG_FILTERS,
} from '@/src/adapters/shared/validation-limits';
import {
  ApplicationError,
  type ApplicationErrorCode,
} from '@/src/application/errors';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';
import type { PracticeSession } from '@/src/domain/entities';
import type { DrizzleDb } from '../shared/database-types';

const questionDifficultySchema = z.enum(['easy', 'medium', 'hard']);

const practiceSessionParamsSchema = z
  .object({
    count: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
    tagSlugs: z.array(z.string().min(1)).max(MAX_PRACTICE_SESSION_TAG_FILTERS),
    difficulties: z
      .array(questionDifficultySchema)
      .max(MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS),
    questionIds: z.array(z.string().min(1)).max(MAX_PRACTICE_SESSION_QUESTIONS),
  })
  .strict();

type PracticeSessionRow = typeof practiceSessions.$inferSelect;
type PracticeSessionParams = z.infer<typeof practiceSessionParamsSchema>;

export class DrizzlePracticeSessionRepository
  implements PracticeSessionRepository
{
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private parseParams(
    paramsJson: unknown,
    errorCode: ApplicationErrorCode,
  ): PracticeSessionParams {
    try {
      return practiceSessionParamsSchema.parse(paramsJson);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const cleanedFieldErrors: Record<string, string[]> = {};
        for (const [field, messages] of Object.entries(
          error.flatten().fieldErrors,
        )) {
          if (messages) cleanedFieldErrors[field] = messages;
        }

        throw new ApplicationError(
          errorCode,
          `Invalid practice session parameters: ${error.message}`,
          cleanedFieldErrors,
        );
      }
      throw error;
    }
  }

  private toDomain(
    row: PracticeSessionRow,
    params: PracticeSessionParams,
  ): PracticeSession {
    return {
      id: row.id,
      userId: row.userId,
      mode: row.mode,
      questionIds: params.questionIds,
      tagFilters: params.tagSlugs,
      difficultyFilters: params.difficulties,
      startedAt: row.startedAt,
      endedAt: row.endedAt ?? null,
    };
  }

  async findByIdAndUserId(id: string, userId: string) {
    const row = await this.db.query.practiceSessions.findFirst({
      where: and(
        eq(practiceSessions.id, id),
        eq(practiceSessions.userId, userId),
      ),
    });

    if (!row) return null;

    const params = this.parseParams(row.paramsJson, 'INTERNAL_ERROR');
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

    const params = this.parseParams(row.paramsJson, 'INTERNAL_ERROR');
    return this.toDomain(row, params);
  }

  async create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown;
  }) {
    const params = this.parseParams(input.paramsJson, 'VALIDATION_ERROR');

    const [row] = await this.db
      .insert(practiceSessions)
      .values({
        userId: input.userId,
        mode: input.mode,
        paramsJson: params,
      })
      .returning();

    if (!row) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to create practice session',
      );
    }

    return this.toDomain(row, params);
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

    return { ...existing, endedAt };
  }
}
