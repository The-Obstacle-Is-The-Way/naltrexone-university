import { describe, expect, it, vi } from 'vitest';
import { runManageBillingAction } from '@/app/pricing/manage-billing-action';

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}

describe('runManageBillingAction', () => {
  it('redirects to the portal url on success', async () => {
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

  it('redirects to /sign-up when unauthenticated', async () => {
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

  it('redirects to /pricing?checkout=error for other errors', async () => {
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

  it('includes error message details in development', async () => {
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
