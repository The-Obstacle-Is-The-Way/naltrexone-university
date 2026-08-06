import { describe, expect, it, vi } from 'vitest';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';

function createStripeMock(input: {
  retrieveResult: 'throws' | 'mismatched-id';
}) {
  const sessionsCreate = vi.fn(async () => ({
    id: 'cs_new',
    url: 'https://stripe/checkout/new',
    status: 'open',
    expires_at: 1_700_000_003_600,
  }));
  const sessionsRetrieve = vi.fn(async () => {
    if (input.retrieveResult === 'throws') {
      throw new Error('retrieve failed');
    }

    return {
      id: 'cs_other',
      url: 'https://stripe/checkout/other',
      status: 'open',
      expires_at: 1_700_000_003_600,
    };
  });

  const stripe = {
    customers: { create: vi.fn(async () => ({ id: 'customer-id-1' })) },
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
    sessionsRetrieve,
  };
}

describe('createStripeCheckoutSession live retrieval fallback', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: 'customer-existing-123',
    ...createTestRenewalTerms('monthly'),
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const priceIds = {
    monthly: 'monthly-price-id',
    annual: 'annual-price-id',
  } as const;

  it('falls back to the created checkout session when live retrieval fails', async () => {
    const logger = new FakeLogger();
    const { stripe, sessionsRetrieve } = createStripeMock({
      retrieveResult: 'throws',
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_new');
    expect(logger.warnCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Falling back to created checkout session snapshot after live retrieval failed',
        }),
      ]),
    );
  });

  it('falls back to the created checkout session when live retrieval returns a different session id', async () => {
    const logger = new FakeLogger();
    const { stripe, sessionsRetrieve } = createStripeMock({
      retrieveResult: 'mismatched-id',
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_new');
    expect(logger.warnCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Ignoring checkout session retrieval result with mismatched id',
        }),
      ]),
    );
  });
});
