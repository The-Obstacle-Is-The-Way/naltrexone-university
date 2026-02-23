import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  createStripeCheckoutSession,
  SUBSCRIPTION_LIST_LIMIT,
} from './stripe-checkout-sessions';

function createStripeMock(overrides?: {
  subscriptionsListData?: Array<{ id?: string; status?: string }>;
  openSessionsData?: Array<{ id: string; url: string | null }>;
  retrievedSessionPriceId?: string;
  shouldThrowOnRetrieve?: boolean;
  shouldThrowOnExpire?: boolean;
  createdSessionUrl?: string | null;
}) {
  const subscriptionsList = vi.fn(async () => ({
    data: overrides?.subscriptionsListData ?? [],
  }));
  const sessionsList = vi.fn(async () => ({
    data: overrides?.openSessionsData ?? [],
  }));
  const sessionsRetrieve = vi.fn(async () => {
    if (overrides?.shouldThrowOnRetrieve) {
      throw new Error('retrieve failed');
    }

    return {
      line_items: {
        data: [
          {
            price: {
              id: overrides?.retrievedSessionPriceId ?? 'price_m',
            },
          },
        ],
      },
    };
  });
  const sessionsExpire = vi.fn(async () => {
    if (overrides?.shouldThrowOnExpire) {
      throw new Error('expire failed');
    }

    return { id: 'cs_old', url: null };
  });
  const sessionsCreate = vi.fn(async () => ({
    id: 'cs_new',
    url:
      overrides && 'createdSessionUrl' in overrides
        ? overrides.createdSessionUrl
        : 'https://stripe/checkout/new',
  }));

  const stripe = {
    customers: { create: vi.fn(async () => ({ id: 'cus_1' })) },
    checkout: {
      sessions: {
        list: sessionsList,
        retrieve: sessionsRetrieve,
        expire: sessionsExpire,
        create: sessionsCreate,
      },
    },
    subscriptions: {
      list: subscriptionsList,
      retrieve: vi.fn(async () => ({})),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
      },
    },
    webhooks: { constructEvent: vi.fn() },
  } as unknown as StripeClient;

  return {
    stripe,
    subscriptionsList,
    sessionsList,
    sessionsRetrieve,
    sessionsExpire,
    sessionsCreate,
  };
}

describe('createStripeCheckoutSession', () => {
  const input = {
    userId: 'user_1',
    externalCustomerId: 'cus_123',
    plan: 'monthly' as const,
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;
  let logger: FakeLogger;

  beforeEach(() => {
    logger = new FakeLogger();
  });

  it('uses a deterministic fallback idempotency key when caller key is missing', async () => {
    const { stripe, sessionsCreate } = createStripeMock({
      openSessionsData: [],
      createdSessionUrl: 'https://stripe/checkout/new',
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: 'checkout_session:user_1:monthly',
      }),
    );
  });

  it('uses the caller-provided idempotency key when present', async () => {
    const { stripe, sessionsCreate } = createStripeMock({
      openSessionsData: [],
      createdSessionUrl: 'https://stripe/checkout/new',
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        options: { idempotencyKey: 'checkout_idem_custom_1' },
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: 'checkout_idem_custom_1',
      }),
    );
  });

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
        input,
        priceIds,
        logger,
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_SUBSCRIBED' });

    expect(makeRequest).toHaveBeenCalledWith({
      customer: 'cus_123',
      status: 'all',
      limit: SUBSCRIPTION_LIST_LIMIT,
    });
  });

  it('reuses an existing open checkout session when plan price matches', async () => {
    const { stripe, sessionsCreate, sessionsRetrieve } = createStripeMock({
      openSessionsData: [
        { id: 'cs_open', url: 'https://stripe/checkout/open' },
      ],
      retrievedSessionPriceId: 'price_m',
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/open' });

    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_open', {
      expand: ['line_items'],
    });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('expires mismatched open checkout session and creates a new session', async () => {
    const { stripe, sessionsExpire, sessionsCreate } = createStripeMock({
      openSessionsData: [
        { id: 'cs_open', url: 'https://stripe/checkout/open' },
      ],
      retrievedSessionPriceId: 'price_a',
      createdSessionUrl: 'https://stripe/checkout/new',
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsExpire).toHaveBeenCalledWith('cs_open', {
      idempotencyKey: 'expire_checkout_session:cs_open',
    });
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: 'checkout_session:user_1:monthly',
      }),
    );
  });

  it('throws STRIPE_ERROR when expiring mismatched session fails', async () => {
    const { stripe } = createStripeMock({
      openSessionsData: [
        { id: 'cs_open', url: 'https://stripe/checkout/open' },
      ],
      retrievedSessionPriceId: 'price_a',
      shouldThrowOnExpire: true,
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
      }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to expire existing checkout session',
    });
  });

  it('creates a new checkout session when existing session inspection fails', async () => {
    const { stripe, sessionsCreate, sessionsRetrieve } = createStripeMock({
      openSessionsData: [
        { id: 'cs_open', url: 'https://stripe/checkout/open' },
      ],
      shouldThrowOnRetrieve: true,
      createdSessionUrl: 'https://stripe/checkout/new',
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsRetrieve).toHaveBeenCalledTimes(1);
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });

  it('throws STRIPE_ERROR when created session is missing URL', async () => {
    const { stripe } = createStripeMock({
      openSessionsData: [],
      createdSessionUrl: null,
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
      }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe Checkout Session URL is missing',
    });
  });
});
