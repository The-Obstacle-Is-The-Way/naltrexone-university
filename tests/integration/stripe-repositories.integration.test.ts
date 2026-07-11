import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { drainPendingStripeCancellations } from '@/src/adapters/jobs/drain-pending-stripe-cancellations';
import { DrizzlePendingStripeCancellationRepository } from '@/src/adapters/repositories/drizzle-pending-stripe-cancellation-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { ApplicationError } from '@/src/application/errors';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
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

  it('drains stale pending Stripe cancellations and leaves fresh rows untouched', async () => {
    const staleEventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const freshEventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const repo = new DrizzlePendingStripeCancellationRepository(db);
    const logger = new FakeLogger();
    const canceledCustomerIds: string[] = [];

    try {
      await db.insert(schema.clerkEvents).values([
        {
          id: staleEventId,
          type: 'user.deleted',
          createdAt: new Date('2026-06-12T12:00:00.000Z'),
        },
        {
          id: freshEventId,
          type: 'user.deleted',
          createdAt: new Date('2026-06-12T12:20:00.000Z'),
        },
      ]);

      await db.insert(schema.pendingStripeCancellations).values([
        {
          eventId: staleEventId,
          stripeCustomerId: 'cus_stale',
          createdAt: new Date('2026-06-12T12:00:00.000Z'),
        },
        {
          eventId: freshEventId,
          stripeCustomerId: 'cus_fresh',
          createdAt: new Date('2026-06-12T12:20:00.000Z'),
        },
      ]);

      const result = await drainPendingStripeCancellations(
        {
          olderThan: new Date('2026-06-12T12:15:00.000Z'),
          dryRun: false,
        },
        {
          pendingStripeCancellations: repo,
          cancelStripeCustomerSubscriptions: async (stripeCustomerId) => {
            canceledCustomerIds.push(stripeCustomerId);
          },
          logger,
        },
      );

      expect(result).toEqual({
        scanned: 1,
        drained: 1,
        failed: 0,
        failures: [],
        dryRun: false,
      });
      expect(canceledCustomerIds).toEqual(['cus_stale']);
      await expect(repo.findByEventId(staleEventId)).resolves.toBeNull();
      await expect(repo.findByEventId(freshEventId)).resolves.toEqual({
        stripeCustomerId: 'cus_fresh',
      });
    } finally {
      await db
        .delete(schema.clerkEvents)
        .where(inArray(schema.clerkEvents.id, [staleEventId, freshEventId]));
    }
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
      expectedVersion: null,
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
      expectedVersion: 1,
      status: 'active',
      plan: 'annual',
      currentPeriodEnd: periodEnd2,
      cancelAtPeriodEnd: true,
    });

    const byUser2 = await repo.findByUserId(user.id);
    expect(byUser2).toMatchObject({
      userId: user.id,
      plan: 'annual',
      status: 'active',
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

  it('does not replace a current entitled row with a superseded terminal subscription', async () => {
    const user = await createUser(db, cleanup);

    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    } as const;

    const repo = new DrizzleSubscriptionRepository(
      db,
      priceIds,
      () => new Date('2026-06-12T12:00:00.000Z'),
    );
    const currentSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
    const supersededSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;

    await repo.upsert({
      userId: user.id,
      externalSubscriptionId: currentSubscriptionId,
      expectedVersion: null,
      status: 'active',
      plan: 'annual',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await repo.upsert({
      userId: user.id,
      externalSubscriptionId: supersededSubscriptionId,
      expectedVersion: 1,
      status: 'canceled',
      plan: 'monthly',
      currentPeriodEnd: new Date('2026-05-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(repo.findByUserId(user.id)).resolves.toMatchObject({
      userId: user.id,
      plan: 'annual',
      status: 'active',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
    });
    await expect(
      repo.findByExternalSubscriptionId(currentSubscriptionId),
    ).resolves.toMatchObject({
      userId: user.id,
      status: 'active',
    });
    await expect(
      repo.findByExternalSubscriptionId(supersededSubscriptionId),
    ).resolves.toBeNull();
  });

  it('keeps legitimate same-subscription terminal transitions', async () => {
    const user = await createUser(db, cleanup);

    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    } as const;

    const repo = new DrizzleSubscriptionRepository(
      db,
      priceIds,
      () => new Date('2026-06-12T12:00:00.000Z'),
    );
    const stripeSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;

    await repo.upsert({
      userId: user.id,
      externalSubscriptionId: stripeSubscriptionId,
      expectedVersion: null,
      status: 'active',
      plan: 'monthly',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await repo.upsert({
      userId: user.id,
      externalSubscriptionId: stripeSubscriptionId,
      expectedVersion: 1,
      status: 'canceled',
      plan: 'monthly',
      currentPeriodEnd: new Date('2026-05-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(
      repo.findByExternalSubscriptionId(stripeSubscriptionId),
    ).resolves.toMatchObject({
      userId: user.id,
      status: 'canceled',
      currentPeriodEnd: new Date('2026-05-31T00:00:00.000Z'),
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
      expectedVersion: null,
      status: 'active',
      plan: 'monthly',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(
      repo.upsert({
        userId: userB.id,
        externalSubscriptionId: stripeSubscriptionId,
        expectedVersion: null,
        status: 'active',
        plan: 'monthly',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
