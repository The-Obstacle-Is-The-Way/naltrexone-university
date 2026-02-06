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
import type {
  PracticeSession,
  PracticeSessionQuestionState,
} from '@/src/domain/entities';
import type { DrizzleDb } from '../shared/database-types';

const questionDifficultySchema = z.enum(['easy', 'medium', 'hard']);

const practiceSessionQuestionStateSchema = z
  .object({
    questionId: z.string().min(1),
    markedForReview: z.boolean(),
    latestSelectedChoiceId: z.string().min(1).nullable(),
    latestIsCorrect: z.boolean().nullable(),
    latestAnsweredAt: z.string().datetime().nullable(),
  })
  .strict();

const practiceSessionParamsSchema = z
  .object({
    count: z.number().int().min(1).max(MAX_PRACTICE_SESSION_QUESTIONS),
    tagSlugs: z.array(z.string().min(1)).max(MAX_PRACTICE_SESSION_TAG_FILTERS),
    difficulties: z
      .array(questionDifficultySchema)
      .max(MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS),
    questionIds: z.array(z.string().min(1)).max(MAX_PRACTICE_SESSION_QUESTIONS),
    questionStates: z
      .array(practiceSessionQuestionStateSchema)
      .max(MAX_PRACTICE_SESSION_QUESTIONS)
      .optional(),
  })
  .strict();

type PracticeSessionRow = typeof practiceSessions.$inferSelect;
type PracticeSessionParams = z.infer<typeof practiceSessionParamsSchema>;
type PersistedQuestionState = z.infer<
  typeof practiceSessionQuestionStateSchema
>;
type NormalizedPracticeSessionParams = Omit<
  PracticeSessionParams,
  'questionStates'
> & {
  questionStates: PersistedQuestionState[];
};
const UPDATE_QUESTION_STATE_MAX_RETRIES = 3;

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

  private normalizeParams(
    params: PracticeSessionParams,
  ): NormalizedPracticeSessionParams {
    const expectedQuestionIds = new Set(params.questionIds);
    const orphanQuestionIds = (params.questionStates ?? [])
      .filter((state) => !expectedQuestionIds.has(state.questionId))
      .map((state) => state.questionId);
    if (orphanQuestionIds.length > 0) {
      console.warn(
        'DrizzlePracticeSessionRepository.normalizeParams: orphaned questionStates dropped',
        {
          orphanCount: orphanQuestionIds.length,
          orphanQuestionIds,
        },
      );
    }

    const byQuestionId = new Map(
      (params.questionStates ?? []).map((state) => [state.questionId, state]),
    );

    return {
      ...params,
      questionStates: params.questionIds.map((questionId) => {
        const existing = byQuestionId.get(questionId);
        if (existing) return existing;

        return {
          questionId,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        };
      }),
    };
  }

  private toDomainQuestionState(
    state: PersistedQuestionState,
  ): PracticeSessionQuestionState {
    return {
      questionId: state.questionId,
      markedForReview: state.markedForReview,
      latestSelectedChoiceId: state.latestSelectedChoiceId,
      latestIsCorrect: state.latestIsCorrect,
      latestAnsweredAt: state.latestAnsweredAt
        ? new Date(state.latestAnsweredAt)
        : null,
    };
  }

  private serializeQuestionState(
    state: PracticeSessionQuestionState,
  ): PersistedQuestionState {
    return {
      questionId: state.questionId,
      markedForReview: state.markedForReview,
      latestSelectedChoiceId: state.latestSelectedChoiceId,
      latestIsCorrect: state.latestIsCorrect,
      latestAnsweredAt: state.latestAnsweredAt
        ? state.latestAnsweredAt.toISOString()
        : null,
    };
  }

  private toParamsJson(
    session: PracticeSession,
  ): NormalizedPracticeSessionParams {
    return {
      count: session.questionIds.length,
      tagSlugs: [...session.tagFilters],
      difficulties: [...session.difficultyFilters],
      questionIds: [...session.questionIds],
      questionStates: session.questionStates.map((state) =>
        this.serializeQuestionState(state),
      ),
    };
  }

  private toDomain(
    row: PracticeSessionRow,
    params: NormalizedPracticeSessionParams,
  ): PracticeSession {
    return {
      id: row.id,
      userId: row.userId,
      mode: row.mode,
      questionIds: params.questionIds,
      questionStates: params.questionStates.map((state) =>
        this.toDomainQuestionState(state),
      ),
      tagFilters: params.tagSlugs,
      difficultyFilters: params.difficulties,
      startedAt: row.startedAt,
      endedAt: row.endedAt ?? null,
    };
  }

  private async updateQuestionState(
    input: {
      sessionId: string;
      userId: string;
      questionId: string;
    },
    updateFn: (
      current: PracticeSessionQuestionState,
    ) => PracticeSessionQuestionState,
    failureMessage: string,
  ): Promise<PracticeSessionQuestionState> {
    for (
      let attempt = 0;
      attempt < UPDATE_QUESTION_STATE_MAX_RETRIES;
      attempt += 1
    ) {
      const existing = await this.findByIdAndUserId(
        input.sessionId,
        input.userId,
      );
      if (!existing) {
        throw new ApplicationError('NOT_FOUND', 'Practice session not found');
      }
      if (existing.endedAt) {
        throw new ApplicationError(
          'CONFLICT',
          'Practice session already ended',
        );
      }

      const found = existing.questionStates.find(
        (state) => state.questionId === input.questionId,
      );
      if (!found) {
        throw new ApplicationError(
          'NOT_FOUND',
          'Question is not part of this practice session',
        );
      }

      const updatedState = updateFn(found);
      const nextSession: PracticeSession = {
        ...existing,
        questionStates: existing.questionStates.map((state) =>
          state.questionId === input.questionId ? updatedState : state,
        ),
      };
      const expectedParamsJson = this.toParamsJson(existing);
      const nextParamsJson = this.toParamsJson(nextSession);

      const [updated] = await this.db
        .update(practiceSessions)
        .set({ paramsJson: nextParamsJson })
        .where(
          and(
            eq(practiceSessions.id, input.sessionId),
            eq(practiceSessions.userId, input.userId),
            isNull(practiceSessions.endedAt),
            eq(practiceSessions.paramsJson, expectedParamsJson),
          ),
        )
        .returning({ id: practiceSessions.id });

      if (updated) {
        return updatedState;
      }
    }

    const current = await this.findByIdAndUserId(input.sessionId, input.userId);
    if (!current) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }
    if (current.endedAt) {
      throw new ApplicationError('CONFLICT', 'Practice session already ended');
    }

    throw new ApplicationError('INTERNAL_ERROR', failureMessage);
  }

  async findByIdAndUserId(id: string, userId: string) {
    const row = await this.db.query.practiceSessions.findFirst({
      where: and(
        eq(practiceSessions.id, id),
        eq(practiceSessions.userId, userId),
      ),
    });

    if (!row) return null;

    const params = this.normalizeParams(
      this.parseParams(row.paramsJson, 'INTERNAL_ERROR'),
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

    const params = this.normalizeParams(
      this.parseParams(row.paramsJson, 'INTERNAL_ERROR'),
    );
    return this.toDomain(row, params);
  }

  async create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown;
  }) {
    const params = this.normalizeParams(
      this.parseParams(input.paramsJson, 'VALIDATION_ERROR'),
    );

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

  async recordQuestionAnswer(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    selectedChoiceId: string;
    isCorrect: boolean;
    answeredAt: Date;
  }): Promise<PracticeSessionQuestionState> {
    return this.updateQuestionState(
      input,
      (current) => ({
        ...current,
        latestSelectedChoiceId: input.selectedChoiceId,
        latestIsCorrect: input.isCorrect,
        latestAnsweredAt: input.answeredAt,
      }),
      'Failed to persist practice session answer state',
    );
  }

  async setQuestionMarkedForReview(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    markedForReview: boolean;
  }): Promise<PracticeSessionQuestionState> {
    return this.updateQuestionState(
      input,
      (current) => ({
        ...current,
        markedForReview: input.markedForReview,
      }),
      'Failed to persist practice session review mark',
    );
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
