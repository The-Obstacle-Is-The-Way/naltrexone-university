import { and, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { z } from 'zod';
import type * as schema from '@/db/schema';
import { practiceSessions } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';

type Db = PostgresJsDatabase<typeof schema>;

const questionDifficultySchema = z.enum(['easy', 'medium', 'hard']);

const practiceSessionParamsSchema = z
  .object({
    count: z.number().int().min(1).max(200),
    tagSlugs: z.array(z.string().min(1)).max(50),
    difficulties: z.array(questionDifficultySchema).max(3),
    questionIds: z.array(z.string().min(1)).max(200),
  })
  .strict();

export class DrizzlePracticeSessionRepository
  implements PracticeSessionRepository
{
  constructor(private readonly db: Db) {}

  async findByIdAndUserId(id: string, userId: string) {
    const row = await this.db.query.practiceSessions.findFirst({
      where: and(
        eq(practiceSessions.id, id),
        eq(practiceSessions.userId, userId),
      ),
    });

    if (!row) return null;

    const params = practiceSessionParamsSchema.parse(row.paramsJson);

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

  async create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown;
  }) {
    const params = practiceSessionParamsSchema.parse(input.paramsJson);

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

  async end(id: string, userId: string) {
    const existing = await this.findByIdAndUserId(id, userId);
    if (!existing) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    if (existing.endedAt) {
      throw new ApplicationError('CONFLICT', 'Practice session already ended');
    }

    const endedAt = new Date();
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
        throw new ApplicationError('CONFLICT', 'Practice session already ended');
      }
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to end practice session',
      );
    }

    return { ...existing, endedAt };
  }
}
