import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
const FRONTEND_API = 'clerk.example.com';
const PUBLISHABLE_KEY = `pk_live_${Buffer.from(`${FRONTEND_API}$`).toString('base64')}`;
// Clerk names the refresh cookie with a suffix derived from the publishable key.
const REFRESH_COOKIE = `__refresh_${createHash('sha1')
  .update(PUBLISHABLE_KEY)
  .digest('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .slice(0, 8)}`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// A production instance's signing key, its public half as Clerk's keys
// endpoint serves it, and a session token it signed that expired a minute ago.
function signingKey() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const kid = `ins_${crypto.randomUUID()}`;
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT', kid })}.${part({
    sid: 'sess_sdk',
    sub: 'user_sdk',
    iss: `https://${FRONTEND_API}`,
    azp: 'https://example.com',
    iat: now - 120,
    nbf: now - 130,
    exp: now - 60,
  })}`;
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(unsigned),
    privateKey,
  ).toString('base64url');
  return {
    keys: {
      keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' }],
    },
    expiredToken: `${unsigned}.${signature}`,
  };
}

// Runs the proxy over the real Clerk middleware, answering Clerk's Backend API
// as a healthy instance would, and records every call Clerk makes.
async function throughTheProxy(
  headers: Record<string, string>,
  keys: { keys: unknown[] },
) {
  process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
  process.env.CLERK_SECRET_KEY = 'sk_live_sdk';
  const paths: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = new URL(input instanceof Request ? input.url : String(input))
      .pathname;
    paths.push(path);
    if (path === '/v1/jwks') return json(200, keys);
    return json(401, { errors: [{ code: 'unauthorized', message: 'no' }] });
  });
  const { createProxy } = await import('./proxy');
  const proxy = createProxy({
    loadBackendCallLimiter: async () => new FakeRateLimiter(),
    loadOperationalAlerts: async () => new FakeOperationalAlerts(),
  });
  const request = new NextRequest('https://example.com/app/dashboard', {
    headers: { accept: 'application/json', ...headers },
  });
  const response = await proxy(
    request,
    new NextFetchEvent({ request, page: '/', context: undefined }),
  );
  return { response, paths };
}

// BUG-369, against the installed SDK: each Authorization header shape that
// would make Clerk call its Backend API is refused before Clerk sees it.
describe('the proxy and the real Clerk middleware', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.restoreAllMocks();
    // Clerk caches its signing keys per module instance.
    vi.resetModules();
  });

  // The same token in the session cookie does reach Clerk's refresh, so the
  // cases below show the proxy refusing, not the harness missing Clerk.
  it('lets an expired session cookie with a refresh cookie reach Clerk', async () => {
    const key = signingKey();

    const { paths } = await throughTheProxy(
      {
        // Well before the token's issue time, as a signed-in client's is.
        cookie: `__session=${key.expiredToken}; __client_uat=${Math.floor(Date.now() / 1000) - 600}; ${REFRESH_COOKIE}=refresh`,
      },
      key.keys,
    );

    expect(paths).toContain('/v1/sessions/sess_sdk/refresh');
  });

  it('refuses a genuine expired session token in the header, with no Clerk call', async () => {
    const key = signingKey();

    const { response, paths } = await throughTheProxy(
      {
        authorization: `Bearer ${key.expiredToken}`,
        cookie: `${REFRESH_COOKIE}=refresh`,
      },
      key.keys,
    );

    expect(response?.status).toBe(401);
    expect(paths).toEqual([]);
  });

  it.each(['ak_', 'mt_', 'oat_'])(
    'refuses a %s machine token in the header, with no Clerk call',
    async (prefix) => {
      const { response, paths } = await throughTheProxy(
        { authorization: `Bearer ${prefix}${'x'.repeat(32)}` },
        signingKey().keys,
      );

      expect(response?.status).toBe(401);
      expect(paths).toEqual([]);
    },
  );
});
