import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  carriesClerkHandshake,
  limitClerkHandshake,
} from '@/lib/clerk-handshake-limit';
import {
  CLERK_HANDSHAKE_RATE_LIMIT,
  ONE_MINUTE_MS,
} from '@/src/adapters/shared/rate-limits';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';
import { proxyInvocation } from '@/tests/shared/next-proxy-invocation';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();
const OVER_LIMIT = {
  success: false,
  limit: 30,
  remaining: 0,
  retryAfterSeconds: 42,
};

function request(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, cookie ? { headers: { cookie } } : undefined);
}

// BUG-323: each request carrying Clerk's handshake nonce makes the Clerk SDK
// call Clerk's Backend API, which every signed-in page shares. Requests that
// carry it are limited per address before Clerk sees them.
describe('Clerk handshake limit', () => {
  it('is 30 a minute per address, far above one person refreshing a session', () => {
    expect(CLERK_HANDSHAKE_RATE_LIMIT).toEqual({
      limit: 30,
      windowMs: ONE_MINUTE_MS,
    });
  });

  it.each([
    [
      'the nonce in the query',
      'https://example.com/?__clerk_handshake_nonce=x',
      undefined,
    ],
    [
      'the nonce in a cookie',
      'https://example.com/pricing',
      '__clerk_handshake_nonce=x',
    ],
    [
      'a handshake token in the query',
      'https://example.com/?__clerk_handshake=x',
      undefined,
    ],
  ])('recognizes %s', (_kind, url, cookie) => {
    expect(carriesClerkHandshake(request(url, cookie))).toBe(true);
  });

  it('ignores an ordinary request', () => {
    expect(
      carriesClerkHandshake(
        request('https://example.com/pricing?plan=monthly', '__session=x'),
      ),
    ).toBe(false);
  });

  it('lets a request under the limit through, counted per address', async () => {
    const limiter = new FakeRateLimiter();

    expect(
      await limitClerkHandshake(
        request('https://example.com/?__clerk_handshake_nonce=x'),
        async () => limiter,
        () => {},
      ),
    ).toBeNull();
    expect(limiter.inputs).toEqual([
      { key: 'clerk-handshake:unknown', ...CLERK_HANDSHAKE_RATE_LIMIT },
    ]);
  });

  it('answers 429 over the limit, without calling Clerk', async () => {
    const response = await limitClerkHandshake(
      request('https://example.com/?__clerk_handshake_nonce=x'),
      async () => new FakeRateLimiter(OVER_LIMIT),
      () => {},
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('42');
  });

  // Failing closed would break every real session refresh while the database
  // is down; the firewall rule still bounds the volume.
  it('lets the request through and reports when the limiter fails', async () => {
    const reports: unknown[] = [];

    expect(
      await limitClerkHandshake(
        request('https://example.com/?__clerk_handshake_nonce=x'),
        async () => new FakeRateLimiter(new Error('database unavailable')),
        (report) => reports.push(report),
      ),
    ).toBeNull();
    expect(reports).toHaveLength(1);
  });

  it('lets the request through and reports when the limiter cannot load', async () => {
    const reports: unknown[] = [];

    expect(
      await limitClerkHandshake(
        request('https://example.com/?__clerk_handshake_nonce=x'),
        async () => {
          throw new Error('container unavailable');
        },
        (report) => reports.push(report),
      ),
    ).toBeNull();
    expect(reports).toHaveLength(1);
  });
});

describe('proxy with the Clerk handshake limit', () => {
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
    const loadHandshakeLimiter = vi.fn(async () => limiter);
    const { createProxy } = await import('./proxy');
    return {
      proxy: createProxy({ loadHandshakeLimiter }),
      clerkRuns,
      loadHandshakeLimiter,
    };
  }

  it('answers 429 before Clerk runs when the address is over the limit', async () => {
    const { proxy, clerkRuns } = await proxyWith(
      new FakeRateLimiter(OVER_LIMIT),
    );

    const response = await proxy(
      ...proxyInvocation(
        'https://example.com/pricing?__clerk_handshake_nonce=x',
      ),
    );

    expect(response?.status).toBe(429);
    expect(clerkRuns).not.toHaveBeenCalled();
  });

  it('hands a request under the limit to Clerk', async () => {
    const { proxy, clerkRuns } = await proxyWith(new FakeRateLimiter());

    await proxy(
      ...proxyInvocation(
        'https://example.com/pricing?__clerk_handshake_nonce=x',
      ),
    );

    expect(clerkRuns).toHaveBeenCalledTimes(1);
  });

  it('never loads the limiter for an ordinary request', async () => {
    const { proxy, clerkRuns, loadHandshakeLimiter } = await proxyWith(
      new FakeRateLimiter(),
    );

    await proxy(...proxyInvocation('https://example.com/pricing'));

    expect(loadHandshakeLimiter).not.toHaveBeenCalled();
    expect(clerkRuns).toHaveBeenCalledTimes(1);
  });
});
