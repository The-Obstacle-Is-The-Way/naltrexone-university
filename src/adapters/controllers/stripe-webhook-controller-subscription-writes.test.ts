import { describe, expect, it } from 'vitest';
import {
  FakeRenewalConsentRecordRepository,
  FakeStripeEventRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createTestWebhookInitialSubscriptionConsent,
  createTestWebhookSubscriptionUpdate,
} from '@/src/application/test-helpers/webhook-event-results';
import { newRenewalConsentRecord } from '@/src/domain/entities';
import { createSubscription } from '@/src/domain/test-helpers';
import { processStripeWebhook } from './stripe-webhook-controller';
import {
  createRollbackAwareStripeWebhookTestHarness,
  createStripeWebhookTestHarness,
  createWebhookPaymentGateway,
} from './test-helpers/stripe-webhook-controller-harness';

class MarkProcessedFailingStripeEventRepository extends FakeStripeEventRepository {
  override async markProcessed(): Promise<never> {
    throw new Error('mark processed failed');
  }
}

class WriteGuardRejectingSubscriptionRepository extends FakeSubscriptionRepository {
  override async upsert() {
    return {
      persisted: false as const,
      reason: 'write_guard_rejected' as const,
      current: createSubscription(),
    };
  }
}

// A Checkout-completed event carrying both the subscription write and the
// initial renewal consent accepted in that Session.
function checkoutConsentEvent(input: {
  eventId: string;
  userId: string;
  checkoutSessionId: string;
}) {
  const consent = createTestWebhookInitialSubscriptionConsent({
    userId: input.userId,
    checkoutSessionId: input.checkoutSessionId,
  });
  const paymentGateway = createWebhookPaymentGateway({
    eventId: input.eventId,
    type: 'checkout.session.completed',
    subscriptionUpdate: createTestWebhookSubscriptionUpdate({
      userId: input.userId,
      currentPeriodEnd: new Date('2026-09-06T12:00:00Z'),
    }),
    initialSubscriptionConsent: consent,
  });
  return { consent, paymentGateway };
}

// A user's current active row, then an event for a different Subscription of
// theirs: the event is recorded as processed, but neither the row nor the
// customer mapping changes.
async function expectCurrentActiveRowSurvives(event: {
  eventId: string;
  type: 'customer.subscription.deleted' | 'customer.subscription.updated';
  externalSubscriptionId: string;
  status: 'canceled' | 'unpaid';
  currentPeriodEnd: Date;
}) {
  const userId = crypto.randomUUID();
  const now = new Date('2026-06-12T00:00:00.000Z');
  const subscriptions = new FakeSubscriptionRepository([], () => now);
  await subscriptions.upsert({
    userId,
    externalSubscriptionId: 'sub_current',
    plan: 'monthly',
    status: 'active',
    currentPeriodEnd: new Date('2026-06-13T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    expectedVersion: null,
  });
  const paymentGateway = createWebhookPaymentGateway({
    eventId: event.eventId,
    type: event.type,
    subscriptionUpdate: createTestWebhookSubscriptionUpdate({
      userId,
      externalSubscriptionId: event.externalSubscriptionId,
      status: event.status,
      currentPeriodEnd: event.currentPeriodEnd,
    }),
  });
  const { deps, stripeEvents, stripeCustomers } =
    createStripeWebhookTestHarness({ paymentGateway, subscriptions });

  await expect(
    processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
  ).resolves.toBeUndefined();

  await expect(
    subscriptions.findByExternalSubscriptionId('sub_current'),
  ).resolves.toMatchObject({
    userId,
    status: 'active',
    currentPeriodEnd: new Date('2026-06-13T00:00:00.000Z'),
  });
  await expect(
    subscriptions.findByExternalSubscriptionId(event.externalSubscriptionId),
  ).resolves.toBeNull();
  await expect(stripeEvents.lock(event.eventId)).resolves.toMatchObject({
    processedAt: expect.any(Date),
    error: null,
  });
  await expect(stripeCustomers.findByUserId(userId)).resolves.toBeNull();
}

describe('processStripeWebhook subscription writes', () => {
  it('starts legal retention from a persisted subscription termination', async () => {
    const userId = crypto.randomUUID();
    const renewalConsents = new FakeRenewalConsentRecordRepository();
    await renewalConsents.save(
      newRenewalConsentRecord({
        userId,
        consumerReference: 'a'.repeat(64),
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        checkoutSessionId: 'cs_checkout_123',
        setupSessionId: null,
        applicationSourceId: null,
        plan: 'monthly',
        amountCents: 2900,
        currency: 'usd',
        frequency: 'month',
        trialEndsAt: null,
        cancellationDeadline: new Date('2026-09-06T12:00:00Z'),
        cancellationMethod:
          'Billing page in the app or support@addictionboards.com',
        disclosureSnapshot: 'Exact disclosure.',
        disclosureVersion: '2026-08-05',
        termsVersion: '2026-08-05',
        termsHash: 'terms-hash',
        consentSource: 'stripe_checkout',
        acceptedAt: new Date('2026-08-06T12:00:00Z'),
        consentKind: 'initial_offer',
        priorAmountCents: null,
        proposedAmountCents: null,
        effectiveRenewalAt: null,
      }),
    );
    const terminatedAt = new Date('2026-10-06T12:00:00Z');
    const paymentGateway = createWebhookPaymentGateway({
      eventId: 'evt_subscription_deleted',
      type: 'customer.subscription.deleted',
      occurredAt: terminatedAt,
      subscriptionUpdate: createTestWebhookSubscriptionUpdate({
        userId,
        status: 'canceled',
        currentPeriodEnd: terminatedAt,
      }),
    });
    const { deps } = createStripeWebhookTestHarness({
      paymentGateway,
      renewalConsents,
      now: () => new Date('2026-10-07T12:00:00Z'),
    });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(renewalConsents.snapshot()).toEqual([
      expect.objectContaining({
        subscriptionTerminatedAt: terminatedAt,
        retainUntil: new Date('2029-08-06T12:00:00Z'),
      }),
    ]);
  });

  it('persists subscription Checkout consent in the subscription webhook transaction', async () => {
    const userId = crypto.randomUUID();
    const { consent, paymentGateway } = checkoutConsentEvent({
      eventId: 'evt_checkout_consent',
      userId,
      checkoutSessionId: 'cs_checkout_123',
    });
    const { deps, renewalConsents, renewalNoticeDeliveries } =
      createRollbackAwareStripeWebhookTestHarness({ paymentGateway });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(renewalConsents.snapshot()).toEqual([
      expect.objectContaining({
        userId,
        checkoutSessionId: 'cs_checkout_123',
        setupSessionId: null,
        cancellationDeadline: new Date('2026-09-06T12:00:00Z'),
        trialEndsAt: null,
        disclosureSnapshot: consent.disclosureSnapshot,
        acceptedAt: consent.acceptedAt,
      }),
    ]);
    expect(renewalNoticeDeliveries.records).toEqual([
      expect.objectContaining({
        noticeKind: 'acknowledgment',
        consentRecordId: renewalConsents.snapshot()[0]?.id,
        status: 'queued',
        createdAt: new Date('2026-08-07T12:00:00.000Z'),
      }),
    ]);
  });

  it('rolls back the acknowledgment row when the webhook transaction fails after queueing', async () => {
    const { paymentGateway } = checkoutConsentEvent({
      eventId: 'evt_checkout_ack_rollback',
      userId: crypto.randomUUID(),
      checkoutSessionId: 'cs_checkout_ack_rollback',
    });
    const stripeEvents = new MarkProcessedFailingStripeEventRepository();
    const { deps, renewalConsents, renewalNoticeDeliveries } =
      createRollbackAwareStripeWebhookTestHarness({
        paymentGateway,
        stripeEvents,
      });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toThrow('mark processed failed');

    expect(renewalConsents.snapshot()).toEqual([]);
    expect(renewalNoticeDeliveries.records).toEqual([]);
  });

  it('does not persist consent when the subscription write guard rejects the update', async () => {
    const { paymentGateway } = checkoutConsentEvent({
      eventId: 'evt_checkout_consent_rejected',
      userId: crypto.randomUUID(),
      checkoutSessionId: 'cs_checkout_rejected',
    });
    const subscriptions = new WriteGuardRejectingSubscriptionRepository();
    const { deps, renewalConsents } = createStripeWebhookTestHarness({
      paymentGateway,
      subscriptions,
    });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(renewalConsents.snapshot()).toEqual([]);
  });

  it('does not let a superseded terminal subscription webhook overwrite a current active row', async () => {
    await expectCurrentActiveRowSurvives({
      eventId: 'evt_superseded_canceled',
      type: 'customer.subscription.deleted',
      externalSubscriptionId: 'sub_superseded',
      status: 'canceled',
      currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
    });
  });

  it('does not let a different unpaid subscription webhook overwrite a current active row', async () => {
    await expectCurrentActiveRowSurvives({
      eventId: 'evt_duplicate_unpaid',
      type: 'customer.subscription.updated',
      externalSubscriptionId: 'sub_unpaid',
      status: 'unpaid',
      currentPeriodEnd: new Date('2026-07-13T00:00:00.000Z'),
    });
  });

  it('updates stale stripe customer mappings in webhook context instead of failing', async () => {
    const userId = crypto.randomUUID();
    const paymentGateway = createWebhookPaymentGateway({
      eventId: 'evt_customer_remap',
      type: 'customer.subscription.updated',
      subscriptionUpdate: createTestWebhookSubscriptionUpdate({
        userId,
        externalCustomerId: 'cus_new',
      }),
    });
    const { deps, stripeCustomers } = createStripeWebhookTestHarness({
      paymentGateway,
    });
    await stripeCustomers.insert(userId, 'cus_old');

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    await expect(stripeCustomers.findByUserId(userId)).resolves.toEqual({
      stripeCustomerId: 'cus_new',
    });
  });
});
