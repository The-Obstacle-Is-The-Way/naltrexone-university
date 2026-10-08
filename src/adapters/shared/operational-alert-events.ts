import * as Sentry from '@sentry/nextjs';
import type { OperationalAlertKind } from '@/src/application/ports/operational-alerts';

export type OperationalAlertEvent = {
  kind: OperationalAlertKind;
  count: number;
  /** "unavailable" when the shared cooldown could not be consulted. */
  sharedCooldown: 'held' | 'unavailable';
};

const FLUSH_TIMEOUT_MS = 2_000;

// DEBT-505: the one place an operational alert reaches Sentry. The event
// carries fixed tags and the count only; each kind groups as its own issue,
// which the owner's issue alert routes. Flushing before resolving keeps a
// serverless instance from freezing with the event still buffered, and the
// cooldowns keep that wait rare.
export async function sendOperationalAlertEvent(
  event: OperationalAlertEvent,
): Promise<void> {
  Sentry.captureMessage(`Operational alert: ${event.kind}`, {
    level: 'error',
    fingerprint: ['operational-alert', event.kind],
    tags: {
      'alert.kind': event.kind,
      'alert.shared_cooldown': event.sharedCooldown,
    },
    contexts: { alert: { count: event.count } },
  });
  await Sentry.flush(FLUSH_TIMEOUT_MS);
}
