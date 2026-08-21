import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  finalizeProviderContract,
  findTriggeredSession,
  getPersistedSubscriptionPlan,
} from './checkout-success-provider-resources';

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
  it('bounds the provider lookup to Sessions created after the trigger started', async () => {
    let listParams: Stripe.Checkout.SessionListParams | undefined;
    const session = {
      id: 'cs_test_completed',
      client_reference_id: 'debt471-marker',
      status: 'complete',
    } as Stripe.Checkout.Session;
    const stripe = {
      checkout: {
        sessions: {
          list: async (params: Stripe.Checkout.SessionListParams) => {
            listParams = params;
            return { data: [session] };
          },
          retrieve: async () => session,
        },
      },
    } as unknown as Stripe;

    await expect(
      findTriggeredSession(stripe, 'debt471-marker', 1_787_177_600),
    ).resolves.toBe(session);
    expect(listParams).toMatchObject({
      created: { gte: 1_787_177_600 },
      limit: 100,
    });
  });
});
