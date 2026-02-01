import { and, desc, eq, inArray, max } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { attempts } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  AttemptMostRecentAnsweredAt,
  AttemptRepository,
} from '@/src/application/ports/repositories';

type Db = PostgresJsDatabase<typeof schema>;

export class DrizzleAttemptRepository implements AttemptRepository {
  constructor(private readonly db: Db) {}

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

  async findByUserId(userId: string) {
    const rows = await this.db.query.attempts.findMany({
      where: eq(attempts.userId, userId),
      orderBy: desc(attempts.answeredAt),
    });

    return rows.map((row) => {
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
    });
  }

  async findBySessionId(sessionId: string, userId: string) {
    const rows = await this.db.query.attempts.findMany({
      where: and(
        eq(attempts.practiceSessionId, sessionId),
        eq(attempts.userId, userId),
      ),
      orderBy: desc(attempts.answeredAt),
    });

    return rows.map((row) => {
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
    });
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
