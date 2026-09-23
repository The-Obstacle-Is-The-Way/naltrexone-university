import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import type { ClerkWebhookEvent } from '@/src/adapters/controllers/clerk-webhook-controller';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import type { StripeWebhookInput } from '@/src/adapters/controllers/stripe-webhook-controller';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import { createStripeWebhookRenewalAcknowledgmentTestDeps } from '@/src/adapters/controllers/test-helpers/stripe-webhook-renewal-acknowledgment';
import { DrizzleClerkEventRepository } from '@/src/adapters/repositories/drizzle-clerk-event-repository';
import { DrizzleDeletedClerkUserRepository } from '@/src/adapters/repositories/drizzle-deleted-clerk-user-repository';
import { DrizzlePendingStripeCustomerCleanupRepository } from '@/src/adapters/repositories/drizzle-pending-stripe-customer-cleanup-repository';
import { DrizzleRenewalConsentRecordRepository } from '@/src/adapters/repositories/drizzle-renewal-consent-record-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from '@/src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import {
  FakeLogger,
  FakePaymentGateway,
} from '@/src/application/test-helpers/fakes';

import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = {
  ...createCleanupState(),
  clerkEventIds: [] as string[],
  deletedClerkUserIds: [] as string[],
};

async function createUser(): Promise<{
  id: string;
  email: string;
  clerkUserId: string;
}> {
  const email = `it-${randomUUID()}@example.com`;
  const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;

  const [row] = await db
    .insert(schema.users)
    .values({ email, clerkUserId })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      clerkUserId: schema.users.clerkUserId,
    });

  if (!row) {
    throw new Error('Failed to insert user');
  }

  cleanup.userIds.push(row.id);
  return row;
}

afterEach(async () => {
  if (cleanup.clerkEventIds.length > 0) {
    await db
      .delete(schema.clerkEvents)
      .where(inArray(schema.clerkEvents.id, cleanup.clerkEventIds));
  }
  if (cleanup.deletedClerkUserIds.length > 0) {
    await db
      .delete(schema.deletedClerkUsers)
      .where(
        inArray(
          schema.deletedClerkUsers.clerkUserId,
          cleanup.deletedClerkUserIds,
        ),
      );
  }
  await cleanupAfterEach(db, cleanup);
  cleanup.clerkEventIds.length = 0;
  cleanup.deletedClerkUserIds.length = 0;
});
afterAll(async () => {
  await closeConnection(sql);
});

describe('stripe webhook controller (integration)', () => {
  it('persists subscription updates and marks the Stripe event as processed', async () => {
    const user = await createUser();
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    cleanup.stripeEventIds.push(eventId);

    const subscriptionUpdate = {
      userId: user.id,
      externalCustomerId: `cus_${randomUUID().replaceAll('-', '')}`,
      externalSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
      plan: 'monthly' as const,
      status: 'active' as const,
      currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    };

    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_unused',
      checkoutUrl: 'https://stripe.test/checkout',
      portalUrl: 'https://stripe.test/portal',
      webhookResult: {
        eventId,
        type: 'customer.subscription.updated',
        subscriptionUpdate,
      },
    });

    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    };

    const input: StripeWebhookInput = { rawBody: 'raw', signature: 'sig_1' };
    const acknowledgment = createStripeWebhookRenewalAcknowledgmentTestDeps();

    await processStripeWebhook(
      {
        paymentGateway,
        subscriptionVersions: new DrizzleSubscriptionRepository(db, priceIds),
        logger: new FakeLogger(),
        now: () => new Date(),
        ...acknowledgment.webhook,
        transaction: async (fn) =>
          db.transaction(async (tx) =>
            fn({
              stripeEvents: new DrizzleStripeEventRepository(tx),
              subscriptions: new DrizzleSubscriptionRepository(tx, priceIds),
              stripeCustomers: new DrizzleStripeCustomerRepository(tx),
              trialPaymentMethodSetupOperations:
                new DrizzleTrialPaymentMethodSetupOperationRepository(tx),
              renewalConsentRecords: new DrizzleRenewalConsentRecordRepository(
                tx,
              ),
              ...acknowledgment.transaction,
            }),
          ),
      },
      input,
    );

    const stripeCustomers = new DrizzleStripeCustomerRepository(db);
    await expect(stripeCustomers.findByUserId(user.id)).resolves.toEqual({
      stripeCustomerId: subscriptionUpdate.externalCustomerId,
    });

    const subscriptions = new DrizzleSubscriptionRepository(db, priceIds);
    const subscription = await subscriptions.findByUserId(user.id);
    expect(subscription).toMatchObject({
      userId: user.id,
      plan: 'monthly',
      status: 'active',
      cancelAtPeriodEnd: false,
    });
    expect(subscription?.currentPeriodEnd.toISOString()).toBe(
      subscriptionUpdate.currentPeriodEnd.toISOString(),
    );

    const event = await db.query.stripeEvents.findFirst({
      where: eq(schema.stripeEvents.id, eventId),
    });
    expect(event).toMatchObject({
      id: eventId,
      type: 'customer.subscription.updated',
      error: null,
    });
    expect(event?.processedAt).toBeInstanceOf(Date);
  });
});

describe('clerk webhook controller (integration)', () => {
  it('deletes the user and cascades stripe data on user.deleted', async () => {
    const user = await createUser();
    const stripeCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;

    await db.insert(schema.stripeCustomers).values({
      userId: user.id,
      stripeCustomerId,
    });

    await db.insert(schema.stripeSubscriptions).values({
      userId: user.id,
      stripeSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
      status: 'active',
      priceId: 'price_test_monthly',
      currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
    });

    const deleteStripeCustomer = vi.fn(async () => undefined);
    const userRepository = new DrizzleUserRepository(db);
    const clerkEventRepository = new DrizzleClerkEventRepository(db);
    const deletedClerkUserRepository = new DrizzleDeletedClerkUserRepository(
      db,
    );
    const pendingStripeCustomerCleanupRepository =
      new DrizzlePendingStripeCustomerCleanupRepository(db);
    const stripeCustomerRepository = new DrizzleStripeCustomerRepository(db);

    const deps = {
      transaction: async <T>(
        fn: (tx: {
          clerkEvents: DrizzleClerkEventRepository;
          deletedClerkUsers: DrizzleDeletedClerkUserRepository;
          pendingStripeCustomerCleanups: DrizzlePendingStripeCustomerCleanupRepository;
          userRepository: DrizzleUserRepository;
          stripeCustomerRepository: DrizzleStripeCustomerRepository;
        }) => Promise<T>,
      ) =>
        db.transaction(async (tx) =>
          fn({
            clerkEvents: new DrizzleClerkEventRepository(tx),
            deletedClerkUsers: new DrizzleDeletedClerkUserRepository(tx),
            pendingStripeCustomerCleanups:
              new DrizzlePendingStripeCustomerCleanupRepository(tx),
            userRepository: new DrizzleUserRepository(tx),
            stripeCustomerRepository: new DrizzleStripeCustomerRepository(tx),
          }),
        ),
      deleteStripeCustomer,
      getClerkUserById: async () => null,
      logger: new FakeLogger(),
    };

    const event: ClerkWebhookEvent = {
      eventId,
      type: 'user.deleted',
      data: { id: user.clerkUserId },
    };

    cleanup.clerkEventIds.push(eventId);
    cleanup.deletedClerkUserIds.push(user.clerkUserId);
    await processClerkWebhook(deps, event);

    expect(deleteStripeCustomer).toHaveBeenCalledTimes(1);
    expect(deleteStripeCustomer).toHaveBeenCalledWith(stripeCustomerId);

    await expect(
      userRepository.findByClerkId(user.clerkUserId),
    ).resolves.toBeNull();
    await expect(
      deletedClerkUserRepository.exists(user.clerkUserId),
    ).resolves.toBe(true);
    await expect(clerkEventRepository.peek(eventId)).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
    await expect(
      pendingStripeCustomerCleanupRepository.findByEventId(eventId),
    ).resolves.toBeNull();
    await expect(
      stripeCustomerRepository.findByUserId(user.id),
    ).resolves.toBeNull();
    await expect(
      db.query.stripeSubscriptions.findFirst({
        where: eq(schema.stripeSubscriptions.userId, user.id),
      }),
    ).resolves.toBeUndefined();
  });

  it('retries a pending Stripe customer cleanup after the local delete already committed', async () => {
    const user = await createUser();
    const stripeCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;

    await db.insert(schema.stripeCustomers).values({
      userId: user.id,
      stripeCustomerId,
    });

    const clerkEventRepository = new DrizzleClerkEventRepository(db);
    const deletedClerkUserRepository = new DrizzleDeletedClerkUserRepository(
      db,
    );
    const pendingStripeCustomerCleanupRepository =
      new DrizzlePendingStripeCustomerCleanupRepository(db);
    const userRepository = new DrizzleUserRepository(db);

    let shouldFailCustomerDelete = true;
    const deleteStripeCustomer = vi.fn(async () => {
      if (shouldFailCustomerDelete) {
        throw new Error('stripe customer delete failed');
      }
    });

    const deps = {
      transaction: async <T>(
        fn: (tx: {
          clerkEvents: DrizzleClerkEventRepository;
          deletedClerkUsers: DrizzleDeletedClerkUserRepository;
          pendingStripeCustomerCleanups: DrizzlePendingStripeCustomerCleanupRepository;
          userRepository: DrizzleUserRepository;
          stripeCustomerRepository: DrizzleStripeCustomerRepository;
        }) => Promise<T>,
      ) =>
        db.transaction(async (tx) =>
          fn({
            clerkEvents: new DrizzleClerkEventRepository(tx),
            deletedClerkUsers: new DrizzleDeletedClerkUserRepository(tx),
            pendingStripeCustomerCleanups:
              new DrizzlePendingStripeCustomerCleanupRepository(tx),
            userRepository: new DrizzleUserRepository(tx),
            stripeCustomerRepository: new DrizzleStripeCustomerRepository(tx),
          }),
        ),
      deleteStripeCustomer,
      getClerkUserById: async () => null,
      logger: new FakeLogger(),
    };

    const event: ClerkWebhookEvent = {
      eventId,
      type: 'user.deleted',
      data: { id: user.clerkUserId },
    };

    cleanup.clerkEventIds.push(eventId);
    cleanup.deletedClerkUserIds.push(user.clerkUserId);

    await expect(processClerkWebhook(deps, event)).rejects.toThrow(
      'stripe customer delete failed',
    );

    await expect(
      userRepository.findByClerkId(user.clerkUserId),
    ).resolves.toBeNull();
    await expect(
      deletedClerkUserRepository.exists(user.clerkUserId),
    ).resolves.toBe(true);
    await expect(
      pendingStripeCustomerCleanupRepository.findByEventId(eventId),
    ).resolves.toEqual({ stripeCustomerId });
    const storedEvent = await clerkEventRepository.peek(eventId);
    expect(storedEvent).toMatchObject({
      processedAt: null,
      error: expect.any(String),
    });
    expect(JSON.parse(storedEvent?.error ?? '{}')).toEqual({ name: 'Error' });
    expect(storedEvent?.error).not.toContain('stripe customer delete failed');

    shouldFailCustomerDelete = false;
    await expect(processClerkWebhook(deps, event)).resolves.toBeUndefined();

    expect(deleteStripeCustomer).toHaveBeenCalledTimes(2);
    await expect(
      pendingStripeCustomerCleanupRepository.findByEventId(eventId),
    ).resolves.toBeNull();
    await expect(clerkEventRepository.peek(eventId)).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('ignores replayed user.updated deliveries after user.deleted', async () => {
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;
    const updatedEventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const deletedEventId = `evt_${randomUUID().replaceAll('-', '')}`;

    cleanup.clerkEventIds.push(updatedEventId, deletedEventId);
    cleanup.deletedClerkUserIds.push(clerkUserId);

    const userRepository = new DrizzleUserRepository(db);
    const deletedClerkUserRepository = new DrizzleDeletedClerkUserRepository(
      db,
    );

    const deps = {
      transaction: async <T>(
        fn: (tx: {
          clerkEvents: DrizzleClerkEventRepository;
          deletedClerkUsers: DrizzleDeletedClerkUserRepository;
          pendingStripeCustomerCleanups: DrizzlePendingStripeCustomerCleanupRepository;
          userRepository: DrizzleUserRepository;
          stripeCustomerRepository: DrizzleStripeCustomerRepository;
        }) => Promise<T>,
      ) =>
        db.transaction(async (tx) =>
          fn({
            clerkEvents: new DrizzleClerkEventRepository(tx),
            deletedClerkUsers: new DrizzleDeletedClerkUserRepository(tx),
            pendingStripeCustomerCleanups:
              new DrizzlePendingStripeCustomerCleanupRepository(tx),
            userRepository: new DrizzleUserRepository(tx),
            stripeCustomerRepository: new DrizzleStripeCustomerRepository(tx),
          }),
        ),
      deleteStripeCustomer: vi.fn(async () => undefined),
      getClerkUserById: async () => null,
      logger: new FakeLogger(),
    };

    const updatedEvent: ClerkWebhookEvent = {
      eventId: updatedEventId,
      type: 'user.updated',
      data: {
        id: clerkUserId,
        primary_email_address_id: 'email_1',
        updated_at: 1769904000000,
        email_addresses: [
          { id: 'email_1', email_address: `it-${randomUUID()}@example.com` },
        ],
      },
    };

    await processClerkWebhook(deps, updatedEvent);

    const createdUser = await userRepository.findByClerkId(clerkUserId);
    expect(createdUser).toMatchObject({ email: expect.stringContaining('@') });
    if (createdUser) {
      cleanup.userIds.push(createdUser.id);
    }

    await processClerkWebhook(deps, {
      eventId: deletedEventId,
      type: 'user.deleted',
      data: { id: clerkUserId },
    });

    await processClerkWebhook(deps, updatedEvent);

    await expect(userRepository.findByClerkId(clerkUserId)).resolves.toBeNull();
    await expect(deletedClerkUserRepository.exists(clerkUserId)).resolves.toBe(
      true,
    );
  });
});
