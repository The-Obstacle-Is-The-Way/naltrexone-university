import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { StripeCallBudget } from '@/src/adapters/gateways/stripe/stripe-call-budget';
import { StripeBudgetHttpClient } from './stripe-budget-http-client';

describe('StripeBudgetHttpClient closed-connection translation', () => {
  it.each(['ECONNRESET', 'EPIPE'])(
    'preserves %s as the cause without triggering the SDK exceptional retry',
    async (code) => {
      vi.useFakeTimers();
      try {
        const cause = Object.assign(new Error('Transport closed'), { code });
        let requests = 0;
        const delegate: ReturnType<typeof Stripe.createFetchHttpClient> = {
          getClientName: () => 'injected-transport-error',
          makeRequest: async () => {
            requests += 1;
            throw cause;
          },
        };
        const stripe = new Stripe('sk_test_loopback_only', {
          httpClient: new StripeBudgetHttpClient(
            delegate,
            new StripeCallBudget(),
            10_000,
          ),
          maxNetworkRetries: 0,
        });
        const result = stripe.customers
          .retrieve('cus_loopback')
          .catch((error: unknown) => error);
        await vi.runAllTimersAsync();
        expect(await result).toMatchObject({
          type: 'StripeConnectionError',
          raw: { detail: { cause } },
        });
        expect(requests).toBe(2);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
