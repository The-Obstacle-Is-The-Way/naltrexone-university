import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleSubscriptionRepository } from './drizzle-subscription-repository';

describe('DrizzleSubscriptionRepository', () => {
  type RepoDb = ConstructorParameters<typeof DrizzleSubscriptionRepository>[0];

  const subscriptionRowId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  const createRepo = (
    db: unknown,
    priceIds: { monthly: string; annual: string },
    nowFn?: () => Date,
  ) =>
    new DrizzleSubscriptionRepository(db as unknown as RepoDb, priceIds, nowFn);

  const priceIds = {
    monthly: 'price_monthly',
    annual: 'price_annual',
  } as const;

  const createUpsertInput = () => ({
    userId,
    externalSubscriptionId: 'sub_123',
    plan: 'monthly' as const,
    status: 'active' as const,
    currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    expectedVersion: null,
  });

  const createFailingUpsertDb = (dbError: unknown) => {
    const tx = {
      execute: async () => undefined,
      select: () => ({
        from: () => ({
          where: () => ({
            for: async () => [],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: async () => {
            throw dbError;
          },
        }),
      }),
    };

    return {
      transaction: async (callback: (txArg: unknown) => Promise<unknown>) =>
        callback(tx),
    };
  };

  it('returns null from findByUserId when no subscription row exists', async () => {
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

    const repo = createRepo(db, priceIds);

    await expect(repo.findByUserId(userId)).resolves.toBeNull();
  });

  it('maps Stripe price ids to domain plan when loading subscriptions', async () => {
    const currentPeriodEnd = new Date('2026-12-31T00:00:00.000Z');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const db = {
      query: {
        stripeSubscriptions: {
          findFirst: async () => ({
            id: subscriptionRowId,
            userId: userId,
            stripeSubscriptionId: 'sub_123',
            status: 'active',
            priceId: 'price_monthly',
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
            createdAt,
            updatedAt,
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

    const repo = createRepo(db, priceIds);

    await expect(repo.findByUserId(userId)).resolves.toMatchObject({
      id: subscriptionRowId,
      userId: userId,
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      createdAt,
      updatedAt,
    });
  });

  it('throws INTERNAL_ERROR when a stored subscription has an unknown priceId', async () => {
    const db = {
      query: {
        stripeSubscriptions: {
          findFirst: async () => ({
            id: subscriptionRowId,
            userId: userId,
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

    const repo = createRepo(db, priceIds);

    await expect(repo.findByUserId(userId)).rejects.toBeInstanceOf(
      ApplicationError,
    );
    await expect(repo.findByUserId(userId)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('upserts subscriptions by userId and reuses one captured timestamp', async () => {
    const now = new Date('2026-02-01T02:03:04.000Z');
    const nowFn = vi.fn(() => now);
    const onConflictDoUpdate = async () => {};
    const values = (input: unknown) => ({
      onConflictDoUpdate: async (conflict: unknown) => {
        expect(input).toMatchObject({
          userId: userId,
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

    const tx = {
      execute: async () => undefined,
      select: () => ({
        from: () => ({
          where: () => ({
            for: async () => [],
          }),
        }),
      }),
      insert: () => ({ values }),
    };
    const db = {
      transaction: async (callback: (txArg: unknown) => Promise<unknown>) => {
        return callback(tx);
      },
    };

    const priceIds = {
      monthly: 'price_monthly',
      annual: 'price_annual',
    } as const;

    const repo = createRepo(db, priceIds, nowFn);

    await expect(
      repo.upsert({
        userId: userId,
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        expectedVersion: null,
      }),
    ).resolves.toEqual({ persisted: true });
    expect(nowFn).toHaveBeenCalledTimes(1);
  });

  it('serializes upserts per user before reading the current subscription row', async () => {
    const operations: string[] = [];
    const now = new Date('2026-02-01T02:03:04.000Z');
    const nowFn = vi.fn(() => {
      operations.push('timestamp');
      return now;
    });
    const forUpdate = vi.fn(async () => {
      operations.push('row-lock');
      return [];
    });
    const where = vi.fn(() => ({ for: forUpdate }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const onConflictDoUpdate = vi.fn(async () => {
      operations.push('write');
    });
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const tx = {
      execute: vi.fn(async () => {
        operations.push('user-lock');
      }),
      select,
      insert,
    };
    const db = {
      transaction: vi.fn(async (callback) => callback(tx)),
    } as const;

    const repo = createRepo(
      db,
      {
        monthly: 'price_monthly',
        annual: 'price_annual',
      },
      nowFn,
    );

    await expect(
      repo.upsert({
        userId: userId,
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        expectedVersion: null,
      }),
    ).resolves.toEqual({ persisted: true });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(nowFn).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(forUpdate).toHaveBeenCalledWith('update');
    expect(operations).toEqual(['user-lock', 'timestamp', 'row-lock', 'write']);
  });

  it('throws CONFLICT when the DB reports a unique-constraint violation during upsert', async () => {
    const tx = {
      execute: async () => undefined,
      select: () => ({
        from: () => ({
          where: () => ({
            for: async () => [],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: async () => {
            throw { cause: { code: '23505' } };
          },
        }),
      }),
    };
    const db = {
      transaction: async (callback: (txArg: unknown) => Promise<unknown>) => {
        return callback(tx);
      },
    };

    const priceIds = {
      monthly: 'price_monthly',
      annual: 'price_annual',
    } as const;

    const repo = createRepo(db, priceIds);

    await expect(
      repo.upsert({
        userId: userId,
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        expectedVersion: null,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws typed user_missing for the exact users foreign-key violation through a cause chain', async () => {
    const dbError = {
      cause: {
        cause: {
          code: '23503',
          constraint: 'stripe_subscriptions_user_id_users_id_fk',
        },
      },
    };
    const repo = createRepo(createFailingUpsertDb(dbError), priceIds);

    await expect(repo.upsert(createUpsertInput())).rejects.toMatchObject({
      name: 'SubscriptionUserMissingError',
      reason: 'user_missing',
      userId,
      cause: dbError,
    });
  });

  it('keeps a different foreign-key violation classified as INTERNAL_ERROR', async () => {
    const dbError = {
      cause: {
        cause: {
          code: '23503',
          constraint: 'some_other_user_id_fk',
        },
      },
    };
    const repo = createRepo(createFailingUpsertDb(dbError), priceIds);

    const promise = repo.upsert(createUpsertInput());

    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: dbError,
    });
  });

  it('throws INTERNAL_ERROR on unexpected database failures during upsert', async () => {
    const dbError = new Error('db down');
    const tx = {
      execute: async () => undefined,
      select: () => ({
        from: () => ({
          where: () => ({
            for: async () => [],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: async () => {
            throw dbError;
          },
        }),
      }),
    };
    const db = {
      transaction: async (callback: (txArg: unknown) => Promise<unknown>) => {
        return callback(tx);
      },
    };

    const priceIds = {
      monthly: 'price_monthly',
      annual: 'price_annual',
    } as const;

    const repo = createRepo(db, priceIds);

    let thrown: unknown;
    try {
      await repo.upsert({
        userId: userId,
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        expectedVersion: null,
      });
      expect.unreachable('Expected upsert to throw');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApplicationError);
    expect(thrown).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect((thrown as Error).cause).toBe(dbError);
  });

  it('findByExternalSubscriptionId returns null when missing', async () => {
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

    const repo = createRepo(db, priceIds);

    await expect(
      repo.findByExternalSubscriptionId('sub_123'),
    ).resolves.toBeNull();
  });

  it('findByExternalSubscriptionId maps priceId → plan when found', async () => {
    const db = {
      query: {
        stripeSubscriptions: {
          findFirst: async () => ({
            id: subscriptionRowId,
            userId: userId,
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

    const repo = createRepo(db, priceIds);

    await expect(
      repo.findByExternalSubscriptionId('sub_123'),
    ).resolves.toMatchObject({
      userId: userId,
      plan: 'annual',
    });
  });

  it('findByExternalSubscriptionId throws INTERNAL_ERROR when the stored priceId is unknown', async () => {
    const db = {
      query: {
        stripeSubscriptions: {
          findFirst: async () => ({
            id: subscriptionRowId,
            userId: userId,
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

    const repo = createRepo(db, priceIds);

    await expect(
      repo.findByExternalSubscriptionId('sub_123'),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      repo.findByExternalSubscriptionId('sub_123'),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
