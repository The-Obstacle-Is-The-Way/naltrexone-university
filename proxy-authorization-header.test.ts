import { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CRON_ROUTE_PATHS } from '@/lib/public-routes';
import {
  FakeOperationalAlerts,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

function invocation(
  url: string,
  headers: Record<string, string> = {},
): [NextRequest, NextFetchEvent] {
  const request = new NextRequest(url, { headers });
  return [
    request,
    new NextFetchEvent({ request, page: '/', context: undefined }),
  ];
}

// The proxy over a stubbed Clerk middleware, which records whether it ran.
async function proxyOverClerk() {
  process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_live_x';
  const clerkRuns = vi.fn();
  vi.doMock('@clerk/nextjs/server', () => ({
    clerkMiddleware: () => async () => {
      clerkRuns();
      return NextResponse.next();
    },
    createRouteMatcher: () => () => true,
  }));
  const { createProxy } = await import('./proxy');
  return {
    proxy: createProxy({
      loadBackendCallLimiter: async () => new FakeRateLimiter(),
      loadOperationalAlerts: async () => new FakeOperationalAlerts(),
    }),
    clerkRuns,
  };
}

// BUG-369: Clerk's middleware reads a token from any Authorization header and
// can spend its Backend API on one, uncounted by BUG-323's limits. No page or
// browser request to the app sends the header; only the cron routes take it.
describe('the Authorization header', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it.each([
    ['a protected page', 'https://example.com/app/dashboard'],
    ['a public page', 'https://example.com/pricing'],
    ['a public API route', 'https://example.com/api/health'],
    ['a public resource', 'https://example.com/robots.txt'],
    [
      'a path that only starts like a cron route',
      `https://example.com${CRON_ROUTE_PATHS[0]}-other`,
    ],
  ])('is refused on %s before Clerk runs', async (_kind, url) => {
    const { proxy, clerkRuns } = await proxyOverClerk();

    const response = await proxy(
      ...invocation(url, { authorization: 'Bearer token' }),
    );

    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: 'Unauthorized' });
    expect(clerkRuns).not.toHaveBeenCalled();
  });

  // Clerk's header parser also takes a bare token with no scheme.
  it('is refused without a scheme too', async () => {
    const { proxy, clerkRuns } = await proxyOverClerk();

    const response = await proxy(
      ...invocation('https://example.com/app/dashboard', {
        authorization: 'token',
      }),
    );

    expect(response?.status).toBe(401);
    expect(clerkRuns).not.toHaveBeenCalled();
  });

  // Vercel Cron sends CRON_SECRET in the header, and each route checks it
  // itself; neither needs a Clerk session.
  it.each(CRON_ROUTE_PATHS)(
    'reaches the cron route %s without starting Clerk',
    async (path) => {
      const { proxy, clerkRuns } = await proxyOverClerk();

      const response = await proxy(
        ...invocation(`https://example.com${path}?dryRun=false`, {
          authorization: 'Bearer cron-secret',
        }),
      );

      expect(response?.headers.get('x-middleware-next')).toBe('1');
      expect(clerkRuns).not.toHaveBeenCalled();
    },
  );

  it('leaves a request without the header to Clerk', async () => {
    const { proxy, clerkRuns } = await proxyOverClerk();

    await proxy(...invocation('https://example.com/app/dashboard'));

    expect(clerkRuns).toHaveBeenCalledTimes(1);
  });
});
