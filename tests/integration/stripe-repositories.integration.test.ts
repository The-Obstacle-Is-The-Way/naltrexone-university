import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { ApplicationError } from '@/src/application/errors';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('Stripe repositories', () => {
  it('persists Stripe events with idempotency and processed tracking', async () => {
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    cleanup.stripeEventIds.push(eventId);

    const repo = new DrizzleStripeEventRepository(db);

    expect(await repo.claim(eventId, 'checkout.session.completed')).toBe(true);
    await expect(repo.lock(eventId)).resolves.toEqual({
      processedAt: null,
      error: null,
    });

    await repo.markProcessed(eventId);
    await expect(repo.lock(eventId)).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });

    expect(await repo.claim(eventId, 'checkout.session.completed')).toBe(false);

    await repo.markFailed(eventId, 'boom');
    await expect(repo.lock(eventId)).resolves.toEqual({
      processedAt: null,
      error: 'boom',
    });
  });

  it('upserts Stripe customers per user', async () => {
    const user = await createUser(db, cleanup);
    const otherUser = await createUser(db, cleanup);
    const repo = new DrizzleStripeCustomerRepository(db);

    await repo.insert(user.id, 'cus_123');
    await expect(repo.findByUserId(user.id)).resolves.toEqual({
      stripeCustomerId: 'cus_123',
    });

    await repo.insert(user.id, 'cus_123');

    await expect(repo.insert(otherUser.id, 'cus_123')).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    await expect(repo.insert(user.id, 'cus_456')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('maps Stripe price ids to domain plan when loading subscriptions', async () => {
    const user = await createUser(db, cleanup);

    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    } as const;

    const repo = new DrizzleSubscriptionRepository(db, priceIds);

    const [inserted] = await db
      .insert(schema.stripeSubscriptions)
      .values({
        userId: user.id,
        stripeSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
        status: 'active',
        priceId: priceIds.monthly,
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      })
      .returning({ id: schema.stripeSubscriptions.id });

    if (!inserted) throw new Error('Failed to insert subscription');

    const subscription = await repo.findByUserId(user.id);
    expect(subscription?.plan).toBe('monthly');

    await db
      .update(schema.stripeSubscriptions)
      .set({ priceId: 'price_unknown' })
      .where(eq(schema.stripeSubscriptions.id, inserted.id));

    await expect(repo.findByUserId(user.id)).rejects.toBeInstanceOf(
      ApplicationError,
    );
  });

  it('upserts subscriptions per user and supports lookup by externalSubscriptionId', async () => {
    const user = await createUser(db, cleanup);

    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    } as const;

    const repo = new DrizzleSubscriptionRepository(db, priceIds);

    const stripeSubscriptionId1 = `sub_${randomUUID().replaceAll('-', '')}`;
    const periodEnd1 = new Date('2026-12-31T00:00:00.000Z');

    await repo.upsert({
      userId: user.id,
      externalSubscriptionId: stripeSubscriptionId1,
      status: 'active',
      plan: 'monthly',
      currentPeriodEnd: periodEnd1,
      cancelAtPeriodEnd: false,
    });

    const byUser1 = await repo.findByUserId(user.id);
    expect(byUser1).toMatchObject({
      userId: user.id,
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: periodEnd1,
      cancelAtPeriodEnd: false,
    });

    const byStripeSubId1 = await repo.findByExternalSubscriptionId(
      stripeSubscriptionId1,
    );
    expect(byStripeSubId1?.userId).toBe(user.id);

    const stripeSubscriptionId2 = `sub_${randomUUID().replaceAll('-', '')}`;
    const periodEnd2 = new Date('2027-01-31T00:00:00.000Z');

    await repo.upsert({
      userId: user.id,
      externalSubscriptionId: stripeSubscriptionId2,
      status: 'canceled',
      plan: 'annual',
      currentPeriodEnd: periodEnd2,
      cancelAtPeriodEnd: true,
    });

    const byUser2 = await repo.findByUserId(user.id);
    expect(byUser2).toMatchObject({
      userId: user.id,
      plan: 'annual',
      status: 'canceled',
      currentPeriodEnd: periodEnd2,
      cancelAtPeriodEnd: true,
    });

    await expect(
      repo.findByExternalSubscriptionId(stripeSubscriptionId1),
    ).resolves.toBeNull();
    await expect(
      repo.findByExternalSubscriptionId(stripeSubscriptionId2),
    ).resolves.toMatchObject({
      userId: user.id,
    });
  });

  it('throws CONFLICT when externalSubscriptionId is already mapped to a different user', async () => {
    const userA = await createUser(db, cleanup);
    const userB = await createUser(db, cleanup);

    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    } as const;

    const repo = new DrizzleSubscriptionRepository(db, priceIds);
    const stripeSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;

    await repo.upsert({
      userId: userA.id,
      externalSubscriptionId: stripeSubscriptionId,
      status: 'active',
      plan: 'monthly',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(
      repo.upsert({
        userId: userB.id,
        externalSubscriptionId: stripeSubscriptionId,
        status: 'active',
        plan: 'monthly',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
