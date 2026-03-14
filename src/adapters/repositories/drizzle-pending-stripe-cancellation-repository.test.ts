import { describe, expect, it, vi } from 'vitest';
import { pendingStripeCancellations } from '@/db/schema';
import { DrizzlePendingStripeCancellationRepository } from './drizzle-pending-stripe-cancellation-repository';

type RepoDb = ConstructorParameters<
  typeof DrizzlePendingStripeCancellationRepository
>[0];

describe('DrizzlePendingStripeCancellationRepository', () => {
  it('returns null when no pending cancellation exists', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    } as const;

    const repo = new DrizzlePendingStripeCancellationRepository(
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

    const repo = new DrizzlePendingStripeCancellationRepository(
      db as unknown as RepoDb,
    );

    await expect(repo.findByEventId('evt_1')).resolves.toEqual({
      stripeCustomerId: 'cus_123',
    });
  });

  it('upserts scheduled cancellations by event id', async () => {
    const onConflictDoUpdate = vi.fn(async () => undefined);
    const insertValues = vi.fn(() => ({
      onConflictDoUpdate,
    }));

    const db = {
      insert: () => ({
        values: insertValues,
      }),
    } as const;

    const repo = new DrizzlePendingStripeCancellationRepository(
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

  it('deletes pending cancellations by event id', async () => {
    const where = vi.fn(async () => undefined);
    const deleteFn = vi.fn(() => ({ where }));

    const db = {
      delete: deleteFn,
    } as const;

    const repo = new DrizzlePendingStripeCancellationRepository(
      db as unknown as RepoDb,
    );

    await expect(repo.deleteByEventId('evt_1')).resolves.toBeUndefined();
    expect(deleteFn).toHaveBeenCalledWith(pendingStripeCancellations);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
