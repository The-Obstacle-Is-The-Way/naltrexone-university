import { PgDatabase } from 'drizzle-orm/pg-core';
import { drizzle, PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { isRollbackCertainPersistenceError } from '@/src/application/errors';
import { installMockTransactionBoundary } from '@/tests/shared/drizzle-mock-transaction';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';

const repo = new DrizzlePracticeSessionRepository(drizzle.mock({ schema }));

function markQuestion() {
  return repo.setQuestionMarkedForReview({
    sessionId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    questionId: crypto.randomUUID(),
    markedForReview: true,
  });
}

// Only statement cancellation (SQLSTATE 57014), which real Postgres cannot
// raise deterministically inside this write, belongs here. The write's
// behavior (not-found, ended-session, missing-state, draft finalization and
// the optimistic retry loop) runs against real Postgres in
// tests/integration/practice-session-question-state-writes.integration.test.ts.
beforeEach(() => {
  installMockTransactionBoundary();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DrizzlePracticeSessionRepository statement cancellation', () => {
  it('classifies transaction-body cancellation as rollback-certain for a mark write', async () => {
    const statementCancellation = new Error('canceling statement', {
      cause: { code: '57014' },
    });
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      statementCancellation,
    );

    const promise = markQuestion();

    await expect(promise).rejects.toSatisfy(isRollbackCertainPersistenceError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: statementCancellation,
    });
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
  });

  it('keeps transaction-boundary cancellation indeterminate for a mark write', async () => {
    const statementCancellation = new Error('commit canceled', {
      cause: { code: '57014' },
    });
    vi.mocked(PgDatabase.prototype.transaction).mockRejectedValueOnce(
      statementCancellation,
    );

    await expect(markQuestion()).rejects.toBe(statementCancellation);
    expect(PostgresJsPreparedQuery.prototype.execute).not.toHaveBeenCalled();
  });
});
