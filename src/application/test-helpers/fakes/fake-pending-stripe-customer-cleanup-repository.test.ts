import { describe, expect, it } from 'vitest';
import { FakePendingStripeCustomerCleanupRepository } from './fake-pending-stripe-customer-cleanup-repository';

describe('FakePendingStripeCustomerCleanupRepository', () => {
  it('stores and reads pending customer cleanups by event id', async () => {
    const repo = new FakePendingStripeCustomerCleanupRepository();

    await expect(repo.findByEventId('evt_1')).resolves.toBeNull();

    await repo.schedule('evt_1', 'cus_123');

    await expect(repo.findByEventId('evt_1')).resolves.toEqual({
      stripeCustomerId: 'cus_123',
    });
  });

  it('deletes pending customer cleanups by event id', async () => {
    const repo = new FakePendingStripeCustomerCleanupRepository();
    await repo.schedule('evt_1', 'cus_123');

    await repo.deleteByEventId('evt_1');

    await expect(repo.findByEventId('evt_1')).resolves.toBeNull();
  });

  it('lists only stale pending customer cleanups before the cutoff', async () => {
    let now = new Date('2026-06-12T12:00:00.000Z');
    const repo = new FakePendingStripeCustomerCleanupRepository(() => now);

    await repo.schedule('evt_stale', 'cus_stale');
    now = new Date('2026-06-12T12:20:00.000Z');
    await repo.schedule('evt_fresh', 'cus_fresh');

    await expect(
      repo.listStale(new Date('2026-06-12T12:15:00.000Z'), 10),
    ).resolves.toEqual([
      {
        eventId: 'evt_stale',
        stripeCustomerId: 'cus_stale',
        createdAt: new Date('2026-06-12T12:00:00.000Z'),
      },
    ]);
  });

  it('limits stale pending customer cleanups after ordering oldest first', async () => {
    let now = new Date('2026-06-12T12:00:00.000Z');
    const repo = new FakePendingStripeCustomerCleanupRepository(() => now);
    await repo.schedule('evt_oldest', 'cus_oldest');
    now = new Date('2026-06-12T12:01:00.000Z');
    await repo.schedule('evt_newer', 'cus_newer');

    await expect(
      repo.listStale(new Date('2026-06-12T12:15:00.000Z'), 1),
    ).resolves.toEqual([
      {
        eventId: 'evt_oldest',
        stripeCustomerId: 'cus_oldest',
        createdAt: new Date('2026-06-12T12:00:00.000Z'),
      },
    ]);
  });

  it('restores snapshots', async () => {
    const repo = new FakePendingStripeCustomerCleanupRepository();
    await repo.schedule('evt_1', 'cus_123');

    const snapshot = repo.snapshot();

    await repo.schedule('evt_2', 'cus_456');
    repo.restore(snapshot);

    await expect(repo.findByEventId('evt_1')).resolves.toEqual({
      stripeCustomerId: 'cus_123',
    });
    await expect(repo.findByEventId('evt_2')).resolves.toBeNull();
  });
});
