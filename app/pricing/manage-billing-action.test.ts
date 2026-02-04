import { describe, expect, it, vi } from 'vitest';
import { runManageBillingAction } from '@/app/pricing/manage-billing-action';

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

  it('returns redirect to /sign-up when portal session creation is unauthenticated', async () => {
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
      url: '/sign-up',
    });
  });

  it('returns redirect to /pricing?checkout=error when portal session creation fails', async () => {
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
      url: '/pricing?checkout=error&error_code=INTERNAL_ERROR',
    });
  });

  it('returns redirect to /pricing?checkout=error with error_message when in development', async () => {
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
        url: '/pricing?checkout=error&error_code=INTERNAL_ERROR&error_message=Boom',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
