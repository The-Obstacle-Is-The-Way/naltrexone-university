import { describe, expect, it, vi } from 'vitest';
import type {
  CheckoutSessionCreateParams,
  StripeCheckoutSession,
  StripeClient,
  StripeRequestOptions,
} from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  CHECKOUT_SESSION_RECOVERY_ATTEMPT_LIMIT,
  createStripeCheckoutSession,
} from './stripe-checkout-sessions';

type SessionResponse = StripeCheckoutSession & {
  expires_at: number;
};

function createReplayStripeMock(input: {
  createdSessions: SessionResponse[];
  retrievedSessions: SessionResponse[];
}) {
  let createCallIndex = 0;
  let retrieveCallIndex = 0;
  const sessionsCreate = vi.fn(
    async (
      _params: CheckoutSessionCreateParams,
      _options?: StripeRequestOptions,
    ) => {
      const session = input.createdSessions[createCallIndex];
      createCallIndex += 1;
      if (!session) throw new Error('Unexpected checkout session create.');
      return session;
    },
  );
  const sessionsRetrieve = vi.fn(async () => {
    const session = input.retrievedSessions[retrieveCallIndex];
    retrieveCallIndex += 1;
    if (!session) throw new Error('Unexpected checkout session retrieve.');
    return session;
  });

  const stripe = {
    customers: { create: vi.fn(async () => ({ id: 'cus_1' })) },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({ data: [] })),
        retrieve: sessionsRetrieve,
        expire: vi.fn(async () => ({ id: 'cs_expired', url: null })),
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
    sessionsCreate,
    sessionsRetrieve,
  };
}

describe('createStripeCheckoutSession recovery', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: 'cus_123',
    plan: 'monthly' as const,
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;
  const fixedNowMs = 1_700_000_000_000;
  const fixedNowUnix = fixedNowMs / 1000;

  it('walks the recovery key chain when deterministic keys replay completed checkout sessions', async () => {
    const { stripe, sessionsCreate, sessionsRetrieve } = createReplayStripeMock(
      {
        createdSessions: [
          {
            id: 'cs_completed_replay',
            url: 'https://stripe/checkout/completed',
            status: 'open',
            expires_at: fixedNowUnix + 3600,
          },
          {
            id: 'cs_recovered_completed_replay',
            url: 'https://stripe/checkout/recovered-completed',
            status: 'open',
            expires_at: fixedNowUnix + 3600,
          },
          {
            id: 'cs_fresh',
            url: 'https://stripe/checkout/fresh',
            status: 'open',
            expires_at: fixedNowUnix + 3600,
          },
        ],
        retrievedSessions: [
          {
            id: 'cs_completed_replay',
            url: 'https://stripe/checkout/completed',
            status: 'complete',
            expires_at: fixedNowUnix + 3600,
          },
          {
            id: 'cs_recovered_completed_replay',
            url: 'https://stripe/checkout/recovered-completed',
            status: 'complete',
            expires_at: fixedNowUnix + 3600,
          },
          {
            id: 'cs_fresh',
            url: 'https://stripe/checkout/fresh',
            status: 'open',
            expires_at: fixedNowUnix + 3600,
          },
        ],
      },
    );

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        options: { idempotencyKey: 'client-tab-key-1' },
        priceIds,
        logger: new FakeLogger(),
        nowMs: () => fixedNowMs,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/fresh' });

    expect(sessionsRetrieve).toHaveBeenCalledTimes(3);
    expect(sessionsCreate.mock.calls.map(([, options]) => options)).toEqual([
      { idempotencyKey: `checkout_session:${appUserId}:monthly` },
      {
        idempotencyKey: `checkout_session_recovery:${appUserId}:monthly:cs_completed_replay`,
      },
      {
        idempotencyKey: `checkout_session_recovery:${appUserId}:monthly:cs_recovered_completed_replay`,
      },
    ]);
  });

  it('throws STRIPE_ERROR when the recovery chain keeps replaying inactive sessions', async () => {
    const inactiveSessionResponses = Array.from(
      { length: CHECKOUT_SESSION_RECOVERY_ATTEMPT_LIMIT + 1 },
      (_, index) => ({
        id: `cs_inactive_${index}`,
        url: `https://stripe/checkout/inactive-${index}`,
        status: 'expired' as const,
        expires_at: fixedNowUnix + 3600,
      }),
    );
    const { stripe, sessionsCreate } = createReplayStripeMock({
      createdSessions: inactiveSessionResponses,
      retrievedSessions: inactiveSessionResponses,
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger: new FakeLogger(),
        nowMs: () => fixedNowMs,
      }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe Checkout Session is expired or inactive',
    });

    expect(sessionsCreate).toHaveBeenCalledTimes(
      CHECKOUT_SESSION_RECOVERY_ATTEMPT_LIMIT + 1,
    );
  });
});
