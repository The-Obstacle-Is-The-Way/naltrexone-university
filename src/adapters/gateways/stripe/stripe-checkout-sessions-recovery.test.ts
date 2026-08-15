import { describe, expect, it, vi } from 'vitest';
import type {
  CheckoutSessionCreateParams,
  StripeCheckoutSession,
  StripeClient,
  StripeRequestOptions,
} from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import {
  createStripeCheckoutSession,
  SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT,
} from './stripe-checkout-sessions';

type SessionResponse = StripeCheckoutSession & {
  expires_at: number;
};

type SessionCreateResult = SessionResponse | Error;

function createReplayStripeMock(input: {
  createdSessions: SessionCreateResult[];
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
      if (session instanceof Error) throw session;
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

function createCompletedReplaySnapshots(count: number): {
  createdSessions: SessionResponse[];
  retrievedSessions: SessionResponse[];
} {
  const createdSessions = Array.from({ length: count }, (_, index) => ({
    id: `cs_completed_replay_${index}`,
    url: `https://stripe/checkout/completed-${index}`,
    status: 'open' as const,
    expires_at: 1_700_000_000 + 3600,
  }));

  return {
    createdSessions,
    retrievedSessions: createdSessions.map((session) => ({
      ...session,
      status: 'complete' as const,
    })),
  };
}

describe('createStripeCheckoutSession recovery', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: 'cus_123',
    ...createTestRenewalTerms('monthly'),
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;
  const fixedNowMs = 1_700_000_000_000;
  const fixedNowUnix = fixedNowMs / 1000;

  it('recovers with a deterministic request key when Stripe rejects stale primary key parameters', async () => {
    const stalePrimaryKeyError = Object.assign(
      new Error(
        'Keys for idempotent requests can only be used with the same parameters they were first used with.',
      ),
      {
        type: 'StripeIdempotencyError',
        rawType: 'idempotency_error',
        statusCode: 400,
      },
    );
    const freshSession = {
      id: 'cs_fresh',
      url: 'https://stripe/checkout/fresh',
      status: 'open' as const,
      expires_at: fixedNowUnix + 3600,
    };
    const { stripe, sessionsCreate } = createReplayStripeMock({
      createdSessions: [stalePrimaryKeyError, freshSession],
      retrievedSessions: [freshSession],
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input: { ...input, trialPeriodDays: 7 },
        priceIds,
        logger: new FakeLogger(),
        nowMs: () => fixedNowMs,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/fresh' });

    const createOptions = sessionsCreate.mock.calls.map(([, options]) => ({
      idempotencyKey: options?.idempotencyKey,
    }));
    expect(
      sessionsCreate.mock.calls.map(([params]) => params.consent_collection),
    ).toEqual([
      { terms_of_service: 'required' },
      { terms_of_service: 'required' },
    ]);
    expect(
      sessionsCreate.mock.calls.map(([params]) => params.metadata),
    ).toEqual([
      expect.objectContaining({
        renewal_disclosure_version: '2026-08-05',
        renewal_terms_hash: 'test-terms-hash',
      }),
      expect.objectContaining({
        renewal_disclosure_version: '2026-08-05',
        renewal_terms_hash: 'test-terms-hash',
      }),
    ]);
    expect(createOptions[0]).toEqual({
      idempotencyKey: `checkout_session:${appUserId}:monthly:trial:7`,
    });
    expect(createOptions[1]?.idempotencyKey).toMatch(
      new RegExp(
        `^checkout_session_recovery:${appUserId}:monthly:request:[a-f0-9]{16}:trial:7$`,
      ),
    );
    expect(createOptions[1]).not.toEqual(createOptions[0]);
  });

  it('does not retry non-idempotency checkout create errors with a new key', async () => {
    const createError = new Error('Stripe checkout configuration failed');
    const { stripe, sessionsCreate } = createReplayStripeMock({
      createdSessions: [createError],
      retrievedSessions: [],
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger: new FakeLogger(),
        nowMs: () => fixedNowMs,
      }),
    ).rejects.toThrow('Stripe checkout configuration failed');

    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });

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

  it('walks six retained completed replays before returning a fresh open Session', async () => {
    const completedReplays = createCompletedReplaySnapshots(6);
    const freshSession = {
      id: 'cs_fresh_after_six',
      url: 'https://stripe/checkout/fresh-after-six',
      status: 'open' as const,
      expires_at: fixedNowUnix + 3600,
    };
    const { stripe, sessionsCreate, sessionsRetrieve } = createReplayStripeMock(
      {
        createdSessions: [...completedReplays.createdSessions, freshSession],
        retrievedSessions: [
          ...completedReplays.retrievedSessions,
          freshSession,
        ],
      },
    );
    const logger = new FakeLogger();

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
        nowMs: () => fixedNowMs,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/fresh-after-six' });

    expect(sessionsCreate).toHaveBeenCalledTimes(7);
    expect(sessionsRetrieve).toHaveBeenCalledTimes(7);
    expect(
      logger.warnCalls.map(({ context }) => context.recoveryAttempt),
    ).toEqual([1, 2, 3, 4]);
    expect(
      logger.errorCalls.map(({ context }) => context.recoveryAttempt),
    ).toEqual([5, 6]);
  });

  it('succeeds when the primary plus L - 1 recoveries are terminal and recovery create L is open', async () => {
    const completedReplays = createCompletedReplaySnapshots(
      SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT,
    );
    const freshSession = {
      id: 'cs_fresh_at_limit',
      url: 'https://stripe/checkout/fresh-at-limit',
      status: 'open' as const,
      expires_at: fixedNowUnix + 3600,
    };
    const { stripe, sessionsCreate } = createReplayStripeMock({
      createdSessions: [...completedReplays.createdSessions, freshSession],
      retrievedSessions: [...completedReplays.retrievedSessions, freshSession],
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger: new FakeLogger(),
        nowMs: () => fixedNowMs,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/fresh-at-limit' });

    expect(sessionsCreate).toHaveBeenCalledTimes(
      SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT + 1,
    );
  });

  it('throws after the primary plus L recoveries are terminal without issuing recovery create L + 1', async () => {
    const completedReplays = createCompletedReplaySnapshots(
      SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT + 1,
    );
    const { stripe, sessionsCreate } = createReplayStripeMock({
      createdSessions: completedReplays.createdSessions,
      retrievedSessions: completedReplays.retrievedSessions,
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
      SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT + 1,
    );
  });
});
