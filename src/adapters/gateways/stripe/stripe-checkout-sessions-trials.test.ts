import { describe, expect, it, vi } from 'vitest';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';

function createStripeMock() {
  const sessionsCreate = vi.fn(async () => ({
    id: 'cs_new',
    url: 'https://stripe/checkout/new',
  }));

  const stripe = {
    customers: { create: vi.fn(async () => ({ id: 'cus_1' })) },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({ data: [] })),
        retrieve: vi.fn(async () => ({ id: 'cs_1', url: null })),
        expire: vi.fn(async () => ({ id: 'cs_1', url: null })),
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

  return { stripe, sessionsCreate };
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
        idempotencyKey: `checkout_session:${appUserId}:monthly`,
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
});
