import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_RESOURCE_PATHS } from '@/lib/public-routes';
import { ROUTES } from '@/lib/routes';
import { proxyInvocation } from '@/tests/shared/next-proxy-invocation';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();
const CHECKOUT_SUCCESS_URL = `https://example.com${ROUTES.CHECKOUT_SUCCESS}`;
const CHECKOUT_SUCCESS_WITH_SESSION_ID_URL = `${CHECKOUT_SUCCESS_URL}?session_id=cs_test_xxx`;

type ClerkMiddlewareCallback = (
  auth: { protect: () => Promise<void> },
  request: unknown,
) => Promise<void> | void;

const matchesPathnameAgainstPattern = (
  pathname: string,
  pattern: string,
): boolean => {
  // Pattern values come from static route matchers under test (not user input).
  try {
    return new RegExp(`^${pattern}$`).test(pathname);
  } catch {
    return false;
  }
};

describe('proxy middleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('can be imported when NEXT_PUBLIC_SKIP_CLERK=true even if Clerk server import would fail', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs/server', () => {
      throw new Error('Publishable key not valid.');
    });

    await expect(import('./proxy')).resolves.toBeDefined();
  });

  it('keeps the default export function name as proxy (BUG-150 regression guard)', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs/server', () => {
      throw new Error('Publishable key not valid.');
    });

    const { default: proxy } = await import('./proxy');
    expect(proxy.name).toBe('proxy');
  });

  it.each(PUBLIC_RESOURCE_PATHS)(
    'passes the public resource %s through without starting Clerk',
    async (path) => {
      process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
      const clerkMiddleware = vi.fn();
      vi.doMock('@clerk/nextjs/server', () => ({
        clerkMiddleware,
        createRouteMatcher: vi.fn(),
      }));

      const { default: middleware } = await import('./proxy');
      const res = await middleware(
        ...proxyInvocation(`https://example.com${path}`),
      );

      expect(res?.headers.get('x-middleware-next')).toBe('1');
      expect(clerkMiddleware).not.toHaveBeenCalled();
    },
  );

  it('returns NextResponse.next() when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs/server', () => {
      throw new Error('Publishable key not valid.');
    });

    const { default: middleware } = await import('./proxy');

    const res = await middleware(...proxyInvocation());

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('ignores NEXT_PUBLIC_SKIP_CLERK=true in production and still protects routes', async () => {
    vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'true');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'development');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const protect = vi.fn(async () => undefined);
    const clerkMiddleware = vi.fn((cb: ClerkMiddlewareCallback) =>
      vi.fn(async (req: unknown) => {
        await cb({ protect }, req);
        return new Response('ok');
      }),
    );
    const createRouteMatcher = vi.fn(() => () => false);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    const res = await middleware(...proxyInvocation());

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    expect(clerkMiddleware).toHaveBeenCalledTimes(1);
    expect(protect).toHaveBeenCalledTimes(1);
    expect(await res.text()).toBe('ok');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'));
  });

  it('initializes and caches clerkMiddleware when NEXT_PUBLIC_SKIP_CLERK is not true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    const protect = vi.fn(async () => undefined);
    const clerkMiddleware = vi.fn((cb: ClerkMiddlewareCallback) =>
      vi.fn(async (req: unknown) => {
        await cb({ protect }, req);
        return new Response('ok');
      }),
    );
    const createRouteMatcher = vi.fn(() => () => false);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    const first = await middleware(...proxyInvocation());
    const second = await middleware(...proxyInvocation());

    if (!first || !second) {
      throw new Error('Expected middleware to return a response');
    }

    expect(clerkMiddleware).toHaveBeenCalledTimes(1);
    expect(createRouteMatcher).toHaveBeenCalledTimes(1);
    expect(protect).toHaveBeenCalledTimes(2);
    expect(await first.text()).toBe('ok');
    expect(await second.text()).toBe('ok');
  });

  it('does not call auth.protect for public routes', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    const protect = vi.fn(async () => undefined);
    const clerkMiddleware = vi.fn((cb: ClerkMiddlewareCallback) =>
      vi.fn(async (req: unknown) => {
        await cb({ protect }, req);
        return new Response('ok');
      }),
    );
    const createRouteMatcher = vi.fn(() => () => true);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    const res = await middleware(...proxyInvocation());

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    expect(protect).not.toHaveBeenCalled();
    expect(await res.text()).toBe('ok');
  });

  it('calls auth.protect for /checkout/success when the route is not public', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    const protect = vi.fn(async () => undefined);
    const clerkMiddleware = vi.fn((cb: ClerkMiddlewareCallback) =>
      vi.fn(async (req: unknown) => {
        await cb({ protect }, req);
        return new Response('ok');
      }),
    );
    const createRouteMatcher = vi.fn((patterns: string[]) => (req: unknown) => {
      const pathname = new URL((req as { url: string }).url).pathname;
      return patterns.some((pattern) =>
        matchesPathnameAgainstPattern(pathname, pattern),
      );
    });

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    const res = await middleware(...proxyInvocation(CHECKOUT_SUCCESS_URL));

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    expect(protect).toHaveBeenCalledTimes(1);
    expect(await res.text()).toBe('ok');
  });

  it('preserves full checkout success URL including session_id when auth.protect redirects to sign-in', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const checkoutSuccessUrl = CHECKOUT_SUCCESS_WITH_SESSION_ID_URL;

    const clerkMiddleware = vi.fn((cb: ClerkMiddlewareCallback) =>
      vi.fn(async (req: unknown) => {
        const protect = vi.fn(async () => {
          throw {
            type: 'redirect',
            returnBackUrl: (req as { url: string }).url,
          };
        });

        try {
          await cb({ protect }, req);
          return new Response('ok');
        } catch (error) {
          if (
            typeof error === 'object' &&
            error &&
            'type' in error &&
            error.type === 'redirect' &&
            'returnBackUrl' in error &&
            typeof error.returnBackUrl === 'string'
          ) {
            const returnBackUrl = error.returnBackUrl;
            const location = `/sign-in?redirect_url=${encodeURIComponent(returnBackUrl)}`;
            return new Response(null, {
              status: 307,
              headers: {
                location,
              },
            });
          }

          throw error;
        }
      }),
    );
    const createRouteMatcher = vi.fn((patterns: string[]) => (req: unknown) => {
      const pathname = new URL((req as { url: string }).url).pathname;
      return patterns.some((pattern) =>
        matchesPathnameAgainstPattern(pathname, pattern),
      );
    });

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    const res = await middleware(...proxyInvocation(checkoutSuccessUrl));

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();

    const redirectUrl = new URL(
      location ?? '',
      'https://example.com',
    ).searchParams.get('redirect_url');
    expect(redirectUrl).toBe(checkoutSuccessUrl);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'checkout_success_auth_bounce',
        route: ROUTES.CHECKOUT_SUCCESS,
        hasSessionId: true,
      }),
    );
  });

  it('preserves full checkout success URL including session_id when Clerk handshake redirects before callback execution', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const checkoutSuccessUrl = CHECKOUT_SUCCESS_WITH_SESSION_ID_URL;

    const clerkMiddleware = vi.fn((_cb: ClerkMiddlewareCallback) =>
      // Simulate authenticateRequest() returning a handshake redirect before invoking user callback.
      vi.fn(async (req: unknown) => {
        const redirectUrl = encodeURIComponent((req as { url: string }).url);
        return new Response(null, {
          status: 307,
          headers: {
            location: `https://clerk.accounts.dev/v1/client/handshake?__clerk_handshake=1&redirect_url=${redirectUrl}`,
          },
        });
      }),
    );
    const createRouteMatcher = vi.fn(() => () => false);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    const res = await middleware(...proxyInvocation(checkoutSuccessUrl));

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();

    const redirectUrl = new URL(
      location ?? '',
      'https://example.com',
    ).searchParams.get('redirect_url');
    expect(redirectUrl).toBe(checkoutSuccessUrl);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'checkout_success_auth_bounce',
        route: ROUTES.CHECKOUT_SUCCESS,
        hasSessionId: true,
      }),
    );
  });

  it('logs checkout success auth bounce when redirect_url is relative', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const checkoutSuccessUrl = CHECKOUT_SUCCESS_WITH_SESSION_ID_URL;

    const clerkMiddleware = vi.fn((_cb: ClerkMiddlewareCallback) =>
      vi.fn(async () => {
        const relativeCheckoutSuccessUrl = `${ROUTES.CHECKOUT_SUCCESS}?session_id=cs_test_xxx`;
        const location = `/sign-in?redirect_url=${encodeURIComponent(relativeCheckoutSuccessUrl)}`;
        return new Response(null, {
          status: 307,
          headers: {
            location,
          },
        });
      }),
    );
    const createRouteMatcher = vi.fn(() => () => false);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    const res = await middleware(...proxyInvocation(checkoutSuccessUrl));

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'checkout_success_auth_bounce',
        route: ROUTES.CHECKOUT_SUCCESS,
        hasSessionId: true,
      }),
    );
  });
});
