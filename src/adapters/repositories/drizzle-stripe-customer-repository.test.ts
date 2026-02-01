import { describe, expect, it } from 'vitest';
import { DrizzleStripeCustomerRepository } from './drizzle-stripe-customer-repository';

describe('DrizzleStripeCustomerRepository', () => {
  it('treats missing-after-conflict as retryable CONFLICT', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [],
          }),
        }),
      }),
      query: {
        stripeCustomers: {
          findFirst: async () => null,
        },
      },
    } as const;

    const repo = new DrizzleStripeCustomerRepository(db as any);

    await expect(repo.insert('user_1', 'cus_123')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});
