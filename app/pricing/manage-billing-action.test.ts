import { describe, expect, it, vi } from 'vitest';
import { runManageBillingAction } from '@/app/pricing/manage-billing-action';
import { toPricingRoute, toSignUpRedirectRoute } from '@/lib/routes';
import { FakeLogger } from '@/src/application/test-helpers/fakes';

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}

describe('runManageBillingAction', () => {
  it('returns redirect to portal url when portal session creation succeeds', async () => {
    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(
          async () =>
            ({
              ok: true,
              data: { url: 'https://stripe.test/portal' },
            }) as const,
        ),
        redirectFn,
      });

    await expect(action()).rejects.toMatchObject({
      url: 'https://stripe.test/portal',
    });
  });

  it('returns redirect to sign-up with the manage-billing return destination when portal session creation is unauthenticated', async () => {
    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(
          async () =>
            ({
              ok: false,
              error: { code: 'UNAUTHENTICATED', message: 'No session' },
            }) as const,
        ),
        redirectFn,
      });

    await expect(action()).rejects.toMatchObject({
      url: toSignUpRedirectRoute(toPricingRoute({ reason: 'manage_billing' })),
    });
  });

  it('returns redirect to /pricing?portal=error when portal session creation fails', async () => {
    const redirectFn = (url: string): never => {
      throw new RedirectError(url);
    };

    const action = async () =>
      runManageBillingAction({
        createPortalSessionFn: vi.fn(
          async () =>
            ({
              ok: false,
              error: { code: 'INTERNAL_ERROR', message: 'Boom' },
            }) as const,
        ),
        redirectFn,
      });

    await expect(action()).rejects.toMatchObject({
      url: '/pricing?portal=error',
    });
  });

  it('does not include internal error params in development redirects', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const redirectFn = (url: string): never => {
        throw new RedirectError(url);
      };

      const action = async () =>
        runManageBillingAction({
          createPortalSessionFn: vi.fn(
            async () =>
              ({
                ok: false,
                error: { code: 'INTERNAL_ERROR', message: 'Boom' },
              }) as const,
          ),
          redirectFn,
        });

      await expect(action()).rejects.toMatchObject({
        url: '/pricing?portal=error',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('logs and redirects to pricing failure when portal session creation throws', async () => {
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
      url: '/pricing?portal=error',
    });
    expect(logger.errorCalls).toHaveLength(1);
  });
});
