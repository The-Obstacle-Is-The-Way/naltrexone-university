// biome-ignore lint/style/noExcessiveLinesPerFile: Keep subscription consent evidence and webhook normalization cases in one adapter contract suite.
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { processStripeWebhookEvent } from './stripe-webhook-processor';

const priceIds: StripePriceIds = {
  monthly: 'price_monthly',
  annual: 'price_annual',
};

const appUserId = crypto.randomUUID();
const consentStateSecret = 'dedicated-consent-state-secret-32-bytes';

function createSubscriptionFixture() {
  return {
    id: 'sub_123',
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

function createStripeClient(input: {
  eventFactory: () => {
    id: string;
    type: string;
    created?: number;
    data: { object: unknown };
  };
  subscription?: unknown;
  retrieve?: (subscriptionId: string) => Promise<unknown>;
}): StripeClient {
  const retrieve =
    input.retrieve ??
    (async (_subscriptionId: string) =>
      input.subscription ?? createSubscriptionFixture());

  return {
    customers: {
      create: vi.fn(async () => ({ id: 'cus_123' })),
      search: vi.fn(async () => ({ data: [] })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: 'cs_1', url: 'https://stripe/test' })),
        list: vi.fn(async () => ({ data: [] })),
        retrieve: vi.fn(async () => ({
          id: 'cs_1',
          url: 'https://stripe/test',
        })),
        expire: vi.fn(async () => ({ id: 'cs_1', url: 'https://stripe/test' })),
      },
    },
    subscriptions: {
      retrieve: vi.fn(retrieve),
      list: vi.fn(async () => ({ data: [] })),
      cancel: vi.fn(async () => ({})),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
      },
    },
    webhooks: {
      constructEvent: vi.fn((_rawBody: string, _sig: string, _secret: string) =>
        input.eventFactory(),
      ),
    },
  };
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

describe('processStripeWebhookEvent', () => {
  it('normalizes an accepted, signed setup completion and resolves its payment method', async () => {
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_setup',
        type: 'checkout.session.completed',
        created: 1_775_649_600,
        data: { object: createCompletedSetupSession() },
      }),
    });
    stripe.setupIntents = {
      retrieve: vi.fn(async () => ({
        id: 'seti_123',
        payment_method: 'pm_123',
      })),
    };

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        consentStateSecret,
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({
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
    });
    expect(stripe.setupIntents.retrieve).toHaveBeenCalledWith('seti_123');
    expect(stripe.subscriptions?.retrieve).not.toHaveBeenCalled();
  });

  it('fails a setup completion closed when the dedicated consent-state secret is unavailable', async () => {
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_setup',
        type: 'checkout.session.completed',
        data: { object: createCompletedSetupSession() },
      }),
    });

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger: new FakeLogger(),
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Trial consent-state verification is not configured',
    });
  });

  it('rejects a setup completion without accepted Terms before resolving the payment method', async () => {
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_setup',
        type: 'checkout.session.completed',
        data: {
          object: createCompletedSetupSession({ terms: 'required' }),
        },
      }),
    });
    stripe.setupIntents = {
      retrieve: vi.fn(async () => ({
        id: 'seti_123',
        payment_method: 'pm_123',
      })),
    };

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        consentStateSecret,
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger: new FakeLogger(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
    expect(stripe.setupIntents.retrieve).not.toHaveBeenCalled();
  });

  it('rejects setup metadata with an invalid server signature before resolving the payment method', async () => {
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_setup',
        type: 'checkout.session.completed',
        data: {
          object: createCompletedSetupSession({ signature: 'invalid' }),
        },
      }),
    });
    stripe.setupIntents = {
      retrieve: vi.fn(async () => ({
        id: 'seti_123',
        payment_method: 'pm_123',
      })),
    };

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        consentStateSecret,
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger: new FakeLogger(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
    expect(stripe.setupIntents.retrieve).not.toHaveBeenCalled();
  });

  it('throws INVALID_WEBHOOK_SIGNATURE when Stripe signature verification fails', async () => {
    const logger = new FakeLogger();
    const stripe = {
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error('signature mismatch');
        }),
      },
    } as unknown as StripeClient;

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });

    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toMatchObject({
      msg: 'Webhook signature verification failed',
      context: { error: 'signature mismatch' },
    });
  });

  it('returns base result for unsupported event types', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_unsupported',
        type: 'charge.refunded',
        data: { object: {} },
      }),
    });

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger,
      }),
    ).resolves.toEqual({
      eventId: 'evt_unsupported',
      type: 'charge.refunded',
    });

    expect(stripe.subscriptions?.retrieve).not.toHaveBeenCalled();
  });

  it('returns base result for checkout completion when subscription reference is null', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_checkout',
        type: 'checkout.session.completed',
        data: {
          object: {
            subscription: null,
          },
        },
      }),
    });

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger,
      }),
    ).resolves.toEqual({
      eventId: 'evt_checkout',
      type: 'checkout.session.completed',
    });

    expect(stripe.subscriptions?.retrieve).not.toHaveBeenCalled();
  });

  it('retrieves and includes subscriptionUpdate for checkout session events', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_checkout',
        type: 'checkout.session.completed',
        data: {
          object: {
            subscription: 'sub_123',
          },
        },
      }),
    });

    const result = await processStripeWebhookEvent({
      stripe,
      webhookSecret: 'whsec_test',
      rawBody: '{}',
      signature: 'sig_test',
      priceIds,
      logger,
    });

    expect(result).toEqual({
      eventId: 'evt_checkout',
      type: 'checkout.session.completed',
      subscriptionUpdate: {
        userId: appUserId,
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });
    expect(stripe.subscriptions?.retrieve).toHaveBeenCalledWith('sub_123');
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
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_checkout_consent',
        type: 'checkout.session.completed',
        created: 1_775_649_600,
        data: {
          object: {
            id: 'cs_checkout_123',
            mode: 'subscription',
            customer: 'cus_123',
            client_reference_id: appUserId,
            subscription: 'sub_123',
            consent: { terms_of_service: 'accepted' },
            metadata: {
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
            },
          },
        },
      }),
    });

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger,
      }),
    ).resolves.toMatchObject({
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

  it('preserves subscription activation and warns when accepted consent lacks the complete evidence snapshot', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_checkout_incomplete_consent',
        type: 'checkout.session.completed',
        created: 1_775_649_600,
        data: {
          object: {
            id: 'cs_checkout_incomplete',
            mode: 'subscription',
            customer: 'cus_123',
            client_reference_id: appUserId,
            subscription: 'sub_123',
            consent: { terms_of_service: 'accepted' },
            metadata: {
              checkout_variant: 'standard',
              renewal_user_id: appUserId,
            },
          },
        },
      }),
    });

    const result = await processStripeWebhookEvent({
      stripe,
      webhookSecret: 'whsec_test',
      rawBody: '{}',
      signature: 'sig_test',
      priceIds,
      logger,
    });

    expect(result).toMatchObject({
      eventId: 'evt_checkout_incomplete_consent',
      subscriptionUpdate: { externalSubscriptionId: 'sub_123' },
    });
    expect(result).not.toHaveProperty('initialSubscriptionConsent');
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          eventId: 'evt_checkout_incomplete_consent',
          sessionId: 'cs_checkout_incomplete',
          reason: 'consent_evidence_invalid',
        }),
      }),
    ]);
  });

  it('preserves subscription activation and warns when consent identity differs from the live subscription', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_checkout_mismatched_consent',
        type: 'checkout.session.completed',
        created: 1_775_649_600,
        data: {
          object: {
            id: 'cs_checkout_mismatched',
            mode: 'subscription',
            customer: 'cus_123',
            client_reference_id: appUserId,
            subscription: 'sub_123',
            consent: { terms_of_service: 'accepted' },
            metadata: {
              checkout_variant: 'standard',
              renewal_user_id: crypto.randomUUID(),
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
            },
          },
        },
      }),
    });

    const result = await processStripeWebhookEvent({
      stripe,
      webhookSecret: 'whsec_test',
      rawBody: '{}',
      signature: 'sig_test',
      priceIds,
      logger,
    });

    expect(result).toMatchObject({
      eventId: 'evt_checkout_mismatched_consent',
      subscriptionUpdate: { externalSubscriptionId: 'sub_123' },
    });
    expect(result).not.toHaveProperty('initialSubscriptionConsent');
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          eventId: 'evt_checkout_mismatched_consent',
          sessionId: 'cs_checkout_mismatched',
          reason: 'consent_identity_mismatch',
        }),
      }),
    ]);
  });

  it('preserves subscription activation for a pre-deploy Session and records an operator warning', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_checkout_legacy_consent',
        type: 'checkout.session.completed',
        created: 1_775_649_600,
        data: {
          object: {
            id: 'cs_checkout_legacy',
            mode: 'subscription',
            customer: 'cus_123',
            client_reference_id: appUserId,
            subscription: 'sub_123',
            consent: { terms_of_service: 'accepted' },
            metadata: { checkout_variant: 'standard' },
          },
        },
      }),
    });

    const result = await processStripeWebhookEvent({
      stripe,
      webhookSecret: 'whsec_test',
      rawBody: '{}',
      signature: 'sig_test',
      priceIds,
      logger,
    });

    expect(result).toMatchObject({
      eventId: 'evt_checkout_legacy_consent',
      subscriptionUpdate: { externalSubscriptionId: 'sub_123' },
    });
    expect(result).not.toHaveProperty('initialSubscriptionConsent');
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          eventId: 'evt_checkout_legacy_consent',
          sessionId: 'cs_checkout_legacy',
          reason: 'consent_evidence_invalid',
        }),
      }),
    ]);
  });

  it('retrieves and includes subscriptionUpdate for invoice.payment_succeeded events with a nested Clover subscription reference', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_invoice_success_nested',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test_REDACTED',
            object: 'invoice',
            subscription: null,
            parent: {
              type: 'subscription_details',
              subscription_details: {
                subscription: 'sub_test_REDACTED_nested_success',
              },
            },
          },
        },
      }),
    });

    const result = await processStripeWebhookEvent({
      stripe,
      webhookSecret: 'whsec_test',
      rawBody: '{}',
      signature: 'sig_test',
      priceIds,
      logger,
    });

    expect(result).toEqual({
      eventId: 'evt_invoice_success_nested',
      type: 'invoice.payment_succeeded',
      subscriptionUpdate: {
        userId: appUserId,
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });
    expect(stripe.subscriptions?.retrieve).toHaveBeenCalledWith(
      'sub_test_REDACTED_nested_success',
    );
  });

  it('retrieves and includes subscriptionUpdate for invoice.payment_failed events with a nested Clover subscription reference', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_invoice_failed_nested',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_REDACTED',
            object: 'invoice',
            subscription: null,
            parent: {
              type: 'subscription_details',
              subscription_details: {
                subscription: 'sub_test_REDACTED_nested_failed',
              },
            },
          },
        },
      }),
    });

    const result = await processStripeWebhookEvent({
      stripe,
      webhookSecret: 'whsec_test',
      rawBody: '{}',
      signature: 'sig_test',
      priceIds,
      logger,
    });

    expect(result).toEqual({
      eventId: 'evt_invoice_failed_nested',
      type: 'invoice.payment_failed',
      subscriptionUpdate: {
        userId: appUserId,
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });
    expect(stripe.subscriptions?.retrieve).toHaveBeenCalledWith(
      'sub_test_REDACTED_nested_failed',
    );
  });

  it('prefers nested invoice subscription references over legacy root references when both are present', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_invoice_both_refs',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test_REDACTED',
            object: 'invoice',
            subscription: 'sub_test_REDACTED_legacy_root',
            parent: {
              type: 'subscription_details',
              subscription_details: {
                subscription: 'sub_test_REDACTED_clover_nested',
              },
            },
          },
        },
      }),
    });

    await processStripeWebhookEvent({
      stripe,
      webhookSecret: 'whsec_test',
      rawBody: '{}',
      signature: 'sig_test',
      priceIds,
      logger,
    });

    // Current Clover invoice payloads put the authoritative subscription
    // reference in parent.subscription_details; root is legacy fallback only.
    expect(stripe.subscriptions?.retrieve).toHaveBeenCalledWith(
      'sub_test_REDACTED_clover_nested',
    );
  });

  it('returns base result for invoice events when no subscription reference exists', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_invoice_no_ref',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test_REDACTED',
            object: 'invoice',
            subscription: null,
            parent: {
              type: 'subscription_details',
              subscription_details: {
                subscription: null,
              },
            },
          },
        },
      }),
    });

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger,
      }),
    ).resolves.toEqual({
      eventId: 'evt_invoice_no_ref',
      type: 'invoice.payment_succeeded',
    });
    expect(stripe.subscriptions?.retrieve).not.toHaveBeenCalled();
  });

  it('normalizes and includes subscriptionUpdate for customer.subscription.updated events', async () => {
    const logger = new FakeLogger();
    const subscription = createSubscriptionFixture();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_sub_updated',
        type: 'customer.subscription.updated',
        data: { object: subscription },
      }),
    });

    const result = await processStripeWebhookEvent({
      stripe,
      webhookSecret: 'whsec_test',
      rawBody: '{}',
      signature: 'sig_test',
      priceIds,
      logger,
    });

    expect(result).toEqual({
      eventId: 'evt_sub_updated',
      type: 'customer.subscription.updated',
      subscriptionUpdate: {
        userId: appUserId,
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });
    expect(stripe.subscriptions?.retrieve).toHaveBeenCalledWith('sub_123');
  });

  it('throws INVALID_WEBHOOK_PAYLOAD for invalid subscription event payloads', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      eventFactory: () => ({
        id: 'evt_bad_payload',
        type: 'customer.subscription.updated',
        data: { object: { id: 123 } },
      }),
    });

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
    });

    expect(logger.errorCalls).toHaveLength(1);
    const errorCall = logger.errorCalls[0];
    if (errorCall === undefined) {
      throw new Error('Expected Stripe webhook payload error log');
    }
    expect(errorCall.msg).toBe('Invalid Stripe subscription webhook payload');
    expect(errorCall.context).toHaveProperty('error');
    expect(stripe.subscriptions?.retrieve).not.toHaveBeenCalled();
  });
});
