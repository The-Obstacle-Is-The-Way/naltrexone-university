import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import {
  STRIPE_CALLER_BUDGET_MS,
  StripeCallBudget,
} from '@/src/adapters/gateways/stripe/stripe-call-budget';
import { StripeBudgetHttpClient } from './stripe-budget-http-client';

const ATTEMPT_TIMEOUT_MS = 10_000;
const HTTP_SERVICE_UNAVAILABLE = 503;

describe('StripeBudgetHttpClient caller deadline', () => {
  it('refuses an attempt once the deadline has passed, without a request', async () => {
    let clock = 0;
    const budget = new StripeCallBudget(STRIPE_CALLER_BUDGET_MS, () => clock);
    let requests = 0;
    const stripe = new Stripe('sk_test_loopback_only', {
      httpClient: new StripeBudgetHttpClient(
        Stripe.createFetchHttpClient(async () => {
          requests += 1;
          return new Response('{}', { status: 200 });
        }),
        budget,
        ATTEMPT_TIMEOUT_MS,
      ),
      maxNetworkRetries: 0,
    });
    const cutByDeadline = budget.startCall();
    clock = STRIPE_CALLER_BUDGET_MS;

    await expect(
      stripe.customers.retrieve('cus_loopback'),
    ).rejects.toMatchObject({ type: 'StripeConnectionError' });

    expect(requests).toBe(0);
    expect(cutByDeadline()).toBe(true);
  });

  it('gives up when the deadline passes before the retry backoff', async () => {
    let clock = 0;
    const budget = new StripeCallBudget(STRIPE_CALLER_BUDGET_MS, () => clock);
    let requests = 0;
    const stripe = new Stripe('sk_test_loopback_only', {
      httpClient: new StripeBudgetHttpClient(
        Stripe.createFetchHttpClient(async () => {
          requests += 1;
          // The retry decision has been made; the deadline passes while the
          // 503's body is released, before the backoff starts.
          const body = new ReadableStream({
            cancel: () => {
              clock = STRIPE_CALLER_BUDGET_MS;
            },
          });
          return new Response(body, { status: HTTP_SERVICE_UNAVAILABLE });
        }),
        budget,
        ATTEMPT_TIMEOUT_MS,
      ),
      maxNetworkRetries: 0,
    });
    const cutByDeadline = budget.startCall();

    await expect(
      stripe.customers.retrieve('cus_loopback'),
    ).rejects.toMatchObject({ type: 'StripeConnectionError' });

    expect(requests).toBe(1);
    expect(cutByDeadline()).toBe(true);
  });
});

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
