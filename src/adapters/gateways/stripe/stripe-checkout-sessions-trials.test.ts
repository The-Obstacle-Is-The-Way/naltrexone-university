import { describe, expect, it, vi } from 'vitest';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';

function createStripeMock(overrides?: {
  openSessionsData?: Array<{ id: string; url: string | null }>;
  retrievedSessionPriceId?: string | null;
  retrievedSessionMetadata?: Record<string, string>;
  retrievedSessionPaymentMethodCollection?: 'always' | 'if_required';
  shouldThrowOnRetrieve?: boolean;
}) {
  const sessionsCreate = vi.fn(async () => ({
    id: 'cs_new',
    url: 'https://stripe/checkout/new',
  }));
  const sessionsRetrieve = vi.fn(async () => {
    if (overrides?.shouldThrowOnRetrieve) {
      throw new Error('retrieve failed');
    }

    const lineItemsData =
      overrides?.retrievedSessionPriceId === null
        ? []
        : [
            {
              price: {
                id: overrides?.retrievedSessionPriceId ?? 'price_m',
              },
            },
          ];

    return {
      id: 'cs_existing',
      url: 'https://stripe/checkout/existing',
      status: 'open' as const,
      expires_at: 1_700_000_001,
      metadata: overrides?.retrievedSessionMetadata,
      payment_method_collection:
        overrides?.retrievedSessionPaymentMethodCollection,
      line_items: {
        data: lineItemsData,
      },
    };
  });
  const sessionsExpire = vi.fn(async () => ({ id: 'cs_existing', url: null }));

  const stripe = {
    customers: { create: vi.fn(async () => ({ id: 'cus_1' })) },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({ data: overrides?.openSessionsData ?? [] })),
        retrieve: sessionsRetrieve,
        expire: sessionsExpire,
        create: sessionsCreate,
      },
    },
    subscriptions: {
      list: vi.fn(async () => ({ data: [] })),
      retrieve: vi.fn(async () => ({})),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
      },
    },
    webhooks: { constructEvent: vi.fn() },
  } as unknown as StripeClient;

  return { stripe, sessionsCreate, sessionsExpire, sessionsRetrieve };
}

describe('createStripeCheckoutSession trial params', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: 'cus_123',
    plan: 'monthly' as const,
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;
  const logger = new FakeLogger();

  it('adds no-card trial params when trialPeriodDays is provided', async () => {
    const { stripe, sessionsCreate } = createStripeMock();

    await expect(
      createStripeCheckoutSession({
        stripe,
        input: { ...input, trialPeriodDays: 7 },
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsCreate).toHaveBeenCalledWith(
      {
        mode: 'subscription',
        customer: 'cus_123',
        line_items: [{ price: 'price_m', quantity: 1 }],
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
        success_url: 'https://app/success',
        cancel_url: 'https://app/cancel',
        client_reference_id: appUserId,
        metadata: {
          checkout_variant: 'trial:7',
        },
        payment_method_collection: 'if_required',
        subscription_data: {
          metadata: {
            user_id: appUserId,
          },
          trial_period_days: 7,
          trial_settings: {
            end_behavior: {
              missing_payment_method: 'cancel',
            },
          },
        },
      },
      expect.objectContaining({
        idempotencyKey: `checkout_session:${appUserId}:monthly:trial:7`,
      }),
    );
  });

  it('omits all trial params when trialPeriodDays is absent', async () => {
    const { stripe, sessionsCreate } = createStripeMock();

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsCreate).toHaveBeenCalledWith(
      {
        mode: 'subscription',
        customer: 'cus_123',
        line_items: [{ price: 'price_m', quantity: 1 }],
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
        success_url: 'https://app/success',
        cancel_url: 'https://app/cancel',
        client_reference_id: appUserId,
        subscription_data: {
          metadata: {
            user_id: appUserId,
          },
        },
      },
      expect.objectContaining({
        idempotencyKey: `checkout_session:${appUserId}:monthly`,
      }),
    );

    const createCalls = sessionsCreate.mock.calls as unknown as Array<
      [Record<string, unknown>, unknown]
    >;
    const params = createCalls[0]?.[0];
    const subscriptionData = params?.subscription_data as
      | Record<string, unknown>
      | undefined;
    expect(params).not.toHaveProperty('payment_method_collection');
    expect(subscriptionData).not.toHaveProperty('trial_period_days');
    expect(subscriptionData).not.toHaveProperty('trial_settings');
  });

  it('expires an existing same-price trial checkout session when standard checkout is requested', async () => {
    const { stripe, sessionsCreate, sessionsExpire } = createStripeMock({
      openSessionsData: [
        { id: 'cs_existing', url: 'https://stripe/checkout/trial' },
      ],
      retrievedSessionMetadata: { checkout_variant: 'trial:7' },
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
        nowMs: () => 1_700_000_000_000,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_existing',
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: `checkout_session:${appUserId}:monthly`,
      }),
    );
  });

  it('expires a legacy no-card checkout session without variant metadata when standard checkout is requested', async () => {
    const { stripe, sessionsCreate, sessionsExpire } = createStripeMock({
      openSessionsData: [
        { id: 'cs_existing', url: 'https://stripe/checkout/legacy-trial' },
      ],
      retrievedSessionPaymentMethodCollection: 'if_required',
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
        nowMs: () => 1_700_000_000_000,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_existing',
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: `checkout_session:${appUserId}:monthly`,
      }),
    );
  });

  it('reuses an existing same-price trial checkout session when checkout variant matches', async () => {
    const { stripe, sessionsCreate, sessionsExpire, sessionsRetrieve } =
      createStripeMock({
        openSessionsData: [
          { id: 'cs_existing', url: 'https://stripe/checkout/trial' },
        ],
        retrievedSessionMetadata: { checkout_variant: 'trial:7' },
      });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input: { ...input, trialPeriodDays: 7 },
        priceIds,
        logger,
        nowMs: () => 1_700_000_000_000,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/trial' });

    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_existing', {
      expand: ['line_items'],
    });
    expect(sessionsExpire).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'the existing session cannot be retrieved',
      overrides: { shouldThrowOnRetrieve: true },
    },
    {
      name: 'the existing session has a different price',
      overrides: { retrievedSessionPriceId: 'price_a' },
    },
    {
      name: 'the existing session price cannot be determined',
      overrides: { retrievedSessionPriceId: null },
    },
  ])('creates trial checkout with a replacement idempotency key when $name', async ({
    overrides,
  }) => {
    const { stripe, sessionsCreate, sessionsExpire } = createStripeMock({
      openSessionsData: [
        { id: 'cs_existing', url: 'https://stripe/checkout/existing' },
      ],
      ...overrides,
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input: { ...input, trialPeriodDays: 7 },
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_existing',
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_collection: 'if_required',
        subscription_data: expect.objectContaining({
          trial_period_days: 7,
        }),
      }),
      expect.objectContaining({
        idempotencyKey: `checkout_session_recovery:${appUserId}:monthly:cs_existing:trial:7`,
      }),
    );
  });

  it('adds no-card trial params for annual plan with correct price and idempotency key', async () => {
    const { stripe, sessionsCreate } = createStripeMock();
    const annualInput = {
      ...input,
      plan: 'annual' as const,
      trialPeriodDays: 7,
    };

    await expect(
      createStripeCheckoutSession({
        stripe,
        input: annualInput,
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_a', quantity: 1 }],
        payment_method_collection: 'if_required',
        metadata: { checkout_variant: 'trial:7' },
        subscription_data: expect.objectContaining({
          trial_period_days: 7,
          trial_settings: {
            end_behavior: {
              missing_payment_method: 'cancel',
            },
          },
        }),
      }),
      expect.objectContaining({
        idempotencyKey: `checkout_session:${appUserId}:annual:trial:7`,
      }),
    );
  });

  it('reuses an existing same-price standard checkout session when no trial is requested', async () => {
    const { stripe, sessionsCreate, sessionsExpire, sessionsRetrieve } =
      createStripeMock({
        openSessionsData: [
          { id: 'cs_existing', url: 'https://stripe/checkout/standard' },
        ],
        // Default: no metadata, no if_required → standard variant inferred
      });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input, // no trialPeriodDays
        priceIds,
        logger,
        nowMs: () => 1_700_000_000_000,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/standard' });

    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_existing', {
      expand: ['line_items'],
    });
    expect(sessionsExpire).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('expires and recreates when existing session has a different trial variant (trial:14 vs requested trial:7)', async () => {
    const { stripe, sessionsCreate, sessionsExpire } = createStripeMock({
      openSessionsData: [
        { id: 'cs_existing', url: 'https://stripe/checkout/trial14' },
      ],
      retrievedSessionMetadata: { checkout_variant: 'trial:14' },
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input: { ...input, trialPeriodDays: 7 },
        priceIds,
        logger,
        nowMs: () => 1_700_000_000_000,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_existing',
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_collection: 'if_required',
        metadata: { checkout_variant: 'trial:7' },
        subscription_data: expect.objectContaining({
          trial_period_days: 7,
        }),
      }),
      expect.objectContaining({
        idempotencyKey: `checkout_session_recovery:${appUserId}:monthly:cs_existing:trial:7`,
      }),
    );
  });

  it('reuses an existing same-price session with explicit standard checkout_variant metadata', async () => {
    const { stripe, sessionsCreate, sessionsExpire, sessionsRetrieve } =
      createStripeMock({
        openSessionsData: [
          { id: 'cs_existing', url: 'https://stripe/checkout/std' },
        ],
        retrievedSessionMetadata: { checkout_variant: 'standard' },
      });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input, // no trialPeriodDays → requests standard
        priceIds,
        logger,
        nowMs: () => 1_700_000_000_000,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/std' });

    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_existing', {
      expand: ['line_items'],
    });
    expect(sessionsExpire).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});
