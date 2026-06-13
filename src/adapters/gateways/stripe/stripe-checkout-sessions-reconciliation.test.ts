import { describe, expect, it, vi } from 'vitest';
import type {
  StripeCheckoutSession,
  StripeClient,
} from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';

type TestCheckoutSession = StripeCheckoutSession & {
  created: number;
  expires_at?: number;
};

function createReconciliationStripeMock(input: {
  createdSession: TestCheckoutSession;
  listedAfterCreate: TestCheckoutSession[];
  expireError?: unknown;
}) {
  let listCallCount = 0;
  const sessionsList = vi.fn(async () => {
    listCallCount += 1;
    return {
      data: listCallCount === 1 ? [] : input.listedAfterCreate,
    };
  });
  const sessionsRetrieve = vi.fn(async () => input.createdSession);
  const sessionsExpire = vi.fn(async () => {
    if (input.expireError) throw input.expireError;
    return { ...input.createdSession, status: 'expired' as const, url: null };
  });
  const sessionsCreate = vi.fn(async () => input.createdSession);

  const stripe = {
    customers: { create: vi.fn(async () => ({ id: 'customer-id-1' })) },
    checkout: {
      sessions: {
        list: sessionsList,
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

  return {
    stripe,
    sessionsExpire,
  };
}

describe('createStripeCheckoutSession post-create reconciliation', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: 'customer-existing-123',
    plan: 'monthly' as const,
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const priceIds = {
    monthly: 'monthly-price-id',
    annual: 'annual-price-id',
  } as const;
  const fixedNowMs = 1_700_000_000_000;
  const fixedNowUnix = fixedNowMs / 1000;

  it('treats already-terminal reconcile expire errors as idempotent success', async () => {
    const logger = new FakeLogger();
    const createdSession = {
      id: 'checkout-created',
      url: 'https://stripe/checkout/created',
      status: 'open' as const,
      created: 1,
      expires_at: fixedNowUnix + 3600,
    };
    const canonicalSession = {
      id: 'checkout-canonical',
      url: 'https://stripe/checkout/canonical',
      status: 'open' as const,
      created: 2,
      expires_at: fixedNowUnix + 3600,
    };
    const alreadyExpiredError = Object.assign(
      new Error('This checkout session has already expired'),
      {
        rawType: 'invalid_request_error',
        code: 'resource_missing',
      },
    );
    const { stripe, sessionsExpire } = createReconciliationStripeMock({
      createdSession,
      listedAfterCreate: [canonicalSession],
      expireError: alreadyExpiredError,
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
        nowMs: () => fixedNowMs,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/canonical' });

    expect(sessionsExpire).toHaveBeenCalledWith('checkout-created', undefined, {
      idempotencyKey: 'expire_checkout_session:checkout-created',
    });
    expect(logger.infoCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Treating already-terminal checkout session expire error as success',
        }),
      ]),
    );
  });

  it('throws when reconciliation cannot expire a superseded checkout session', async () => {
    const logger = new FakeLogger();
    const createdSession = {
      id: 'checkout-created',
      url: 'https://stripe/checkout/created',
      status: 'open' as const,
      created: 1,
      expires_at: fixedNowUnix + 3600,
    };
    const canonicalSession = {
      id: 'checkout-canonical',
      url: 'https://stripe/checkout/canonical',
      status: 'open' as const,
      created: 2,
      expires_at: fixedNowUnix + 3600,
    };
    const { stripe } = createReconciliationStripeMock({
      createdSession,
      listedAfterCreate: [canonicalSession],
      expireError: new Error('expire transport failed'),
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
        nowMs: () => fixedNowMs,
      }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Failed to reconcile open checkout sessions',
    });

    expect(logger.errorCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Failed to expire superseded checkout session',
        }),
      ]),
    );
  });

  it('uses the listed canonical session when the created session expires before reconciliation', async () => {
    const logger = new FakeLogger();
    const createdSession = {
      id: 'checkout-created',
      url: 'https://stripe/checkout/created',
      status: 'open' as const,
      created: 1,
      expires_at: fixedNowUnix + 1,
    };
    const canonicalSession = {
      id: 'checkout-canonical',
      url: 'https://stripe/checkout/canonical',
      status: 'open' as const,
      created: 2,
      expires_at: fixedNowUnix + 3600,
    };
    const { stripe, sessionsExpire } = createReconciliationStripeMock({
      createdSession,
      listedAfterCreate: [canonicalSession],
    });
    const nowMs = vi
      .fn<() => number>()
      .mockReturnValueOnce(fixedNowMs)
      .mockReturnValueOnce(fixedNowMs + 2_000);

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
        nowMs,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/canonical' });

    expect(sessionsExpire).not.toHaveBeenCalled();
  });
});
