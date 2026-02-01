import { describe, expect, it, vi } from 'vitest';
import { DrizzleStripeCustomerRepository } from './drizzle-stripe-customer-repository';

describe('DrizzleStripeCustomerRepository', () => {
  it('uses a single upsert statement and does not query on idempotent inserts', async () => {
    const queryFindFirst = vi.fn(() => {
      throw new Error('unexpected query');
    });

    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: async () => [{ stripeCustomerId: 'cus_123' }],
          }),
        }),
      }),
      query: {
        stripeCustomers: {
          findFirst: queryFindFirst,
        },
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzleStripeCustomerRepository
    >[0];
    const repo = new DrizzleStripeCustomerRepository(db as unknown as RepoDb);

    await expect(repo.insert('user_1', 'cus_123')).resolves.toBeUndefined();
    expect(queryFindFirst).not.toHaveBeenCalled();
  });

  it('throws CONFLICT when user already has a different stripeCustomerId', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: async () => [{ stripeCustomerId: 'cus_existing' }],
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

    await expect(repo.insert('user_1', 'cus_new')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('throws INTERNAL_ERROR on unexpected database failures', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: async () => {
              throw new Error('db down');
            },
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
      code: 'INTERNAL_ERROR',
    });
  });
});
