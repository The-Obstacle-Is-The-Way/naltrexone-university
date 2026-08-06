import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createWebhookHandler } from '@/app/api/stripe/webhook/handler';
import * as schema from '@/db/schema';
import {
  processStripeWebhook,
  type StripeWebhookDeps,
} from '@/src/adapters/controllers/stripe-webhook-controller';
import { DrizzleRenewalConsentRecordRepository } from '@/src/adapters/repositories/drizzle-renewal-consent-record-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from '@/src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository';
import {
  FakeLogger,
  FakePaymentGateway,
  FakeRateLimiter,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

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

function createPost(deps: StripeWebhookDeps, logger: FakeLogger) {
  return createWebhookHandler(
    () => ({
      logger: {
        error: (context: unknown, message: string) =>
          logger.error({ context }, message),
      },
      createRateLimiter: () => new FakeRateLimiter(),
      createStripeWebhookDeps: () => deps,
    }),
    processStripeWebhook,
  );
}

function createRequest(signature: string): Request {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body: 'raw',
  });
}

describe('BUG-296 post-deletion Stripe subscription webhook', () => {
  it('returns 200, warns, and records a non-failed event when the local user was deleted', async () => {
    const user = await createUser(db, cleanup);
    await db.delete(schema.users).where(eq(schema.users.id, user.id));

    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    cleanup.stripeEventIds.push(eventId);
    const subscriptionUpdate = {
      userId: user.id,
      externalCustomerId: `cus_${randomUUID().replaceAll('-', '')}`,
      externalSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
      plan: 'monthly' as const,
      status: 'canceled' as const,
      currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    };
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_unused',
      checkoutUrl: 'https://stripe.test/checkout',
      portalUrl: 'https://stripe.test/portal',
      webhookResult: {
        eventId,
        type: 'customer.subscription.deleted',
        subscriptionUpdate,
      },
    });
    const logger = new FakeLogger();
    const deps: StripeWebhookDeps = {
      paymentGateway,
      subscriptionVersions: new DrizzleSubscriptionRepository(db, priceIds),
      logger,
      now: () => new Date(),
      transaction: (fn) =>
        db.transaction((tx) =>
          fn({
            stripeEvents: new DrizzleStripeEventRepository(tx),
            subscriptions: new DrizzleSubscriptionRepository(tx, priceIds),
            stripeCustomers: new DrizzleStripeCustomerRepository(tx),
            trialPaymentMethodSetupOperations:
              new DrizzleTrialPaymentMethodSetupOperationRepository(tx),
            renewalConsentRecords: new DrizzleRenewalConsentRecordRepository(
              tx,
            ),
          }),
        ),
    };

    const response = await createPost(
      deps,
      logger,
    )(createRequest('sig_deleted_user'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(logger.warnCalls).toContainEqual({
      context: {
        reason: 'user_missing',
        eventId,
        eventType: 'customer.subscription.deleted',
        stripeCustomerId: subscriptionUpdate.externalCustomerId,
        userId: user.id,
      },
      msg: 'Acknowledging Stripe subscription webhook for missing local user',
    });
    const event = await db.query.stripeEvents.findFirst({
      where: eq(schema.stripeEvents.id, eventId),
    });
    expect(event).toMatchObject({
      id: eventId,
      type: 'customer.subscription.deleted',
      error: null,
    });
    expect(event?.processedAt).toBeInstanceOf(Date);
  });

  it('returns 500 and records INTERNAL_ERROR for a different user foreign-key violation', async () => {
    const missingUserId = randomUUID();
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    cleanup.stripeEventIds.push(eventId);
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_unused',
      checkoutUrl: 'https://stripe.test/checkout',
      portalUrl: 'https://stripe.test/portal',
      webhookResult: {
        eventId,
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId: missingUserId,
          externalCustomerId: `cus_${randomUUID().replaceAll('-', '')}`,
          externalSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });
    const subscriptions = new FakeSubscriptionRepository();
    const logger = new FakeLogger();
    const deps: StripeWebhookDeps = {
      paymentGateway,
      subscriptionVersions: subscriptions,
      logger,
      now: () => new Date(),
      transaction: (fn) =>
        db.transaction((tx) =>
          fn({
            stripeEvents: new DrizzleStripeEventRepository(tx),
            subscriptions,
            // This real adapter hits stripe_customers_user_id_users_id_fk,
            // not the narrowly acknowledged subscription constraint.
            stripeCustomers: new DrizzleStripeCustomerRepository(tx),
            trialPaymentMethodSetupOperations:
              new DrizzleTrialPaymentMethodSetupOperationRepository(tx),
            renewalConsentRecords: new DrizzleRenewalConsentRecordRepository(
              tx,
            ),
          }),
        ),
    };

    const response = await createPost(
      deps,
      logger,
    )(createRequest('sig_other_fk'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Webhook processing failed',
    });
    const event = await db.query.stripeEvents.findFirst({
      where: eq(schema.stripeEvents.id, eventId),
    });
    expect(event).toMatchObject({
      id: eventId,
      type: 'customer.subscription.updated',
      processedAt: null,
    });
    expect(event?.error).toContain('"code":"INTERNAL_ERROR"');
  });
});
