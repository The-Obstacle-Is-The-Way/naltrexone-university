import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleStripeCustomerRepository } from './drizzle-stripe-customer-repository';

describe('DrizzleStripeCustomerRepository', () => {
  it('returns null from findByUserId when no mapping exists', async () => {
    const db = {
      query: {
        stripeCustomers: {
          findFirst: async () => null,
        },
      },
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzleStripeCustomerRepository
    >[0];
    const repo = new DrizzleStripeCustomerRepository(db as unknown as RepoDb);

    await expect(repo.findByUserId('user_1')).resolves.toBeNull();
  });

  it('returns stripeCustomerId from findByUserId when mapping exists', async () => {
    const db = {
      query: {
        stripeCustomers: {
          findFirst: async () => ({ stripeCustomerId: 'cus_123' }),
        },
      },
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzleStripeCustomerRepository
    >[0];
    const repo = new DrizzleStripeCustomerRepository(db as unknown as RepoDb);

    await expect(repo.findByUserId('user_1')).resolves.toEqual({
      stripeCustomerId: 'cus_123',
    });
  });

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

  it('updates user mapping when conflictStrategy is authoritative', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: async () => [{ stripeCustomerId: 'cus_new' }],
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

    await expect(
      repo.insert('user_1', 'cus_new', { conflictStrategy: 'authoritative' }),
    ).resolves.toBeUndefined();
  });

  it('throws INTERNAL_ERROR when the upsert returns no row', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
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
      code: 'INTERNAL_ERROR',
    });
  });

  it('throws CONFLICT on unique-constraint violations (e.g., stripeCustomerId already mapped)', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: async () => {
              throw { code: '23505' };
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

    await expect(repo.insert('user_1', 'cus_123')).rejects.toBeInstanceOf(
      ApplicationError,
    );
    await expect(repo.insert('user_1', 'cus_123')).rejects.toMatchObject({
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
