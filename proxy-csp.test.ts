import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyInvocation } from '@/tests/shared/next-proxy-invocation';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

type CapturedContentSecurityPolicy = {
  directives: Record<string, string[]>;
  strict?: boolean;
  reportOnly: boolean;
  reportTo?: string;
};

type ClerkMiddlewareCallback = (
  auth: { protect: () => Promise<void> },
  request: unknown,
) => Promise<void> | void;

const captureContentSecurityPolicyOptions =
  async (): Promise<CapturedContentSecurityPolicy> => {
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

    await middleware(...proxyInvocation());

    return (
      capturedOptions as {
        contentSecurityPolicy: CapturedContentSecurityPolicy;
      }
    ).contentSecurityPolicy;
  };

describe('proxy content security policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns configured Clerk CSP directives when NEXT_PUBLIC_SKIP_CLERK is false', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

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
    const res = await middleware(...proxyInvocation());

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

  describe('preview-only Vercel Toolbar CSP support', () => {
    it('includes the Vercel Toolbar origins when VERCEL_ENV=preview', async () => {
      vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
      vi.stubEnv('VERCEL_ENV', 'preview');
      vi.stubEnv('NODE_ENV', 'production');

      const contentSecurityPolicy = await captureContentSecurityPolicyOptions();

      expect(contentSecurityPolicy.strict).toBe(true);
      expect(contentSecurityPolicy.reportOnly).toBe(true);
      expect(contentSecurityPolicy.directives['script-src']).toEqual([
        'https://vercel.live',
      ]);
      expect(contentSecurityPolicy.directives['connect-src']).toEqual(
        expect.arrayContaining([
          'ws:',
          'wss:',
          'https://vercel.live',
          'wss://ws-us3.pusher.com',
        ]),
      );
      expect(contentSecurityPolicy.directives['img-src']).toEqual(
        expect.arrayContaining([
          'self',
          'data:',
          'blob:',
          'https:',
          'https://vercel.live',
          'https://vercel.com',
        ]),
      );
      expect(contentSecurityPolicy.directives['frame-src']).toEqual([
        'https://vercel.live',
      ]);
      expect(contentSecurityPolicy.directives['style-src']).toEqual([
        'https://vercel.live',
        "'unsafe-inline'",
      ]);
      expect(contentSecurityPolicy.directives['font-src']).toEqual(
        expect.arrayContaining([
          'self',
          'data:',
          'https:',
          'https://vercel.live',
          'https://assets.vercel.com',
        ]),
      );
    });

    it('does not include the Vercel Toolbar origins when VERCEL_ENV=production', async () => {
      vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('NODE_ENV', 'production');

      const contentSecurityPolicy = await captureContentSecurityPolicyOptions();

      expect(contentSecurityPolicy.directives['script-src']).toBeUndefined();
      expect(contentSecurityPolicy.directives['frame-src']).toBeUndefined();
      expect(contentSecurityPolicy.directives['style-src']).toBeUndefined();
      expect(contentSecurityPolicy.directives['connect-src']).not.toContain(
        'https://vercel.live',
      );
      expect(contentSecurityPolicy.directives['connect-src']).not.toContain(
        'wss://ws-us3.pusher.com',
      );
      expect(contentSecurityPolicy.directives['img-src']).not.toContain(
        'https://vercel.live',
      );
      expect(contentSecurityPolicy.directives['img-src']).not.toContain(
        'https://vercel.com',
      );
      expect(contentSecurityPolicy.directives['font-src']).not.toContain(
        'https://vercel.live',
      );
      expect(contentSecurityPolicy.directives['font-src']).not.toContain(
        'https://assets.vercel.com',
      );
    });

    it('does not include the Vercel Toolbar origins when VERCEL_ENV is not set', async () => {
      vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
      vi.unstubAllEnvs();
      process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
      delete process.env.VERCEL_ENV;
      vi.stubEnv('NODE_ENV', 'production');

      const contentSecurityPolicy = await captureContentSecurityPolicyOptions();

      expect(contentSecurityPolicy.directives['script-src']).toBeUndefined();
      expect(contentSecurityPolicy.directives['frame-src']).toBeUndefined();
      expect(contentSecurityPolicy.directives['style-src']).toBeUndefined();
      expect(contentSecurityPolicy.directives['connect-src']).not.toContain(
        'https://vercel.live',
      );
      expect(contentSecurityPolicy.directives['img-src']).not.toContain(
        'https://vercel.live',
      );
      expect(contentSecurityPolicy.directives['font-src']).not.toContain(
        'https://vercel.live',
      );
    });

    it('includes sentry_environment=preview in report-uri when VERCEL_ENV=preview and NEXT_PUBLIC_SENTRY_DSN is set', async () => {
      vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
      vi.stubEnv(
        'NEXT_PUBLIC_SENTRY_DSN',
        'https://abc123@o456.ingest.us.sentry.io/789',
      );
      vi.stubEnv('VERCEL_ENV', 'preview');
      vi.stubEnv('NODE_ENV', 'production');

      const contentSecurityPolicy = await captureContentSecurityPolicyOptions();

      expect(contentSecurityPolicy.reportTo).toBe(
        'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123&sentry_environment=preview',
      );
      expect(contentSecurityPolicy.directives['report-uri']).toEqual([
        'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123&sentry_environment=preview',
      ]);
    });
  });

  it('includes Sentry ingest origin in connect-src when NEXT_PUBLIC_SENTRY_DSN is set', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://abc123@o456.ingest.us.sentry.io/789';
    delete process.env.VERCEL_ENV;
    vi.stubEnv('NODE_ENV', 'test');

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

    await middleware(...proxyInvocation());

    expect(capturedOptions).toMatchObject({
      contentSecurityPolicy: {
        strict: true,
        reportOnly: true,
        reportTo:
          'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123&sentry_environment=test',
        directives: expect.objectContaining({
          'connect-src': expect.arrayContaining([
            'ws:',
            'wss:',
            'https://o456.ingest.us.sentry.io',
          ]),
          'report-uri': [
            'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123&sentry_environment=test',
          ],
        }),
      },
    });
  });

  it('excludes Sentry ingest origin from connect-src when NEXT_PUBLIC_SENTRY_DSN is not set', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

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

    await middleware(...proxyInvocation());

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

    await middleware(...proxyInvocation());

    const directives = (
      capturedOptions as {
        contentSecurityPolicy: { directives: Record<string, string[]> };
      }
    ).contentSecurityPolicy.directives;

    expect(directives['connect-src']).toEqual(['ws:', 'wss:']);
  });
});
