import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import { clerkCallFailure } from './clerk-call-failures';

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

type ClerkApiAnswer = (path: string) => Response | undefined;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
// The body of Clerk's 429 is undocumented; the refresh reason carries its code.
const refused = () =>
  json(429, { errors: [{ code: 'too_many_requests', message: 'Too many' }] });

// A production instance's signing key, its public half as Clerk's keys
// endpoint serves it, and a session token it signed.
function signingKey() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const kid = `ins_${crypto.randomUUID()}`;
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    keys: {
      keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' }],
    },
    token(expiresInSeconds: number) {
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${part({ alg: 'RS256', typ: 'JWT', kid })}.${part({
        sid: 'sess_sdk',
        sub: 'user_sdk',
        iss: `https://${FRONTEND_API}`,
        iat: now - 120,
        nbf: now - 130,
        exp: now + expiresInSeconds,
      })}`;
      const signature = sign(
        'RSA-SHA256',
        Buffer.from(unsigned),
        privateKey,
      ).toString('base64url');
      return `${unsigned}.${signature}`;
    },
  };
}

// Runs the real Clerk middleware for a document request, answering its
// Backend API calls by path.
async function clerkAnswerTo(
  url: string,
  cookie: string,
  answer: ClerkApiAnswer,
) {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
  process.env.CLERK_SECRET_KEY = 'sk_live_sdk';
  const paths: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = new URL(input instanceof Request ? input.url : String(input))
      .pathname;
    paths.push(path);
    return answer(path) ?? json(500, { errors: [] });
  });
  const { clerkMiddleware } = await import('@clerk/nextjs/server');
  const request = new NextRequest(url, {
    headers: { cookie, accept: 'text/html', 'sec-fetch-dest': 'document' },
  });
  const response = await clerkMiddleware()(
    request,
    new NextFetchEvent({ request, page: '/', context: undefined }),
  );
  if (!response) throw new Error('Clerk middleware gave no answer');
  return { request, response, paths };
}

function signedInCookies(token: string) {
  const now = Math.floor(Date.now() / 1000);
  return `__session=${token}; __client_uat=${now - 120}; ${REFRESH_COOKIE}=refresh_sdk`;
}

// DEBT-503 item 3, against the installed SDK: each failure is read from the
// answer the real Clerk middleware gives when Clerk refuses that call.
describe('Clerk calls the real middleware fails silently', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.restoreAllMocks();
    // Clerk caches its signing keys per module instance.
    vi.resetModules();
  });

  // Clerk documents no rate limit for its keys endpoint, so this fails only
  // in an outage or a network failure.
  it('names a failed signing-key fetch, which leaves a signed-in visitor signed out', async () => {
    const key = signingKey();

    const { request, response, paths } = await clerkAnswerTo(
      'https://example.com/app/dashboard',
      signedInCookies(key.token(60)),
      (path) => (path === '/v1/jwks' ? json(503, { errors: [] }) : undefined),
    );

    expect(paths).toContain('/v1/jwks');
    expect(response.headers.get('x-clerk-auth-status')).toBe('signed-out');
    expect(clerkCallFailure(request, response)).toBe('keys');
  });

  it('names a refused refresh, which redirects through a handshake', async () => {
    const key = signingKey();

    const { request, response, paths } = await clerkAnswerTo(
      'https://example.com/app/dashboard',
      signedInCookies(key.token(-60)),
      (path) => {
        if (path === '/v1/jwks') return json(200, key.keys);
        if (path === '/v1/sessions/sess_sdk/refresh') return refused();
        return undefined;
      },
    );

    expect(paths).toContain('/v1/sessions/sess_sdk/refresh');
    expect(response.headers.get('x-clerk-auth-status')).toBe('handshake');
    expect(clerkCallFailure(request, response)).toBe('refresh');
  });

  it('names a refused handshake nonce lookup, which signs the visitor out', async () => {
    const { request, response, paths } = await clerkAnswerTo(
      'https://example.com/app/dashboard?__clerk_handshake_nonce=nonce_sdk',
      '',
      (path) =>
        path === '/v1/clients/handshake_payload' ? refused() : undefined,
    );

    expect(paths).toEqual(['/v1/clients/handshake_payload']);
    expect(response.headers.get('x-clerk-auth-status')).toBe('signed-out');
    expect(clerkCallFailure(request, response)).toBe('handshake');
  });

  it('names nothing for a nonce lookup that answers a signed-out client', async () => {
    const { request, response } = await clerkAnswerTo(
      'https://example.com/app/dashboard?__clerk_handshake_nonce=nonce_sdk',
      '',
      (path) =>
        path === '/v1/clients/handshake_payload'
          ? json(200, {
              directives: [
                '__client_uat=0; Path=/; Domain=example.com; Secure; SameSite=Lax',
              ],
            })
          : undefined,
    );

    expect(response.headers.get('x-clerk-auth-status')).toBe('signed-out');
    expect(clerkCallFailure(request, response)).toBeNull();
  });

  it('names nothing for a signed-in visitor', async () => {
    const key = signingKey();

    const { request, response } = await clerkAnswerTo(
      'https://example.com/app/dashboard',
      signedInCookies(key.token(60)),
      (path) => (path === '/v1/jwks' ? json(200, key.keys) : undefined),
    );

    // A signed-in answer passes its state on in the forwarded request headers.
    expect(
      response.headers.get('x-middleware-request-x-clerk-auth-status'),
    ).toBe('signed-in');
    expect(clerkCallFailure(request, response)).toBeNull();
  });
});
