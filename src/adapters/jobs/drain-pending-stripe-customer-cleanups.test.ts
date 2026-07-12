import { describe, expect, it, vi } from 'vitest';
import {
  FakeLogger,
  FakePendingStripeCustomerCleanupRepository,
} from '@/src/application/test-helpers/fakes';
import {
  drainPendingStripeCustomerCleanups,
  PENDING_STRIPE_CUSTOMER_CLEANUP_BATCH_LIMIT,
} from './drain-pending-stripe-customer-cleanups';

describe('drainPendingStripeCustomerCleanups', () => {
  it('uses a bounded default when no batch limit is configured', async () => {
    const start = new Date('2026-06-12T12:00:00.000Z').getTime();
    let now = new Date(start);
    const repo = new FakePendingStripeCustomerCleanupRepository(() => now);
    for (
      let index = 0;
      index < PENDING_STRIPE_CUSTOMER_CLEANUP_BATCH_LIMIT + 1;
      index += 1
    ) {
      now = new Date(start + index * 1_000);
      await repo.schedule(`evt_${index}`, `cus_${index}`);
    }

    const result = await drainPendingStripeCustomerCleanups(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: true,
      },
      {
        pendingStripeCustomerCleanups: repo,
        deleteStripeCustomer: async () => undefined,
        logger: new FakeLogger(),
      },
    );

    expect(result.scanned).toBe(PENDING_STRIPE_CUSTOMER_CLEANUP_BATCH_LIMIT);
  });

  it('processes at most the configured number of stale obligations', async () => {
    let now = new Date('2026-06-12T12:00:00.000Z');
    const repo = new FakePendingStripeCustomerCleanupRepository(() => now);
    await repo.schedule('evt_first', 'cus_first');
    now = new Date('2026-06-12T12:01:00.000Z');
    await repo.schedule('evt_second', 'cus_second');
    now = new Date('2026-06-12T12:02:00.000Z');
    await repo.schedule('evt_third', 'cus_third');
    const deletedCustomerIds: string[] = [];

    const result = await drainPendingStripeCustomerCleanups(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: false,
        limit: 2,
      },
      {
        pendingStripeCustomerCleanups: repo,
        deleteStripeCustomer: async (stripeCustomerId) => {
          deletedCustomerIds.push(stripeCustomerId);
        },
        logger: new FakeLogger(),
      },
    );

    expect(result).toEqual({
      scanned: 2,
      drained: 2,
      failed: 0,
      failures: [],
      dryRun: false,
    });
    expect(deletedCustomerIds).toEqual(['cus_first', 'cus_second']);
    await expect(repo.findByEventId('evt_third')).resolves.toEqual({
      stripeCustomerId: 'cus_third',
    });
  });

  it('deletes a stale obligation after Stripe customer deletion succeeds', async () => {
    const repo = new FakePendingStripeCustomerCleanupRepository(
      () => new Date('2026-06-12T12:00:00.000Z'),
    );
    await repo.schedule('evt_stale', 'cus_stale');
    const deleteStripeCustomer = vi.fn(async () => undefined);

    const result = await drainPendingStripeCustomerCleanups(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: false,
      },
      {
        pendingStripeCustomerCleanups: repo,
        deleteStripeCustomer,
        logger: new FakeLogger(),
      },
    );

    expect(result).toEqual({
      scanned: 1,
      drained: 1,
      failed: 0,
      failures: [],
      dryRun: false,
    });
    expect(deleteStripeCustomer).toHaveBeenCalledWith('cus_stale');
    await expect(repo.findByEventId('evt_stale')).resolves.toBeNull();
  });

  it('keeps a stale obligation and logs the failure when customer deletion fails', async () => {
    const repo = new FakePendingStripeCustomerCleanupRepository(
      () => new Date('2026-06-12T12:00:00.000Z'),
    );
    await repo.schedule('evt_stale', 'cus_stale');
    const logger = new FakeLogger();
    const deleteStripeCustomer = vi.fn(async () => {
      throw new Error('stripe outage');
    });

    const result = await drainPendingStripeCustomerCleanups(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: false,
      },
      {
        pendingStripeCustomerCleanups: repo,
        deleteStripeCustomer,
        logger,
      },
    );

    expect(result).toEqual({
      scanned: 1,
      drained: 0,
      failed: 1,
      failures: [{ eventId: 'evt_stale', error: 'stripe outage' }],
      dryRun: false,
    });
    await expect(repo.findByEventId('evt_stale')).resolves.toEqual({
      stripeCustomerId: 'cus_stale',
    });
    expect(logger.errorCalls).toEqual([
      {
        context: { eventId: 'evt_stale', error: 'stripe outage' },
        msg: 'Pending Stripe customer cleanup drain failed',
      },
    ]);
  });

  it('deletes the obligation when customer cleanup was already satisfied', async () => {
    const repo = new FakePendingStripeCustomerCleanupRepository(
      () => new Date('2026-06-12T12:00:00.000Z'),
    );
    await repo.schedule('evt_stale', 'cus_stale');
    const deleteStripeCustomer = vi.fn(async () => undefined);

    const result = await drainPendingStripeCustomerCleanups(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: false,
      },
      {
        pendingStripeCustomerCleanups: repo,
        deleteStripeCustomer,
        logger: new FakeLogger(),
      },
    );

    expect(result.drained).toBe(1);
    expect(result.failed).toBe(0);
    await expect(repo.findByEventId('evt_stale')).resolves.toBeNull();
  });

  it('does not drain obligations newer than the stale cutoff', async () => {
    const repo = new FakePendingStripeCustomerCleanupRepository(
      () => new Date('2026-06-12T12:20:00.000Z'),
    );
    await repo.schedule('evt_fresh', 'cus_fresh');
    const deleteStripeCustomer = vi.fn(async () => undefined);

    const result = await drainPendingStripeCustomerCleanups(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: false,
      },
      {
        pendingStripeCustomerCleanups: repo,
        deleteStripeCustomer,
        logger: new FakeLogger(),
      },
    );

    expect(result.scanned).toBe(0);
    expect(deleteStripeCustomer).not.toHaveBeenCalled();
    await expect(repo.findByEventId('evt_fresh')).resolves.toEqual({
      stripeCustomerId: 'cus_fresh',
    });
  });

  it('reports stale obligations without deleting customers or rows in dry-run mode', async () => {
    const repo = new FakePendingStripeCustomerCleanupRepository(
      () => new Date('2026-06-12T12:00:00.000Z'),
    );
    await repo.schedule('evt_stale', 'cus_stale');
    const deleteStripeCustomer = vi.fn(async () => undefined);

    const result = await drainPendingStripeCustomerCleanups(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: true,
      },
      {
        pendingStripeCustomerCleanups: repo,
        deleteStripeCustomer,
        logger: new FakeLogger(),
      },
    );

    expect(result).toEqual({
      scanned: 1,
      drained: 0,
      failed: 0,
      failures: [],
      dryRun: true,
    });
    expect(deleteStripeCustomer).not.toHaveBeenCalled();
    await expect(repo.findByEventId('evt_stale')).resolves.toEqual({
      stripeCustomerId: 'cus_stale',
    });
  });
});
