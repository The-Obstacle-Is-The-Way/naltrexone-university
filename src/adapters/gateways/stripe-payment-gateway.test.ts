import { describe, expect, it, vi } from 'vitest';
import { loadJsonFixture } from '@/tests/shared/load-json-fixture';
import { StripePaymentGateway } from './stripe-payment-gateway';

describe('StripePaymentGateway', () => {
  it('creates a Stripe customer with the correct Stripe parameters', async () => {
    const customersCreate = vi.fn(async () => ({ id: 'cus_123' }));
    const stripe = {
      customers: { create: customersCreate },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
      id: 'cs_new',
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
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
      data: [{ id: 'cs_existing', url: 'https://stripe/existing-checkout' }],
    }));
    const checkoutRetrieve = vi.fn(async () => ({
      id: 'cs_existing',
      url: 'https://stripe/existing-checkout',
      line_items: { data: [{ price: { id: 'price_a' } }] },
    }));
    const checkoutExpire = vi.fn(async () => ({
      id: 'cs_existing',
      url: 'https://stripe/existing-checkout',
    }));
    const checkoutCreate = vi.fn(async () => ({
      id: 'cs_new',
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
          retrieve: checkoutRetrieve,
          expire: checkoutExpire,
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
    expect(checkoutRetrieve).toHaveBeenCalledWith('cs_existing', {
      expand: ['line_items'],
    });
    expect(checkoutExpire).not.toHaveBeenCalled();
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it('expires an existing open checkout session when the plan does not match', async () => {
    const checkoutList = vi.fn(async () => ({
      data: [{ id: 'cs_existing', url: 'https://stripe/existing-checkout' }],
    }));
    const checkoutRetrieve = vi.fn(async () => ({
      id: 'cs_existing',
      url: 'https://stripe/existing-checkout',
      line_items: { data: [{ price: { id: 'price_a' } }] },
    }));
    const checkoutExpire = vi.fn(async () => ({
      id: 'cs_existing',
      url: 'https://stripe/existing-checkout',
    }));
    const checkoutCreate = vi.fn(async () => ({
      id: 'cs_new',
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
          retrieve: checkoutRetrieve,
          expire: checkoutExpire,
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
    ).resolves.toEqual({ url: 'https://stripe/new-checkout' });

    expect(checkoutRetrieve).toHaveBeenCalledWith('cs_existing', {
      expand: ['line_items'],
    });
    expect(checkoutExpire).toHaveBeenCalledWith('cs_existing');
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_m', quantity: 1 }],
      }),
    );
  });

  it('throws STRIPE_ERROR when a checkout session URL is missing', async () => {
    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ id: 'cs_new', url: null })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
    const event = loadJsonFixture('stripe/customer.subscription.updated.json');
    const constructEvent = vi.fn(() => event as never);

    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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

  it('throws INVALID_WEBHOOK_PAYLOAD when subscription payload shape is invalid', async () => {
    const constructEvent = vi.fn(() => ({
      id: 'evt_bad',
      type: 'customer.subscription.updated',
      data: { object: { id: 123 } },
    }));

    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
  });

  it('normalizes customer.subscription.paused events', async () => {
    const event = loadJsonFixture('stripe/customer.subscription.paused.json');
    const constructEvent = vi.fn(() => event as never);

    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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

  it('normalizes customer.subscription.resumed events', async () => {
    const event = loadJsonFixture('stripe/customer.subscription.resumed.json');
    const constructEvent = vi.fn(() => event as never);

    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
      eventId: 'evt_3',
      type: 'customer.subscription.resumed',
      subscriptionUpdate: {
        userId: 'user_3',
        stripeCustomerId: 'cus_789',
        stripeSubscriptionId: 'sub_789',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });
  });

  it('normalizes customer.subscription.pending_update_applied events', async () => {
    const event = loadJsonFixture(
      'stripe/customer.subscription.pending_update_applied.json',
    );
    const constructEvent = vi.fn(() => event as never);

    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
      eventId: 'evt_4',
      type: 'customer.subscription.pending_update_applied',
      subscriptionUpdate: {
        userId: 'user_4',
        stripeCustomerId: 'cus_901',
        stripeSubscriptionId: 'sub_901',
        plan: 'annual',
        status: 'active',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });
  });

  it('normalizes customer.subscription.pending_update_expired events', async () => {
    const event = loadJsonFixture(
      'stripe/customer.subscription.pending_update_expired.json',
    );
    const constructEvent = vi.fn(() => event as never);

    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
      eventId: 'evt_5',
      type: 'customer.subscription.pending_update_expired',
      subscriptionUpdate: {
        userId: 'user_5',
        stripeCustomerId: 'cus_902',
        stripeSubscriptionId: 'sub_902',
        plan: 'monthly',
        status: 'active',
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
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
              cancel_at_period_end: false,
              metadata: {},
              items: {
                data: [
                  {
                    current_period_end: 1_700_000_000,
                    price: { id: 'price_m' },
                  },
                ],
              },
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

  it('skips customer.subscription.created events when metadata.user_id is missing', async () => {
    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
          type: 'customer.subscription.created',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              cancel_at_period_end: false,
              metadata: {},
              items: {
                data: [
                  {
                    current_period_end: 1_700_000_000,
                    price: { id: 'price_m' },
                  },
                ],
              },
            },
          },
        })),
      },
    } as const;

    const loggerWarn = vi.fn();
    const gateway = new StripePaymentGateway({
      stripe,
      webhookSecret: 'whsec_1',
      priceIds: { monthly: 'price_m', annual: 'price_a' },
      logger: { error: vi.fn(), warn: loggerWarn },
    });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_1',
      type: 'customer.subscription.created',
    });

    expect(loggerWarn).toHaveBeenCalledWith(
      'Skipping subscription.created event without metadata.user_id',
      {
        eventId: 'evt_1',
        stripeSubscriptionId: 'sub_123',
        stripeCustomerId: 'cus_123',
      },
    );
  });

  it('ignores checkout.session.completed events (no subscription update extracted)', async () => {
    const stripe = {
      customers: {
        create: vi.fn(async () => ({ id: 'cus_123' })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'cs_new',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
            line_items: { data: [] },
          })),
          expire: vi.fn(async () => ({
            id: 'cs_existing',
            url: 'https://stripe/existing-checkout',
          })),
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
