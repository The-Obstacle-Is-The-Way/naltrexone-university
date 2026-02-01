import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleSubscriptionRepository } from './drizzle-subscription-repository';

describe('DrizzleSubscriptionRepository', () => {
  it('maps Stripe price ids to domain plan when loading subscriptions', async () => {
    const db = {
      query: {
        stripeSubscriptions: {
          findFirst: async () => ({
            id: 'sub_row_1',
            userId: 'user_1',
            stripeSubscriptionId: 'sub_123',
            status: 'active',
            priceId: 'price_monthly',
            currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
            cancelAtPeriodEnd: false,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        },
      },
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    const priceIds = {
      monthly: 'price_monthly',
      annual: 'price_annual',
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzleSubscriptionRepository
    >[0];
    const repo = new DrizzleSubscriptionRepository(
      db as unknown as RepoDb,
      priceIds,
    );

    await expect(repo.findByUserId('user_1')).resolves.toMatchObject({
      userId: 'user_1',
      plan: 'monthly',
      status: 'active',
    });
  });

  it('throws INTERNAL_ERROR when a stored subscription has an unknown priceId', async () => {
    const db = {
      query: {
        stripeSubscriptions: {
          findFirst: async () => ({
            id: 'sub_row_1',
            userId: 'user_1',
            stripeSubscriptionId: 'sub_123',
            status: 'active',
            priceId: 'price_unknown',
            currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
            cancelAtPeriodEnd: false,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        },
      },
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    const priceIds = {
      monthly: 'price_monthly',
      annual: 'price_annual',
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzleSubscriptionRepository
    >[0];
    const repo = new DrizzleSubscriptionRepository(
      db as unknown as RepoDb,
      priceIds,
    );

    await expect(repo.findByUserId('user_1')).rejects.toBeInstanceOf(
      ApplicationError,
    );
    await expect(repo.findByUserId('user_1')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('upserts subscriptions by userId and maps plan → priceId', async () => {
    const now = new Date('2026-02-01T02:03:04.000Z');
    const nowFn = vi.fn(() => now);
    const onConflictDoUpdate = async () => {};
    const values = (input: unknown) => ({
      onConflictDoUpdate: async (conflict: unknown) => {
        expect(input).toMatchObject({
          userId: 'user_1',
          stripeSubscriptionId: 'sub_123',
          status: 'active',
          priceId: 'price_monthly',
          cancelAtPeriodEnd: false,
          updatedAt: now,
        });
        expect(conflict).toMatchObject({
          target: expect.anything(),
          set: expect.objectContaining({ updatedAt: now }),
        });
        return onConflictDoUpdate;
      },
    });

    const db = {
      insert: () => ({ values }),
      query: {
        stripeSubscriptions: {
          findFirst: async () => null,
        },
      },
    } as const;

    const priceIds = {
      monthly: 'price_monthly',
      annual: 'price_annual',
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzleSubscriptionRepository
    >[0];
    const repo = new DrizzleSubscriptionRepository(
      db as unknown as RepoDb,
      priceIds,
      nowFn,
    );

    await expect(
      repo.upsert({
        userId: 'user_1',
        stripeSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).resolves.toBeUndefined();
    expect(nowFn).toHaveBeenCalledTimes(2);
  });

  it('throws CONFLICT when the DB reports a unique-constraint violation during upsert', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: async () => {
            throw { cause: { code: '23505' } };
          },
        }),
      }),
      query: {
        stripeSubscriptions: {
          findFirst: async () => null,
        },
      },
    } as const;

    const priceIds = {
      monthly: 'price_monthly',
      annual: 'price_annual',
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzleSubscriptionRepository
    >[0];
    const repo = new DrizzleSubscriptionRepository(
      db as unknown as RepoDb,
      priceIds,
    );

    await expect(
      repo.upsert({
        userId: 'user_1',
        stripeSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws INTERNAL_ERROR on unexpected database failures during upsert', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: async () => {
            throw new Error('db down');
          },
        }),
      }),
      query: {
        stripeSubscriptions: {
          findFirst: async () => null,
        },
      },
    } as const;

    const priceIds = {
      monthly: 'price_monthly',
      annual: 'price_annual',
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzleSubscriptionRepository
    >[0];
    const repo = new DrizzleSubscriptionRepository(
      db as unknown as RepoDb,
      priceIds,
    );

    await expect(
      repo.upsert({
        userId: 'user_1',
        stripeSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('findByStripeSubscriptionId returns null when missing', async () => {
    const db = {
      query: {
        stripeSubscriptions: {
          findFirst: async () => null,
        },
      },
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    const priceIds = {
      monthly: 'price_monthly',
      annual: 'price_annual',
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzleSubscriptionRepository
    >[0];
    const repo = new DrizzleSubscriptionRepository(
      db as unknown as RepoDb,
      priceIds,
    );

    await expect(
      repo.findByStripeSubscriptionId('sub_123'),
    ).resolves.toBeNull();
  });

  it('findByStripeSubscriptionId maps priceId → plan when found', async () => {
    const db = {
      query: {
        stripeSubscriptions: {
          findFirst: async () => ({
            id: 'sub_row_1',
            userId: 'user_1',
            stripeSubscriptionId: 'sub_123',
            status: 'active',
            priceId: 'price_annual',
            currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
            cancelAtPeriodEnd: false,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        },
      },
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    const priceIds = {
      monthly: 'price_monthly',
      annual: 'price_annual',
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzleSubscriptionRepository
    >[0];
    const repo = new DrizzleSubscriptionRepository(
      db as unknown as RepoDb,
      priceIds,
    );

    await expect(
      repo.findByStripeSubscriptionId('sub_123'),
    ).resolves.toMatchObject({
      userId: 'user_1',
      plan: 'annual',
    });
  });

  it('findByStripeSubscriptionId throws INTERNAL_ERROR when the stored priceId is unknown', async () => {
    const db = {
      query: {
        stripeSubscriptions: {
          findFirst: async () => ({
            id: 'sub_row_1',
            userId: 'user_1',
            priceId: 'price_unknown',
            status: 'active',
            currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
            cancelAtPeriodEnd: false,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            stripeSubscriptionId: 'sub_123',
          }),
        },
      },
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    const priceIds = {
      monthly: 'price_monthly',
      annual: 'price_annual',
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzleSubscriptionRepository
    >[0];
    const repo = new DrizzleSubscriptionRepository(
      db as unknown as RepoDb,
      priceIds,
    );

    await expect(
      repo.findByStripeSubscriptionId('sub_123'),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      repo.findByStripeSubscriptionId('sub_123'),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
