import * as Sentry from '@sentry/nextjs';
import type { OperationalAlertKind } from '@/src/application/ports/operational-alerts';
import { OPERATIONAL_ALERT_FINGERPRINT } from './operational-alert-fingerprint';

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
//
// Sentry's capture never throws, so a lost event is detected here: with no
// enabled client, or no confirmed flush, this rejects and the caller logs it.
export async function sendOperationalAlertEvent(
  event: OperationalAlertEvent,
): Promise<void> {
  if (!Sentry.isEnabled()) throw new Error('Sentry is not enabled');
  Sentry.captureMessage(`Operational alert: ${event.kind}`, {
    level: 'error',
    fingerprint: [OPERATIONAL_ALERT_FINGERPRINT, event.kind, event.window],
    tags: {
      'alert.kind': event.kind,
      'alert.shared_cooldown': event.sharedCooldown,
      'alert.window': event.window,
    },
    contexts: { alert: { count: event.count } },
  });
  if (!(await Sentry.flush(FLUSH_TIMEOUT_MS))) {
    throw new Error('Sentry did not confirm the operational alert');
  }
}
