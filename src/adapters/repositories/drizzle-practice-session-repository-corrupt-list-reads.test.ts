import { PgRelationalQuery } from 'drizzle-orm/pg-core/query-builders/query';
import { drizzle, PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { installMockTransactionBoundary } from '@/tests/shared/drizzle-mock-transaction';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';

// Only an arbitrary driver failure inside the corrupt-row classification,
// which real Postgres cannot raise on demand, belongs here: the relational
// session read is answered at the relational query's execute boundary and the
// following state-rows read fails at the prepared-query boundary. Corrupt-row skipping
// and logging run against real Postgres in
// tests/integration/practice-session-schema-hardening.integration.test.ts and
// tests/integration/practice-session-reads.integration.test.ts.
beforeEach(() => {
  installMockTransactionBoundary();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DrizzlePracticeSessionRepository corrupt-row classification', () => {
  it('propagates an unrelated driver failure raised while mapping a session instead of logging it as a corrupt row', async () => {
    const logger = new FakeLogger();
    const repo = new DrizzlePracticeSessionRepository(
      drizzle.mock({ schema }),
      undefined,
      logger,
    );
    const row: typeof schema.practiceSessions.$inferSelect = {
      id: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [crypto.randomUUID()],
      },
      startedAt: new Date('2026-03-05T10:00:00.000Z'),
      endedAt: null,
    };
    // Awaiting the relational query routes through its own execute(), so the
    // session row is answered there without touching the prepared-query spy.
    vi.spyOn(PgRelationalQuery.prototype, 'execute').mockResolvedValueOnce(row);
    const failure = new Error('connection reset');
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      failure,
    );

    await expect(repo.findLatestIncompleteByUserId(row.userId)).rejects.toBe(
      failure,
    );
    expect(logger.warnCalls).toEqual([]);
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
  });
});
