import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  renewalConsentRecords,
  renewalNoticeDeliveries,
  stripeEvents,
} from '@/db/schema';
import {
  processStripeWebhook,
  type StripeWebhookDeps,
} from '@/src/adapters/controllers/stripe-webhook-controller';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import { DrizzleRenewalConsentRecordRepository } from '@/src/adapters/repositories/drizzle-renewal-consent-record-repository';
import { DrizzleRenewalNoticeDeliveryRepository } from '@/src/adapters/repositories/drizzle-renewal-notice-delivery-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleStripeEventRepository } from '@/src/adapters/repositories/drizzle-stripe-event-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from '@/src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import { getRenewalNoticeProviderIdempotencyKey } from '@/src/application/shared/transactional-email-payload';
import {
  FakeLogger,
  FakePaymentGateway,
  FakeTransactionalEmailGateway,
} from '@/src/application/test-helpers/fakes';
import { DispatchRenewalNoticeDeliveryUseCase } from '@/src/application/use-cases';
import type { NewRenewalNoticeDelivery } from '@/src/domain/entities';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const checkoutSessionIds: string[] = [];
const eventIds: string[] = [];
const now = new Date('2026-08-07T12:00:00.000Z');
const priceIds = {
  monthly: 'price_test_monthly',
  annual: 'price_test_annual',
} as const;

class FailingRenewalNoticeDeliveryRepository extends DrizzleRenewalNoticeDeliveryRepository {
  override async saveQueued(_input: NewRenewalNoticeDelivery): Promise<never> {
    throw new Error('acknowledgment outbox unavailable');
  }
}

afterEach(async () => {
  if (checkoutSessionIds.length > 0) {
    const consents = await db
      .select({ id: renewalConsentRecords.id })
      .from(renewalConsentRecords)
      .where(
        inArray(renewalConsentRecords.checkoutSessionId, checkoutSessionIds),
      );
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
  if (eventIds.length > 0) {
    await db.delete(stripeEvents).where(inArray(stripeEvents.id, eventIds));
  }
  checkoutSessionIds.length = 0;
  eventIds.length = 0;
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

function createDeps(input: {
  userId: string;
  checkoutSessionId: string;
  eventId: string;
  failOutbox?: boolean;
}): StripeWebhookDeps {
  const hasher = new NobleSha256Hasher();
  const paymentGateway = new FakePaymentGateway({
    externalCustomerId: `cus_${randomUUID().replaceAll('-', '')}`,
    checkoutUrl: 'https://stripe.test/checkout',
    portalUrl: 'https://stripe.test/portal',
    webhookResult: {
      eventId: input.eventId,
      type: 'checkout.session.completed',
      subscriptionUpdate: {
        userId: input.userId,
        externalCustomerId: `cus_${input.eventId}`,
        externalSubscriptionId: `sub_${input.eventId}`,
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-09-07T12:00:00.000Z'),
        cancelAtPeriodEnd: false,
      },
      initialSubscriptionConsent: {
        checkoutSessionId: input.checkoutSessionId,
        userId: input.userId,
        externalCustomerId: `cus_${input.eventId}`,
        externalSubscriptionId: `sub_${input.eventId}`,
        plan: 'monthly',
        amountCents: 2900,
        currency: 'usd',
        frequency: 'month',
        disclosureSnapshot: 'Renews monthly at $29 until canceled.',
        disclosureVersion: '2026-08-05',
        termsVersion: '2026-08-05',
        termsHash: 'terms-hash',
        cancellationMethod:
          'Billing page in the app or support@addictionboards.com',
        acceptedAt: now,
      },
    },
  });
  const deliveryRepository = new DrizzleRenewalNoticeDeliveryRepository(
    db,
    hasher,
    () => now,
  );
  return {
    paymentGateway,
    subscriptionVersions: new DrizzleSubscriptionRepository(db, priceIds),
    logger: new FakeLogger(),
    now: () => now,
    appUrl: 'https://addictionboards.com',
    sha256Hasher: hasher,
    dispatchRenewalNoticeDelivery: new DispatchRenewalNoticeDeliveryUseCase(
      deliveryRepository,
      new FakeTransactionalEmailGateway({ configured: false }),
      hasher,
      new FakeLogger(),
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
          renewalNoticeDeliveries: input.failOutbox
            ? new FailingRenewalNoticeDeliveryRepository(tx, hasher, () => now)
            : new DrizzleRenewalNoticeDeliveryRepository(tx, hasher, () => now),
          users: new DrizzleUserRepository(tx, () => now),
        }),
      ),
  };
}

describe('Stripe renewal acknowledgment transaction', () => {
  it('commits one consent and one acknowledgment and keeps replay idempotent', async () => {
    const user = await createUser(db, cleanup);
    const checkoutSessionId = `cs_${randomUUID().replaceAll('-', '')}`;
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    checkoutSessionIds.push(checkoutSessionId);
    eventIds.push(eventId);
    const deps = createDeps({ userId: user.id, checkoutSessionId, eventId });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });
    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    const consents = await db
      .select()
      .from(renewalConsentRecords)
      .where(eq(renewalConsentRecords.checkoutSessionId, checkoutSessionId));
    expect(consents).toHaveLength(1);
    const consent = consents[0];
    if (!consent) throw new Error('expected consent');
    const deliveries = await db
      .select()
      .from(renewalNoticeDeliveries)
      .where(eq(renewalNoticeDeliveries.consentRecordId, consent.id));
    expect(deliveries).toEqual([
      expect.objectContaining({
        noticeKind: 'acknowledgment',
        destination: user.email,
        status: 'queued',
        disclosureVersion: consent.disclosureVersion,
      }),
    ]);
    const delivery = deliveries[0];
    if (!delivery) throw new Error('expected acknowledgment delivery');
    expect(delivery.payloadSnapshot).not.toBe('');
    expect(delivery.payloadHash).toBe(
      new NobleSha256Hasher().hash(delivery.payloadSnapshot),
    );
    expect(delivery.providerIdempotencyKey).toBe(
      getRenewalNoticeProviderIdempotencyKey(delivery.id),
    );
  });

  it('rolls back consent when the acknowledgment row cannot be persisted', async () => {
    const user = await createUser(db, cleanup);
    const checkoutSessionId = `cs_${randomUUID().replaceAll('-', '')}`;
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    checkoutSessionIds.push(checkoutSessionId);
    eventIds.push(eventId);
    const deps = createDeps({
      userId: user.id,
      checkoutSessionId,
      eventId,
      failOutbox: true,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toThrow('acknowledgment outbox unavailable');

    await expect(
      db
        .select()
        .from(renewalConsentRecords)
        .where(eq(renewalConsentRecords.checkoutSessionId, checkoutSessionId)),
    ).resolves.toEqual([]);
    await expect(
      db
        .select()
        .from(renewalNoticeDeliveries)
        .where(eq(renewalNoticeDeliveries.destination, user.email)),
    ).resolves.toEqual([]);
  });
});
