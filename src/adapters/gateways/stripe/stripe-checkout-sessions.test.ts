import { describe, expect, it, vi } from 'vitest';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  createStripeCheckoutSession,
  SUBSCRIPTION_LIST_LIMIT,
} from './stripe-checkout-sessions';

describe('createStripeCheckoutSession', () => {
  it('preserves this-binding when calling subscriptions.list', async () => {
    const makeRequest = vi.fn(async (_params: unknown) => ({
      data: [{ id: 'sub_active', status: 'active' as const }],
    }));

    const subscriptions = {
      _makeRequest: makeRequest,
      retrieve: vi.fn(async () => ({})),
      list: function (
        this: { _makeRequest: typeof makeRequest },
        params: unknown,
      ) {
        return this._makeRequest(params);
      },
    };

    const stripe = {
      customers: { create: vi.fn(async () => ({ id: 'cus_1' })) },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'cs_1',
            url: 'https://stripe/checkout',
          })),
          list: vi.fn(async () => ({ data: [] })),
          retrieve: vi.fn(async () => ({ id: 'cs_1', url: null })),
          expire: vi.fn(async () => ({ id: 'cs_1', url: null })),
        },
      },
      subscriptions,
      billingPortal: {
        sessions: {
          create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
        },
      },
      webhooks: { constructEvent: vi.fn() },
    } as unknown as StripeClient;

    // If .bind() is missing, subscriptions.list will throw because
    // `this._makeRequest` will be undefined at runtime.
    await expect(
      createStripeCheckoutSession({
        stripe,
        input: {
          userId: 'user_1',
          externalCustomerId: 'cus_123',
          plan: 'monthly',
          successUrl: 'https://app/success',
          cancelUrl: 'https://app/cancel',
        },
        priceIds: { monthly: 'price_m', annual: 'price_a' },
        logger: new FakeLogger(),
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_SUBSCRIBED' });

    expect(makeRequest).toHaveBeenCalledWith({
      customer: 'cus_123',
      status: 'all',
      limit: SUBSCRIPTION_LIST_LIMIT,
    });
  });
});
