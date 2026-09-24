import { drizzle } from 'drizzle-orm/postgres-js';
import { PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { newQuestionRatingFeedback } from '@/src/domain/entities';
import { DrizzleQuestionFeedbackRepository } from './drizzle-question-feedback-repository';

const repo = new DrizzleQuestionFeedbackRepository(drizzle.mock({ schema }));
const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();

// Only driver responses that real Postgres cannot produce belong here; the
// real prepared-query boundary supplies them. Recording, replay and latest
// rating behavior is covered against real Postgres in
// tests/integration/question-feedback-repository.integration.test.ts.
beforeEach(() => {
  vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DrizzleQuestionFeedbackRepository error translation', () => {
  it('throws INTERNAL_ERROR when the insert returns no rows', async () => {
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockResolvedValueOnce(
      [],
    );

    const promise = repo.record(
      newQuestionRatingFeedback({
        userId,
        questionId,
        attemptId: 'attempt-1',
        practiceSessionId: 'session-1',
        rating: 'helpful',
      }),
    );
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to insert question feedback',
    });
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
  });

  it('throws INTERNAL_ERROR with the cause when the latest-rating read fails', async () => {
    const databaseError = new Error('boom');
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      databaseError,
    );

    const promise = repo.findLatestRatingByUser(userId, questionId);
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to load latest question rating',
      cause: databaseError,
    });
  });
});
