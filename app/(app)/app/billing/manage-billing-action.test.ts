import { describe, expect, it, vi } from 'vitest';
import { runManageBillingAction } from '@/app/(app)/app/billing/manage-billing-action';
import { ROUTES } from '@/lib/routes';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { FakeLogger } from '@/src/application/test-helpers/fakes';

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

describe('app/(app)/app/billing/manage-billing-action', () => {
  it('redirects to the Stripe portal when portal session creation succeeds', async () => {
    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(async () =>
          ok({ url: 'https://stripe.test/portal' }),
        ),
        redirectFn,
      });

    await expect(action()).rejects.toMatchObject({
      url: 'https://stripe.test/portal',
    });
  });

  it('redirects back to billing with portal_failed when portal session creation fails', async () => {
    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(async () => err('INTERNAL_ERROR', 'Boom')),
        redirectFn,
      });

    await expect(action()).rejects.toMatchObject({
      url: `${ROUTES.APP_BILLING}?error=portal_failed`,
    });
  });

  it('redirects to sign-up when portal session creation returns unauthenticated', async () => {
    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(async () =>
          err('UNAUTHENTICATED', 'Not signed in'),
        ),
        redirectFn,
      });

    await expect(action()).rejects.toMatchObject({
      url: ROUTES.SIGN_UP,
    });
  });

  it('logs and redirects to billing failure when portal session creation throws', async () => {
    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };
    const logger = new FakeLogger();

    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(async () => {
          throw new Error('network');
        }),
        redirectFn,
        logger,
      });

    await expect(action()).rejects.toMatchObject({
      url: `${ROUTES.APP_BILLING}?error=portal_failed`,
    });
    expect(logger.errorCalls).toHaveLength(1);
  });
});
