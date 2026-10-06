import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import {
  CLERK_BACKEND_CALL_RATE_LIMIT,
  CLERK_BACKEND_CALL_SITE_RATE_LIMIT,
} from '@/src/adapters/shared/rate-limits';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { RateLimiter } from '@/src/application/ports/gateways';

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

// Reads only the expiry; Clerk verifies the token itself.
function expiresBefore(token: string, nowSeconds: number): boolean {
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    const exp =
      payload && typeof payload === 'object' && 'exp' in payload
        ? payload.exp
        : undefined;
    return typeof exp === 'number' && exp <= nowSeconds;
  } catch {
    return false;
  }
}

export function triggersClerkBackendCall(
  request: ClerkRequest,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (
    HANDSHAKE_NAMES.some(
      (name) =>
        request.nextUrl.searchParams.has(name) || request.cookies.has(name),
    )
  )
    return true;
  if (request.method !== 'GET') return false;
  const cookies = request.cookies.getAll();
  const hasRefresh = cookies.some(({ name }) => name.startsWith('__refresh_'));
  return (
    hasRefresh &&
    cookies.some(
      ({ name, value }) =>
        (name === '__session' || name.startsWith('__session_')) &&
        expiresBefore(value, nowSeconds),
    )
  );
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

/**
 * Limits these requests per client address, then site-wide, before they reach
 * Clerk. Returns the 429 response, or null to continue. A limiter failure,
 * including one while loading it, lets the request through: failing closed
 * would break every real session refresh while the database is down, and the
 * firewall rule still bounds the volume.
 */
export async function limitClerkBackendCalls(
  request: ClerkRequest,
  loadLimiter: () => Promise<RateLimiter>,
  report: (failure: unknown) => void,
): Promise<NextResponse | null> {
  try {
    const limiter = await loadLimiter();
    const perAddress = await limiter.limit({
      key: `clerk-backend-call:${getClientIp(request.headers)}`,
      ...CLERK_BACKEND_CALL_RATE_LIMIT,
    });
    if (!perAddress.success)
      return tooManyRequests(request, perAddress.retryAfterSeconds);
    const site = await limiter.limit({
      key: 'clerk-backend-call:site',
      ...CLERK_BACKEND_CALL_SITE_RATE_LIMIT,
    });
    if (!site.success) return tooManyRequests(request, site.retryAfterSeconds);
    return null;
  } catch (error) {
    report({
      event: 'clerk_backend_call_limiter_failed',
      error: projectSafeErrorDiagnostics(error),
    });
    return null;
  }
}
