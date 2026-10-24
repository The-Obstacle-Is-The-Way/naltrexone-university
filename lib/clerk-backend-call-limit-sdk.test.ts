import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import { limitClerkBackendCalls } from './clerk-backend-call-limit';

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

// Runs the real Clerk middleware, with the key, for a page load that carries
// the token and a refresh cookie, and returns the Backend API paths it
// called beside what BUG-323's limiter counted for the same request.
async function clerkAndLimiterOn(token: string) {
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
  const now = Math.floor(Date.now() / 1000);
  const request = new NextRequest('https://example.com/app/dashboard', {
    headers: {
      cookie: `__session=${token}; __client_uat=${now - 600}; ${REFRESH_COOKIE}=refresh_sdk`,
      accept: 'text/html',
      'sec-fetch-dest': 'document',
      'x-vercel-forwarded-for': '203.0.113.7',
    },
  });
  const limiter = new FakeRateLimiter();
  await limitClerkBackendCalls(
    request,
    async () => limiter,
    () => {},
    () => {},
    CLERK_JWT_KEY,
  );
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

  it('counts a refresh of a token Clerk signed, which Clerk makes', async () => {
    const { paths, counted } = await clerkAndLimiterOn(
      expiredSessionToken(clerkKey.privateKey),
    );

    expect(paths).toEqual(['/v1/sessions/sess_sdk/refresh']);
    expect(counted).toEqual([
      'clerk-backend-call:signed-in:203.0.113.7',
      'clerk-backend-call:session:sess_sdk',
      'clerk-backend-call:site',
    ]);
  });

  // Clerk decodes a signature strictly but for padding, so any it accepts
  // reads the same to the limiter.
  it('counts a refresh of a token Clerk signed whose signature is padded', async () => {
    const { paths, counted } = await clerkAndLimiterOn(
      `${expiredSessionToken(clerkKey.privateKey)}==`,
    );

    expect(paths).toEqual(['/v1/sessions/sess_sdk/refresh']);
    expect(counted).toContain('clerk-backend-call:session:sess_sdk');
  });

  it('counts nothing for a forged token, for which Clerk calls nothing', async () => {
    const { paths, counted } = await clerkAndLimiterOn(
      expiredSessionToken(otherKey.privateKey),
    );

    expect(paths).toEqual([]);
    expect(counted).toEqual([]);
  });
});
