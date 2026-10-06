import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/lib/routes';
import {
  FakeAuthGateway,
  FakeLogger,
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
function depsRecordingCalls(retrieveSession: () => Promise<never>) {
  const calls = { clerk: 0, stripe: 0 };
  const logger = new FakeLogger();
  const deps: CheckoutSuccessDeps = {
    authGateway: new FakeAuthGateway({
      id: crypto.randomUUID(),
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    }),
    subscriptionVersions: { findObservationVersionByUserId: async () => null },
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
