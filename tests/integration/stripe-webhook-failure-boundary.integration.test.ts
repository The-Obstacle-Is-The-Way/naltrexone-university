import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import { createStripeWebhookRenewalAcknowledgmentTestDeps } from '@/src/adapters/controllers/test-helpers/stripe-webhook-renewal-acknowledgment';
import { DrizzleRenewalConsentRecordRepository } from '@/src/adapters/repositories/drizzle-renewal-consent-record-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from '@/src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeLogger,
  FakePaymentGateway,
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

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('Stripe webhook failure boundary', () => {
  it('BUG-285 persists the original failure after a statement aborts the processing transaction', async () => {
    const mappedUser = await createUser(db, cleanup);
    const processingUser = await createUser(db, cleanup);
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const externalCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
    cleanup.stripeEventIds.push(eventId);

    await new DrizzleStripeCustomerRepository(db).insert(
      mappedUser.id,
      externalCustomerId,
    );

    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_unused',
      checkoutUrl: 'https://stripe.test/checkout',
      portalUrl: 'https://stripe.test/portal',
      webhookResult: {
        eventId,
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId: processingUser.id,
          externalCustomerId,
          externalSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2027-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });
    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    } as const;
    const acknowledgment = createStripeWebhookRenewalAcknowledgmentTestDeps();

    let surfacedError: unknown;
    try {
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
                renewalConsentRecords:
                  new DrizzleRenewalConsentRecordRepository(tx),
                ...acknowledgment.transaction,
              }),
            ),
        },
        { rawBody: 'raw', signature: 'sig_bug_285' },
      );
    } catch (error) {
      surfacedError = error;
    }

    expect(surfacedError).toBeInstanceOf(ApplicationError);
    expect(surfacedError).toMatchObject({
      code: 'CONFLICT',
      message: 'Stripe customer id is already mapped to a different user',
    });

    const failedEvent = await db.query.stripeEvents.findFirst({
      where: eq(schema.stripeEvents.id, eventId),
    });
    expect(failedEvent).toMatchObject({
      id: eventId,
      type: 'customer.subscription.updated',
      processedAt: null,
    });
    expect(JSON.parse(failedEvent?.error ?? '{}')).toEqual({
      name: 'ApplicationError',
      code: 'CONFLICT',
    });
    expect(failedEvent?.error).not.toContain(
      'Stripe customer id is already mapped to a different user',
    );

    await expect(
      new DrizzleSubscriptionRepository(db, priceIds).findByUserId(
        processingUser.id,
      ),
    ).resolves.toBeNull();
  });
});
