import * as Sentry from '@sentry/nextjs';
import type { OperationalAlertKind } from '@/src/application/ports/operational-alerts';

export type OperationalAlertEvent = {
  kind: OperationalAlertKind;
  count: number;
  /** "unavailable" when the shared cooldown could not be consulted. */
  sharedCooldown: 'held' | 'unavailable';
  /** The start of the fixed cooldown window the event belongs to. */
  window: string;
};

const FLUSH_TIMEOUT_MS = 2_000;

// DEBT-505: the one place an operational alert reaches Sentry. The event
// carries fixed tags and the count only. Sentry emails on a new issue, not on
// a later event in an issue still open, so each kind and cooldown window opens
// its own issue: every episode notifies, whether or not an earlier issue was
// resolved. Flushing before resolving keeps a serverless instance from
// freezing with the event still buffered, and the cooldowns keep that rare.
export async function sendOperationalAlertEvent(
  event: OperationalAlertEvent,
): Promise<void> {
  Sentry.captureMessage(`Operational alert: ${event.kind}`, {
    level: 'error',
    fingerprint: ['operational-alert', event.kind, event.window],
    tags: {
      'alert.kind': event.kind,
      'alert.shared_cooldown': event.sharedCooldown,
      'alert.window': event.window,
    },
    contexts: { alert: { count: event.count } },
  });
  await Sentry.flush(FLUSH_TIMEOUT_MS);
}
