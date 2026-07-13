import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { pendingStripeCancellations } from '@/db/schema';
import { DrizzlePendingStripeCustomerCleanupRepository } from './drizzle-pending-stripe-customer-cleanup-repository';

type RepoDb = ConstructorParameters<
  typeof DrizzlePendingStripeCustomerCleanupRepository
>[0];

describe('DrizzlePendingStripeCustomerCleanupRepository', () => {
  it('returns null when no pending customer cleanup exists', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    } as const;

    const repo = new DrizzlePendingStripeCustomerCleanupRepository(
      db as unknown as RepoDb,
    );

    await expect(repo.findByEventId('evt_missing')).resolves.toBeNull();
  });

  it('returns the pending stripe customer id when present', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ stripeCustomerId: 'cus_123' }],
          }),
        }),
      }),
    } as const;

    const repo = new DrizzlePendingStripeCustomerCleanupRepository(
      db as unknown as RepoDb,
    );

    await expect(repo.findByEventId('evt_1')).resolves.toEqual({
      stripeCustomerId: 'cus_123',
    });
  });

  it('upserts scheduled customer cleanups by event id', async () => {
    const onConflictDoUpdate = vi.fn(async () => undefined);
    const insertValues = vi.fn(() => ({
      onConflictDoUpdate,
    }));

    const db = {
      insert: () => ({
        values: insertValues,
      }),
    } as const;

    const repo = new DrizzlePendingStripeCustomerCleanupRepository(
      db as unknown as RepoDb,
    );

    await expect(repo.schedule('evt_1', 'cus_123')).resolves.toBeUndefined();
    expect(insertValues).toHaveBeenCalledWith({
      eventId: 'evt_1',
      stripeCustomerId: 'cus_123',
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith({
      target: pendingStripeCancellations.eventId,
      set: { stripeCustomerId: 'cus_123' },
    });
  });

  it('deletes pending customer cleanups by event id', async () => {
    const where = vi.fn(async () => undefined);
    const deleteFn = vi.fn(() => ({ where }));

    const db = {
      delete: deleteFn,
    } as const;

    const repo = new DrizzlePendingStripeCustomerCleanupRepository(
      db as unknown as RepoDb,
    );

    await expect(repo.deleteByEventId('evt_1')).resolves.toBeUndefined();
    expect(deleteFn).toHaveBeenCalledWith(pendingStripeCancellations);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('lists a bounded batch of stale pending customer cleanups ordered by creation time', async () => {
    const rows = [
      {
        eventId: 'evt_old',
        stripeCustomerId: 'cus_old',
        createdAt: new Date('2026-06-12T12:00:00.000Z'),
      },
    ];
    const limit = vi.fn(async () => rows);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));

    const db = { select } as const;
    const repo = new DrizzlePendingStripeCustomerCleanupRepository(
      db as unknown as RepoDb,
    );

    await expect(
      repo.listStale(new Date('2026-06-12T12:15:00.000Z'), 25),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledWith({
      eventId: pendingStripeCancellations.eventId,
      stripeCustomerId: pendingStripeCancellations.stripeCustomerId,
      createdAt: pendingStripeCancellations.createdAt,
    });
    expect(from).toHaveBeenCalledWith(pendingStripeCancellations);
    expect(where).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(25);
  });

  it('filters excluded event ids out of the stale listing', async () => {
    const limit = vi.fn(async () => []);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn((_clause: unknown) => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));

    const db = { select } as const;
    const repo = new DrizzlePendingStripeCustomerCleanupRepository(
      db as unknown as RepoDb,
    );

    await repo.listStale(new Date('2026-06-12T12:15:00.000Z'), 25, [
      'evt_failed_1',
      'evt_failed_2',
    ]);

    const whereClause = where.mock.calls[0]?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(whereClause);
    expect(query.sql).toContain('not in');
    expect(query.params).toEqual(
      expect.arrayContaining(['evt_failed_1', 'evt_failed_2']),
    );
  });
});
