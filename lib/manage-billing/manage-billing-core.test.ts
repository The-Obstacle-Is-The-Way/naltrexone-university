import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/src/adapters/controllers/action-result';
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
  it('redirects to Stripe portal URL on success', async () => {
    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

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
    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

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
    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
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
      });

    await expect(action()).rejects.toMatchObject({
      url: '/app/billing?error=portal_failed',
    });
  });
});
