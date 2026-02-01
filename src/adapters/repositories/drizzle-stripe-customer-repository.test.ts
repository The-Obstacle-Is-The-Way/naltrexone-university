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

    type RepoDb = ConstructorParameters<
      typeof DrizzleStripeCustomerRepository
    >[0];
    const repo = new DrizzleStripeCustomerRepository(db as unknown as RepoDb);

    await expect(repo.insert('user_1', 'cus_123')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});
