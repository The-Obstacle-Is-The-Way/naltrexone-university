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
  cookies: {
    has(name: string): boolean;
    getAll(): { name: string; value: string }[];
  };
  headers: Pick<Headers, 'get'>;
};

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
  nowSeconds: number,
): ExpiredSession[] {
  if (request.method !== 'GET') return [];
  const cookies = request.cookies.getAll();
  if (!cookies.some(({ name }) => name.startsWith('__refresh_'))) return [];
  const sessions: ExpiredSession[] = [];
  for (const { name, value } of cookies) {
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

function carriesHandshake(request: ClerkRequest): boolean {
  return HANDSHAKE_NAMES.some(
    (name) =>
      request.nextUrl.searchParams.has(name) || request.cookies.has(name),
  );
}

export function triggersClerkBackendCall(
  request: ClerkRequest,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  return (
    carriesHandshake(request) || expiredSessions(request, nowSeconds).length > 0
  );
}

// DEBT-503 item 4: whether Clerk signed a session token, checked with item
// 5's key, as Clerk checks it before refreshing. Clerk signs session tokens
// with RS256 only; a token in any other algorithm, or one this cannot read,
// is left unchecked. Clerk decodes base64url strictly but for padding, and
// Node more loosely, so a token Clerk verifies reads the same here: a
// mismatch can only count a token Clerk rejects, never miss one it refreshes.
type Signature = 'genuine' | 'forged' | 'unchecked';

function signatureOf(token: string, key: KeyObject): Signature {
  const [header = '', payload = '', signature = ''] = token.split('.');
  try {
    const { alg } = JSON.parse(
      Buffer.from(header, 'base64url').toString('utf8'),
    );
    if (alg !== 'RS256') return 'unchecked';
    return verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      key,
      Buffer.from(signature, 'base64url'),
    )
      ? 'genuine'
      : 'forged';
  } catch {
    // An unreadable header: counted as before.
    return 'unchecked';
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
  const sessions = expiredSessions(request, Math.floor(Date.now() / 1000));
  // DEBT-503 item 4, step 2: with Clerk's key, a refresh Clerk would make is
  // one of a session it signed. A handshake, which only Clerk can check,
  // keeps the narrow per-address limit.
  const key = jwtKey && !carriesHandshake(request) && publicKey(jwtKey);
  if (key && sessions.length > 0) {
    const signatures = sessions.map((session) => ({
      ...session,
      signature: signatureOf(session.token, key),
    }));
    const signed = signatures.find(({ signature }) => signature === 'genuine');
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
          key: `clerk-backend-call:session:${signed.id}`,
          rate: CLERK_BACKEND_CALL_SESSION_RATE_LIMIT,
        },
        SITE_BUCKET,
      ];
    }
    // Clerk rejects a forged token without calling its Backend API.
    if (signatures.every(({ signature }) => signature === 'forged')) return [];
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
 * refresh counts only if Clerk signed its session token, and then per
 * address in a wider bucket of its own (DEBT-503 item 4). Returns the 429
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
  if (buckets.length === 0) return null;
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
