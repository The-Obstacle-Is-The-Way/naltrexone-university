import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import {
  limitClerkBackendCalls,
  triggersClerkBackendCall,
} from './clerk-backend-call-limit';

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

// The instance's signing key, configured as CLERK_JWT_KEY, and a key Clerk
// never used.
const clerkKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CLERK_JWT_KEY = clerkKey.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString()
  .trim();

// A session token that expired a minute ago, signed with the given key.
function expiredSessionToken(privateKey: typeof clerkKey.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT', kid: 'ins_sdk' })}.${part(
    {
      sid: 'sess_sdk',
      sub: 'user_sdk',
      iss: `https://${FRONTEND_API}`,
      azp: 'https://example.com',
      iat: now - 180,
      nbf: now - 190,
      exp: now - 60,
    },
  )}`;
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(unsigned),
    privateKey,
  ).toString('base64url');
  return `${unsigned}.${signature}`;
}

const now = () => Math.floor(Date.now() / 1000);
const refreshCookies = (token: string) =>
  `__session=${token}; __client_uat=${now() - 600}; ${REFRESH_COOKIE}=refresh_sdk`;

// Runs the real Clerk middleware, with the key, on a page load carrying the
// cookies, and returns the Backend API paths it called beside what BUG-323's
// limiter counted for the same request.
async function clerkAndLimiterOn(cookie: string, method = 'GET') {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
  process.env.CLERK_SECRET_KEY = 'sk_live_sdk';
  const paths: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    paths.push(
      new URL(input instanceof Request ? input.url : String(input)).pathname,
    );
    return new Response(JSON.stringify({ errors: [] }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  });
  const request = new NextRequest('https://example.com/app/dashboard', {
    method,
    headers: {
      cookie,
      accept: 'text/html',
      'sec-fetch-dest': 'document',
      'x-vercel-forwarded-for': '203.0.113.7',
    },
  });
  const limiter = new FakeRateLimiter();
  if (triggersClerkBackendCall(request)) {
    await limitClerkBackendCalls(
      request,
      async () => limiter,
      () => {},
      () => {},
      CLERK_JWT_KEY,
    );
  }
  const { clerkMiddleware } = await import('@clerk/nextjs/server');
  await clerkMiddleware({ jwtKey: CLERK_JWT_KEY })(
    request,
    new NextFetchEvent({ request, page: '/', context: undefined }),
  );
  return { paths, counted: limiter.inputs.map(({ key }) => key) };
}

// DEBT-503 item 4, step 2, against the installed SDK: the limiter counts a
// refresh exactly when Clerk's middleware, given the same key, calls its
// Backend API to make it.
describe("BUG-323's limiter and Clerk's middleware, with Clerk's key", () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const SIGNED_IN = [
    'clerk-backend-call:signed-in-session:sess_sdk',
    'clerk-backend-call:signed-in:203.0.113.7',
    'clerk-backend-call:site',
  ];

  it('counts a refresh of a token Clerk signed in its signed-in buckets, and Clerk makes it', async () => {
    const { paths, counted } = await clerkAndLimiterOn(
      refreshCookies(expiredSessionToken(clerkKey.privateKey)),
    );

    expect(paths).toEqual(['/v1/sessions/sess_sdk/refresh']);
    expect(counted).toEqual(SIGNED_IN);
  });

  // Clerk decodes a signature strictly but for padding, so any it accepts
  // reads the same to the limiter.
  it('counts a refresh of a padded signature Clerk accepts in its signed-in buckets', async () => {
    const { paths, counted } = await clerkAndLimiterOn(
      refreshCookies(`${expiredSessionToken(clerkKey.privateKey)}==`),
    );

    expect(paths).toEqual(['/v1/sessions/sess_sdk/refresh']);
    expect(counted).toEqual(SIGNED_IN);
  });

  // Clerk reads a token as a JWT only with exactly three segments.
  it('counts a signed token with an extra segment as before, for which Clerk calls nothing', async () => {
    const { paths, counted } = await clerkAndLimiterOn(
      refreshCookies(`${expiredSessionToken(clerkKey.privateKey)}.extra`),
    );

    expect(paths).toEqual([]);
    expect(counted).toEqual([
      'clerk-backend-call:203.0.113.7',
      'clerk-backend-call:session:sess_sdk',
      'clerk-backend-call:site',
    ]);
  });

  // It costs Clerk nothing, but stays within the limits for anonymous traffic.
  it('counts a forged token as before, for which Clerk calls nothing', async () => {
    const { paths, counted } = await clerkAndLimiterOn(
      refreshCookies(expiredSessionToken(otherKey.privateKey)),
    );

    expect(paths).toEqual([]);
    expect(counted).toEqual([
      'clerk-backend-call:203.0.113.7',
      'clerk-backend-call:session:sess_sdk',
      'clerk-backend-call:site',
    ]);
  });

  // Cookie headers Clerk's parser and Next's read differently (DEBT-503 item
  // 4's review): every one Clerk calls its Backend API for is counted.
  it.each([
    [
      'a genuine session before a forged one of the same name',
      () =>
        `__session=${expiredSessionToken(clerkKey.privateKey)}; ${refreshCookies(expiredSessionToken(otherKey.privateKey))}`,
      SIGNED_IN,
    ],
    [
      'a genuine session after a space',
      () => refreshCookies(` ${expiredSessionToken(clerkKey.privateKey)}`),
      SIGNED_IN,
    ],
    [
      'a genuine session after a tab',
      () =>
        `__client_uat=${now() - 600};\t__session=${expiredSessionToken(clerkKey.privateKey)}; ${REFRESH_COOKIE}=refresh_sdk`,
      SIGNED_IN,
    ],
    [
      'a refresh cookie that does not percent-decode',
      () =>
        `__session=${expiredSessionToken(clerkKey.privateKey)}; __client_uat=${now() - 600}; ${REFRESH_COOKIE}=%`,
      SIGNED_IN,
    ],
  ])('counts %s', async (_kind, cookie, expected) => {
    const { paths, counted } = await clerkAndLimiterOn(cookie());

    expect(paths).toEqual(['/v1/sessions/sess_sdk/refresh']);
    expect(counted).toEqual(expected);
  });

  it.each([
    ['that does not percent-decode', '__clerk_handshake_nonce=%'],
    ['with a space before its equals sign', '__clerk_handshake_nonce =nonce'],
  ])('counts a handshake nonce cookie %s', async (_kind, cookie) => {
    const { paths, counted } = await clerkAndLimiterOn(cookie, 'POST');

    expect(paths).toEqual(['/v1/clients/handshake_payload']);
    expect(counted).toEqual([
      'clerk-backend-call:203.0.113.7',
      'clerk-backend-call:site',
    ]);
  });
});
