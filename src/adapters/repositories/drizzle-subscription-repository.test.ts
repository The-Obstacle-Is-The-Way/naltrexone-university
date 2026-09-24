import { drizzle, PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { installMockTransactionBoundary } from '@/tests/shared/drizzle-mock-transaction';
import { DrizzleSubscriptionRepository } from './drizzle-subscription-repository';

const repo = new DrizzleSubscriptionRepository(drizzle.mock({ schema }), {
  monthly: 'price_monthly',
  annual: 'price_annual',
});

function upsert() {
  return repo.upsert({
    userId: crypto.randomUUID(),
    externalSubscriptionId: 'sub_123',
    plan: 'monthly',
    status: 'active',
    currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    expectedVersion: null,
  });
}

// Inside the upsert transaction the advisory lock, the FOR UPDATE read and the
// insert each reach the prepared-query boundary in that order; the first two
// are answered and the third carries the failure under test.
function failInsertWith(failure: unknown) {
  vi.mocked(PostgresJsPreparedQuery.prototype.execute)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(failure);
}

// Only error translation that real Postgres cannot force belongs here: the
// nested-cause shape of a driver error, a foreign-key violation on a
// constraint this table does not have, and an arbitrary driver failure. Real
// lookups, the price mapping, the injected clock, the real users foreign key
// and the real unique constraints run in tests/integration/
// subscription-repository.integration.test.ts and stripe-repositories.integration.test.ts.
beforeEach(() => {
  installMockTransactionBoundary();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DrizzleSubscriptionRepository upsert error translation', () => {
  it('throws typed user_missing for the exact users foreign-key violation through a cause chain', async () => {
    const dbError = new Error('insert failed', {
      cause: {
        cause: {
          code: '23503',
          constraint: 'stripe_subscriptions_user_id_users_id_fk',
        },
      },
    });
    failInsertWith(dbError);

    await expect(upsert()).rejects.toMatchObject({
      reason: 'user_missing',
      cause: dbError,
    });
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(3);
  });

  it('keeps a different foreign-key violation classified as INTERNAL_ERROR', async () => {
    const dbError = new Error('insert failed', {
      cause: { cause: { code: '23503', constraint: 'some_other_user_id_fk' } },
    });
    failInsertWith(dbError);

    await expect(upsert()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: dbError,
    });
  });

  it('wraps an unexpected database failure during upsert in INTERNAL_ERROR with its cause', async () => {
    const dbError = new Error('db down');
    failInsertWith(dbError);

    await expect(upsert()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: dbError,
    });
  });
});
