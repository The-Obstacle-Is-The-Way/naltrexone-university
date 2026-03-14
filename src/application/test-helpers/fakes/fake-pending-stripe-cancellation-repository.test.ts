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
