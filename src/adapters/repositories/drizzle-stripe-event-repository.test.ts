import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleStripeEventRepository } from './drizzle-stripe-event-repository';

type RepoDb = ConstructorParameters<typeof DrizzleStripeEventRepository>[0];

describe('DrizzleStripeEventRepository', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('claim', () => {
    it('returns true when event is successfully inserted', async () => {
      const insertValues = vi.fn(() => ({
        onConflictDoNothing: () => ({
          returning: async () => [{ id: 'evt_123' }],
        }),
      }));

      const db = {
        insert: () => ({ values: insertValues }),
      } as const;

      const repo = new DrizzleStripeEventRepository(db as unknown as RepoDb);

      const result = await repo.claim(
        'evt_123',
        'customer.subscription.created',
      );

      expect(result).toBe(true);
      expect(insertValues).toHaveBeenCalledWith({
        id: 'evt_123',
        type: 'customer.subscription.created',
        processedAt: null,
        error: null,
      });
    });

    it('returns false when event already exists (conflict)', async () => {
      const db = {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: async () => [],
            }),
          }),
        }),
      } as const;

      const repo = new DrizzleStripeEventRepository(db as unknown as RepoDb);

      const result = await repo.claim(
        'evt_existing',
        'customer.subscription.updated',
      );

      expect(result).toBe(false);
    });
  });

  describe('lock', () => {
    it('returns event state when found', async () => {
      const processedAt = new Date('2026-02-01T12:00:00.000Z');
      const selectFrom = vi.fn(() => ({
        where: () => ({
          for: async () => [{ processedAt, error: null }],
        }),
      }));

      const db = {
        select: () => ({ from: selectFrom }),
      } as const;

      const repo = new DrizzleStripeEventRepository(db as unknown as RepoDb);

      const result = await repo.lock('evt_123');

      expect(result).toEqual({ processedAt, error: null });
    });

    it('returns null values when event has not been processed', async () => {
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () => [{ processedAt: null, error: null }],
            }),
          }),
        }),
      } as const;

      const repo = new DrizzleStripeEventRepository(db as unknown as RepoDb);

      const result = await repo.lock('evt_123');

      expect(result).toEqual({ processedAt: null, error: null });
    });

    it('returns error when event previously failed', async () => {
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () => [{ processedAt: null, error: 'Previous error' }],
            }),
          }),
        }),
      } as const;

      const repo = new DrizzleStripeEventRepository(db as unknown as RepoDb);

      const result = await repo.lock('evt_123');

      expect(result).toEqual({ processedAt: null, error: 'Previous error' });
    });

    it('throws NOT_FOUND when event does not exist', async () => {
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () => [],
            }),
          }),
        }),
      } as const;

      const repo = new DrizzleStripeEventRepository(db as unknown as RepoDb);

      await expect(repo.lock('evt_missing')).rejects.toBeInstanceOf(
        ApplicationError,
      );
      await expect(repo.lock('evt_missing')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('markProcessed', () => {
    it('updates processedAt timestamp and clears error', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-02-01T13:00:00.000Z');
      vi.setSystemTime(now);

      const updateSet = vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 'evt_123' }],
        }),
      }));

      const db = {
        update: () => ({ set: updateSet }),
      } as const;

      const repo = new DrizzleStripeEventRepository(db as unknown as RepoDb);

      await expect(repo.markProcessed('evt_123')).resolves.toBeUndefined();

      expect(updateSet).toHaveBeenCalledWith({
        processedAt: now,
        error: null,
      });
    });

    it('throws NOT_FOUND when event does not exist', async () => {
      const db = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => [],
            }),
          }),
        }),
      } as const;

      const repo = new DrizzleStripeEventRepository(db as unknown as RepoDb);

      await expect(repo.markProcessed('evt_missing')).rejects.toBeInstanceOf(
        ApplicationError,
      );
      await expect(repo.markProcessed('evt_missing')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('markFailed', () => {
    it('updates error and clears processedAt', async () => {
      const updateSet = vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 'evt_123' }],
        }),
      }));

      const db = {
        update: () => ({ set: updateSet }),
      } as const;

      const repo = new DrizzleStripeEventRepository(db as unknown as RepoDb);

      await expect(
        repo.markFailed('evt_123', 'Something went wrong'),
      ).resolves.toBeUndefined();

      expect(updateSet).toHaveBeenCalledWith({
        processedAt: null,
        error: 'Something went wrong',
      });
    });

    it('throws NOT_FOUND when event does not exist', async () => {
      const db = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => [],
            }),
          }),
        }),
      } as const;

      const repo = new DrizzleStripeEventRepository(db as unknown as RepoDb);

      await expect(
        repo.markFailed('evt_missing', 'Error message'),
      ).rejects.toBeInstanceOf(ApplicationError);
      await expect(
        repo.markFailed('evt_missing', 'Error message'),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
