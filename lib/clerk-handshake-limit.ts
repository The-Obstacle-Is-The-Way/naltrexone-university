import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { CLERK_HANDSHAKE_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { RateLimiter } from '@/src/application/ports/gateways';

// BUG-323: Clerk's middleware resolves a handshake from either parameter,
// in the query or a cookie. The nonce costs a Backend API call; the token
// costs an error log line.
const HANDSHAKE_PARAMETERS = [
  '__clerk_handshake_nonce',
  '__clerk_handshake',
] as const;

type HandshakeRequest = {
  nextUrl: { searchParams: Pick<URLSearchParams, 'has'> };
  cookies: { has(name: string): boolean };
  headers: Pick<Headers, 'get'>;
};

export function carriesClerkHandshake(request: HandshakeRequest): boolean {
  return HANDSHAKE_PARAMETERS.some(
    (name) =>
      request.nextUrl.searchParams.has(name) || request.cookies.has(name),
  );
}

/**
 * Limits handshake-bearing requests per client address before they reach
 * Clerk. Returns the 429 response, or null to continue. A limiter failure,
 * including one while loading it,
 * lets the request through: failing closed would break every real session
 * refresh while the database is down, and the firewall rule still bounds
 * the volume.
 */
export async function limitClerkHandshake(
  request: HandshakeRequest,
  loadLimiter: () => Promise<RateLimiter>,
  report: (failure: unknown) => void,
): Promise<NextResponse | null> {
  try {
    const limiter = await loadLimiter();
    const rate = await limiter.limit({
      key: `clerk-handshake:${getClientIp(request.headers)}`,
      ...CLERK_HANDSHAKE_RATE_LIMIT,
    });
    if (rate.success) return null;
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      },
    );
  } catch (error) {
    report({
      event: 'clerk_handshake_limiter_failed',
      error: projectSafeErrorDiagnostics(error),
    });
    return null;
  }
}
