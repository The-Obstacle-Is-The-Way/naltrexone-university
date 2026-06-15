import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CheckoutSessionCreateParams,
  StripeCheckoutSession,
  StripeClient,
  StripeRequestOptions,
} from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';

type RecordedCheckoutSession = StripeCheckoutSession & {
  created: number;
  line_items: { data: Array<{ price: { id: string } }> };
};

function createConcurrentStripeMock() {
  const sessions = new Map<string, RecordedCheckoutSession>();
  const sessionsByIdempotencyKey = new Map<string, RecordedCheckoutSession>();
  let createCount = 0;
  let preCreateListCount = 0;
  let releasePreCreateLists: (() => void) | null = null;
  const preCreateListsReleased = new Promise<void>((resolve) => {
    releasePreCreateLists = resolve;
  });

  function listOpenSessions(): RecordedCheckoutSession[] {
    return Array.from(sessions.values())
      .filter((session) => session.status === 'open')
      .sort((left, right) => {
        if (right.created !== left.created) return right.created - left.created;
        return right.id.localeCompare(left.id);
      });
  }

  const subscriptionsList = vi.fn(async () => ({ data: [] }));
  const sessionsList = vi.fn(async () => {
    preCreateListCount++;
    if (preCreateListCount <= 2) {
      const snapshot = listOpenSessions();
      if (preCreateListCount === 2) releasePreCreateLists?.();
      await preCreateListsReleased;
      return { data: snapshot };
    }

    return { data: listOpenSessions() };
  });
  const sessionsRetrieve = vi.fn(async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`Missing checkout session ${sessionId}`);
    return session;
  });
  const sessionsExpire = vi.fn(async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`Missing checkout session ${sessionId}`);

    const expired = { ...session, status: 'expired' as const, url: null };
    sessions.set(sessionId, expired);
    return expired;
  });
  const sessionsCreate = vi.fn(
    async (
      params: CheckoutSessionCreateParams,
      options?: StripeRequestOptions,
    ) => {
      const key = options?.idempotencyKey;
      if (key) {
        const replayed = sessionsByIdempotencyKey.get(key);
        if (replayed) return replayed;
      }

      createCount++;
      const session = {
        id: `cs_${createCount}`,
        url: `https://stripe/checkout/cs_${createCount}`,
        status: 'open' as const,
        created: createCount,
        line_items: {
          data: [
            {
              price: {
                id: params.line_items[0]?.price ?? 'price_unknown',
              },
            },
          ],
        },
      };
      sessions.set(session.id, session);
      if (key) sessionsByIdempotencyKey.set(key, session);
      return session;
    },
  );

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
    sessionsCreate,
    getOpenSessions: listOpenSessions,
    getExpiredSessions: () =>
      Array.from(sessions.values()).filter(
        (session) => session.status === 'expired',
      ),
  };
}

describe('createStripeCheckoutSession concurrency', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
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

  it('collapses concurrent same-plan creates into one Stripe session', async () => {
    const { stripe, sessionsCreate, getOpenSessions } =
      createConcurrentStripeMock();

    const [first, second] = await Promise.all([
      createStripeCheckoutSession({
        stripe,
        input: { ...input, trialPeriodDays: 7 },
        priceIds,
        logger,
      }),
      createStripeCheckoutSession({
        stripe,
        input: { ...input, trialPeriodDays: 7 },
        priceIds,
        logger,
      }),
    ]);

    expect(first).toEqual({ url: 'https://stripe/checkout/cs_1' });
    expect(second).toEqual(first);
    expect(getOpenSessions()).toHaveLength(1);
    expect(sessionsCreate.mock.calls.map(([, options]) => options)).toEqual([
      { idempotencyKey: `checkout_session:${appUserId}:monthly:trial:7` },
      { idempotencyKey: `checkout_session:${appUserId}:monthly:trial:7` },
    ]);
  });

  it('expires superseded concurrent different-plan creates so one completable session survives', async () => {
    const { stripe, sessionsCreate, getExpiredSessions, getOpenSessions } =
      createConcurrentStripeMock();

    await Promise.all([
      createStripeCheckoutSession({
        stripe,
        input: { ...input, plan: 'monthly', trialPeriodDays: 7 },
        priceIds,
        logger,
      }),
      createStripeCheckoutSession({
        stripe,
        input: { ...input, plan: 'annual', trialPeriodDays: 7 },
        priceIds,
        logger,
      }),
    ]);

    expect(getOpenSessions()).toEqual([
      expect.objectContaining({
        id: 'cs_2',
        line_items: { data: [{ price: { id: 'price_a' } }] },
        status: 'open',
      }),
    ]);
    expect(getExpiredSessions()).toEqual([
      expect.objectContaining({
        id: 'cs_1',
        line_items: { data: [{ price: { id: 'price_m' } }] },
        status: 'expired',
      }),
    ]);
    expect(sessionsCreate.mock.calls.map(([, options]) => options)).toEqual([
      { idempotencyKey: `checkout_session:${appUserId}:monthly:trial:7` },
      { idempotencyKey: `checkout_session:${appUserId}:annual:trial:7` },
    ]);
  });
});
