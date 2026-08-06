import { describe, expect, it, vi } from 'vitest';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';

function createStripeMock(overrides: {
  retrievedSessionPriceId?: string | null;
  shouldThrowOnFirstRetrieve?: boolean;
}) {
  let retrieveCallIndex = 0;
  const sessionsRetrieve = vi.fn(async (sessionId: string) => {
    const shouldThrow =
      overrides.shouldThrowOnFirstRetrieve && retrieveCallIndex === 0;
    retrieveCallIndex += 1;

    if (shouldThrow) {
      throw new Error('retrieve failed');
    }

    return {
      id: sessionId,
      url:
        sessionId === 'cs_new'
          ? undefined
          : 'https://stripe/checkout/retrieved',
      status: 'open',
      expires_at: 1_700_000_003_600,
      line_items:
        overrides.retrievedSessionPriceId === null
          ? { data: [] }
          : {
              data: [
                {
                  price: {
                    id: overrides.retrievedSessionPriceId ?? 'price_m',
                  },
                },
              ],
            },
    };
  });
  const sessionsExpire = vi.fn(async () => ({ id: 'cs_open', url: null }));
  const sessionsCreate = vi.fn(async () => ({
    id: 'cs_new',
    url: 'https://stripe/checkout/new-trial',
    status: 'open',
    expires_at: 1_700_000_003_600,
  }));

  const stripe = {
    customers: { create: vi.fn(async () => ({ id: 'cus_1' })) },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({
          data: [{ id: 'cs_open', url: 'https://stripe/checkout/open' }],
        })),
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
    sessionsCreate,
    sessionsExpire,
    sessionsRetrieve,
  };
}

describe('createStripeCheckoutSession trial replacement idempotency', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: 'cus_123',
    plan: 'monthly' as const,
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
    trialPeriodDays: 7,
  };
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;

  it('uses a trial recovery key when expiring a mismatched trial checkout session', async () => {
    const { stripe, sessionsExpire, sessionsCreate } = createStripeMock({
      retrievedSessionPriceId: 'price_a',
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new-trial' });

    expect(sessionsExpire).toHaveBeenCalledWith('cs_open', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_open',
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        consent_collection: { terms_of_service: 'required' },
      }),
      expect.objectContaining({
        idempotencyKey: `checkout_session_recovery:${appUserId}:monthly:cs_open:trial:7`,
      }),
    );
  });

  it('uses a trial recovery key when the existing checkout session price cannot be inspected', async () => {
    const { stripe, sessionsCreate } = createStripeMock({
      retrievedSessionPriceId: null,
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new-trial' });

    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: `checkout_session_recovery:${appUserId}:monthly:cs_open:trial:7`,
      }),
    );
  });

  it('uses a trial recovery key when existing trial session inspection fails', async () => {
    const { stripe, sessionsCreate, sessionsRetrieve, sessionsExpire } =
      createStripeMock({
        shouldThrowOnFirstRetrieve: true,
      });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new-trial' });

    expect(sessionsRetrieve).toHaveBeenCalledTimes(2);
    expect(sessionsExpire).toHaveBeenCalledWith('cs_open', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_open',
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: `checkout_session_recovery:${appUserId}:monthly:cs_open:trial:7`,
      }),
    );
  });
});
