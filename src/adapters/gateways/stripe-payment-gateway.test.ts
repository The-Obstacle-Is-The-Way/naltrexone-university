import { describe, expect, it, vi } from 'vitest';
import { StripePaymentGateway } from './stripe-payment-gateway';

describe('StripePaymentGateway', () => {
  it('creates a subscription checkout session with the correct Stripe parameters', async () => {
    const checkoutCreate = vi.fn(async () => ({
      url: 'https://stripe/checkout',
    }));
    const stripe = {
      checkout: { sessions: { create: checkoutCreate } },
      billingPortal: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
        },
      },
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error('unexpected webhook call');
        }),
      },
    } as const;

    const gateway = new StripePaymentGateway({
      stripe,
      webhookSecret: 'whsec_1',
      priceIds: { monthly: 'price_m', annual: 'price_a' },
    });

    await expect(
      gateway.createCheckoutSession({
        userId: 'user_1',
        stripeCustomerId: 'cus_123',
        plan: 'monthly',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout' });

    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_123',
        line_items: [{ price: 'price_m', quantity: 1 }],
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
        success_url: 'https://app/success',
        cancel_url: 'https://app/cancel',
        client_reference_id: 'user_1',
        subscription_data: {
          metadata: { user_id: 'user_1' },
        },
      }),
    );
  });

  it('throws STRIPE_ERROR when a checkout session URL is missing', async () => {
    const stripe = {
      checkout: { sessions: { create: vi.fn(async () => ({ url: null })) } },
      billingPortal: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
        },
      },
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error('unexpected webhook call');
        }),
      },
    } as const;

    const gateway = new StripePaymentGateway({
      stripe,
      webhookSecret: 'whsec_1',
      priceIds: { monthly: 'price_m', annual: 'price_a' },
    });

    await expect(
      gateway.createCheckoutSession({
        userId: 'user_1',
        stripeCustomerId: 'cus_123',
        plan: 'monthly',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });

  it('creates a billing portal session with the correct Stripe parameters', async () => {
    const portalCreate = vi.fn(async () => ({ url: 'https://stripe/portal' }));
    const stripe = {
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
        },
      },
      billingPortal: { sessions: { create: portalCreate } },
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error('unexpected webhook call');
        }),
      },
    } as const;

    const gateway = new StripePaymentGateway({
      stripe,
      webhookSecret: 'whsec_1',
      priceIds: { monthly: 'price_m', annual: 'price_a' },
    });

    await expect(
      gateway.createPortalSession({
        stripeCustomerId: 'cus_123',
        returnUrl: 'https://app/return',
      }),
    ).resolves.toEqual({ url: 'https://stripe/portal' });

    expect(portalCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://app/return',
    });
  });

  it('verifies webhook signatures and normalizes subscription update events', async () => {
    const constructEvent = vi.fn(() => ({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          current_period_end: 1_700_000_000,
          cancel_at_period_end: false,
          metadata: { user_id: 'user_1' },
          items: { data: [{ price: { id: 'price_m' } }] },
        },
      },
    }));

    const stripe = {
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
        },
      },
      billingPortal: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
        },
      },
      webhooks: { constructEvent },
    } as const;

    const gateway = new StripePaymentGateway({
      stripe,
      webhookSecret: 'whsec_1',
      priceIds: { monthly: 'price_m', annual: 'price_a' },
    });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_1',
      type: 'customer.subscription.updated',
      subscriptionUpdate: {
        userId: 'user_1',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });

    expect(constructEvent).toHaveBeenCalledWith('raw_body', 'sig_1', 'whsec_1');
  });

  it('throws STRIPE_ERROR when webhook signature verification fails', async () => {
    const stripe = {
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
        },
      },
      billingPortal: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
        },
      },
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error('Invalid signature');
        }),
      },
    } as const;

    const gateway = new StripePaymentGateway({
      stripe,
      webhookSecret: 'whsec_1',
      priceIds: { monthly: 'price_m', annual: 'price_a' },
    });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Invalid webhook signature',
    });
  });

  it('throws when a subscription update event is missing required metadata', async () => {
    const stripe = {
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
        },
      },
      billingPortal: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
        },
      },
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: 'evt_1',
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              current_period_end: 1_700_000_000,
              cancel_at_period_end: false,
              metadata: {},
              items: { data: [{ price: { id: 'price_m' } }] },
            },
          },
        })),
      },
    } as const;

    const gateway = new StripePaymentGateway({
      stripe,
      webhookSecret: 'whsec_1',
      priceIds: { monthly: 'price_m', annual: 'price_a' },
    });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });

  it('ignores checkout.session.completed events (no subscription update extracted)', async () => {
    const stripe = {
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
        },
      },
      billingPortal: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
        },
      },
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: 'evt_1',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_test_1' } },
        })),
      },
    } as const;

    const gateway = new StripePaymentGateway({
      stripe,
      webhookSecret: 'whsec_1',
      priceIds: { monthly: 'price_m', annual: 'price_a' },
    });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_1',
      type: 'checkout.session.completed',
    });
  });
});
