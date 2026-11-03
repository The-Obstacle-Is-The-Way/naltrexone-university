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
// Clerk names its suffixed cookies with a suffix derived from the publishable
// key.
const SUFFIX = createHash('sha1')
  .update(PUBLISHABLE_KEY)
  .digest('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .slice(0, 8);
const REFRESH_COOKIE = `__refresh_${SUFFIX}`;

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
  return sessionToken(privateKey, { issuedSecondsAgo: 180 });
}

// A session token issued the given number of seconds ago, valid for two
// minutes unless told otherwise, signed with the given key.
function sessionToken(
  privateKey: typeof clerkKey.privateKey,
  {
    issuedSecondsAgo,
    validSeconds = 120,
    issuer = `https://${FRONTEND_API}`,
  }: { issuedSecondsAgo: number; validSeconds?: number; issuer?: string },
) {
  const now = Math.floor(Date.now() / 1000);
  const iat = now - issuedSecondsAgo;
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT', kid: 'ins_sdk' })}.${part(
    {
      sid: 'sess_sdk',
      sub: 'user_sdk',
      ...(issuer ? { iss: issuer } : {}),
      azp: 'https://example.com',
      iat,
      nbf: iat - 10,
      exp: iat + validSeconds,
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
// cookies and any other headers, and returns the Backend API paths it called
// beside what BUG-323's limiter counted for the same request.
async function clerkAndLimiterOn(
  cookie: string,
  method = 'GET',
  headers: Record<string, string> = {},
) {
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
      ...headers,
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
      PUBLISHABLE_KEY,
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

  // BUG-374: a returning visitor's first page load refreshes the suffixed
  // session cookie, the one Clerk reads, and leaves the plain one expired
  // until Clerk's browser script rewrites it. The page's other requests in
  // that time cost Clerk nothing.
  describe('beside an expired plain session', () => {
    const genuine = (options: {
      issuedSecondsAgo: number;
      validSeconds?: number;
      issuer?: string;
    }) => sessionToken(clerkKey.privateKey, options);
    const signedIn = String(now() - 600);
    const returning = ({
      plain = expiredSessionToken(clerkKey.privateKey),
      plainUat = signedIn,
      suffixed = genuine({ issuedSecondsAgo: 1 }),
      suffix = SUFFIX,
      suffixedUat = signedIn,
    }: {
      plain?: string;
      plainUat?: string;
      suffixed?: string;
      suffix?: string;
      suffixedUat?: string | null;
    } = {}) =>
      [
        `__session=${plain}`,
        `__client_uat=${plainUat}`,
        `__session_${suffix}=${suffixed}`,
        ...(suffixedUat === null
          ? []
          : [`__client_uat_${suffix}=${suffixedUat}`]),
        `${REFRESH_COOKIE}=refresh_sdk`,
      ].join('; ');

    it.each([
      ['a current suffixed session', () => returning()],
      [
        'a current suffixed session issued in the same second',
        () =>
          returning({
            plain: genuine({ issuedSecondsAgo: 1, validSeconds: -60 }),
          }),
      ],
      [
        'a current suffixed session, both client cookies saying "0"',
        () => returning({ plainUat: '0', suffixedUat: '0' }),
      ],
    ])('counts nothing for %s, which Clerk reads', async (_kind, cookie) => {
      const { paths, counted } = await clerkAndLimiterOn(cookie());

      expect(paths).toEqual([]);
      expect(counted).toEqual([]);
    });

    // Clerk reads the plain session instead, refreshes it, and the limiter
    // must count that.
    it.each([
      [
        'a suffixed session Clerk cannot decode',
        () => returning({ suffixed: `${genuine({ issuedSecondsAgo: 1 })}!` }),
      ],
      [
        'a current session under another suffix',
        () => returning({ suffix: 'decoy123' }),
      ],
      ['no suffixed client cookie', () => returning({ suffixedUat: null })],
      ['an empty suffixed client cookie', () => returning({ suffixedUat: '' })],
      [
        'a suffixed client cookie saying "0"',
        () => returning({ suffixedUat: '0' }),
      ],
      [
        'a plain session issued later',
        () =>
          returning({
            plain: genuine({ issuedSecondsAgo: 70, validSeconds: 60 }),
            suffixed: genuine({ issuedSecondsAgo: 80, validSeconds: 600 }),
          }),
      ],
      [
        'a plain session without an issuer',
        () =>
          returning({
            plain: genuine({ issuedSecondsAgo: 180, issuer: '' }),
          }),
      ],
    ])('counts a refresh beside %s', async (_kind, cookie) => {
      const { paths, counted } = await clerkAndLimiterOn(cookie());

      expect(paths).toEqual(['/v1/sessions/sess_sdk/refresh']);
      expect(counted).toEqual(SIGNED_IN);
    });

    // Neither costs Clerk a call, but the limiter counts each as before: one
    // token Clerk did not sign, and a reverse no check has seen.
    it.each([
      [
        'a current suffixed session Clerk did not sign',
        () =>
          returning({
            suffixed: sessionToken(otherKey.privateKey, {
              issuedSecondsAgo: 1,
            }),
          }),
      ],
      [
        'an expired suffixed session beside a newer current plain one',
        () =>
          returning({
            plain: genuine({ issuedSecondsAgo: 1 }),
            suffixed: expiredSessionToken(clerkKey.privateKey),
          }),
      ],
    ])('still counts %s', async (_kind, cookie) => {
      const { paths, counted } = await clerkAndLimiterOn(cookie());

      expect(paths).toEqual([]);
      expect(counted).toEqual(SIGNED_IN);
    });

    // Clerk also refreshes a token sent in an Authorization header. The proxy
    // refuses that header before the limiter (BUG-369); the limiter does not
    // rely on it.
    it('counts a refresh of an expired token in an Authorization header', async () => {
      const { paths, counted } = await clerkAndLimiterOn(returning(), 'GET', {
        authorization: `Bearer ${expiredSessionToken(clerkKey.privateKey)}`,
      });

      expect(paths).toEqual(['/v1/sessions/sess_sdk/refresh']);
      expect(counted).toEqual(SIGNED_IN);
    });

    // Against a Clerk upgrade that changes which cookie it reads: across the
    // shapes each condition turns on, wherever Clerk calls its Backend API,
    // the limiter counts.
    it('leaves no Backend API call uncounted, across session and client cookies', async () => {
      const plains = {
        none: undefined,
        expired: expiredSessionToken(clerkKey.privateKey),
        current: genuine({ issuedSecondsAgo: 1 }),
        'expired, forged': expiredSessionToken(otherKey.privateKey),
        'expired, undecodable': `${expiredSessionToken(clerkKey.privateKey)}!`,
        'expired, no issuer': genuine({ issuedSecondsAgo: 180, issuer: '' }),
        'expired, issued later': genuine({
          issuedSecondsAgo: 70,
          validSeconds: 60,
        }),
      };
      const suffixeds = {
        none: undefined,
        current: genuine({ issuedSecondsAgo: 1 }),
        expired: expiredSessionToken(clerkKey.privateKey),
        'current, forged': sessionToken(otherKey.privateKey, {
          issuedSecondsAgo: 1,
        }),
        'current, undecodable': `${genuine({ issuedSecondsAgo: 1 })}!`,
        'current, issued earlier': genuine({
          issuedSecondsAgo: 80,
          validSeconds: 600,
        }),
      };
      const clientUats = [undefined, '', '0', signedIn];
      const uncounted: string[] = [];
      let skipped = 0;

      for (const [plainKind, plain] of Object.entries(plains))
        for (const [suffixedKind, suffixed] of Object.entries(suffixeds))
          for (const plainUat of clientUats)
            for (const suffixedUat of clientUats)
              for (const suffix of [SUFFIX, 'decoy123']) {
                const cookie = [
                  plain && `__session=${plain}`,
                  plainUat !== undefined && `__client_uat=${plainUat}`,
                  suffixed && `__session_${suffix}=${suffixed}`,
                  suffixedUat !== undefined &&
                    `__client_uat_${suffix}=${suffixedUat}`,
                  `${REFRESH_COOKIE}=refresh_sdk`,
                ]
                  .filter(Boolean)
                  .join('; ');
                const { paths, counted } = await clerkAndLimiterOn(cookie);
                if (paths.length > 0 && counted.length === 0)
                  uncounted.push(
                    `plain ${plainKind} (${plainUat}), suffixed ${suffixedKind} (${suffixedUat}) under ${suffix}`,
                  );
                if (
                  plain &&
                  plainKind.startsWith('expired') &&
                  counted.length === 0
                )
                  skipped += 1;
              }

      expect(uncounted).toEqual([]);
      // The exception does apply somewhere in the table.
      expect(skipped).toBeGreaterThan(0);
    });
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
