import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyOpenSessionRejection,
  cleanStripeProducts,
  finalizeProviderContract,
  findTriggeredSession,
  getPersistedSubscriptionPlan,
  redactStripeIdentifiers,
  redirectForProviderContract,
  type StripeCheckoutSessionLookup,
} from './checkout-success-provider-resources';

function captureRedirect(url: string): unknown {
  try {
    redirectForProviderContract(url);
  } catch (error) {
    return error;
  }
}

function autoPagingList<T>(firstPage: T[], allItems: T[]) {
  return Object.assign(Promise.resolve({ data: firstPage }), {
    autoPagingToArray: vi.fn().mockResolvedValue(allItems),
  });
}

describe('provider-contract lifecycle', () => {
  it('cleans resources and closes the connection after setup fails', async () => {
    const calls: string[] = [];

    await expect(
      finalizeProviderContract({
        primaryError: new Error('setup failed'),
        cleanup: async () => {
          calls.push('cleanup');
        },
        close: async () => {
          calls.push('close');
        },
      }),
    ).rejects.toThrow('[E2E_PROVIDER_CONTRACT:FAILED] Error: setup failed');
    expect(calls).toEqual(['cleanup', 'close']);
  });

  it('closes the connection when cleanup fails', async () => {
    const calls: string[] = [];
    const cleanupError = new Error('cleanup failed');

    await expect(
      finalizeProviderContract({
        cleanup: async () => {
          calls.push('cleanup');
          throw cleanupError;
        },
        close: async () => {
          calls.push('close');
        },
      }),
    ).rejects.toBe(cleanupError);
    expect(calls).toEqual(['cleanup', 'close']);
  });

  it('reports a close failure when the primary operation and cleanup succeed', async () => {
    await expect(
      finalizeProviderContract({
        cleanup: async () => undefined,
        close: async () => {
          throw new Error('close failed for sk_live_secret');
        },
      }),
    ).rejects.toThrow(
      '[E2E_PROVIDER_CONTRACT:CLOSE_FAILED] Error: close failed for sk_live_[REDACTED]',
    );
  });

  it('preserves the primary failure and reports redacted cleanup and close failures', async () => {
    const calls: string[] = [];

    await expect(
      finalizeProviderContract({
        primaryError: new Error('sync failed for cus_primary'),
        cleanup: async () => {
          calls.push('cleanup');
          throw new Error('cleanup failed for sub_secondary');
        },
        close: async () => {
          calls.push('close');
          throw new Error('close failed for rk_test_secondary');
        },
      }),
    ).rejects.toThrow(
      '[E2E_PROVIDER_CONTRACT:FAILED] Error: sync failed for cus_[REDACTED] | secondary: Error: cleanup failed for sub_[REDACTED] | Error: close failed for rk_test_[REDACTED]',
    );
    expect(calls).toEqual(['cleanup', 'close']);
  });
});

describe('redactStripeIdentifiers', () => {
  it('redacts provider ids and every Stripe secret or restricted key variant', () => {
    const redacted = redactStripeIdentifiers(
      'cus_customer sub_subscription sk_test_secret sk_live_secret rk_test_secret rk_live_secret',
    );

    expect(redacted).toBe(
      'cus_[REDACTED] sub_[REDACTED] sk_test_[REDACTED] sk_live_[REDACTED] rk_test_[REDACTED] rk_live_[REDACTED]',
    );
    expect(redacted).not.toMatch(/(?:customer|subscription|secret)/);
  });

  it('does not redact identifier-like substrings without a token boundary', () => {
    expect(redactStripeIdentifiers('login_example')).toBe('login_example');
  });
});

describe('getPersistedSubscriptionPlan', () => {
  it('derives the persisted plan from the stored price id', () => {
    const priceIds = {
      monthly: 'price_test_monthly',
      annual: 'price_test_annual',
    };

    expect(getPersistedSubscriptionPlan('price_test_annual', priceIds)).toBe(
      'annual',
    );
    expect(getPersistedSubscriptionPlan('price_unknown', priceIds)).toBeNull();
  });
});

describe('findTriggeredSession', () => {
  it('scans bounded pages and rejects open or wrong-marker Sessions', async () => {
    let listParams: Stripe.Checkout.SessionListParams | undefined;
    const openDecoy = {
      id: 'cs_test_open',
      client_reference_id: 'debt471-marker',
      status: 'open',
    } as Stripe.Checkout.Session;
    const markerDecoy = {
      id: 'cs_test_other',
      client_reference_id: 'other-marker',
      status: 'complete',
    } as Stripe.Checkout.Session;
    const session = {
      id: 'cs_test_completed',
      client_reference_id: 'debt471-marker',
      status: 'complete',
    } as Stripe.Checkout.Session;
    const stripe = {
      checkout: {
        sessions: {
          list: (params: Stripe.Checkout.SessionListParams) => {
            listParams = params;
            return autoPagingList(
              [openDecoy],
              [openDecoy, markerDecoy, session],
            );
          },
          retrieve: async () => session,
        },
      },
    } satisfies StripeCheckoutSessionLookup;

    await expect(
      findTriggeredSession(stripe, 'debt471-marker', 1_787_177_600),
    ).resolves.toBe(session);
    expect(listParams).toMatchObject({
      created: { gte: 1_787_177_600 },
      limit: 100,
    });
  });

  it('polls within a fixed deadline until Stripe exposes the completed Session', async () => {
    let now = 0;
    let calls = 0;
    const delays: number[] = [];
    const session = {
      id: 'cs_test_completed',
      client_reference_id: 'debt471-marker',
      status: 'complete',
    } as Stripe.Checkout.Session;
    const stripe = {
      checkout: {
        sessions: {
          list: () => {
            calls += 1;
            return autoPagingList([], calls === 1 ? [] : [session]);
          },
          retrieve: async () => session,
        },
      },
    } satisfies StripeCheckoutSessionLookup;

    await expect(
      findTriggeredSession(stripe, 'debt471-marker', 1_787_177_600, {
        timeoutMs: 2_000,
        intervalMs: 500,
        now: () => now,
        sleep: async (ms) => {
          delays.push(ms);
          now += ms;
        },
      }),
    ).resolves.toBe(session);
    expect(calls).toBe(2);
    expect(delays).toEqual([500]);
  });

  it('stops polling when the triggered Session lookup deadline expires', async () => {
    let now = 0;
    let calls = 0;
    const stripe = {
      checkout: {
        sessions: {
          list: () => {
            calls += 1;
            return autoPagingList([], []);
          },
          retrieve: async () => {
            throw new Error('retrieve should not run');
          },
        },
      },
    } satisfies StripeCheckoutSessionLookup;

    await expect(
      findTriggeredSession(stripe, 'debt471-marker', 1_787_177_600, {
        timeoutMs: 1_000,
        intervalMs: 500,
        now: () => now,
        sleep: async (ms) => {
          now += ms;
        },
      }),
    ).rejects.toThrow('Triggered Checkout Session was not found.');
    expect(calls).toBe(3);
  });
});

describe('cleanStripeProducts', () => {
  it('scans bounded product and price pages before deactivating marked resources', async () => {
    const markedProduct = {
      id: 'prod_marked',
      active: true,
      metadata: { e2e_marker: 'debt471-marker' },
    } as unknown as Stripe.Product;
    const markedPrice = {
      id: 'price_marked',
      active: true,
    } as Stripe.Price;
    const productList = autoPagingList([], [markedProduct]);
    const priceList = autoPagingList([], [markedPrice]);
    const stripe = {
      products: {
        list: vi.fn(() => productList),
        update: vi.fn().mockResolvedValue(markedProduct),
      },
      prices: {
        list: vi.fn(() => priceList),
        update: vi.fn().mockResolvedValue(markedPrice),
      },
    } as unknown as Stripe;

    await cleanStripeProducts(stripe, 'debt471-marker');

    expect(productList.autoPagingToArray).toHaveBeenCalledWith({ limit: 500 });
    expect(priceList.autoPagingToArray).toHaveBeenCalledWith({ limit: 500 });
    expect(stripe.prices.update).toHaveBeenCalledWith('price_marked', {
      active: false,
    });
    expect(stripe.products.update).toHaveBeenCalledWith('prod_marked', {
      active: false,
    });
  });
});

describe('classifyOpenSessionRejection', () => {
  it('accepts only the expected checkout-error redirect', () => {
    expect(
      classifyOpenSessionRejection(
        captureRedirect('http://localhost:3000/pricing?checkout=error'),
      ),
    ).toBe(true);
  });

  it('rethrows dependency failures without masking their cause', () => {
    const failure = new Error('Stripe retrieval failed');

    expect(() => classifyOpenSessionRejection(failure)).toThrow(failure);
  });

  it('rejects an unexpected redirect with its destination', () => {
    expect(() =>
      classifyOpenSessionRejection(captureRedirect('/sign-in')),
    ).toThrow('[E2E_PROVIDER_CONTRACT:UNEXPECTED_REDIRECT] /sign-in');
  });
});
