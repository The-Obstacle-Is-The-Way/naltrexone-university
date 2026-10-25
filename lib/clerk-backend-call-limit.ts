import { createPublicKey, type KeyObject, verify } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import {
  CLERK_BACKEND_CALL_RATE_LIMIT,
  CLERK_BACKEND_CALL_SESSION_RATE_LIMIT,
  CLERK_BACKEND_CALL_SIGNED_IN_RATE_LIMIT,
  CLERK_BACKEND_CALL_SITE_RATE_LIMIT,
} from '@/src/adapters/shared/rate-limits';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { RateLimiter } from '@/src/application/ports/gateways';
import type {
  OperationalAlertKind,
  OperationalAlerts,
} from '@/src/application/ports/operational-alerts';

// BUG-323: the request shapes for which Clerk's SDK calls Clerk's Backend API
// before answering: a handshake value, or a GET whose session has expired and
// can be refreshed.
const HANDSHAKE_NAMES = [
  '__clerk_handshake_nonce',
  '__clerk_handshake',
] as const;

type ClerkRequest = {
  method: string;
  nextUrl: { searchParams: Pick<URLSearchParams, 'has'> };
  headers: Pick<Headers, 'get'>;
};

// Clerk reads cookies with the `cookie` package (1.1.1, bundled in
// `@clerk/backend`), not Next's parser: the first of two cookies with one
// name wins, names and values lose surrounding spaces and tabs, and a value
// that does not percent-decode is kept as sent. Read any other way, a cookie
// Clerk acts on could go uncounted, or a genuine session read as another.
const SPACE = 0x20;
const TAB = 0x09;
const JWT_SEGMENTS = 3;

function cookiesAsClerkReadsThem(request: ClerkRequest): Map<string, string> {
  const header = request.headers.get('cookie') ?? '';
  const cookies = new Map<string, string>();
  // Scanned, as Clerk's parser does: a trimming regex backtracks
  // quadratically over a long run of spaces inside a value.
  const blank = (at: number) =>
    header.charCodeAt(at) === SPACE || header.charCodeAt(at) === TAB;
  const trimmed = (start: number, end: number) => {
    let from = start;
    let to = end;
    while (from < to && blank(from)) from += 1;
    while (to > from && blank(to - 1)) to -= 1;
    return header.slice(from, to);
  };
  let index = 0;
  while (index < header.length) {
    const equals = header.indexOf('=', index);
    if (equals === -1) break;
    const semicolon = header.indexOf(';', index);
    const end = semicolon === -1 ? header.length : semicolon;
    if (equals > end) {
      index = header.lastIndexOf(';', equals - 1) + 1;
      continue;
    }
    const name = trimmed(index, equals);
    if (!cookies.has(name)) {
      cookies.set(name, percentDecoded(trimmed(equals + 1, end)));
    }
    index = end + 1;
  }
  return cookies;
}

function percentDecoded(value: string): string {
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    // As Clerk's parser does, a value that does not decode is kept as sent.
    return value;
  }
}

// Reads only the claims; Clerk verifies the token itself.
function claims(token: string): { exp?: unknown; sid?: unknown } | undefined {
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    return payload && typeof payload === 'object' ? payload : undefined;
  } catch {
    return undefined;
  }
}

// Clerk treats a session token as current until five seconds past its expiry.
const CLERK_CLOCK_SKEW_SECONDS = 5;

type ExpiredSession = { id: string; token: string };

// The sessions a GET could refresh: expired session tokens alongside a
// refresh cookie. Clerk refreshes the suffixed cookie's or the plain one's, as
// it decides. A session's ID keys the per-session limit.
function expiredSessions(
  request: ClerkRequest,
  cookies: Map<string, string>,
  nowSeconds: number,
): ExpiredSession[] {
  if (request.method !== 'GET') return [];
  if (![...cookies.keys()].some((name) => name.startsWith('__refresh_')))
    return [];
  const sessions: ExpiredSession[] = [];
  for (const [name, value] of cookies) {
    if (name !== '__session' && !name.startsWith('__session_')) continue;
    const payload = claims(value);
    if (
      typeof payload?.exp === 'number' &&
      payload.exp + CLERK_CLOCK_SKEW_SECONDS <= nowSeconds
    )
      sessions.push({
        id: typeof payload.sid === 'string' ? payload.sid : 'unknown',
        token: value,
      });
  }
  return sessions;
}

function carriesHandshake(
  request: ClerkRequest,
  cookies: Map<string, string>,
): boolean {
  return HANDSHAKE_NAMES.some(
    (name) => request.nextUrl.searchParams.has(name) || cookies.has(name),
  );
}

export function triggersClerkBackendCall(
  request: ClerkRequest,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const cookies = cookiesAsClerkReadsThem(request);
  return (
    carriesHandshake(request, cookies) ||
    expiredSessions(request, cookies, nowSeconds).length > 0
  );
}

// DEBT-503 item 4: whether Clerk signed a session token, checked with item
// 5's key, as Clerk checks it before refreshing. Clerk signs session tokens
// with RS256 only, and reads a token as a JWT only with exactly three
// segments. Clerk decodes base64url strictly but for padding, and Node more
// loosely, so a token Clerk verifies verifies here too.
function signedByClerk(token: string, key: KeyObject): boolean {
  const segments = token.split('.');
  if (segments.length !== JWT_SEGMENTS) return false;
  const [header = '', payload = '', signature = ''] = segments;
  try {
    const { alg } = JSON.parse(
      Buffer.from(header, 'base64url').toString('utf8'),
    );
    return (
      alg === 'RS256' &&
      verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${payload}`),
        key,
        Buffer.from(signature, 'base64url'),
      )
    );
  } catch {
    // An unreadable header: not one Clerk signed.
    return false;
  }
}

let parsedKey: { pem: string; key: KeyObject | undefined } | undefined;

function publicKey(pem: string): KeyObject | undefined {
  if (parsedKey?.pem !== pem) {
    let key: KeyObject | undefined;
    try {
      key = createPublicKey(pem);
    } catch {
      // The proxy passes only a key Clerk can read; any other counts as none.
      key = undefined;
    }
    parsedKey = { pem, key };
  }
  return parsedKey.key;
}

function tooManyRequests(
  request: ClerkRequest,
  retryAfterSeconds: number,
): NextResponse {
  const headers = { 'Retry-After': String(retryAfterSeconds) };
  const response = request.headers.get('accept')?.includes('text/html')
    ? new NextResponse(
        '<!doctype html><title>Please wait</title><p>Too many sign-in checks came from your network. Please wait a minute, then try again.</p>',
        {
          status: 429,
          headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
        },
      )
    : NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers },
      );
  // A handshake cookie would otherwise make every later request count again.
  for (const name of HANDSHAKE_NAMES)
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  return response;
}

export type ClerkBackendCallLimit =
  | 'address'
  | 'session'
  | 'signed-in-address'
  | 'signed-in-session'
  | 'site';

type Bucket = {
  limit: ClerkBackendCallLimit;
  key: string;
  rate: { limit: number; windowMs: number };
};

const SITE_BUCKET: Bucket = {
  limit: 'site',
  key: 'clerk-backend-call:site',
  rate: CLERK_BACKEND_CALL_SITE_RATE_LIMIT,
};

// The buckets a request counts in, in order. Without a readable address
// every request would share one bucket, so one sender could refuse everyone;
// the other limits still apply.
function bucketsFor(
  request: ClerkRequest,
  jwtKey: string | undefined,
): Bucket[] {
  const address = getClientIp(request.headers);
  const cookies = cookiesAsClerkReadsThem(request);
  const sessions = expiredSessions(
    request,
    cookies,
    Math.floor(Date.now() / 1000),
  );
  // DEBT-503 item 4, step 2: with Clerk's key, a refresh of a session Clerk
  // signed counts in buckets of its own, which no other request can fill. A
  // handshake, which only Clerk can check, keeps the narrow per-address
  // limit, and so does every other request, a forged token's included: it
  // costs Clerk nothing, but counting it keeps any request the proxy misreads
  // within today's limits.
  const key =
    jwtKey && !carriesHandshake(request, cookies) && publicKey(jwtKey);
  const signed = key
    ? sessions.find(({ token }) => signedByClerk(token, key))
    : undefined;
  if (signed) {
    return [
      ...(address === 'unknown'
        ? []
        : [
            {
              limit: 'signed-in-address' as const,
              key: `clerk-backend-call:signed-in:${address}`,
              rate: CLERK_BACKEND_CALL_SIGNED_IN_RATE_LIMIT,
            },
          ]),
      {
        limit: 'signed-in-session',
        key: `clerk-backend-call:signed-in-session:${signed.id}`,
        rate: CLERK_BACKEND_CALL_SESSION_RATE_LIMIT,
      },
      SITE_BUCKET,
    ];
  }
  const [session] = sessions;
  return [
    ...(address === 'unknown'
      ? []
      : [
          {
            limit: 'address' as const,
            key: `clerk-backend-call:${address}`,
            rate: CLERK_BACKEND_CALL_RATE_LIMIT,
          },
        ]),
    ...(session
      ? [
          {
            limit: 'session' as const,
            key: `clerk-backend-call:session:${session.id}`,
            rate: CLERK_BACKEND_CALL_SESSION_RATE_LIMIT,
          },
        ]
      : []),
    SITE_BUCKET,
  ];
}

/**
 * Limits these requests per client address, per refreshing session, then
 * site-wide, before they reach Clerk. With Clerk's signing key (`jwtKey`), a
 * refresh of a session Clerk signed counts per address in a wider bucket of
 * its own, and per session in another (DEBT-503 item 4). Returns the 429
 * response, or null to continue. A limiter failure, including one while
 * loading it, lets the request through: failing closed would break every
 * real session refresh while the database is down, and the firewall rule
 * still bounds the volume. A refusal names the limit that tripped (DEBT-503
 * item 3), never the address or session.
 */
export async function limitClerkBackendCalls(
  request: ClerkRequest,
  loadLimiter: () => Promise<RateLimiter>,
  report: (failure: unknown) => void,
  refused: (limit: ClerkBackendCallLimit) => void = () => {},
  jwtKey?: string,
): Promise<NextResponse | null> {
  const buckets = bucketsFor(request, jwtKey);
  try {
    const limiter = await loadLimiter();
    for (const { limit, key, rate } of buckets) {
      const result = await limiter.limit({ key, ...rate });
      if (!result.success) {
        refused(limit);
        return tooManyRequests(request, result.retryAfterSeconds);
      }
    }
    return null;
  } catch (error) {
    report({
      event: 'clerk_backend_call_limiter_failed',
      error: projectSafeErrorDiagnostics(error),
    });
    return null;
  }
}

// DEBT-505: an alert the proxy raises after its response. It never rejects.
export async function raiseOperationalAlert(
  loadAlerts: () => Promise<OperationalAlerts>,
  kind: OperationalAlertKind,
): Promise<void> {
  try {
    const alerts = await loadAlerts();
    await alerts.raise({ kind, count: 1 });
  } catch (error) {
    console.error({
      event: 'operational_alert_unavailable',
      error: projectSafeErrorDiagnostics(error),
    });
  }
}

// DEBT-505: the limiter failing is BUG-323's alert; the log line alone
// reaches nobody.
export function raiseLimiterFailureAlert(
  loadAlerts: () => Promise<OperationalAlerts>,
): Promise<void> {
  return raiseOperationalAlert(loadAlerts, 'clerk_backend_call_limiter_failed');
}

// The production alerts: the container's, which share one in-process
// cooldown per server process.
export async function loadContainerOperationalAlerts(): Promise<OperationalAlerts> {
  const { createContainer } = await import('@/lib/container');
  return createContainer().createOperationalAlerts();
}

// The production limiter: the container's database-backed rate limiter.
export async function loadContainerRateLimiter(): Promise<RateLimiter> {
  const { createContainer } = await import('@/lib/container');
  return createContainer().createRateLimiter();
}
