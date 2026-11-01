import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  renewalConsentRecords,
  renewalNoticeDeliveries,
  stripeSubscriptions,
} from '@/db/schema';
import {
  processStripeWebhook,
  type StripeWebhookDeps,
} from '@/src/adapters/controllers/stripe-webhook-controller';
import { seedPendingTrialSetupOperation } from '@/src/adapters/controllers/test-helpers/stripe-webhook-controller-harness';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import { DrizzleRenewalConsentRecordRepository } from '@/src/adapters/repositories/drizzle-renewal-consent-record-repository';
import { DrizzleRenewalNoticeDeliveryRepository } from '@/src/adapters/repositories/drizzle-renewal-notice-delivery-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from '@/src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import type { WebhookEventResult } from '@/src/application/ports/gateways';
import {
  FakeLogger,
  FakeOperationalAlerts,
  FakePaymentGateway,
  FakeTransactionalEmailGateway,
} from '@/src/application/test-helpers/fakes';
import { createTestWebhookTrialSetupCompletion } from '@/src/application/test-helpers/webhook-event-results';
import { DispatchRenewalNoticeDeliveryUseCase } from '@/src/application/use-cases';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

// BUG-364 (DEBT-414 F22): an add-card setup Session opened before the trial's
// portal cancellation completes after it. Against Postgres, completion records
// no renewal consent or acknowledgment and leaves no saved card, whether the
// cancellation was recorded before completion began or while it called Stripe.

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const setupSessionIds: string[] = [];
const now = new Date('2026-08-07T12:00:00.000Z');
const priceIds = {
  monthly: 'price_test_monthly',
  annual: 'price_test_annual',
} as const;

type TrialSetupCompletion = NonNullable<
  WebhookEventResult['trialPaymentMethodSetupCompletion']
>;

afterEach(async () => {
  if (setupSessionIds.length > 0) {
    const consents = await db
      .select({ id: renewalConsentRecords.id })
      .from(renewalConsentRecords)
      .where(inArray(renewalConsentRecords.setupSessionId, setupSessionIds));
    const consentIds = consents.map((row) => row.id);
    if (consentIds.length > 0) {
      await db
        .delete(renewalNoticeDeliveries)
        .where(inArray(renewalNoticeDeliveries.consentRecordId, consentIds));
      await db
        .delete(renewalConsentRecords)
        .where(inArray(renewalConsentRecords.id, consentIds));
    }
  }
  setupSessionIds.length = 0;
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

async function scheduleCancellation(externalSubscriptionId: string) {
  await db
    .update(stripeSubscriptions)
    .set({ cancelAtPeriodEnd: true })
    .where(
      eq(stripeSubscriptions.stripeSubscriptionId, externalSubscriptionId),
    );
}

// Calls the cancellation hook once Stripe has set the card as the default, as
// a portal cancellation's webhook would land between completion's steps.
class HookedPaymentGateway extends FakePaymentGateway {
  afterDefaultSet: () => Promise<void> = async () => undefined;

  override async setTrialSubscriptionDefaultPaymentMethod(
    input: Parameters<
      FakePaymentGateway['setTrialSubscriptionDefaultPaymentMethod']
    >[0],
  ): Promise<void> {
    await super.setTrialSubscriptionDefaultPaymentMethod(input);
    await this.afterDefaultSet();
  }
}

async function seedTrial(): Promise<{
  completion: TrialSetupCompletion;
  paymentGateway: HookedPaymentGateway;
  deps: StripeWebhookDeps;
}> {
  const user = await createUser(db, cleanup);
  const suffix = randomUUID().replaceAll('-', '');
  const eventId = `evt_${suffix}`;
  cleanup.stripeEventIds.push(eventId);
  const completion = createTestWebhookTrialSetupCompletion({
    sessionId: `cs_setup_${suffix}`,
    userId: user.id,
    externalCustomerId: `cus_${suffix}`,
    externalSubscriptionId: `sub_${suffix}`,
  });
  setupSessionIds.push(completion.sessionId);

  const upserted = await new DrizzleSubscriptionRepository(db, priceIds).upsert(
    {
      userId: user.id,
      externalSubscriptionId: completion.externalSubscriptionId,
      plan: completion.plan,
      status: 'inTrial',
      currentPeriodEnd: completion.trialEndsAt,
      cancelAtPeriodEnd: false,
      startedAt: new Date('2026-08-06T12:00:00.000Z'),
      billingCycleAnchor: completion.trialEndsAt,
      expectedVersion: null,
    },
  );
  if (!upserted.persisted) throw new Error('expected the trial to persist');
  await new DrizzleStripeCustomerRepository(db).insert(
    user.id,
    completion.externalCustomerId,
  );
  await seedPendingTrialSetupOperation(
    new DrizzleTrialPaymentMethodSetupOperationRepository(db, () => now),
    completion,
  );

  const paymentGateway = new HookedPaymentGateway({
    externalCustomerId: completion.externalCustomerId,
    checkoutUrl: 'https://stripe.test/checkout',
    portalUrl: 'https://stripe.test/portal',
    webhookResult: {
      eventId,
      type: 'checkout.session.completed',
      trialPaymentMethodSetupCompletion: completion,
    },
  });
  const hasher = new NobleSha256Hasher();
  const deps: StripeWebhookDeps = {
    paymentGateway,
    operationalAlerts: new FakeOperationalAlerts(),
    subscriptionVersions: new DrizzleSubscriptionRepository(db, priceIds),
    logger: new FakeLogger(),
    now: () => now,
    appUrl: 'https://addictionboards.com',
    sha256Hasher: hasher,
    dispatchRenewalNoticeDelivery: new DispatchRenewalNoticeDeliveryUseCase(
      new DrizzleRenewalNoticeDeliveryRepository(db, hasher, () => now),
      new FakeTransactionalEmailGateway({ configured: false }),
      {
        subscriptions: new DrizzleSubscriptionRepository(db, priceIds),
        users: new DrizzleUserRepository(db),
      },
      hasher,
      new FakeLogger(),
      new FakeOperationalAlerts(),
      () => now,
    ),
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          stripeEvents: new DrizzleStripeEventRepository(tx, () => now),
          subscriptions: new DrizzleSubscriptionRepository(
            tx,
            priceIds,
            () => now,
          ),
          stripeCustomers: new DrizzleStripeCustomerRepository(tx),
          trialPaymentMethodSetupOperations:
            new DrizzleTrialPaymentMethodSetupOperationRepository(
              tx,
              () => now,
            ),
          renewalConsentRecords: new DrizzleRenewalConsentRecordRepository(
            tx,
            () => now,
          ),
          renewalNoticeDeliveries: new DrizzleRenewalNoticeDeliveryRepository(
            tx,
            hasher,
            () => now,
          ),
          users: new DrizzleUserRepository(tx, () => now),
        }),
      ),
  };
  return { completion, paymentGateway, deps };
}

async function expectNoConsentAndNoSavedCard(
  completion: TrialSetupCompletion,
): Promise<void> {
  const operations = new DrizzleTrialPaymentMethodSetupOperationRepository(
    db,
    () => now,
  );
  await expect(
    operations.findBySessionId(completion.sessionId),
  ).resolves.toMatchObject({
    status: 'terminal',
    terminalReason: 'trial_cancellation_scheduled',
  });
  await expect(
    operations.hasSubscriptionDefaultSet({
      userId: completion.userId,
      stripeSubscriptionId: completion.externalSubscriptionId,
    }),
  ).resolves.toBe(false);
  await expect(
    db
      .select({ id: renewalConsentRecords.id })
      .from(renewalConsentRecords)
      .where(eq(renewalConsentRecords.setupSessionId, completion.sessionId)),
  ).resolves.toEqual([]);
}

describe('trial add-card completion after a scheduled cancellation', () => {
  it('records no consent and keeps no card when the cancellation was recorded first', async () => {
    const { completion, paymentGateway, deps } = await seedTrial();
    await scheduleCancellation(completion.externalSubscriptionId);

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(paymentGateway.trialPaymentMethodAttachInputs).toEqual([]);
    expect(paymentGateway.trialPaymentMethodDetachInputs).toHaveLength(1);
    await expectNoConsentAndNoSavedCard(completion);
  });

  it('records no consent and detaches the card when the cancellation lands while Stripe is called', async () => {
    const { completion, paymentGateway, deps } = await seedTrial();
    paymentGateway.afterDefaultSet = () =>
      scheduleCancellation(completion.externalSubscriptionId);

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(paymentGateway.trialSubscriptionDefaultInputs).toHaveLength(1);
    expect(paymentGateway.trialPaymentMethodDetachInputs).toHaveLength(1);
    await expectNoConsentAndNoSavedCard(completion);
  });
});
