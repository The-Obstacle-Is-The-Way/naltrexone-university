import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  limitClerkBackendCalls,
  triggersClerkBackendCall,
} from '@/lib/clerk-backend-call-limit';
import {
  CLERK_BACKEND_CALL_RATE_LIMIT,
  CLERK_BACKEND_CALL_SESSION_RATE_LIMIT,
  CLERK_BACKEND_CALL_SITE_RATE_LIMIT,
  ONE_MINUTE_MS,
} from '@/src/adapters/shared/rate-limits';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';
import { proxyInvocation } from '@/tests/shared/next-proxy-invocation';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();
const NOW_SECONDS = 1_800_000_000;
const UNDER_LIMIT = {
  success: true,
  limit: 30,
  remaining: 29,
  retryAfterSeconds: 0,
};
const OVER_LIMIT = {
  success: false,
  limit: 30,
  remaining: 0,
  retryAfterSeconds: 42,
};

function request(
  url: string,
  init: { cookie?: string; method?: string; accept?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie) headers.cookie = init.cookie;
  if (init.accept) headers.accept = init.accept;
  return new NextRequest(url, { method: init.method ?? 'GET', headers });
}

// A session token's payload is read only for its expiry; the SDK verifies it.
function sessionToken(exp: number, sid = 'sess_a'): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part({ exp, sid })}.signature`;
}

// BUG-323: some requests make Clerk's SDK call Clerk's Backend API, whose
// limit every signed-in page shares. They are limited before Clerk sees them.
describe('requests that make Clerk call its Backend API', () => {
  // The site-wide cap is a share of what it protects: Clerk's production
  // limit is 1,000 calls per 10 seconds, about 6,000 a minute.
  it('are limited per address, per session and site-wide', () => {
    expect(CLERK_BACKEND_CALL_RATE_LIMIT).toEqual({
      limit: 30,
      windowMs: ONE_MINUTE_MS,
    });
    expect(CLERK_BACKEND_CALL_SESSION_RATE_LIMIT).toEqual({
      limit: 6,
      windowMs: ONE_MINUTE_MS,
    });
    expect(CLERK_BACKEND_CALL_SITE_RATE_LIMIT).toEqual({
      limit: 1000,
      windowMs: ONE_MINUTE_MS,
    });
  });

  const expired = sessionToken(NOW_SECONDS - 60);
  const current = sessionToken(NOW_SECONDS + 60);

  it.each([
    [
      'a handshake nonce in the query',
      'https://example.com/?__clerk_handshake_nonce=x',
      {},
    ],
    [
      'a handshake nonce cookie',
      'https://example.com/pricing',
      { cookie: '__clerk_handshake_nonce=x' },
    ],
    [
      'a handshake token in the query',
      'https://example.com/?__clerk_handshake=x',
      {},
    ],
    [
      'a handshake token cookie',
      'https://example.com/pricing',
      { cookie: '__clerk_handshake=x' },
    ],
    [
      'an expired session with a refresh cookie',
      'https://example.com/pricing',
      { cookie: `__session=${expired}; __refresh_abc=x` },
    ],
    [
      'an expired suffixed session with a refresh cookie',
      'https://example.com/pricing',
      { cookie: `__session_abc=${expired}; __refresh_abc=x` },
    ],
  ])('recognizes %s', (_kind, url, init) => {
    expect(triggersClerkBackendCall(request(url, init), NOW_SECONDS)).toBe(
      true,
    );
  });

  it.each([
    ['an ordinary request', { cookie: `__session=${current}` }],
    [
      'a current session with a refresh cookie',
      { cookie: `__session=${current}; __refresh_abc=x` },
    ],
    [
      'an expired session without a refresh cookie',
      { cookie: `__session=${expired}` },
    ],
    [
      'an expired session on a POST',
      { cookie: `__session=${expired}; __refresh_abc=x`, method: 'POST' },
    ],
    [
      'a malformed session with a refresh cookie',
      { cookie: '__session=not-a-token; __refresh_abc=x' },
    ],
  ])('ignores %s', (_kind, init) => {
    expect(
      triggersClerkBackendCall(
        request('https://example.com/pricing', init),
        NOW_SECONDS,
      ),
    ).toBe(false);
  });
});

describe('limiting requests that make Clerk call its Backend API', () => {
  const nonce = () => request('https://example.com/?__clerk_handshake_nonce=x');

  it('counts each request per address, then site-wide, and lets it through under both', async () => {
    const limiter = new FakeRateLimiter([UNDER_LIMIT, UNDER_LIMIT]);

    expect(
      await limitClerkBackendCalls(
        nonce(),
        async () => limiter,
        () => {},
      ),
    ).toBeNull();
    expect(limiter.inputs).toEqual([
      { key: 'clerk-backend-call:unknown', ...CLERK_BACKEND_CALL_RATE_LIMIT },
      { key: 'clerk-backend-call:site', ...CLERK_BACKEND_CALL_SITE_RATE_LIMIT },
    ]);
  });

  // Clerk refreshes only a genuine session, whose ID is fixed, so one session
  // replayed from many addresses is still limited.
  it('also counts a session refresh against its session', async () => {
    const limiter = new FakeRateLimiter([
      UNDER_LIMIT,
      UNDER_LIMIT,
      UNDER_LIMIT,
    ]);
    const refresh = request('https://example.com/pricing', {
      cookie: `__session=${sessionToken(1, 'sess_replayed')}; __refresh_abc=x`,
    });

    expect(
      await limitClerkBackendCalls(
        refresh,
        async () => limiter,
        () => {},
      ),
    ).toBeNull();
    expect(limiter.inputs.map(({ key }) => key)).toEqual([
      'clerk-backend-call:unknown',
      'clerk-backend-call:session:sess_replayed',
      'clerk-backend-call:site',
    ]);
  });

  it('answers 429 when one session refreshes too often', async () => {
    const limiter = new FakeRateLimiter([UNDER_LIMIT, OVER_LIMIT]);
    const refresh = request('https://example.com/pricing', {
      cookie: `__session=${sessionToken(1)}; __refresh_abc=x`,
    });

    const response = await limitClerkBackendCalls(
      refresh,
      async () => limiter,
      () => {},
    );

    expect(response?.status).toBe(429);
    expect(limiter.inputs).toHaveLength(2);
  });

  // One address over its own limit stops counting toward the site budget, so
  // it cannot use that budget up on its own.
  it('answers 429 over the per-address limit, without counting it site-wide', async () => {
    const limiter = new FakeRateLimiter([OVER_LIMIT]);

    const response = await limitClerkBackendCalls(
      nonce(),
      async () => limiter,
      () => {},
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('42');
    expect(limiter.inputs).toHaveLength(1);
  });

  it('answers 429 over the site-wide limit', async () => {
    const limiter = new FakeRateLimiter([UNDER_LIMIT, OVER_LIMIT]);

    const response = await limitClerkBackendCalls(
      nonce(),
      async () => limiter,
      () => {},
    );

    expect(response?.status).toBe(429);
  });

  it('gives a browser a page to retry from, and clears the handshake cookies', async () => {
    const response = await limitClerkBackendCalls(
      request('https://example.com/pricing', {
        cookie: '__clerk_handshake_nonce=x',
        accept: 'text/html,application/xhtml+xml',
      }),
      async () => new FakeRateLimiter([OVER_LIMIT]),
      () => {},
    );

    expect(response?.headers.get('content-type')).toContain('text/html');
    expect(await response?.text()).toContain('try again');
    const cleared = response?.cookies
      .getAll()
      .map((cookie) => [cookie.name, cookie.maxAge]);
    expect(cleared).toEqual([
      ['__clerk_handshake_nonce', 0],
      ['__clerk_handshake', 0],
    ]);
  });

  it('answers other clients with JSON', async () => {
    const response = await limitClerkBackendCalls(
      nonce(),
      async () => new FakeRateLimiter([OVER_LIMIT]),
      () => {},
    );

    expect(await response?.json()).toEqual({ error: 'Too many requests' });
  });

  // Failing closed would break every real session refresh while the database
  // is down; the firewall rule still bounds the volume.
  it('lets the request through and reports when the limiter fails', async () => {
    const reports: unknown[] = [];

    expect(
      await limitClerkBackendCalls(
        nonce(),
        async () => new FakeRateLimiter(new Error('database unavailable')),
        (report) => reports.push(report),
      ),
    ).toBeNull();
    expect(reports).toHaveLength(1);
  });

  it('lets the request through and reports when the limiter cannot load', async () => {
    const reports: unknown[] = [];

    expect(
      await limitClerkBackendCalls(
        nonce(),
        async () => {
          throw new Error('container unavailable');
        },
        (report) => reports.push(report),
      ),
    ).toBeNull();
    expect(reports).toHaveLength(1);
  });
});

describe('proxy with the Clerk Backend API limit', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function proxyWith(limiter: FakeRateLimiter) {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    const clerkRuns = vi.fn();
    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware: () => async () => {
        clerkRuns();
        return NextResponse.next();
      },
      createRouteMatcher: () => () => true,
    }));
    const loadBackendCallLimiter = vi.fn(async () => limiter);
    const { createProxy } = await import('./proxy');
    return {
      proxy: createProxy({ loadBackendCallLimiter }),
      clerkRuns,
      loadBackendCallLimiter,
    };
  }

  it('answers 429 before Clerk runs when the address is over the limit', async () => {
    const { proxy, clerkRuns } = await proxyWith(
      new FakeRateLimiter([OVER_LIMIT]),
    );

    const response = await proxy(
      ...proxyInvocation(
        'https://example.com/pricing?__clerk_handshake_nonce=x',
      ),
    );

    expect(response?.status).toBe(429);
    expect(clerkRuns).not.toHaveBeenCalled();
  });

  it('hands a request under the limits to Clerk', async () => {
    const { proxy, clerkRuns } = await proxyWith(new FakeRateLimiter());

    await proxy(
      ...proxyInvocation(
        'https://example.com/pricing?__clerk_handshake_nonce=x',
      ),
    );

    expect(clerkRuns).toHaveBeenCalledTimes(1);
  });

  it('never loads the limiter for an ordinary request', async () => {
    const { proxy, clerkRuns, loadBackendCallLimiter } = await proxyWith(
      new FakeRateLimiter(),
    );

    await proxy(...proxyInvocation('https://example.com/pricing'));

    expect(loadBackendCallLimiter).not.toHaveBeenCalled();
    expect(clerkRuns).toHaveBeenCalledTimes(1);
  });
});
