import { describe, expect, it } from 'vitest';
import { FakePendingStripeCancellationRepository } from './fake-pending-stripe-cancellation-repository';

describe('FakePendingStripeCancellationRepository', () => {
  it('stores and reads pending cancellations by event id', async () => {
    const repo = new FakePendingStripeCancellationRepository();

    await expect(repo.findByEventId('evt_1')).resolves.toBeNull();

    await repo.schedule('evt_1', 'cus_123');

    await expect(repo.findByEventId('evt_1')).resolves.toEqual({
      stripeCustomerId: 'cus_123',
    });
  });

  it('deletes pending cancellations by event id', async () => {
    const repo = new FakePendingStripeCancellationRepository();
    await repo.schedule('evt_1', 'cus_123');

    await repo.deleteByEventId('evt_1');

    await expect(repo.findByEventId('evt_1')).resolves.toBeNull();
  });

  it('lists only stale pending cancellations before the cutoff', async () => {
    let now = new Date('2026-06-12T12:00:00.000Z');
    const repo = new FakePendingStripeCancellationRepository(() => now);

    await repo.schedule('evt_stale', 'cus_stale');
    now = new Date('2026-06-12T12:20:00.000Z');
    await repo.schedule('evt_fresh', 'cus_fresh');

    await expect(
      repo.listStale(new Date('2026-06-12T12:15:00.000Z')),
    ).resolves.toEqual([
      {
        eventId: 'evt_stale',
        stripeCustomerId: 'cus_stale',
        createdAt: new Date('2026-06-12T12:00:00.000Z'),
      },
    ]);
  });

  it('restores snapshots', async () => {
    const repo = new FakePendingStripeCancellationRepository();
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
