import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  getManageBillingErrorRedirect,
  runManageBillingAction,
} from './manage-billing-core';

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

describe('manage-billing-core', () => {
  const redirectFn = (url: string): never => {
    throw new RedirectError(url);
  };

  it('redirects to Stripe portal URL on success', async () => {
    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(async () =>
          ok({ url: 'https://stripe.test/portal' }),
        ),
        redirectFn,
        redirects: {
          failure: '/pricing?checkout=error',
          unauthenticated: '/sign-up',
        },
      });

    await expect(action()).rejects.toMatchObject({
      url: 'https://stripe.test/portal',
    });
  });

  it('redirects to configured unauthenticated route when portal session creation returns UNAUTHENTICATED', async () => {
    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(async () =>
          err('UNAUTHENTICATED', 'Not signed in'),
        ),
        redirectFn,
        redirects: {
          failure: '/app/billing?error=portal_failed',
          unauthenticated: '/app/login?reason=auth',
        },
      });

    await expect(action()).rejects.toMatchObject({
      url: '/app/login?reason=auth',
    });
  });

  it('maps UNAUTHENTICATED to route-specific unauthenticated redirect when configured', () => {
    const redirect = getManageBillingErrorRedirect('UNAUTHENTICATED', {
      failure: '/pricing?checkout=error',
      unauthenticated: '/sign-up',
    });

    expect(redirect).toBe('/sign-up');
  });

  it('falls back to failure redirect for non-unauthenticated errors', () => {
    const redirect = getManageBillingErrorRedirect('INTERNAL_ERROR', {
      failure: '/pricing?checkout=error',
      unauthenticated: '/sign-up',
    });

    expect(redirect).toBe('/pricing?checkout=error');
  });

  it('falls back to failure redirect when unauthenticated redirect is not configured', () => {
    const redirect = getManageBillingErrorRedirect('UNAUTHENTICATED', {
      failure: '/app/billing?error=portal_failed',
    });

    expect(redirect).toBe('/app/billing?error=portal_failed');
  });

  it('redirects to configured failure route when portal session creation fails', async () => {
    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(async () =>
          err('INTERNAL_ERROR', 'Portal unavailable'),
        ),
        redirectFn,
        redirects: {
          failure: '/app/billing?error=portal_failed',
        },
      });

    await expect(action()).rejects.toMatchObject({
      url: '/app/billing?error=portal_failed',
    });
  });

  it('redirects to configured failure route when portal session creation throws', async () => {
    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(async () => {
          throw new Error('network');
        }),
        redirectFn,
        redirects: {
          failure: '/app/billing?error=portal_failed',
        },
      });

    await expect(action()).rejects.toMatchObject({
      url: '/app/billing?error=portal_failed',
    });
  });

  it('logs error context when portal session creation throws and logger is provided', async () => {
    const logger = new FakeLogger();

    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(async () => {
          throw new Error('network');
        }),
        redirectFn,
        redirects: {
          failure: '/app/billing?error=portal_failed',
        },
        logger,
      });

    await expect(action()).rejects.toMatchObject({
      url: '/app/billing?error=portal_failed',
    });
    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toMatchObject({
      context: { error: 'network' },
      msg: 'Billing portal session creation threw',
    });
  });

  it('still redirects to failure route when logger throws while handling portal session exception', async () => {
    const logger = {
      error: () => {
        throw new Error('logger failed');
      },
    };

    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(async () => {
          throw new Error('network');
        }),
        redirectFn,
        redirects: {
          failure: '/app/billing?error=portal_failed',
        },
        logger,
      });

    await expect(action()).rejects.toMatchObject({
      url: '/app/billing?error=portal_failed',
    });
  });
});
