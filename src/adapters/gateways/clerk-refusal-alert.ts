import { HTTP_TOO_MANY_REQUESTS } from '@/src/adapters/shared/http-status';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger } from '@/src/application/ports/logger';
import type { OperationalAlerts } from '@/src/application/ports/operational-alerts';
import type { ClerkUserLookup } from './clerk-user-provisioner';

function isRefusal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === HTTP_TOO_MANY_REQUESTS
  );
}

/**
 * DEBT-503 item 3: Clerk answering 429 means the Backend API allowance every
 * signed-in page shares is spent. Each refusal is logged for diagnosis, and
 * the owner is alerted through the bounded alert path (at most once per
 * cooldown), before the same error is rethrown to the caller's retry and
 * handling, whatever happens to the alert.
 */
export function alertWhenClerkRefuses(
  lookup: ClerkUserLookup,
  deps: { alerts: () => OperationalAlerts; logger: Logger },
): ClerkUserLookup {
  return async (clerkUserId) => {
    try {
      return await lookup(clerkUserId);
    } catch (error) {
      if (isRefusal(error)) {
        deps.logger.warn(
          { event: 'clerk_backend_call_refused', limit: 'clerk' },
          'Clerk refused a Backend API call',
        );
        // `raise` never rejects, but building the alerts can throw; the
        // caller must still get Clerk's own error.
        try {
          await deps
            .alerts()
            .raise({ kind: 'clerk_backend_calls_refused', count: 1 });
        } catch (alertError) {
          deps.logger.error(
            {
              event: 'operational_alert_unavailable',
              error: projectSafeErrorDiagnostics(alertError),
            },
            'Could not raise the Clerk refusal alert',
          );
        }
      }
      throw error;
    }
  };
}
