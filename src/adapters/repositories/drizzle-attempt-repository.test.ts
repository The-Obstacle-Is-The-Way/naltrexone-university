import { drizzle } from 'drizzle-orm/postgres-js';
import { PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { answeredOutcome } from '@/src/domain/value-objects';
import { DrizzleAttemptRepository } from './drizzle-attempt-repository';

const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();
const input = {
  userId,
  questionId,
  practiceSessionId: null,
  outcome: answeredOutcome(selectedChoiceId),
  isCorrect: true,
  timeSpentSeconds: 12,
};
const repo = new DrizzleAttemptRepository(drizzle.mock({ schema }));

// Only impossible driver-response/error translation belongs here. The real
// prepared-query boundary supplies the fault; SQL behavior is covered in
// tests/integration/attempt-repository-reads-writes.integration.test.ts.
beforeEach(() => {
  vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DrizzleAttemptRepository error translation', () => {
  it('throws INTERNAL_ERROR when insert returns no row', async () => {
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockResolvedValueOnce(
      [],
    );
    const result = repo.insert(input);
    await expect(result).rejects.toBeInstanceOf(ApplicationError);
    await expect(result).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it.each(['insert', 'findByUserId'] as const)(
    'throws INTERNAL_ERROR when %s returns an answered row without a selected choice',
    async (operation) => {
      const corruptedRow = {
        id: crypto.randomUUID(),
        userId,
        questionId,
        practiceSessionId: null,
        selectedChoiceId: null,
        isOmitted: false,
        isCorrect: false,
        timeSpentSeconds: 12,
        answeredAt: new Date('2026-01-01T00:00:00Z'),
        retryOfAttemptId: null,
        retryOrigin: null,
        retrySessionId: null,
      } satisfies typeof schema.attempts.$inferSelect;
      vi.mocked(
        PostgresJsPreparedQuery.prototype.execute,
      ).mockResolvedValueOnce([corruptedRow]);
      const result =
        operation === 'insert'
          ? repo.insert(input)
          : repo.findByUserId(userId, { limit: 10, offset: 0 });
      await expect(result).rejects.toBeInstanceOf(ApplicationError);
      await expect(result).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    },
  );

  it('wraps unique violations from other constraints in INTERNAL_ERROR with cause', async () => {
    const cause = { code: '23505', constraint: 'some_other_unique_constraint' };
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      cause,
    );
    const result = repo.insert(input);
    await expect(result).rejects.toBeInstanceOf(ApplicationError);
    await expect(result).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to insert attempt',
    });
    const error = await result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApplicationError);
    if (!(error instanceof ApplicationError))
      throw new Error('Expected ApplicationError');
    expect(error.cause).toBe(cause);
  });

  it('wraps unexpected insert errors in INTERNAL_ERROR with cause', async () => {
    const cause = new Error('db unavailable');
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      cause,
    );
    const result = repo.insert(input);
    await expect(result).rejects.toBeInstanceOf(ApplicationError);
    await expect(result).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to insert attempt',
    });
    const error = await result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApplicationError);
    if (!(error instanceof ApplicationError))
      throw new Error('Expected ApplicationError');
    expect(error.cause).toBe(cause);
  });
});
