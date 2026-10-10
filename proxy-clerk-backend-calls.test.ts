import { getWaitUntilPromiseFromEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  limitClerkBackendCalls,
  raiseLimiterFailureAlert,
  raiseOperationalAlert,
  triggersClerkBackendCall,
} from '@/lib/clerk-backend-call-limit';
import {
  CLERK_BACKEND_CALL_RATE_LIMIT,
  CLERK_BACKEND_CALL_SESSION_RATE_LIMIT,
  CLERK_BACKEND_CALL_SITE_RATE_LIMIT,
  ONE_MINUTE_MS,
} from '@/src/adapters/shared/rate-limits';
import {
  FakeOperationalAlerts,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import { proxyInvocation } from '@/tests/shared/next-proxy-invocation';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import { createDeferred } from '@/tests/test-helpers/create-deferred';

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
  const fromAddress = (url: string, init: { cookie?: string } = {}) => {
    const r = request(url, init);
    // The header Vercel sets in production, which getClientIp reads first.
    r.headers.set('x-vercel-forwarded-for', '203.0.113.7');
    return r;
  };

  it('counts each request per address, then site-wide, and lets it through under both', async () => {
    const limiter = new FakeRateLimiter([UNDER_LIMIT, UNDER_LIMIT]);

    expect(
      await limitClerkBackendCalls(
        fromAddress('https://example.com/?__clerk_handshake_nonce=x'),
        async () => limiter,
        () => {},
      ),
    ).toBeNull();
    expect(limiter.inputs).toEqual([
      {
        key: 'clerk-backend-call:203.0.113.7',
        ...CLERK_BACKEND_CALL_RATE_LIMIT,
      },
      { key: 'clerk-backend-call:site', ...CLERK_BACKEND_CALL_SITE_RATE_LIMIT },
    ]);
  });

  // Without a readable client address every such request would share one
  // per-address bucket, so one sender could refuse everyone else; the
  // per-session and site-wide limits still apply.
  it('skips the per-address limit when the client address is unknown', async () => {
    const limiter = new FakeRateLimiter([UNDER_LIMIT]);

    expect(
      await limitClerkBackendCalls(
        nonce(),
        async () => limiter,
        () => {},
      ),
    ).toBeNull();
    expect(limiter.inputs.map(({ key }) => key)).toEqual([
      'clerk-backend-call:site',
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
    const refresh = fromAddress('https://example.com/pricing', {
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
      'clerk-backend-call:203.0.113.7',
      'clerk-backend-call:session:sess_replayed',
      'clerk-backend-call:site',
    ]);
  });

  it('answers 429 when one session refreshes too often', async () => {
    const limiter = new FakeRateLimiter([UNDER_LIMIT, OVER_LIMIT]);
    const refresh = fromAddress('https://example.com/pricing', {
      cookie: `__session=${sessionToken(1, 'sess_busy')}; __refresh_abc=x`,
    });

    const response = await limitClerkBackendCalls(
      refresh,
      async () => limiter,
      () => {},
    );

    expect(response?.status).toBe(429);
    expect(limiter.inputs.map(({ key }) => key)).toEqual([
      'clerk-backend-call:203.0.113.7',
      'clerk-backend-call:session:sess_busy',
    ]);
  });

  // One address over its own limit stops counting toward the site budget, so
  // it cannot use that budget up on its own.
  it('answers 429 over the per-address limit, without counting it site-wide', async () => {
    const limiter = new FakeRateLimiter([OVER_LIMIT]);

    const response = await limitClerkBackendCalls(
      fromAddress('https://example.com/?__clerk_handshake_nonce=x'),
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
      fromAddress('https://example.com/?__clerk_handshake_nonce=x'),
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
  // DEBT-503 item 3: a refusal names the limit that tripped, never the
  // address or session.
  it.each([
    ['address', [OVER_LIMIT]],
    ['session', [UNDER_LIMIT, OVER_LIMIT]],
    ['site', [UNDER_LIMIT, UNDER_LIMIT, OVER_LIMIT]],
  ] as const)(
    'names the %s limit when it refuses a call',
    async (limit, answers) => {
      const refused: string[] = [];

      await limitClerkBackendCalls(
        fromAddress('https://example.com/pricing', {
          cookie: `__session=${sessionToken(1, 'sess_busy')}; __refresh_abc=x`,
        }),
        async () => new FakeRateLimiter([...answers]),
        () => {},
        (tripped) => refused.push(tripped),
      );

      expect(refused).toEqual([limit]);
    },
  );

  it('names no limit when every limit lets the call through', async () => {
    const refused: string[] = [];

    await limitClerkBackendCalls(
      fromAddress('https://example.com/?__clerk_handshake_nonce=x'),
      async () => new FakeRateLimiter([UNDER_LIMIT, UNDER_LIMIT]),
      () => {},
      (tripped) => refused.push(tripped),
    );

    expect(refused).toEqual([]);
  });

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

// DEBT-505: the limiter failing is BUG-323's alert. The log alone reaches
// nobody.
describe('an operational alert raised after the response', () => {
  it('raises the given kind once', async () => {
    const alerts = new FakeOperationalAlerts();

    await raiseOperationalAlert(
      async () => alerts,
      'clerk_backend_calls_refused',
    );

    expect(alerts.raised).toEqual([
      { kind: 'clerk_backend_calls_refused', count: 1 },
    ]);
  });
});

describe('the limiter failure alert', () => {
  it('raises one limiter-failure alert', async () => {
    const alerts = new FakeOperationalAlerts();

    await raiseLimiterFailureAlert(async () => alerts);

    expect(alerts.raised).toEqual([
      { kind: 'clerk_backend_call_limiter_failed', count: 1 },
    ]);
  });

  it('resolves, and logs, when the alerts cannot load', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      raiseLimiterFailureAlert(async () => {
        throw new Error('container unavailable');
      }),
    ).resolves.toBeUndefined();
    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'operational_alert_unavailable' }),
    );
    reported.mockRestore();
  });
});

describe('the default limiter', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
  });

  it('is the container rate limiter, built without touching the database', async () => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://user:password@localhost:5432/db',
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_dummy',
      STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
      NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_dummy_monthly',
      NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_dummy_annual',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SKIP_CLERK: 'true',
    });
    vi.resetModules();
    const { loadContainerRateLimiter } = await import(
      '@/lib/clerk-backend-call-limit'
    );

    const limiter = await loadContainerRateLimiter();

    expect(typeof limiter.limit).toBe('function');
    expect(typeof limiter.pruneExpiredWindows).toBe('function');
  });

  it("loads the container's operational alerts without touching the database", async () => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://user:password@localhost:5432/db',
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_dummy',
      STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
      NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_dummy_monthly',
      NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_dummy_annual',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SKIP_CLERK: 'true',
    });
    vi.resetModules();
    const { loadContainerOperationalAlerts } = await import(
      '@/lib/clerk-backend-call-limit'
    );

    const alerts = await loadContainerOperationalAlerts();

    expect(typeof alerts.raise).toBe('function');
  });
});

describe('proxy with the Clerk Backend API limit', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function proxyWith(
    limiter: FakeRateLimiter,
    publishableKey = 'pk_live_x',
    alertsLoaded: Promise<void> = Promise.resolve(),
    clerkAnswers: () => Response = () => NextResponse.next(),
  ) {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = publishableKey;
    const clerkRuns = vi.fn();
    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware: () => async () => {
        clerkRuns();
        return clerkAnswers();
      },
      createRouteMatcher: () => () => true,
    }));
    const loadBackendCallLimiter = vi.fn(async () => limiter);
    const alerts = new FakeOperationalAlerts();
    const { createProxy } = await import('./proxy');
    return {
      proxy: createProxy({
        loadBackendCallLimiter,
        loadOperationalAlerts: async () => {
          await alertsLoaded;
          return alerts;
        },
      }),
      clerkRuns,
      loadBackendCallLimiter,
      alerts,
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

  // The allowance at stake is the production instance's. A development
  // instance handshakes every new browser session, so E2E, local work and
  // Preview would trip the limit with legitimate traffic.
  it('leaves a development Clerk instance unlimited', async () => {
    const { proxy, clerkRuns, loadBackendCallLimiter } = await proxyWith(
      new FakeRateLimiter([OVER_LIMIT]),
      'pk_test_x',
    );

    await proxy(
      ...proxyInvocation(
        'https://example.com/pricing?__clerk_handshake_nonce=x',
      ),
    );

    expect(loadBackendCallLimiter).not.toHaveBeenCalled();
    expect(clerkRuns).toHaveBeenCalledTimes(1);
  });

  it('reports a failing limiter and still hands the request to Clerk', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { proxy, clerkRuns } = await proxyWith(
      new FakeRateLimiter(new Error('database unavailable')),
    );

    await proxy(
      ...proxyInvocation(
        'https://example.com/pricing?__clerk_handshake_nonce=x',
      ),
    );

    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'clerk_backend_call_limiter_failed' }),
    );
    expect(clerkRuns).toHaveBeenCalledTimes(1);
  });

  // After the response, so a request never waits on the failing database.
  it('raises the limiter-failure alert through waitUntil', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const alertsLoaded = createDeferred<void>();
    const { proxy, alerts } = await proxyWith(
      new FakeRateLimiter(new Error('database unavailable')),
      'pk_live_x',
      alertsLoaded.promise,
    );
    const [request, event] = proxyInvocation(
      'https://example.com/pricing?__clerk_handshake_nonce=x',
    );

    // The response does not wait for the alert.
    await proxy(request, event);
    let settled = false;
    const afterResponse = getWaitUntilPromiseFromEvent(event)?.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    expect(alerts.raised).toEqual([]);

    // waitUntil holds the function open until the alert is raised.
    alertsLoaded.resolve();
    await afterResponse;
    expect(alerts.raised).toEqual([
      { kind: 'clerk_backend_call_limiter_failed', count: 1 },
    ]);
  });

  // DEBT-503 item 3: a cap trip is logged for diagnosis and alerts the owner,
  // after the response.
  it('logs a refusal by its limit and raises the refusal alert through waitUntil', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { proxy, alerts } = await proxyWith(
      new FakeRateLimiter([OVER_LIMIT]),
    );
    const [request, event] = proxyInvocation(
      'https://example.com/pricing?__clerk_handshake_nonce=x',
    );

    const response = await proxy(request, event);
    await getWaitUntilPromiseFromEvent(event);

    expect(response?.status).toBe(429);
    // The invocation carries no client address, so the site limit refuses.
    expect(warned).toHaveBeenCalledWith({
      event: 'clerk_backend_call_refused',
      limit: 'site',
    });
    expect(alerts.raised).toEqual([
      { kind: 'clerk_backend_calls_refused', count: 1 },
    ]);
  });

  it('raises no alert while the limiter works', async () => {
    const { proxy, alerts } = await proxyWith(
      new FakeRateLimiter([UNDER_LIMIT, UNDER_LIMIT, UNDER_LIMIT]),
    );
    const [request, event] = proxyInvocation(
      'https://example.com/pricing?__clerk_handshake_nonce=x',
    );

    await proxy(request, event);
    await getWaitUntilPromiseFromEvent(event);

    expect(alerts.raised).toEqual([]);
  });

  // DEBT-503 item 3: Clerk's middleware swallows Clerk failing its own calls,
  // and says so only in its auth reason. The owner hears of it after the
  // response; `lib/clerk-call-failures-sdk.test.ts` reads that reason from the
  // real middleware.
  function clerkFailed(reason: string) {
    return () => {
      const response = NextResponse.next();
      response.headers.set('x-clerk-auth-reason', reason);
      return response;
    };
  }

  it('alerts after the response when Clerk could not load its signing keys', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { proxy, alerts } = await proxyWith(
      new FakeRateLimiter(),
      'pk_live_x',
      Promise.resolve(),
      clerkFailed('jwk-remote-failed-to-load'),
    );
    const [request, event] = proxyInvocation();

    await proxy(request, event);
    await getWaitUntilPromiseFromEvent(event);

    expect(warned).toHaveBeenCalledWith({
      event: 'clerk_backend_call_failed',
      call: 'keys',
    });
    expect(alerts.raised).toEqual([
      { kind: 'clerk_backend_calls_refused', count: 1 },
    ]);
  });

  it('counts a refresh Clerk failed toward the alert threshold', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const limiter = new FakeRateLimiter();
    const { proxy, alerts } = await proxyWith(
      limiter,
      'pk_live_x',
      Promise.resolve(),
      clerkFailed('session-token-expired-refresh-too_many_requests'),
    );
    const [request, event] = proxyInvocation();

    await proxy(request, event);
    await getWaitUntilPromiseFromEvent(event);

    expect(limiter.inputs.map(({ key }) => key)).toEqual([
      'clerk-backend-call-failed:site',
    ]);
    expect(alerts.raised).toEqual([]);
  });

  it("leaves a development instance's Clerk failures unreported", async () => {
    const { proxy, alerts, loadBackendCallLimiter } = await proxyWith(
      new FakeRateLimiter(),
      'pk_test_x',
      Promise.resolve(),
      clerkFailed('jwk-remote-failed-to-load'),
    );
    const [request, event] = proxyInvocation();

    await proxy(request, event);
    await getWaitUntilPromiseFromEvent(event);

    expect(loadBackendCallLimiter).not.toHaveBeenCalled();
    expect(alerts.raised).toEqual([]);
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
