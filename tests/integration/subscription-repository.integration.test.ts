import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import {
  getPostgresConstraintName,
  getPostgresErrorCode,
} from '@/src/adapters/repositories/postgres-errors';
import { SubscriptionUserMissingError } from '@/src/application/errors';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

// Real-Postgres twins for the retired subscription chain units: null lookups,
// the annual price mapping, unknown stored price ids, the injected clock on
// insert and conflict-update, and the real users foreign-key violation.
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const priceIds = {
  monthly: 'price_test_monthly',
  annual: 'price_test_annual',
} as const;

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

async function insertSubscription(userId: string, priceId: string) {
  const stripeSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
  const [inserted] = await db
    .insert(schema.stripeSubscriptions)
    .values({
      userId,
      stripeSubscriptionId,
      status: 'active',
      priceId,
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    })
    .returning({ id: schema.stripeSubscriptions.id });
  if (!inserted) throw new Error('Failed to insert subscription');
  return { id: inserted.id, stripeSubscriptionId };
}

async function storedRow(userId: string) {
  const [row] = await db
    .select({
      version: schema.stripeSubscriptions.version,
      updatedAt: schema.stripeSubscriptions.updatedAt,
      stripeSubscriptionId: schema.stripeSubscriptions.stripeSubscriptionId,
    })
    .from(schema.stripeSubscriptions)
    .where(eq(schema.stripeSubscriptions.userId, userId));
  if (!row) throw new Error('Expected a stored subscription row');
  return row;
}

describe('DrizzleSubscriptionRepository lookups', () => {
  it('returns null from findByUserId for a user without a subscription', async () => {
    const user = await createUser(db, cleanup);
    const repo = new DrizzleSubscriptionRepository(db, priceIds);

    await expect(repo.findByUserId(user.id)).resolves.toBeNull();
  });

  it('returns null from findByExternalSubscriptionId for an unknown external id', async () => {
    const repo = new DrizzleSubscriptionRepository(db, priceIds);

    await expect(
      repo.findByExternalSubscriptionId(
        `sub_${randomUUID().replaceAll('-', '')}`,
      ),
    ).resolves.toBeNull();
  });

  it('maps the annual price id to the annual plan from findByExternalSubscriptionId', async () => {
    const user = await createUser(db, cleanup);
    const { id, stripeSubscriptionId } = await insertSubscription(
      user.id,
      priceIds.annual,
    );
    const repo = new DrizzleSubscriptionRepository(db, priceIds);

    await expect(
      repo.findByExternalSubscriptionId(stripeSubscriptionId),
    ).resolves.toMatchObject({ id, userId: user.id, plan: 'annual' });
  });

  it('throws INTERNAL_ERROR from findByUserId for an unknown stored price id', async () => {
    const user = await createUser(db, cleanup);
    const { id } = await insertSubscription(user.id, priceIds.monthly);
    await db
      .update(schema.stripeSubscriptions)
      .set({ priceId: 'price_unknown' })
      .where(eq(schema.stripeSubscriptions.id, id));
    const repo = new DrizzleSubscriptionRepository(db, priceIds);

    await expect(repo.findByUserId(user.id)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: `Unknown Stripe price id "price_unknown" for subscription ${id}`,
    });
  });

  it('throws INTERNAL_ERROR from findByExternalSubscriptionId for an unknown stored price id', async () => {
    const user = await createUser(db, cleanup);
    const { id, stripeSubscriptionId } = await insertSubscription(
      user.id,
      priceIds.monthly,
    );
    await db
      .update(schema.stripeSubscriptions)
      .set({ priceId: 'price_unknown' })
      .where(eq(schema.stripeSubscriptions.id, id));
    const repo = new DrizzleSubscriptionRepository(db, priceIds);

    await expect(
      repo.findByExternalSubscriptionId(stripeSubscriptionId),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('DrizzleSubscriptionRepository upsert', () => {
  it('persists the injected timestamp as updated_at on insert and on conflict-update', async () => {
    const user = await createUser(db, cleanup);
    const stamps = [
      new Date('2026-03-06T10:00:00.000Z'),
      new Date('2026-03-06T11:00:00.000Z'),
    ];
    const now = () => {
      const stamp = stamps.shift();
      if (!stamp) throw new Error('The clock was consulted more than twice');
      return stamp;
    };
    const repo = new DrizzleSubscriptionRepository(db, priceIds, now);
    const firstId = `sub_${randomUUID().replaceAll('-', '')}`;
    const secondId = `sub_${randomUUID().replaceAll('-', '')}`;

    await expect(
      repo.upsert({
        userId: user.id,
        externalSubscriptionId: firstId,
        expectedVersion: null,
        status: 'active',
        plan: 'monthly',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).resolves.toEqual({ persisted: true });
    await expect(storedRow(user.id)).resolves.toMatchObject({
      version: 1,
      updatedAt: new Date('2026-03-06T10:00:00.000Z'),
      stripeSubscriptionId: firstId,
    });

    await expect(
      repo.upsert({
        userId: user.id,
        externalSubscriptionId: secondId,
        expectedVersion: 1,
        status: 'active',
        plan: 'annual',
        currentPeriodEnd: new Date('2027-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).resolves.toEqual({ persisted: true });
    await expect(storedRow(user.id)).resolves.toMatchObject({
      version: 2,
      updatedAt: new Date('2026-03-06T11:00:00.000Z'),
      stripeSubscriptionId: secondId,
    });
    expect(stamps).toHaveLength(0);
  });

  it('throws the typed user_missing error with the real foreign-key violation as its cause', async () => {
    const repo = new DrizzleSubscriptionRepository(db, priceIds);
    const missingUserId = randomUUID();

    const error = await repo
      .upsert({
        userId: missingUserId,
        externalSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
        expectedVersion: null,
        status: 'active',
        plan: 'monthly',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      })
      .then(
        () => null,
        (thrown: unknown) => thrown,
      );

    expect(error).toBeInstanceOf(SubscriptionUserMissingError);
    if (!(error instanceof SubscriptionUserMissingError)) {
      throw new Error('Expected SubscriptionUserMissingError');
    }
    expect(error.reason).toBe('user_missing');
    expect(getPostgresErrorCode(error.cause)).toBe('23503');
    expect(getPostgresConstraintName(error.cause)).toBe(
      'stripe_subscriptions_user_id_users_id_fk',
    );
  });
});
