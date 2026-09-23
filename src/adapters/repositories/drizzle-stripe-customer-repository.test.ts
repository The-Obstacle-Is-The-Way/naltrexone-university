import { drizzle } from 'drizzle-orm/postgres-js';
import { PostgresJsPreparedQuery } from 'drizzle-orm/postgres-js/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleStripeCustomerRepository } from './drizzle-stripe-customer-repository';

const repo = new DrizzleStripeCustomerRepository(drizzle.mock({ schema }));
const userId = crypto.randomUUID();

// Only driver responses that real Postgres cannot produce belong here; the
// real prepared-query boundary supplies them. Lookup, idempotent upsert,
// strict and authoritative conflict handling and the unique-violation mapping
// are covered against real Postgres in
// tests/integration/stripe-customer-repository.integration.test.ts and
// tests/integration/stripe-repositories.integration.test.ts.
beforeEach(() => {
  vi.spyOn(PostgresJsPreparedQuery.prototype, 'execute');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DrizzleStripeCustomerRepository error translation', () => {
  it('throws INTERNAL_ERROR when the upsert returns no row', async () => {
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockResolvedValueOnce(
      [],
    );

    const promise = repo.insert(userId, 'cus_123');
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to upsert Stripe customer mapping',
    });
    expect(PostgresJsPreparedQuery.prototype.execute).toHaveBeenCalledTimes(1);
  });

  it('preserves unexpected database failures as the INTERNAL_ERROR cause', async () => {
    const databaseError = new Error('boom');
    vi.mocked(PostgresJsPreparedQuery.prototype.execute).mockRejectedValueOnce(
      databaseError,
    );

    const promise = repo.insert(userId, 'cus_123');
    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: databaseError,
    });
  });
});
