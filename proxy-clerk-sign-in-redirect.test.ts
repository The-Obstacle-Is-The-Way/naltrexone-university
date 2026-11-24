import { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_REDIRECT_QUERY_PARAM, ROUTES } from '@/lib/routes';
import {
  FakeOperationalAlerts,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

vi.mock('server-only', () => ({}));

const ORIGINAL_ENV = snapshotProcessEnv();
const SITE = 'https://example.com';
const PROTECTED_PAGE = `${SITE}${ROUTES.APP_DASHBOARD}`;
// A production instance whose Frontend API is clerk.example.com. Without a
// configured sign-in URL, Clerk sends sign-in to its Account Portal,
// accounts.example.com.
const PUBLISHABLE_KEY = `pk_live_${Buffer.from('clerk.example.com$').toString('base64')}`;

// Runs a signed-out request through the proxy and the real Clerk middleware.
// A signed-out visitor sends no session cookie, so Clerk needs no network.
async function signedOut(headers: Record<string, string>) {
  process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
  process.env.CLERK_SECRET_KEY = 'sk_live_sign_in_redirect';
  const fetches = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('A signed-out request needs no network'));
  const { createProxy } = await import('./proxy');
  const proxy = createProxy({
    loadBackendCallLimiter: async () => new FakeRateLimiter(),
    loadOperationalAlerts: async () => new FakeOperationalAlerts(),
  });
  const request = new NextRequest(PROTECTED_PAGE, { headers });
  const response = await proxy(
    request,
    new NextFetchEvent({ request, page: '/', context: undefined }),
  );
  return { response, fetches };
}

function signInTarget(response: unknown): URL {
  const location =
    response instanceof Response ? response.headers.get('location') : null;
  if (!location) throw new Error('The proxy did not redirect');
  return new URL(location, SITE);
}

// BUG-378: a redirect to another origin is a fetch the policy's
// `connect-src` does not list, so each one sent a CSP report to Sentry.
describe('signing in from a protected page', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("sends a signed-out router request to the site's own sign-in page", async () => {
    // The headers Next.js's router sends on a prefetch.
    const { response, fetches } = await signedOut({
      rsc: '1',
      'next-router-prefetch': '1',
      'next-url': ROUTES.HOME,
    });

    const target = signInTarget(response);
    expect(target.origin).toBe(SITE);
    expect(target.pathname).toBe(ROUTES.SIGN_IN);
    expect(target.searchParams.get(AUTH_REDIRECT_QUERY_PARAM)).toBe(
      PROTECTED_PAGE,
    );
    expect(fetches).not.toHaveBeenCalled();
  });

  it("sends a signed-out page load to the site's own sign-in page", async () => {
    const { response } = await signedOut({
      accept: 'text/html',
      'sec-fetch-dest': 'document',
    });

    const target = signInTarget(response);
    expect(target.origin).toBe(SITE);
    expect(target.pathname).toBe(ROUTES.SIGN_IN);
    expect(target.searchParams.get(AUTH_REDIRECT_QUERY_PARAM)).toBe(
      PROTECTED_PAGE,
    );
  });
});
