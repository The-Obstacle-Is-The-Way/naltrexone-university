import { describe, expect, it, vi } from 'vitest';
import { StripePaymentGateway } from './stripe-payment-gateway';

describe('StripePaymentGateway', () => {
  it('creates a Stripe customer with the correct Stripe parameters', async () => {
    const customersCreate = vi.fn(async () => ({ id: 'cus_123' }));
    const stripe = {
      customers: { create: customersCreate },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
          list: vi.fn(async () => ({ data: [] })),
        },
      },
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
      gateway.createCustomer({
        userId: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      }),
    ).resolves.toEqual({ stripeCustomerId: 'cus_123' });

    expect(customersCreate).toHaveBeenCalledWith({
      email: 'user@example.com',
      metadata: { user_id: 'user_1', clerk_user_id: 'clerk_1' },
    });
  });

  it('throws STRIPE_ERROR when a Stripe customer id is missing', async () => {
    const stripe = {
      customers: { create: vi.fn(async () => ({ id: undefined })) },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
          list: vi.fn(async () => ({ data: [] })),
        },
      },
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
      gateway.createCustomer({
        userId: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      }),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });

  it('creates a subscription checkout session with the correct Stripe parameters', async () => {
    const checkoutCreate = vi.fn(async () => ({
      url: 'https://stripe/checkout',
    }));
    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: checkoutCreate,
          list: vi.fn(async () => ({ data: [] })),
        },
      },
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

  it('reuses an existing open checkout session when present', async () => {
    const checkoutList = vi.fn(async () => ({
      data: [{ url: 'https://stripe/existing-checkout' }],
    }));
    const checkoutCreate = vi.fn(async () => ({
      url: 'https://stripe/new-checkout',
    }));

    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: checkoutCreate,
          list: checkoutList,
        },
      },
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
        plan: 'annual',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/existing-checkout' });

    expect(checkoutList).toHaveBeenCalledWith({
      customer: 'cus_123',
      status: 'open',
      limit: 1,
    });
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it('throws STRIPE_ERROR when a checkout session URL is missing', async () => {
    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: null })),
          list: vi.fn(async () => ({ data: [] })),
        },
      },
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
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
          list: vi.fn(async () => ({ data: [] })),
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
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
          list: vi.fn(async () => ({ data: [] })),
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

  it('normalizes customer.subscription.paused events', async () => {
    const constructEvent = vi.fn(() => ({
      id: 'evt_2',
      type: 'customer.subscription.paused',
      data: {
        object: {
          id: 'sub_456',
          customer: 'cus_456',
          status: 'paused',
          current_period_end: 1_700_000_000,
          cancel_at_period_end: false,
          metadata: { user_id: 'user_2' },
          items: { data: [{ price: { id: 'price_a' } }] },
        },
      },
    }));

    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
          list: vi.fn(async () => ({ data: [] })),
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
      eventId: 'evt_2',
      type: 'customer.subscription.paused',
      subscriptionUpdate: {
        userId: 'user_2',
        stripeCustomerId: 'cus_456',
        stripeSubscriptionId: 'sub_456',
        plan: 'annual',
        status: 'paused',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });
  });

  it('throws INVALID_WEBHOOK_SIGNATURE when webhook signature verification fails', async () => {
    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
          list: vi.fn(async () => ({ data: [] })),
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
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });
  });

  it('includes original error message when webhook signature verification fails', async () => {
    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
          list: vi.fn(async () => ({ data: [] })),
        },
      },
      billingPortal: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
        },
      },
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error('Signature timestamp too old');
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
      code: 'INVALID_WEBHOOK_SIGNATURE',
      message: expect.stringContaining('Signature timestamp too old'),
    });
  });

  it('calls logger.error when logger is provided and webhook verification fails', async () => {
    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
          list: vi.fn(async () => ({ data: [] })),
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

    const loggerError = vi.fn();
    const gateway = new StripePaymentGateway({
      stripe,
      webhookSecret: 'whsec_1',
      priceIds: { monthly: 'price_m', annual: 'price_a' },
      logger: { error: loggerError },
    });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });

    expect(loggerError).toHaveBeenCalledWith(
      'Webhook signature verification failed',
      { error: 'Invalid signature' },
    );
  });

  it('throws when a subscription update event is missing required metadata', async () => {
    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
          list: vi.fn(async () => ({ data: [] })),
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
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/checkout' })),
          list: vi.fn(async () => ({ data: [] })),
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
