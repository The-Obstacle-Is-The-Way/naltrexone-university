import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyInvocation } from '@/tests/shared/next-proxy-invocation';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

// pk_live_ + base64("clerk.example.com$")
const PUBLISHABLE_KEY = `pk_live_${Buffer.from('clerk.example.com$').toString('base64')}`;

type ClerkMiddlewareCallback = (
  auth: { protect: () => Promise<void> },
  request: unknown,
) => Promise<void> | void;

// Runs the proxy once through a mocked Clerk middleware and returns the
// options the proxy handed Clerk, with the proxy's response.
const runProxyThroughClerk = async (): Promise<{
  clerkOptions: Record<string, unknown>;
  response: Response;
}> => {
  const protect = vi.fn(async () => undefined);
  let clerkOptions: Record<string, unknown> = {};
  const clerkMiddleware = vi.fn(
    (cb: ClerkMiddlewareCallback, options?: Record<string, unknown>) => {
      clerkOptions = options ?? {};
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

  const response = await middleware(...proxyInvocation());
  if (!(response instanceof Response)) throw new Error('No response');
  return { clerkOptions, response };
};

const policyOf = (response: Response): string =>
  response.headers.get('content-security-policy-report-only') ?? '';

const directive = (policy: string, name: string): string[] | undefined =>
  policy
    .split('; ')
    .map((part) => part.split(' '))
    .find(([directiveName]) => directiveName === name)
    ?.slice(1);

describe('proxy content security policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('sets the app’s report-only policy on Clerk’s responses, with no nonce', async () => {
    vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', PUBLISHABLE_KEY);
    vi.stubEnv('NODE_ENV', 'production');

    const { clerkOptions, response } = await runProxyThroughClerk();
    const policy = policyOf(response);

    expect(clerkOptions).not.toHaveProperty('contentSecurityPolicy');
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(directive(policy, 'script-src')).toEqual(
      expect.arrayContaining([
        "'self'",
        "'unsafe-inline'",
        'https://clerk.example.com',
      ]),
    );
    expect(policy).not.toContain('strict-dynamic');
    expect(policy).not.toContain('nonce-');
    expect(directive(policy, 'base-uri')).toEqual(["'self'"]);
    expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(policy, 'object-src')).toEqual(["'none'"]);
  });

  describe('preview-only Vercel Toolbar CSP support', () => {
    it('includes the Vercel Toolbar origins when VERCEL_ENV=preview', async () => {
      vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
      vi.stubEnv('VERCEL_ENV', 'preview');
      vi.stubEnv('NODE_ENV', 'production');

      const { response } = await runProxyThroughClerk();
      const policy = policyOf(response);

      expect(directive(policy, 'script-src')).toContain('https://vercel.live');
      expect(directive(policy, 'connect-src')).toEqual(
        expect.arrayContaining([
          'https://vercel.live',
          'wss://ws-us3.pusher.com',
        ]),
      );
      expect(directive(policy, 'frame-src')).toContain('https://vercel.live');
    });

    it('does not include the Vercel Toolbar origins when VERCEL_ENV=production', async () => {
      vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('NODE_ENV', 'production');

      const { response } = await runProxyThroughClerk();

      expect(policyOf(response)).not.toContain('vercel.live');
    });

    it('does not include the Vercel Toolbar origins when VERCEL_ENV is not set', async () => {
      vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.VERCEL_ENV;

      const { response } = await runProxyThroughClerk();

      expect(policyOf(response)).not.toContain('vercel.live');
    });

    it('includes sentry_environment=preview in the report endpoint when VERCEL_ENV=preview and NEXT_PUBLIC_SENTRY_DSN is set', async () => {
      vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
      vi.stubEnv(
        'NEXT_PUBLIC_SENTRY_DSN',
        'https://abc123@o456.ingest.us.sentry.io/789',
      );
      vi.stubEnv('VERCEL_ENV', 'preview');
      vi.stubEnv('NODE_ENV', 'production');

      const { response } = await runProxyThroughClerk();
      const endpoint =
        'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123&sentry_environment=preview';

      expect(directive(policyOf(response), 'report-uri')).toEqual([endpoint]);
      expect(response.headers.get('reporting-endpoints')).toBe(
        `csp-endpoint="${endpoint}"`,
      );
    });
  });

  it('includes Sentry ingest origin in connect-src when NEXT_PUBLIC_SENTRY_DSN is set', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://abc123@o456.ingest.us.sentry.io/789';
    delete process.env.VERCEL_ENV;
    vi.stubEnv('NODE_ENV', 'test');

    const { response } = await runProxyThroughClerk();
    const policy = policyOf(response);

    expect(directive(policy, 'connect-src')).toEqual(
      expect.arrayContaining([
        'ws:',
        'wss:',
        'https://o456.ingest.us.sentry.io',
      ]),
    );
    expect(directive(policy, 'report-uri')).toEqual([
      'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123&sentry_environment=local',
    ]);
  });

  it('excludes Sentry ingest origin from connect-src when NEXT_PUBLIC_SENTRY_DSN is not set', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const { response } = await runProxyThroughClerk();
    const policy = policyOf(response);

    expect(policy).not.toContain('sentry.io');
    expect(directive(policy, 'report-uri')).toBeUndefined();
    expect(response.headers.get('reporting-endpoints')).toBeNull();
  });

  it('excludes invalid-scheme Sentry DSNs from connect-src', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'mailto:test@example.com';

    const { response } = await runProxyThroughClerk();
    const policy = policyOf(response);

    expect(policy).not.toContain('example.com');
    // An invalid DSN must not reach Sentry reporting either.
    expect(directive(policy, 'report-uri')).toBeUndefined();
    expect(response.headers.get('reporting-endpoints')).toBeNull();
  });
});
