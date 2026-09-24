import { drizzle, PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { installMockTransactionBoundary } from '@/tests/shared/drizzle-mock-transaction';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';

const repo = new DrizzlePracticeSessionRepository(drizzle.mock({ schema }));

function createSession() {
  return repo.create({
    userId: crypto.randomUUID(),
    mode: 'tutor',
    paramsJson: {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [crypto.randomUUID()],
    },
  });
}

// Only driver responses that real Postgres cannot produce belong here: an
// INSERT ... RETURNING with no row and an arbitrary driver failure inside the
// create transaction. The write's behavior (validation guard, the real
// duplicate-incomplete-session constraint, discard scoping, end() with its
// clock, snapshot, guarded-update fallbacks and fake parity) runs against real
// Postgres in tests/integration/practice-session-writes.integration.test.ts
// and tests/integration/session-attempt-repository.integration.test.ts.
beforeEach(() => {
  installMockTransactionBoundary();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DrizzlePracticeSessionRepository create error translation', () => {
  it('wraps an unexpected insert failure in INTERNAL_ERROR with its cause', async () => {
    const cause = new Error('db offline');
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      cause,
    );

    const promise = createSession();

    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create practice session',
      cause,
    });
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
  });

  it('throws INTERNAL_ERROR when the session insert returns no row and skips the state insert', async () => {
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockResolvedValueOnce(
      [],
    );

    await expect(createSession()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create practice session',
    });
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
  });
});
