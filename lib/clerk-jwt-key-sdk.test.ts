import { generateKeyPairSync, sign } from 'node:crypto';
import { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import { parseClerkJwtKey } from './clerk-jwt-key';

vi.mock('server-only', () => ({}));

const ORIGINAL_ENV = snapshotProcessEnv();
const FRONTEND_API = 'clerk.example.com';

function signingKey() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    pem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    token() {
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${part({ alg: 'RS256', typ: 'JWT', kid: 'ins_sdk' })}.${part(
        {
          sid: 'sess_sdk',
          sub: 'user_sdk',
          iss: `https://${FRONTEND_API}`,
          iat: now - 10,
          nbf: now - 20,
          exp: now + 60,
        },
      )}`;
      return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
    },
  };
}

// Runs the real Clerk middleware with the configured key, counting every
// call it makes to Clerk.
async function verifyWith(jwtKey: string, token: string) {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = `pk_live_${Buffer.from(`${FRONTEND_API}$`).toString('base64')}`;
  process.env.CLERK_SECRET_KEY = 'sk_live_sdk';
  const fetched = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(null, { status: 500 }));
  const { clerkMiddleware } = await import('@clerk/nextjs/server');
  const now = Math.floor(Date.now() / 1000);
  const request = new NextRequest('https://example.com/app/dashboard', {
    headers: {
      cookie: `__session=${token}; __client_uat=${now - 10}`,
      accept: 'text/html',
      'sec-fetch-dest': 'document',
    },
  });
  const response = await clerkMiddleware({ jwtKey })(
    request,
    new NextFetchEvent({ request, page: '/', context: undefined }),
  );
  if (!response) throw new Error('Clerk middleware gave no answer');
  return { response, clerkCalls: fetched.mock.calls.length };
}

// DEBT-503 item 5, against the installed SDK.
describe('a configured Clerk JWT key', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('verifies a signed-in visitor without calling Clerk', async () => {
    const key = signingKey();
    const jwtKey = parseClerkJwtKey(key.pem.trim().replaceAll('\n', '\\n'));
    if (!jwtKey) throw new Error('Expected a parsed key');

    const { response, clerkCalls } = await verifyWith(jwtKey, key.token());

    expect(
      response.headers.get('x-middleware-request-x-clerk-auth-status'),
    ).toBe('signed-in');
    expect(clerkCalls).toBe(0);
  });

  // The risk of a static key: one that is not Clerk's signs every visitor
  // out, with this reason, which item 3's detector counts.
  it('signs a visitor out, with an invalid signature, when it is not the signing key', async () => {
    const jwtKey = parseClerkJwtKey(signingKey().pem);
    if (!jwtKey) throw new Error('Expected a parsed key');

    const { response, clerkCalls } = await verifyWith(
      jwtKey,
      signingKey().token(),
    );

    expect(response.headers.get('x-clerk-auth-status')).toBe('signed-out');
    expect(response.headers.get('x-clerk-auth-reason')).toBe(
      'token-invalid-signature',
    );
    expect(clerkCalls).toBe(0);
  });
});
