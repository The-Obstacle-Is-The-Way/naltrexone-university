import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { getWaitUntilPromiseFromEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { limitClerkBackendCalls } from '@/lib/clerk-backend-call-limit';
import {
  CLERK_BACKEND_CALL_SESSION_RATE_LIMIT,
  CLERK_BACKEND_CALL_SIGNED_IN_RATE_LIMIT,
  CLERK_BACKEND_CALL_SITE_RATE_LIMIT,
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

const ORIGINAL_ENV = snapshotProcessEnv();
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

// DEBT-503 item 4: a production instance's signing key, configured as item
// 5's CLERK_JWT_KEY, and a key Clerk never used.
const clerkKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CLERK_JWT_KEY = clerkKey.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString()
  .trim();

function signedSessionToken(
  privateKey: KeyObject,
  exp: number,
  sid = 'sess_a',
  alg = 'RS256',
): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg, typ: 'JWT' })}.${part({ exp, sid })}`;
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(unsigned),
    privateKey,
  ).toString('base64url');
  return `${unsigned}.${signature}`;
}
const genuine = (sid: string) =>
  signedSessionToken(clerkKey.privateKey, 1, sid);
const forged = (sid: string) => signedSessionToken(otherKey.privateKey, 1, sid);

// DEBT-503 item 4, step 2: with item 5's key, Clerk checks a session token's
// signature before its expiry, and refreshes only a token it signed. A forged
// one costs Clerk nothing, so only a genuine refresh counts, per address in
// a bucket of its own, wide enough for a shared network.
describe("limiting a session refresh with Clerk's signing key", () => {
  const refreshFrom = (cookie: string, url = 'https://example.com/pricing') => {
    const r = new NextRequest(url, { headers: { cookie } });
    // The header Vercel sets in production, which getClientIp reads first.
    r.headers.set('x-vercel-forwarded-for', '203.0.113.7');
    return r;
  };
  const limitWithKey = (
    r: NextRequest,
    limiter: FakeRateLimiter,
    refused: (limit: string) => void = () => {},
  ) =>
    limitClerkBackendCalls(
      r,
      async () => limiter,
      () => {},
      refused,
      CLERK_JWT_KEY,
    );

  it('counts a genuine refresh per address in its own bucket, then per session and site-wide', async () => {
    const limiter = new FakeRateLimiter([
      UNDER_LIMIT,
      UNDER_LIMIT,
      UNDER_LIMIT,
    ]);

    expect(
      await limitWithKey(
        refreshFrom(`__session=${genuine('sess_real')}; __refresh_abc=x`),
        limiter,
      ),
    ).toBeNull();
    expect(limiter.inputs).toEqual([
      {
        key: 'clerk-backend-call:signed-in:203.0.113.7',
        ...CLERK_BACKEND_CALL_SIGNED_IN_RATE_LIMIT,
      },
      {
        key: 'clerk-backend-call:signed-in-session:sess_real',
        ...CLERK_BACKEND_CALL_SESSION_RATE_LIMIT,
      },
      { key: 'clerk-backend-call:site', ...CLERK_BACKEND_CALL_SITE_RATE_LIMIT },
    ]);
  });

  // A forged token costs Clerk nothing, but the proxy could misread a cookie
  // Clerk reads, so a token it cannot tie to Clerk counts as before.
  it('counts a refresh whose token Clerk did not sign as before', async () => {
    const limiter = new FakeRateLimiter([
      UNDER_LIMIT,
      UNDER_LIMIT,
      UNDER_LIMIT,
    ]);

    await limitWithKey(
      refreshFrom(`__session=${forged('sess_forged')}; __refresh_abc=x`),
      limiter,
    );

    expect(limiter.inputs.map(({ key }) => key)).toEqual([
      'clerk-backend-call:203.0.113.7',
      'clerk-backend-call:session:sess_forged',
      'clerk-backend-call:site',
    ]);
  });

  // Requests that name a session without Clerk's signature cannot fill that
  // session's signed-in bucket.
  it("keeps a forged token's count apart from the signed-in session it names", async () => {
    const limiter = new FakeRateLimiter([
      UNDER_LIMIT,
      UNDER_LIMIT,
      UNDER_LIMIT,
      UNDER_LIMIT,
      UNDER_LIMIT,
      UNDER_LIMIT,
    ]);

    await limitWithKey(
      refreshFrom(`__session=${forged('sess_victim')}; __refresh_abc=x`),
      limiter,
    );
    await limitWithKey(
      refreshFrom(`__session=${genuine('sess_victim')}; __refresh_abc=x`),
      limiter,
    );

    const sessionKeys = limiter.inputs
      .map(({ key }) => key)
      .filter((key) => key.includes('sess_victim'));
    expect(sessionKeys).toEqual([
      'clerk-backend-call:session:sess_victim',
      'clerk-backend-call:signed-in-session:sess_victim',
    ]);
  });

  // Clerk keeps the first of two cookies with one name, and trims spaces and
  // tabs, where Next's parser keeps the last and trims nothing.
  it.each([
    [
      'a genuine session before a forged one of the same name',
      () =>
        `__session=${genuine('sess_real')}; __session=${forged('sess_forged')}; __refresh_abc=x`,
    ],
    [
      'a genuine session after a space',
      () => `__session= ${genuine('sess_real')}; __refresh_abc=x`,
    ],
    [
      'a genuine session after a tab',
      () =>
        `__client_uat=1;\t__session=${genuine('sess_real')}; __refresh_abc=x`,
    ],
    [
      'a refresh cookie that does not percent-decode',
      () => `__session=${genuine('sess_real')}; __refresh_abc=%`,
    ],
  ])('reads %s as Clerk does', async (_kind, cookie) => {
    const limiter = new FakeRateLimiter([
      UNDER_LIMIT,
      UNDER_LIMIT,
      UNDER_LIMIT,
    ]);

    await limitWithKey(refreshFrom(cookie()), limiter);

    expect(limiter.inputs.map(({ key }) => key)).toEqual([
      'clerk-backend-call:signed-in:203.0.113.7',
      'clerk-backend-call:signed-in-session:sess_real',
      'clerk-backend-call:site',
    ]);
  });

  // Clerk reads the suffixed cookie or the plain one, as it decides; a forged
  // token beside a genuine one must not hide the genuine one's refresh.
  it('counts a genuine session beside a forged one', async () => {
    const limiter = new FakeRateLimiter([
      UNDER_LIMIT,
      UNDER_LIMIT,
      UNDER_LIMIT,
    ]);

    await limitWithKey(
      refreshFrom(
        `__session=${forged('sess_forged')}; __session_abc=${genuine('sess_real')}; __refresh_abc=x`,
      ),
      limiter,
    );

    expect(limiter.inputs.map(({ key }) => key)).toEqual([
      'clerk-backend-call:signed-in:203.0.113.7',
      'clerk-backend-call:signed-in-session:sess_real',
      'clerk-backend-call:site',
    ]);
  });

  // Clerk signs session tokens with RS256 only; any other token is counted
  // as before, since the proxy cannot tell what Clerk would do with it.
  it('counts a token it cannot check as before', async () => {
    const limiter = new FakeRateLimiter([
      UNDER_LIMIT,
      UNDER_LIMIT,
      UNDER_LIMIT,
    ]);
    const unchecked = signedSessionToken(
      otherKey.privateKey,
      1,
      'sess_other',
      'RS512',
    );

    await limitWithKey(
      refreshFrom(`__session=${unchecked}; __refresh_abc=x`),
      limiter,
    );

    expect(limiter.inputs.map(({ key }) => key)).toEqual([
      'clerk-backend-call:203.0.113.7',
      'clerk-backend-call:session:sess_other',
      'clerk-backend-call:site',
    ]);
  });

  // Only Clerk can check a handshake nonce, so a handshake keeps the narrow
  // per-address limit even beside a genuine session.
  it('keeps a handshake on the per-address limit', async () => {
    const limiter = new FakeRateLimiter([
      UNDER_LIMIT,
      UNDER_LIMIT,
      UNDER_LIMIT,
    ]);

    await limitWithKey(
      refreshFrom(
        `__session=${genuine('sess_real')}; __refresh_abc=x`,
        'https://example.com/pricing?__clerk_handshake_nonce=x',
      ),
      limiter,
    );

    expect(limiter.inputs.map(({ key }) => key)).toEqual([
      'clerk-backend-call:203.0.113.7',
      'clerk-backend-call:session:sess_real',
      'clerk-backend-call:site',
    ]);
  });

  it.each([
    ['signed-in-address', [OVER_LIMIT]],
    ['signed-in-session', [UNDER_LIMIT, OVER_LIMIT]],
    ['site', [UNDER_LIMIT, UNDER_LIMIT, OVER_LIMIT]],
  ] as const)(
    'names the %s limit when it refuses a genuine refresh',
    async (limit, answers) => {
      const refused: string[] = [];

      const response = await limitWithKey(
        refreshFrom(`__session=${genuine('sess_busy')}; __refresh_abc=x`),
        new FakeRateLimiter([...answers]),
        (tripped) => refused.push(tripped),
      );

      expect(response?.status).toBe(429);
      expect(refused).toEqual([limit]);
    },
  );
});

describe('proxy with limits only sessions Clerk signed can fill', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function proxyWith(limiter: FakeRateLimiter) {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_live_x';
    process.env.CLERK_JWT_KEY = CLERK_JWT_KEY;
    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware: () => async () => NextResponse.next(),
      createRouteMatcher: () => () => true,
    }));
    const alerts = new FakeOperationalAlerts();
    const { createProxy } = await import('./proxy');
    return {
      proxy: createProxy({
        loadBackendCallLimiter: async () => limiter,
        loadOperationalAlerts: async () => alerts,
      }),
      alerts,
    };
  }

  // DEBT-503 item 4, step 3: only sessions Clerk signed fill an address's
  // signed-in bucket, so a refusal there turned away people on a shared
  // network; the response is raising that limit. One session over its own
  // limit is logged only: any account can trip it at will, and its alert
  // would spend the cooldown of the address's.
  it.each([
    [
      'signed-in-address',
      [OVER_LIMIT],
      [{ kind: 'clerk_signed_in_limit_reached', count: 1 }],
    ],
    ['signed-in-session', [UNDER_LIMIT, OVER_LIMIT], []],
  ] as const)(
    'logs a %s refusal of a genuine refresh, and alerts only for an address',
    async (limit, answers, raised) => {
      const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { proxy, alerts } = await proxyWith(
        new FakeRateLimiter([...answers]),
      );
      const [request, event] = proxyInvocation('https://example.com/pricing');
      request.headers.set('x-vercel-forwarded-for', '203.0.113.7');
      request.cookies.set('__session', genuine('sess_busy'));
      request.cookies.set('__refresh_abc', 'x');

      const response = await proxy(request, event);
      await getWaitUntilPromiseFromEvent(event);

      expect(response?.status).toBe(429);
      expect(warned).toHaveBeenCalledWith({
        event: 'clerk_backend_call_refused',
        limit,
      });
      expect(alerts.raised).toEqual(raised);
    },
  );
});
