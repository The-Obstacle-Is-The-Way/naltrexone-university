import { CLERK_BACKEND_CALL_FAILURE_ALERT_THRESHOLD } from '@/src/adapters/shared/rate-limits';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { RateLimiter } from '@/src/application/ports/gateways';
import type { OperationalAlerts } from '@/src/application/ports/operational-alerts';
import { raiseOperationalAlert } from './clerk-backend-call-limit';

// DEBT-503 item 3: calls Clerk's middleware makes to Clerk's Backend API and
// whose failure it swallows (`@clerk/backend` 3.18.1), saying why only in the
// auth reason of its answer. `keys`: the signing keys, without which every
// signed-in visitor on this server instance is signed out. `refresh`: an
// expired session token's refresh, which then redirects through a handshake.
// `handshake`: the lookup of the nonce that handshake returns with, which
// signs the visitor out when it fails.
export type ClerkCallFailure = 'keys' | 'refresh' | 'handshake';

const REFRESH_FAILED = 'session-token-expired-refresh-';

// Refresh reasons decided before Clerk answered, or after it answered with a
// token: none is Clerk failing the call.
const REFRESH_FAILED_WITHOUT_CLERK = new Set([
  'non-eligible-no-refresh-cookie',
  'non-eligible-non-get',
  'invalid-session-token',
  'missing-api-client',
  'missing-session-token',
  'missing-refresh-token',
  'expired-session-token-decode-failed',
  'expired-session-token-missing-sid-claim',
  'unexpected-sdk-error',
]);

type AnsweredRequest = {
  nextUrl: { searchParams: Pick<URLSearchParams, 'has'> };
};

/**
 * The Clerk call that failed behind this answer from Clerk's middleware, or
 * null. A nonce lookup that failed sets no cookies; one that succeeded sets
 * at least the client's cookie, even for a signed-out visitor.
 */
export function clerkCallFailure(
  request: AnsweredRequest,
  response: Response,
): ClerkCallFailure | null {
  const reason = response.headers.get('x-clerk-auth-reason') ?? '';
  if (reason === 'jwk-remote-failed-to-load') return 'keys';
  if (
    reason.startsWith(REFRESH_FAILED) &&
    !REFRESH_FAILED_WITHOUT_CLERK.has(reason.slice(REFRESH_FAILED.length))
  ) {
    return 'refresh';
  }
  if (
    reason === 'session-token-missing' &&
    request.nextUrl.searchParams.has('__clerk_handshake_nonce') &&
    response.headers.getSetCookie().length === 0
  ) {
    return 'handshake';
  }
  return null;
}

export type ClerkCallFailureReporting = {
  loadLimiter: () => Promise<RateLimiter>;
  loadAlerts: () => Promise<OperationalAlerts>;
};

/**
 * Logs the failure, then alerts the owner through the bounded alert path:
 * at once for the signing keys, which never fail in normal operation, and
 * for refreshes and nonce lookups once more than the threshold fail in a
 * minute, since some fail for ordinary reasons. It runs after the response,
 * and never rejects.
 */
export async function reportClerkCallFailure(
  failure: ClerkCallFailure,
  { loadLimiter, loadAlerts }: ClerkCallFailureReporting,
): Promise<void> {
  console.warn({ event: 'clerk_backend_call_failed', call: failure });
  if (failure !== 'keys') {
    try {
      const limiter = await loadLimiter();
      const counted = await limiter.limit({
        key: 'clerk-backend-call-failed:site',
        ...CLERK_BACKEND_CALL_FAILURE_ALERT_THRESHOLD,
      });
      if (counted.success) return;
    } catch (error) {
      console.error({
        event: 'clerk_backend_call_failure_count_unavailable',
        error: projectSafeErrorDiagnostics(error),
      });
      return;
    }
  }
  await raiseOperationalAlert(loadAlerts, 'clerk_backend_calls_refused');
}
