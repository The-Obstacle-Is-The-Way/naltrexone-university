import { describe, expect, it } from 'vitest';
import { FakeStripeCustomerRepository } from './fake-stripe-customer-repository';

describe('FakeStripeCustomerRepository', () => {
  describe('findByUserId', () => {
    it('returns null when no mapping exists', async () => {
      const repo = new FakeStripeCustomerRepository();
      const result = await repo.findByUserId('user-1');
      expect(result).toBeNull();
    });

    it('returns stripeCustomerId when mapping exists', async () => {
      const repo = new FakeStripeCustomerRepository();
      await repo.insert('user-1', 'cus_123');

      const result = await repo.findByUserId('user-1');

      expect(result).toEqual({ stripeCustomerId: 'cus_123' });
    });
  });

  describe('insert', () => {
    it('creates new mapping', async () => {
      const repo = new FakeStripeCustomerRepository();
      await repo.insert('user-1', 'cus_123');

      const result = await repo.findByUserId('user-1');

      expect(result).toEqual({ stripeCustomerId: 'cus_123' });
    });

    it('is idempotent for same mapping', async () => {
      const repo = new FakeStripeCustomerRepository();
      await repo.insert('user-1', 'cus_123');
      await repo.insert('user-1', 'cus_123');

      const result = await repo.findByUserId('user-1');

      expect(result).toEqual({ stripeCustomerId: 'cus_123' });
    });

    it('throws CONFLICT when userId mapped to different customerId', async () => {
      const repo = new FakeStripeCustomerRepository();
      await repo.insert('user-1', 'cus_123');

      await expect(repo.insert('user-1', 'cus_456')).rejects.toMatchObject({
        code: 'CONFLICT',
        message:
          'Stripe customer already exists with a different stripeCustomerId',
      });
    });

    it('throws CONFLICT when customerId mapped to different userId', async () => {
      const repo = new FakeStripeCustomerRepository();
      await repo.insert('user-1', 'cus_123');

      await expect(repo.insert('user-2', 'cus_123')).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Stripe customer id is already mapped to a different user',
      });
    });
  });

  describe('snapshot/restore', () => {
    it('restores repository state from a snapshot', async () => {
      const repo = new FakeStripeCustomerRepository();
      await repo.insert('user-1', 'cus_123');

      const snapshot = repo.snapshot();

      await repo.insert('user-2', 'cus_456');

      repo.restore(snapshot);

      await expect(repo.findByUserId('user-1')).resolves.toEqual({
        stripeCustomerId: 'cus_123',
      });
      await expect(repo.findByUserId('user-2')).resolves.toBeNull();
    });
  });
});
