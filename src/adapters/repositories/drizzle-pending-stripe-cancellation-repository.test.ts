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

  it('lists stale pending cancellations ordered by creation time', async () => {
    const rows = [
      {
        eventId: 'evt_old',
        stripeCustomerId: 'cus_old',
        createdAt: new Date('2026-06-12T12:00:00.000Z'),
      },
    ];
    const orderBy = vi.fn(async () => rows);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));

    const db = { select } as const;
    const repo = new DrizzlePendingStripeCancellationRepository(
      db as unknown as RepoDb,
    );

    await expect(
      repo.listStale(new Date('2026-06-12T12:15:00.000Z')),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledWith({
      eventId: pendingStripeCancellations.eventId,
      stripeCustomerId: pendingStripeCancellations.stripeCustomerId,
      createdAt: pendingStripeCancellations.createdAt,
    });
    expect(from).toHaveBeenCalledWith(pendingStripeCancellations);
    expect(where).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
  });
});
