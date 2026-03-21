import type { NextFetchEvent, NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();
const CHECKOUT_SUCCESS_URL = `https://example.com${ROUTES.CHECKOUT_SUCCESS}`;
const CHECKOUT_SUCCESS_WITH_SESSION_ID_URL = `${CHECKOUT_SUCCESS_URL}?session_id=cs_test_xxx`;

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

  it('returns NextResponse.next() when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs/server', () => {
      throw new Error('Publishable key not valid.');
    });

    const { default: middleware } = await import('./proxy');

    const res = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

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

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

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

    const res = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

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

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

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

    const first = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );
    const second = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

    if (!first || !second) {
      throw new Error('Expected middleware to return a response');
    }

    expect(clerkMiddleware).toHaveBeenCalledTimes(1);
    expect(createRouteMatcher).toHaveBeenCalledTimes(1);
    expect(protect).toHaveBeenCalledTimes(2);
    expect(await first.text()).toBe('ok');
    expect(await second.text()).toBe('ok');
  });

  it('returns configured Clerk CSP directives when NEXT_PUBLIC_SKIP_CLERK is false', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

    const protect = vi.fn(async () => undefined);
    let capturedOptions: unknown;
    const clerkMiddleware = vi.fn(
      (cb: ClerkMiddlewareCallback, options?: unknown) => {
        capturedOptions = options;
        return vi.fn(async (req: unknown) => {
          await cb({ protect }, req);
          return new Response('ok');
        });
      },
    );
    const createRouteMatcher = vi.fn(() => () => false);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    // Act
    const res = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    // Assert
    expect(capturedOptions).toMatchObject({
      contentSecurityPolicy: {
        strict: true,
        reportOnly: true,
        directives: expect.objectContaining({
          'base-uri': expect.arrayContaining(['self']),
          'connect-src': expect.arrayContaining(['ws:', 'wss:']),
          'frame-ancestors': expect.arrayContaining(['none']),
          'object-src': expect.arrayContaining(['none']),
        }),
      },
    });
  });

  it('does not call auth.protect for public routes', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

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

    const res = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    expect(protect).not.toHaveBeenCalled();
    expect(await res.text()).toBe('ok');
  });

  it('calls auth.protect for /checkout/success when the route is not public', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

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

    const res = await middleware(
      {
        url: CHECKOUT_SUCCESS_URL,
      } as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    expect(protect).toHaveBeenCalledTimes(1);
    expect(await res.text()).toBe('ok');
  });

  it('preserves full checkout success URL including session_id when auth.protect redirects to sign-in', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

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

    const res = await middleware(
      {
        url: checkoutSuccessUrl,
      } as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

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

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

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

    const res = await middleware(
      {
        url: checkoutSuccessUrl,
      } as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

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

  describe('parseSentryIngestOrigin', () => {
    it('extracts the origin from a valid Sentry DSN', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(
        parseSentryIngestOrigin('https://abc123@o456.ingest.us.sentry.io/789'),
      ).toBe('https://o456.ingest.us.sentry.io');
    });

    it('returns null when DSN uses an opaque origin scheme', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(parseSentryIngestOrigin('mailto:test@example.com')).toBeNull();
    });

    it('returns null when DSN uses a non-http scheme', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(parseSentryIngestOrigin('ftp://example.com/123')).toBeNull();
    });

    it('returns null when DSN is undefined', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(parseSentryIngestOrigin(undefined)).toBeNull();
    });

    it('returns null when DSN is empty string', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(parseSentryIngestOrigin('')).toBeNull();
    });

    it('returns null when DSN is not a valid URL', async () => {
      const { parseSentryIngestOrigin } = await import('./proxy');
      expect(parseSentryIngestOrigin('not-a-url')).toBeNull();
    });
  });

  describe('parseSentrySecurityHeaderEndpoint', () => {
    it('builds the Sentry security header endpoint from a valid DSN', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint(
          'https://abc123@o456.ingest.us.sentry.io/789',
        ),
      ).toBe(
        'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123',
      );
    });

    it('preserves DSN path prefixes when building the security header endpoint', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint(
          'https://abc123@example.com/sentry/project/789',
        ),
      ).toBe(
        'https://example.com/sentry/project/api/789/security/?sentry_key=abc123',
      );
    });

    it('returns null when the DSN uses a non-http scheme', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint('ftp://abc123@example.com/789'),
      ).toBeNull();
    });

    it('returns null when the DSN is not a valid URL', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(parseSentrySecurityHeaderEndpoint('not-a-url')).toBeNull();
    });

    it('returns null when the DSN has no public key', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint('https://example.com/789'),
      ).toBeNull();
    });

    it('returns null when the DSN has no project id', async () => {
      const { parseSentrySecurityHeaderEndpoint } = await import('./proxy');

      expect(
        parseSentrySecurityHeaderEndpoint('https://abc123@example.com'),
      ).toBeNull();
    });
  });

  it('includes Sentry ingest origin in connect-src when NEXT_PUBLIC_SENTRY_DSN is set', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://abc123@o456.ingest.us.sentry.io/789';

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

    const protect = vi.fn(async () => undefined);
    let capturedOptions: unknown;
    const clerkMiddleware = vi.fn(
      (cb: ClerkMiddlewareCallback, options?: unknown) => {
        capturedOptions = options;
        return vi.fn(async (req: unknown) => {
          await cb({ protect }, req);
          return new Response('ok');
        });
      },
    );
    const createRouteMatcher = vi.fn(() => () => false);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

    expect(capturedOptions).toMatchObject({
      contentSecurityPolicy: {
        strict: true,
        reportOnly: true,
        reportTo:
          'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123',
        directives: expect.objectContaining({
          'connect-src': expect.arrayContaining([
            'ws:',
            'wss:',
            'https://o456.ingest.us.sentry.io',
          ]),
          'report-uri': [
            'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123',
          ],
        }),
      },
    });
  });

  it('excludes Sentry ingest origin from connect-src when NEXT_PUBLIC_SENTRY_DSN is not set', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

    const protect = vi.fn(async () => undefined);
    let capturedOptions: unknown;
    const clerkMiddleware = vi.fn(
      (cb: ClerkMiddlewareCallback, options?: unknown) => {
        capturedOptions = options;
        return vi.fn(async (req: unknown) => {
          await cb({ protect }, req);
          return new Response('ok');
        });
      },
    );
    const createRouteMatcher = vi.fn(() => () => false);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

    const directives = (
      capturedOptions as {
        contentSecurityPolicy: {
          directives: Record<string, string[]>;
          strict?: boolean;
          reportOnly: boolean;
          reportTo?: string;
        };
      }
    ).contentSecurityPolicy;

    expect(directives.strict).toBe(true);
    expect(directives.reportOnly).toBe(true);
    expect(directives.reportTo).toBeUndefined();
    expect(directives.directives['connect-src']).toEqual(['ws:', 'wss:']);
    expect(directives.directives['report-uri']).toBeUndefined();
  });

  it('excludes invalid-scheme Sentry DSNs from connect-src', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'mailto:test@example.com';

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

    const protect = vi.fn(async () => undefined);
    let capturedOptions: unknown;
    const clerkMiddleware = vi.fn(
      (cb: ClerkMiddlewareCallback, options?: unknown) => {
        capturedOptions = options;
        return vi.fn(async (req: unknown) => {
          await cb({ protect }, req);
          return new Response('ok');
        });
      },
    );
    const createRouteMatcher = vi.fn(() => () => false);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

    const directives = (
      capturedOptions as {
        contentSecurityPolicy: { directives: Record<string, string[]> };
      }
    ).contentSecurityPolicy.directives;

    expect(directives['connect-src']).toEqual(['ws:', 'wss:']);
  });

  it('logs checkout success auth bounce when redirect_url is relative', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

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

    const res = await middleware(
      {
        url: checkoutSuccessUrl,
      } as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

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
