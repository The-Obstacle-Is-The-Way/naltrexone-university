import { and, desc, eq } from 'drizzle-orm';
import { questionFeedback } from '@/db/schema';
import {
  ApplicationConflictReasons,
  ApplicationError,
} from '@/src/application/errors';
import type {
  QuestionFeedbackRecordOptions,
  QuestionFeedbackRepository,
} from '@/src/application/ports/repositories';
import type {
  NewQuestionFeedback,
  QuestionRatingFeedback,
} from '@/src/domain/entities';
import type { DrizzleDb } from '../shared/database-types';
import { toQuestionFeedbackDomain } from './question-feedback-row-mappers';

/**
 * A replayed row must correspond to the same logical request: the token
 * dedupes retries of ONE intent, not reuse across questions or payloads.
 * A mismatch is surfaced as a typed conflict so callers can mint a fresh
 * key instead of silently absorbing another request's outcome.
 */
function assertReplayMatchesRequest(
  row: (typeof questionFeedback)['$inferSelect'],
  event: NewQuestionFeedback,
): void {
  const matches =
    row.questionId === event.questionId &&
    (event.kind === 'rating'
      ? row.rating === event.rating
      : row.category === event.category && row.comment === event.comment);
  if (matches) return;

  throw new ApplicationError(
    'CONFLICT',
    'Feedback request token was reused with a different request',
    undefined,
    {
      details: { reason: ApplicationConflictReasons.FeedbackRequestReused },
    },
  );
}

export class DrizzleQuestionFeedbackRepository
  implements QuestionFeedbackRepository
{
  constructor(private readonly db: DrizzleDb) {}

  async record(
    event: NewQuestionFeedback,
    options?: QuestionFeedbackRecordOptions,
  ) {
    let row: (typeof questionFeedback)['$inferSelect'] | undefined;
    try {
      const values = {
        userId: event.userId,
        questionId: event.questionId,
        attemptId: event.attemptId,
        practiceSessionId: event.practiceSessionId,
        kind: event.kind,
        rating: event.rating,
        category: event.category,
        comment: event.comment,
        ...(options?.idempotencyKey
          ? { idempotencyKey: options.idempotencyKey }
          : {}),
      };

      if (options?.idempotencyKey) {
        [row] = await this.db
          .insert(questionFeedback)
          .values(values)
          .onConflictDoNothing({
            target: [
              questionFeedback.userId,
              questionFeedback.kind,
              questionFeedback.idempotencyKey,
            ],
          })
          .returning();

        row ??= await this.db.query.questionFeedback.findFirst({
          where: and(
            eq(questionFeedback.userId, event.userId),
            eq(questionFeedback.kind, event.kind),
            eq(questionFeedback.idempotencyKey, options.idempotencyKey),
          ),
        });
      } else {
        [row] = await this.db
          .insert(questionFeedback)
          .values(values)
          .returning();
      }
    } catch (error) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to insert question feedback',
        undefined,
        { cause: error },
      );
    }

    if (!row) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to insert question feedback',
      );
    }

    assertReplayMatchesRequest(row, event);

    return toQuestionFeedbackDomain(row);
  }

  async findLatestRatingByUser(
    userId: string,
    questionId: string,
  ): Promise<QuestionRatingFeedback | null> {
    let row: (typeof questionFeedback)['$inferSelect'] | undefined;
    try {
      row = await this.db.query.questionFeedback.findFirst({
        where: and(
          eq(questionFeedback.userId, userId),
          eq(questionFeedback.questionId, questionId),
          eq(questionFeedback.kind, 'rating'),
        ),
        orderBy: [desc(questionFeedback.createdAt), desc(questionFeedback.id)],
      });
    } catch (error) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to load latest question rating',
        undefined,
        { cause: error },
      );
    }

    if (!row) return null;

    const mapped = toQuestionFeedbackDomain(row);
    if (mapped.kind !== 'rating') {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Invalid question feedback row',
      );
    }

    return mapped;
  }
}
