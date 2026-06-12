import { describe, expect, it, vi } from 'vitest';
import {
  FakeLogger,
  FakePendingStripeCancellationRepository,
} from '@/src/application/test-helpers/fakes';
import { drainPendingStripeCancellations } from './drain-pending-stripe-cancellations';

function alreadyCanceledError(): Error {
  return Object.assign(new Error('No such subscription'), {
    rawType: 'invalid_request_error',
    code: 'resource_missing',
  });
}

describe('drainPendingStripeCancellations', () => {
  it('deletes a stale pending row when the Stripe customer cancellation succeeds', async () => {
    const repo = new FakePendingStripeCancellationRepository(
      () => new Date('2026-06-12T12:00:00.000Z'),
    );
    await repo.schedule('evt_stale', 'cus_stale');
    const cancelStripeCustomerSubscriptions = vi.fn(async () => undefined);

    const result = await drainPendingStripeCancellations(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: false,
      },
      {
        pendingStripeCancellations: repo,
        cancelStripeCustomerSubscriptions,
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
    expect(cancelStripeCustomerSubscriptions).toHaveBeenCalledWith('cus_stale');
    await expect(repo.findByEventId('evt_stale')).resolves.toBeNull();
  });

  it('keeps a stale pending row and logs the failure when cancellation fails', async () => {
    const repo = new FakePendingStripeCancellationRepository(
      () => new Date('2026-06-12T12:00:00.000Z'),
    );
    await repo.schedule('evt_stale', 'cus_stale');
    const logger = new FakeLogger();
    const cancelStripeCustomerSubscriptions = vi.fn(async () => {
      throw new Error('stripe outage');
    });

    const result = await drainPendingStripeCancellations(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: false,
      },
      {
        pendingStripeCancellations: repo,
        cancelStripeCustomerSubscriptions,
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
        msg: 'Pending Stripe cancellation drain failed',
      },
    ]);
  });

  it('treats already-canceled Stripe errors as success and deletes the row', async () => {
    const repo = new FakePendingStripeCancellationRepository(
      () => new Date('2026-06-12T12:00:00.000Z'),
    );
    await repo.schedule('evt_stale', 'cus_stale');
    const cancelStripeCustomerSubscriptions = vi.fn(async () => {
      throw alreadyCanceledError();
    });

    const result = await drainPendingStripeCancellations(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: false,
      },
      {
        pendingStripeCancellations: repo,
        cancelStripeCustomerSubscriptions,
        logger: new FakeLogger(),
      },
    );

    expect(result.drained).toBe(1);
    expect(result.failed).toBe(0);
    await expect(repo.findByEventId('evt_stale')).resolves.toBeNull();
  });

  it('does not drain rows newer than the stale cutoff', async () => {
    const repo = new FakePendingStripeCancellationRepository(
      () => new Date('2026-06-12T12:20:00.000Z'),
    );
    await repo.schedule('evt_fresh', 'cus_fresh');
    const cancelStripeCustomerSubscriptions = vi.fn(async () => undefined);

    const result = await drainPendingStripeCancellations(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: false,
      },
      {
        pendingStripeCancellations: repo,
        cancelStripeCustomerSubscriptions,
        logger: new FakeLogger(),
      },
    );

    expect(result.scanned).toBe(0);
    expect(cancelStripeCustomerSubscriptions).not.toHaveBeenCalled();
    await expect(repo.findByEventId('evt_fresh')).resolves.toEqual({
      stripeCustomerId: 'cus_fresh',
    });
  });

  it('reports stale rows without canceling or deleting in dry-run mode', async () => {
    const repo = new FakePendingStripeCancellationRepository(
      () => new Date('2026-06-12T12:00:00.000Z'),
    );
    await repo.schedule('evt_stale', 'cus_stale');
    const cancelStripeCustomerSubscriptions = vi.fn(async () => undefined);

    const result = await drainPendingStripeCancellations(
      {
        olderThan: new Date('2026-06-12T12:15:00.000Z'),
        dryRun: true,
      },
      {
        pendingStripeCancellations: repo,
        cancelStripeCustomerSubscriptions,
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
    expect(cancelStripeCustomerSubscriptions).not.toHaveBeenCalled();
    await expect(repo.findByEventId('evt_stale')).resolves.toEqual({
      stripeCustomerId: 'cus_stale',
    });
  });
});
