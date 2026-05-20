import { describe, expect, it, vi } from 'vitest';
import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { processStripeWebhookEvent } from './stripe-webhook-processor';

const priceIds: StripePriceIds = {
  monthly: 'price_monthly',
  annual: 'price_annual',
};

function createSubscriptionFixture() {
  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { user_id: 'user_1' },
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
  eventFactory: () => { id: string; type: string; data: { object: unknown } };
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

describe('processStripeWebhookEvent', () => {
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
        userId: 'user_1',
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
        userId: 'user_1',
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
        userId: 'user_1',
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
        userId: 'user_1',
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
    expect(logger.errorCalls[0].msg).toBe(
      'Invalid Stripe subscription webhook payload',
    );
    expect(logger.errorCalls[0].context).toHaveProperty('error');
    expect(stripe.subscriptions?.retrieve).not.toHaveBeenCalled();
  });
});
