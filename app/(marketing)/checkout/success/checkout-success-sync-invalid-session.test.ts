import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/lib/routes';
import type { RateLimitResult } from '@/src/application/ports/gateways';
import {
  FakeAuthGateway,
  FakeLogger,
  FakeRateLimiter,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { syncCheckoutSuccess } from './checkout-success-sync';
import type { CheckoutSuccessDeps } from './checkout-success-types';

const CHECKOUT_ERROR_ROUTE = `${ROUTES.PRICING}?checkout=error`;

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}

const redirectFn = (url: string): never => {
  throw new RedirectError(url);
};

// What a session ID that is not Stripe's costs: nothing past the shape check,
// or one Stripe call that answers "no such session".
function depsRecordingCalls(
  retrieveSession: () => Promise<never>,
  rateLimiter = new FakeRateLimiter(),
) {
  const calls = { clerk: 0, stripe: 0 };
  const logger = new FakeLogger();
  const deps: CheckoutSuccessDeps = {
    authGateway: new FakeAuthGateway({
      id: crypto.randomUUID(),
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    }),
    subscriptionVersions: new FakeSubscriptionRepository(),
    getClerkAuth: async () => {
      calls.clerk += 1;
      return {
        userId: 'clerk_user_1',
        redirectToSignIn: () => {
          throw new Error('should not redirect to sign-in');
        },
      };
    },
    logger,
    rateLimiter,
    stripe: {
      checkout: {
        sessions: {
          retrieve: () => {
            calls.stripe += 1;
            return retrieveSession();
          },
        },
      },
      subscriptions: {
        retrieve: async () => {
          throw new Error('should not fetch a subscription');
        },
      },
    },
    priceIds: { monthly: 'price_monthly', annual: 'price_annual' },
    appUrl: 'https://example.com',
    transaction: async () => {
      throw new Error('should not start a transaction');
    },
  };
  return { deps, calls, logger };
}

// BUG-325: anyone can put any text in session_id. Text that is not a Stripe
// Checkout session ID, or one Stripe does not have, is a failed visit to
// redirect quietly, not an error to report, and the caller's text is never
// logged.
describe('syncCheckoutSuccess with a session ID that is not a real one', () => {
  it.each([
    ['oversized text', 'x'.repeat(5000)],
    ['the wrong prefix', 'sub_123'],
    ['characters a Stripe ID never has', 'cs_test_<script>'],
  ])('refuses %s before calling Clerk or Stripe', async (_case, sessionId) => {
    const { deps, calls, logger } = depsRecordingCalls(async () => {
      throw new Error('should not fetch a session');
    });

    await expect(
      syncCheckoutSuccess({ sessionId }, deps, redirectFn),
    ).rejects.toMatchObject({ url: CHECKOUT_ERROR_ROUTE });

    expect(calls).toEqual({ clerk: 0, stripe: 0 });
    expect(logger.errorCalls).toEqual([]);
    expect(logger.infoCalls).toEqual([
      {
        msg: 'Checkout success redirected to checkout error',
        context: {
          reason: 'invalid_session_id',
          route: ROUTES.CHECKOUT_SUCCESS,
          sessionIdLength: sessionId.length,
        },
      },
    ]);
  });

  it('treats a session Stripe does not have as the same quiet failure', async () => {
    const { deps, calls, logger } = depsRecordingCalls(async () => {
      throw Object.assign(new Error('No such checkout.session'), {
        type: 'StripeInvalidRequestError',
        code: 'resource_missing',
        statusCode: 404,
      });
    });

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test_unknown' }, deps, redirectFn),
    ).rejects.toMatchObject({ url: CHECKOUT_ERROR_ROUTE });

    expect(calls.stripe).toBe(1);
    expect(logger.errorCalls).toEqual([]);
    expect(logger.infoCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({ reason: 'invalid_session_id' }),
      }),
    ]);
  });

  // Stripe answers resource_missing for a session that exists under the other
  // mode's key too. That is a setup error that would fail every buyer, so it
  // stays an error, with fixed text.
  it('reports a session that exists only in the other Stripe mode as an error', async () => {
    const { deps, logger } = depsRecordingCalls(async () => {
      throw Object.assign(
        new Error(
          "No such checkout.session: 'cs_live_x'; a similar object exists in live mode, but a test mode key was used to make this request.",
        ),
        { type: 'StripeInvalidRequestError', code: 'resource_missing' },
      );
    });

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_live_x' }, deps, redirectFn),
    ).rejects.toMatchObject({ url: CHECKOUT_ERROR_ROUTE });

    expect(logger.errorCalls).toEqual([
      {
        msg: 'Checkout success session exists only in the other Stripe mode',
        context: { route: ROUTES.CHECKOUT_SUCCESS },
      },
    ]);
  });

  it('still reports any other Stripe failure', async () => {
    const failure = new Error('Stripe is down');
    const { deps } = depsRecordingCalls(async () => {
      throw failure;
    });

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test_real' }, deps, redirectFn),
    ).rejects.toBe(failure);
  });
});

// BUG-325: a session ID of the right shape still costs a Clerk lookup and a
// Stripe call, so each signed-in user is limited before either.
describe('syncCheckoutSuccess under its per-user limit', () => {
  const overLimit: RateLimitResult = {
    success: false,
    limit: 10,
    remaining: 0,
    retryAfterSeconds: 60,
  };

  it('redirects quietly, before the user lookup and Stripe, once over the limit', async () => {
    const rateLimiter = new FakeRateLimiter([overLimit]);
    const { deps, calls, logger } = depsRecordingCalls(async () => {
      throw new Error('should not fetch a session');
    }, rateLimiter);

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test_real' }, deps, redirectFn),
    ).rejects.toMatchObject({ url: CHECKOUT_ERROR_ROUTE });

    expect(rateLimiter.inputs).toEqual([
      { key: 'checkout-success:clerk_user_1', limit: 10, windowMs: 60_000 },
    ]);
    expect(calls.stripe).toBe(0);
    expect(logger.errorCalls).toEqual([]);
    expect(logger.infoCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({ reason: 'rate_limited' }),
      }),
    ]);
  });

  // A buyer's confirmation matters more than the limit, so a limiter that
  // fails lets the visit through.
  it('lets the visit through when the limiter fails', async () => {
    const failure = new Error('Stripe is down');
    const { deps, calls } = depsRecordingCalls(
      async () => {
        throw failure;
      },
      new FakeRateLimiter(new Error('database unavailable')),
    );

    await expect(
      syncCheckoutSuccess({ sessionId: 'cs_test_real' }, deps, redirectFn),
    ).rejects.toBe(failure);
    expect(calls.stripe).toBe(1);
  });
});
