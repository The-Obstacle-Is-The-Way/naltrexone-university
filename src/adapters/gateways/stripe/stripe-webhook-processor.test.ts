import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { processStripeWebhookEvent } from './stripe-webhook-processor';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const priceIds: StripePriceIds = {
  monthly: 'price_monthly',
  annual: 'price_annual',
};

const appUserId = crypto.randomUUID();
const consentStateSecret = 'dedicated-consent-state-secret-32-bytes';

type WebhookEvent = Parameters<FakeStripeCheckoutClient['setWebhookEvent']>[0] &
  object;

function subscriptionFixture(id = 'sub_123') {
  return {
    id,
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { user_id: appUserId },
    items: {
      data: [
        {
          current_period_end: 1_800_000_000,
          price: { id: priceIds.monthly },
        },
      ],
    },
  };
}

// The fake hands back the injected event (recording the verification call)
// and serves seeded Subscriptions and SetupIntents by id; the event shapes
// stay hand-built test data, as they were.
function createStripe(input: {
  event?: WebhookEvent;
  subscriptionIds?: string[];
}): FakeStripeCheckoutClient {
  const stripe = new FakeStripeCheckoutClient();
  if (input.event) stripe.setWebhookEvent(input.event);
  for (const id of input.subscriptionIds ?? []) {
    stripe.seedSubscription(subscriptionFixture(id));
  }
  return stripe;
}

function processEvent(
  stripe: FakeStripeCheckoutClient,
  overrides: { logger?: FakeLogger; consentStateSecret?: string } = {},
) {
  return processStripeWebhookEvent({
    stripe,
    webhookSecret: 'whsec_test',
    ...(overrides.consentStateSecret
      ? { consentStateSecret: overrides.consentStateSecret }
      : {}),
    rawBody: '{}',
    signature: 'sig_test',
    priceIds,
    logger: overrides.logger ?? new FakeLogger(),
  });
}

function signSetupMetadata(metadata: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.entries(metadata).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  return createHmac('sha256', consentStateSecret)
    .update(JSON.stringify(sorted))
    .digest('hex');
}

function createCompletedSetupSession(overrides?: {
  terms?: 'accepted' | 'required';
  signature?: string;
}) {
  const metadata = {
    consent_user_id: appUserId,
    consent_customer_id: 'cus_123',
    consent_subscription_id: 'sub_123',
    consent_plan: 'monthly',
    consent_amount_cents: '2900',
    consent_currency: 'usd',
    consent_frequency: 'month',
    consent_trial_ends_at: '2026-08-13T12:00:00.000Z',
    consent_disclosure_version: '2026-08-05',
    consent_terms_version: '2026-08-05',
    consent_terms_hash: 'terms-hash',
  };
  return {
    id: 'cs_setup_123',
    mode: 'setup',
    setup_intent: 'seti_123',
    consent: { terms_of_service: overrides?.terms ?? 'accepted' },
    metadata: {
      ...metadata,
      consent_state_signature:
        overrides?.signature ?? signSetupMetadata(metadata),
    },
  };
}

function setupCompletionEvent(
  session: ReturnType<typeof createCompletedSetupSession>,
  created?: number,
): WebhookEvent {
  return {
    id: 'evt_setup',
    type: 'checkout.session.completed',
    ...(created === undefined ? {} : { created }),
    data: { object: session },
  };
}

function consentCheckoutEvent(
  id: string,
  sessionId: string,
  metadata: Record<string, string>,
): WebhookEvent {
  return {
    id,
    type: 'checkout.session.completed',
    created: 1_775_649_600,
    data: {
      object: {
        id: sessionId,
        mode: 'subscription',
        customer: 'cus_123',
        client_reference_id: appUserId,
        subscription: 'sub_123',
        consent: { terms_of_service: 'accepted' },
        metadata,
      },
    },
  };
}

function invoiceEvent(
  id: string,
  type: 'invoice.payment_succeeded' | 'invoice.payment_failed',
  references: { root: string | null; nested: string | null },
): WebhookEvent {
  return {
    id,
    type,
    data: {
      object: {
        id: 'in_test_REDACTED',
        object: 'invoice',
        subscription: references.root,
        parent: {
          type: 'subscription_details',
          subscription_details: { subscription: references.nested },
        },
      },
    },
  };
}

const fullRenewalMetadata = {
  checkout_variant: 'standard',
  renewal_user_id: appUserId,
  renewal_plan: 'monthly',
  renewal_amount_cents: '2900',
  renewal_currency: 'usd',
  renewal_frequency: 'month',
  renewal_disclosure_snapshot: 'Exact immediate disclosure.',
  renewal_disclosure_version: '2026-08-05',
  renewal_terms_version: '2026-08-05',
  renewal_terms_hash: 'terms-hash',
  renewal_cancellation_method:
    'Billing page in the app or support@addictionboards.com',
};

function subscriptionUpdateFor(externalSubscriptionId: string) {
  return {
    userId: appUserId,
    externalCustomerId: 'cus_123',
    externalSubscriptionId,
    plan: 'monthly',
    status: 'active',
    currentPeriodEnd: new Date(1_800_000_000 * 1000),
    cancelAtPeriodEnd: false,
  };
}

describe('processStripeWebhookEvent', () => {
  it('normalizes an accepted, signed setup completion and resolves its payment method', async () => {
    const stripe = createStripe({
      event: setupCompletionEvent(createCompletedSetupSession(), 1_775_649_600),
    });
    stripe.seedSetupIntent({ id: 'seti_123', payment_method: 'pm_123' });

    await expect(processEvent(stripe, { consentStateSecret })).resolves.toEqual(
      {
        eventId: 'evt_setup',
        type: 'checkout.session.completed',
        trialPaymentMethodSetupCompletion: {
          sessionId: 'cs_setup_123',
          userId: appUserId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          amountCents: 2900,
          currency: 'usd',
          frequency: 'month',
          trialEndsAt: new Date('2026-08-13T12:00:00.000Z'),
          disclosureVersion: '2026-08-05',
          termsVersion: '2026-08-05',
          termsHash: 'terms-hash',
          stripePaymentMethodId: 'pm_123',
          acceptedAt: new Date('2026-04-08T12:00:00.000Z'),
        },
      },
    );
    expect(stripe.setupIntents.retrieveCalls).toEqual(['seti_123']);
    expect(stripe.subscriptions.retrieveCalls).toEqual([]);
    expect(stripe.webhookCalls).toEqual([
      { rawBody: '{}', signature: 'sig_test', secret: 'whsec_test' },
    ]);
  });

  it('fails a setup completion closed when the dedicated consent-state secret is unavailable', async () => {
    const stripe = createStripe({
      event: setupCompletionEvent(createCompletedSetupSession()),
    });

    await expect(processEvent(stripe)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Trial consent-state verification is not configured',
    });
  });

  it('rejects a setup completion without accepted Terms before resolving the payment method', async () => {
    const stripe = createStripe({
      event: setupCompletionEvent(
        createCompletedSetupSession({ terms: 'required' }),
      ),
    });
    stripe.seedSetupIntent({ id: 'seti_123', payment_method: 'pm_123' });

    await expect(
      processEvent(stripe, { consentStateSecret }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
    expect(stripe.setupIntents.retrieveCalls).toEqual([]);
  });

  it('rejects setup metadata with an invalid server signature before resolving the payment method', async () => {
    // A well-formed but wrong signature: the metadata schema accepts it, so
    // the server-side HMAC check is what rejects the Session.
    const stripe = createStripe({
      event: setupCompletionEvent(
        createCompletedSetupSession({ signature: '0'.repeat(64) }),
      ),
    });
    stripe.seedSetupIntent({ id: 'seti_123', payment_method: 'pm_123' });

    await expect(
      processEvent(stripe, { consentStateSecret }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
    expect(stripe.setupIntents.retrieveCalls).toEqual([]);
  });

  it('maps a constructEvent failure to INVALID_WEBHOOK_SIGNATURE', async () => {
    const logger = new FakeLogger();
    // No event is injected, so the fake's constructEvent throws. This pins the
    // processor's error mapping and argument forwarding only; rejection of a
    // real bad signature is proven with Stripe-generated signatures in
    // tests/integration/webhook-signature-ingress.integration.test.ts.
    const stripe = createStripe({});

    await expect(processEvent(stripe, { logger })).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_SIGNATURE',
      message:
        'Invalid webhook signature: FakeStripeCheckoutClient does not process webhooks',
    });

    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toMatchObject({
      msg: 'Webhook signature verification failed',
      context: { error: 'FakeStripeCheckoutClient does not process webhooks' },
    });
    expect(stripe.webhookCalls).toEqual([
      { rawBody: '{}', signature: 'sig_test', secret: 'whsec_test' },
    ]);
  });

  it('returns base result for unsupported event types', async () => {
    const stripe = createStripe({
      event: {
        id: 'evt_unsupported',
        type: 'charge.refunded',
        data: { object: {} },
      },
    });

    await expect(processEvent(stripe)).resolves.toEqual({
      eventId: 'evt_unsupported',
      type: 'charge.refunded',
    });
    expect(stripe.subscriptions.retrieveCalls).toEqual([]);
  });

  it('returns base result for checkout completion when subscription reference is null', async () => {
    const stripe = createStripe({
      event: {
        id: 'evt_checkout',
        type: 'checkout.session.completed',
        data: { object: { subscription: null } },
      },
    });

    await expect(processEvent(stripe)).resolves.toEqual({
      eventId: 'evt_checkout',
      type: 'checkout.session.completed',
    });
    expect(stripe.subscriptions.retrieveCalls).toEqual([]);
  });

  it('retrieves and includes subscriptionUpdate for checkout session events', async () => {
    const logger = new FakeLogger();
    const stripe = createStripe({
      event: {
        id: 'evt_checkout',
        type: 'checkout.session.completed',
        data: { object: { subscription: 'sub_123' } },
      },
      subscriptionIds: ['sub_123'],
    });

    await expect(processEvent(stripe, { logger })).resolves.toEqual({
      eventId: 'evt_checkout',
      type: 'checkout.session.completed',
      subscriptionUpdate: subscriptionUpdateFor('sub_123'),
    });
    expect(stripe.subscriptions.retrieveCalls).toEqual(['sub_123']);
    expect(logger.warnCalls).toEqual([
      {
        context: {
          eventId: 'evt_checkout',
          sessionId: null,
          reason: 'consent_marker_missing',
          type: 'checkout.session.completed',
        },
        msg: 'Stripe subscription Checkout completed without consent evidence',
      },
    ]);
  });

  it('returns the exact accepted renewal snapshot for a consent-bearing subscription Checkout completion', async () => {
    const stripe = createStripe({
      event: consentCheckoutEvent(
        'evt_checkout_consent',
        'cs_checkout_123',
        fullRenewalMetadata,
      ),
      subscriptionIds: ['sub_123'],
    });

    await expect(processEvent(stripe)).resolves.toMatchObject({
      initialSubscriptionConsent: {
        checkoutSessionId: 'cs_checkout_123',
        userId: appUserId,
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        amountCents: 2900,
        currency: 'usd',
        frequency: 'month',
        disclosureSnapshot: 'Exact immediate disclosure.',
        disclosureVersion: '2026-08-05',
        termsVersion: '2026-08-05',
        termsHash: 'terms-hash',
        cancellationMethod:
          'Billing page in the app or support@addictionboards.com',
        acceptedAt: new Date('2026-04-08T12:00:00.000Z'),
      },
    });
  });

  it.each([
    {
      name: 'accepted consent lacks the complete evidence snapshot',
      eventId: 'evt_checkout_incomplete_consent',
      sessionId: 'cs_checkout_incomplete',
      metadata: { checkout_variant: 'standard', renewal_user_id: appUserId },
      reason: 'consent_evidence_invalid',
    },
    {
      name: 'consent identity differs from the live subscription',
      eventId: 'evt_checkout_mismatched_consent',
      sessionId: 'cs_checkout_mismatched',
      metadata: {
        ...fullRenewalMetadata,
        renewal_user_id: crypto.randomUUID(),
      },
      reason: 'consent_identity_mismatch',
    },
    {
      name: 'a pre-deploy Session carries no consent evidence',
      eventId: 'evt_checkout_legacy_consent',
      sessionId: 'cs_checkout_legacy',
      metadata: { checkout_variant: 'standard' },
      reason: 'consent_evidence_invalid',
    },
  ])(
    'preserves subscription activation and warns when $name',
    async ({ eventId, sessionId, metadata, reason }) => {
      const logger = new FakeLogger();
      const stripe = createStripe({
        event: consentCheckoutEvent(eventId, sessionId, metadata),
        subscriptionIds: ['sub_123'],
      });

      const result = await processEvent(stripe, { logger });

      expect(result).toMatchObject({
        eventId,
        subscriptionUpdate: { externalSubscriptionId: 'sub_123' },
      });
      expect(result).not.toHaveProperty('initialSubscriptionConsent');
      expect(logger.warnCalls).toEqual([
        expect.objectContaining({
          context: expect.objectContaining({ eventId, sessionId, reason }),
        }),
      ]);
    },
  );

  it.each([
    {
      type: 'invoice.payment_succeeded' as const,
      eventId: 'evt_invoice_success_nested',
      nested: 'sub_test_REDACTED_nested_success',
    },
    {
      type: 'invoice.payment_failed' as const,
      eventId: 'evt_invoice_failed_nested',
      nested: 'sub_test_REDACTED_nested_failed',
    },
  ])(
    'retrieves and includes subscriptionUpdate for $type events with a nested Clover subscription reference',
    async ({ type, eventId, nested }) => {
      // The Subscription is seeded under the id the invoice references, so
      // the update carries that id back, as a live retrieval would.
      const stripe = createStripe({
        event: invoiceEvent(eventId, type, { root: null, nested }),
        subscriptionIds: [nested],
      });

      await expect(processEvent(stripe)).resolves.toEqual({
        eventId,
        type,
        subscriptionUpdate: subscriptionUpdateFor(nested),
      });
      expect(stripe.subscriptions.retrieveCalls).toEqual([nested]);
    },
  );

  it('prefers nested invoice subscription references over legacy root references when both are present', async () => {
    const stripe = createStripe({
      event: invoiceEvent(
        'evt_invoice_both_refs',
        'invoice.payment_succeeded',
        {
          root: 'sub_test_REDACTED_legacy_root',
          nested: 'sub_test_REDACTED_clover_nested',
        },
      ),
      subscriptionIds: ['sub_test_REDACTED_clover_nested'],
    });

    await processEvent(stripe);

    // Current Clover invoice payloads put the authoritative subscription
    // reference in parent.subscription_details; root is legacy fallback only.
    expect(stripe.subscriptions.retrieveCalls).toEqual([
      'sub_test_REDACTED_clover_nested',
    ]);
  });

  it('returns base result for invoice events when no subscription reference exists', async () => {
    const stripe = createStripe({
      event: invoiceEvent('evt_invoice_no_ref', 'invoice.payment_succeeded', {
        root: null,
        nested: null,
      }),
    });

    await expect(processEvent(stripe)).resolves.toEqual({
      eventId: 'evt_invoice_no_ref',
      type: 'invoice.payment_succeeded',
    });
    expect(stripe.subscriptions.retrieveCalls).toEqual([]);
  });

  it('normalizes and includes subscriptionUpdate for customer.subscription.updated events', async () => {
    const stripe = createStripe({
      event: {
        id: 'evt_sub_updated',
        type: 'customer.subscription.updated',
        data: { object: subscriptionFixture() },
      },
      subscriptionIds: ['sub_123'],
    });

    await expect(processEvent(stripe)).resolves.toEqual({
      eventId: 'evt_sub_updated',
      type: 'customer.subscription.updated',
      subscriptionUpdate: subscriptionUpdateFor('sub_123'),
    });
    expect(stripe.subscriptions.retrieveCalls).toEqual(['sub_123']);
  });

  it('throws INVALID_WEBHOOK_PAYLOAD for invalid subscription event payloads', async () => {
    const logger = new FakeLogger();
    const stripe = createStripe({
      event: {
        id: 'evt_bad_payload',
        type: 'customer.subscription.updated',
        data: { object: { id: 123 } },
      },
    });

    await expect(processEvent(stripe, { logger })).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
    });

    expect(logger.errorCalls).toHaveLength(1);
    const errorCall = logger.errorCalls[0];
    if (errorCall === undefined) {
      throw new Error('Expected Stripe webhook payload error log');
    }
    expect(errorCall.msg).toBe('Invalid Stripe subscription webhook payload');
    expect(errorCall.context).toHaveProperty('error');
    expect(stripe.subscriptions.retrieveCalls).toEqual([]);
  });
  it.each([
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
    'customer.subscription.trial_will_end',
    'customer.subscription.pending_update_applied',
    'customer.subscription.pending_update_expired',
  ])(
    'normalizes %s events from the live Subscription, stamped with the event time',
    async (type) => {
      const stripe = createStripe({
        event: {
          id: `evt_${type}`,
          type,
          created: 1_700_000_000,
          data: { object: subscriptionFixture() },
        },
        subscriptionIds: ['sub_123'],
      });

      await expect(processEvent(stripe)).resolves.toEqual({
        eventId: `evt_${type}`,
        type,
        occurredAt: new Date(1_700_000_000 * 1000),
        subscriptionUpdate: subscriptionUpdateFor('sub_123'),
      });
      expect(stripe.subscriptions.retrieveCalls).toEqual(['sub_123']);
    },
  );

  it.each([
    'checkout.session.completed',
    'checkout.session.expired',
    'invoice.payment_failed',
    'invoice.payment_succeeded',
    'invoice.payment_action_required',
  ])(
    'retrieves the Subscription referenced at the root of %s events, stamped with the event time',
    async (type) => {
      const stripe = createStripe({
        event: {
          id: `evt_${type}`,
          type,
          created: 1_700_000_000,
          data: { object: { subscription: 'sub_123' } },
        },
        subscriptionIds: ['sub_123'],
      });

      await expect(processEvent(stripe)).resolves.toEqual({
        eventId: `evt_${type}`,
        type,
        occurredAt: new Date(1_700_000_000 * 1000),
        subscriptionUpdate: subscriptionUpdateFor('sub_123'),
      });
      expect(stripe.subscriptions.retrieveCalls).toEqual(['sub_123']);
    },
  );

  it('retrieves the Subscription from an object-form reference', async () => {
    const stripe = createStripe({
      event: {
        id: 'evt_checkout_object_reference',
        type: 'checkout.session.completed',
        data: { object: { subscription: { id: 'sub_123' } } },
      },
      subscriptionIds: ['sub_123'],
    });

    await expect(processEvent(stripe)).resolves.toEqual({
      eventId: 'evt_checkout_object_reference',
      type: 'checkout.session.completed',
      subscriptionUpdate: subscriptionUpdateFor('sub_123'),
    });
    expect(stripe.subscriptions.retrieveCalls).toEqual(['sub_123']);
  });

  it('returns base result for checkout completion without a subscription key', async () => {
    const stripe = createStripe({
      event: {
        id: 'evt_checkout_no_key',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_1' } },
      },
    });

    await expect(processEvent(stripe)).resolves.toEqual({
      eventId: 'evt_checkout_no_key',
      type: 'checkout.session.completed',
    });
    expect(stripe.subscriptions.retrieveCalls).toEqual([]);
  });

  it.each(['invoice.payment_failed', 'checkout.session.completed'])(
    'rejects and logs %s payloads whose subscription reference is malformed',
    async (type) => {
      const logger = new FakeLogger();
      const stripe = createStripe({
        event: {
          id: 'evt_bad_reference',
          type,
          data: { object: { subscription: 123 } },
        },
      });

      await expect(processEvent(stripe, { logger })).rejects.toMatchObject({
        code: 'INVALID_WEBHOOK_PAYLOAD',
      });
      expect(logger.errorCalls).toContainEqual({
        context: expect.objectContaining({
          eventId: 'evt_bad_reference',
          type,
        }),
        msg: `Invalid Stripe ${type} webhook payload`,
      });
      expect(stripe.subscriptions.retrieveCalls).toEqual([]);
    },
  );

  it.each(['invoice.payment_failed', 'checkout.session.completed'])(
    'rejects and logs a Subscription retrieved for %s events that fails the schema',
    async (type) => {
      const logger = new FakeLogger();
      const stripe = createStripe({
        event: {
          id: 'evt_bad_subscription',
          type,
          data: { object: { subscription: 'sub_123' } },
        },
        subscriptionIds: ['sub_123'],
      });
      // Stripe always lists at least one item; an empty list fails the schema.
      stripe.setSubscriptionRetrieveOverride((subscription) => ({
        ...subscription,
        items: { data: [] },
      }));

      await expect(processEvent(stripe, { logger })).rejects.toMatchObject({
        code: 'INVALID_WEBHOOK_PAYLOAD',
      });
      expect(stripe.subscriptions.retrieveCalls).toEqual(['sub_123']);
      expect(logger.errorCalls).toContainEqual({
        context: expect.objectContaining({
          eventId: 'evt_bad_subscription',
          type,
          stripeSubscriptionId: 'sub_123',
        }),
        msg: `Invalid Stripe subscription payload retrieved from ${type}`,
      });
    },
  );

  it.each([
    [
      'customer.subscription.updated',
      { ...subscriptionFixture(), metadata: {} },
    ],
    [
      'customer.subscription.created',
      { ...subscriptionFixture(), metadata: {} },
    ],
    ['checkout.session.completed', { subscription: 'sub_123' }],
  ] as const)(
    'rejects and logs %s events whose live Subscription has no metadata.user_id',
    async (type, object) => {
      const logger = new FakeLogger();
      const stripe = createStripe({
        event: { id: 'evt_missing_user', type, data: { object } },
      });
      stripe.seedSubscription({ ...subscriptionFixture(), metadata: {} });

      await expect(processEvent(stripe, { logger })).rejects.toMatchObject({
        code: 'STRIPE_ERROR',
        message: 'Stripe subscription metadata.user_id is required',
      });
      expect(stripe.subscriptions.retrieveCalls).toEqual(['sub_123']);
      expect(logger.errorCalls).toContainEqual({
        context: expect.objectContaining({
          eventId: 'evt_missing_user',
          type,
          stripeSubscriptionId: 'sub_123',
          stripeCustomerId: 'cus_123',
        }),
        msg: 'Stripe subscription metadata.user_id is required',
      });
    },
  );
});
