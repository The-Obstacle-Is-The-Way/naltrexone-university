import {
  getWaitUntilPromiseFromEvent,
  NextFetchEvent,
} from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FakeOperationalAlerts,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();
const WITHHELD = 'session-token-expired-refresh-non-eligible-no-refresh-cookie';

// A session token's payload is read only for its expiry; the SDK verifies it.
function sessionToken(exp: number): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part({ exp, sid: 'sess_a' })}.signature`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function pageLoad(cookie: string): [NextRequest, NextFetchEvent] {
  const request = new NextRequest('https://example.com/app/dashboard', {
    headers: { cookie, 'x-vercel-forwarded-for': '203.0.113.7' },
  });
  return [
    request,
    new NextFetchEvent({ request, page: '/', context: undefined }),
  ];
}

// The proxy with Clerk's middleware stubbed to record the request it is
// handed, and to answer with the given auth reason.
async function proxyWith(
  limiter: FakeRateLimiter,
  { publishableKey = 'pk_live_x', authReason = '' } = {},
) {
  const alerts = new FakeOperationalAlerts();
  process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = publishableKey;
  const handedToClerk: NextRequest[] = [];
  vi.doMock('@clerk/nextjs/server', () => ({
    clerkMiddleware: () => async (request: NextRequest) => {
      handedToClerk.push(request);
      const response = NextResponse.next();
      if (authReason) response.headers.set('x-clerk-auth-reason', authReason);
      return response;
    },
    createRouteMatcher: () => () => true,
  }));
  const loadBackendCallLimiter = vi.fn(async () => limiter);
  const { createProxy } = await import('./proxy');
  return {
    proxy: createProxy({
      loadBackendCallLimiter,
      loadOperationalAlerts: async () => alerts,
    }),
    alerts,
    cookieHandedToClerk: () => handedToClerk[0]?.headers.get('cookie'),
    loadBackendCallLimiter,
  };
}

// A runtime that refuses to copy a request: Next's own class, which nothing
// can inject, refusing to be built from another request.
function refuseRequestCopies() {
  vi.doMock('next/server', async (importOriginal) => {
    const actual = await importOriginal<typeof import('next/server')>();
    class RefusesCopies extends actual.NextRequest {
      constructor(...[input, init]: ConstructorParameters<typeof NextRequest>) {
        if (input instanceof Request) throw new Error('copy refused');
        super(input, init);
      }
    }
    return { ...actual, NextRequest: RefusesCopies };
  });
}

// DEBT-503 item 4: Clerk refreshes an expired session only with its refresh
// cookie, so Clerk's middleware is handed one only on a request the limiter
// counted.
describe("the cookies the proxy hands Clerk's middleware", () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.doUnmock('next/server');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('leave out the refresh cookie of a GET the limiter did not count', async () => {
    const { proxy, cookieHandedToClerk, loadBackendCallLimiter } =
      await proxyWith(new FakeRateLimiter());
    const current = sessionToken(nowSeconds() + 60);

    await proxy(...pageLoad(`__session=${current}; __refresh_abc=r`));

    expect(cookieHandedToClerk()).toBe(`__session=${current};`);
    expect(loadBackendCallLimiter).not.toHaveBeenCalled();
  });

  it('keep the refresh cookie of a GET the limiter counted', async () => {
    const limiter = new FakeRateLimiter();
    const { proxy, cookieHandedToClerk } = await proxyWith(limiter);
    const cookie = `__session=${sessionToken(nowSeconds() - 60)}; __refresh_abc=r`;

    await proxy(...pageLoad(cookie));

    expect(cookieHandedToClerk()).toBe(cookie);
    expect(limiter.inputs.length).toBeGreaterThan(0);
  });

  it('keep the refresh cookie when the limiter failed and let the request through', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { proxy, cookieHandedToClerk } = await proxyWith(
      new FakeRateLimiter([new Error('database down')]),
    );
    const cookie = `__session=${sessionToken(nowSeconds() - 60)}; __refresh_abc=r`;

    await proxy(...pageLoad(cookie));

    expect(cookieHandedToClerk()).toBe(cookie);
  });

  it("keep a development instance's refresh cookie", async () => {
    const { proxy, cookieHandedToClerk } = await proxyWith(
      new FakeRateLimiter(),
      { publishableKey: 'pk_test_x' },
    );
    const cookie = `__session=${sessionToken(nowSeconds() + 60)}; __refresh_abc=r`;

    await proxy(...pageLoad(cookie));

    expect(cookieHandedToClerk()).toBe(cookie);
  });

  it('are logged when Clerk wanted the refresh cookie it was not handed', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { proxy } = await proxyWith(new FakeRateLimiter(), {
      authReason: WITHHELD,
    });

    await proxy(
      ...pageLoad(
        `__session=${sessionToken(nowSeconds() + 60)}; __refresh_abc=r`,
      ),
    );

    expect(warned).toHaveBeenCalledWith({ event: 'clerk_refresh_withheld' });
  });

  // The log line lasts an hour in production, and while the copy fails Clerk
  // can refresh what the limiter did not count, so a person must hear of it.
  it('are handed over as they came, with an alert after the response, when the runtime refuses the copy', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    refuseRequestCopies();
    const { proxy, alerts, cookieHandedToClerk } = await proxyWith(
      new FakeRateLimiter(),
    );
    const cookie = `__session=${sessionToken(nowSeconds() + 60)}; __refresh_abc=r`;
    const [request, event] = pageLoad(cookie);

    await proxy(request, event);
    await getWaitUntilPromiseFromEvent(event);

    expect(cookieHandedToClerk()).toBe(cookie);
    expect(alerts.raised).toEqual([
      { kind: 'clerk_refresh_cookie_strip_failed', count: 1 },
    ]);
  });

  it('are not logged when the visitor sent no refresh cookie to leave out', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { proxy } = await proxyWith(new FakeRateLimiter(), {
      authReason: WITHHELD,
    });

    await proxy(...pageLoad(`__session=${sessionToken(nowSeconds() + 60)}`));

    expect(warned).not.toHaveBeenCalledWith({
      event: 'clerk_refresh_withheld',
    });
  });
});
