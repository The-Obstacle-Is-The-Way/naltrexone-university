import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakeStripeEventRepository } from './fake-stripe-event-repository';

describe('FakeStripeEventRepository', () => {
  describe('claim', () => {
    it('returns true for new event', async () => {
      const repo = new FakeStripeEventRepository();
      const result = await repo.claim('evt_123', 'checkout.session.completed');
      expect(result).toBe(true);
    });

    it('returns false for existing event', async () => {
      const repo = new FakeStripeEventRepository();
      await repo.claim('evt_123', 'checkout.session.completed');

      const result = await repo.claim('evt_123', 'checkout.session.completed');

      expect(result).toBe(false);
    });
  });

  describe('lock', () => {
    it('returns state for existing event', async () => {
      const repo = new FakeStripeEventRepository();
      await repo.claim('evt_123', 'checkout.session.completed');

      const result = await repo.lock('evt_123');

      expect(result).toEqual({ processedAt: null, error: null });
    });

    it('throws NOT_FOUND when event missing', async () => {
      const repo = new FakeStripeEventRepository();

      await expect(repo.lock('evt_123')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('markProcessed', () => {
    it('updates processedAt and clears error', async () => {
      const repo = new FakeStripeEventRepository();
      await repo.claim('evt_123', 'checkout.session.completed');
      await repo.markFailed('evt_123', 'Something went wrong');

      await repo.markProcessed('evt_123');

      const state = await repo.lock('evt_123');
      expect(state.processedAt).toBeInstanceOf(Date);
      expect(state.error).toBeNull();
    });

    it('throws NOT_FOUND when event is missing', async () => {
      const repo = new FakeStripeEventRepository();

      await expect(repo.markProcessed('evt_missing')).rejects.toEqual(
        new ApplicationError('NOT_FOUND', 'Stripe event not found'),
      );
    });
  });

  describe('markFailed', () => {
    it('sets error and clears processedAt', async () => {
      const repo = new FakeStripeEventRepository();
      await repo.claim('evt_123', 'checkout.session.completed');
      await repo.markProcessed('evt_123');

      await repo.markFailed('evt_123', 'Something went wrong');

      const state = await repo.lock('evt_123');
      expect(state.processedAt).toBeNull();
      expect(state.error).toBe('Something went wrong');
    });

    it('throws NOT_FOUND when event is missing', async () => {
      const repo = new FakeStripeEventRepository();

      await expect(
        repo.markFailed('evt_missing', 'Something went wrong'),
      ).rejects.toEqual(
        new ApplicationError('NOT_FOUND', 'Stripe event not found'),
      );
    });
  });

  describe('snapshot/restore', () => {
    it('restores event states from a snapshot', async () => {
      const repo = new FakeStripeEventRepository();
      await repo.claim('evt_1', 'checkout.session.completed');
      await repo.markFailed('evt_1', 'First failure');

      const snapshot = repo.snapshot();

      await repo.markProcessed('evt_1');
      await repo.claim('evt_2', 'checkout.session.completed');

      repo.restore(snapshot);

      await expect(repo.lock('evt_1')).resolves.toEqual({
        processedAt: null,
        error: 'First failure',
      });
      await expect(repo.lock('evt_2')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('pruneProcessedBefore', () => {
    it('deletes processed events older than cutoff (oldest-first, limited)', async () => {
      vi.useFakeTimers();
      try {
        const repo = new FakeStripeEventRepository();

        await repo.claim('evt_oldest', 'checkout.session.completed');
        await repo.claim('evt_older', 'checkout.session.completed');
        await repo.claim('evt_newer', 'checkout.session.completed');
        await repo.claim('evt_recent', 'checkout.session.completed');
        await repo.claim('evt_unprocessed', 'checkout.session.completed');

        vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
        await repo.markProcessed('evt_oldest');

        vi.setSystemTime(new Date('2026-02-02T00:00:00Z'));
        await repo.markProcessed('evt_older');

        vi.setSystemTime(new Date('2026-02-03T00:00:00Z'));
        await repo.markProcessed('evt_newer');

        vi.setSystemTime(new Date('2026-02-10T00:00:00Z'));
        await repo.markProcessed('evt_recent');

        const cutoff = new Date('2026-02-04T00:00:00Z');

        await expect(repo.pruneProcessedBefore(cutoff, 2)).resolves.toBe(2);

        await expect(repo.lock('evt_oldest')).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
        await expect(repo.lock('evt_older')).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });

        await expect(repo.lock('evt_newer')).resolves.toMatchObject({
          processedAt: expect.any(Date),
        });
        await expect(repo.lock('evt_recent')).resolves.toMatchObject({
          processedAt: expect.any(Date),
        });
        await expect(repo.lock('evt_unprocessed')).resolves.toMatchObject({
          processedAt: null,
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns 0 when limit is not a positive integer', async () => {
      const repo = new FakeStripeEventRepository();
      await repo.claim('evt_1', 'checkout.session.completed');
      await repo.markProcessed('evt_1');

      await expect(
        repo.pruneProcessedBefore(new Date('2026-02-10T00:00:00Z'), 0),
      ).resolves.toBe(0);
    });
  });
});
