// DEBT-505: conditions a person must act on, and a drill that proves the
// alert path. An alert carries fixed fields
// only, a kind from this closed list and a count, so neither personal data nor
// free text can reach the alert channel. Callers keep their log line beside
// each alert, for diagnosis.
export const OPERATIONAL_ALERT_KINDS = [
  'renewal_notice_deadline_missed',
  'anniversary_reminder_deadline_missed',
  'renewal_notice_send_by_cutoff_passed',
  'renewal_notice_outcome_unknown',
  'checkout_stripe_holds_unrecorded',
  'clerk_backend_call_limiter_failed',
  // DEBT-503 item 3: a call that would reach Clerk's Backend API was refused,
  // by one of the sign-in limits or by Clerk itself (429).
  'clerk_backend_calls_refused',
  // A scheduled GitHub check, the alert watcher among them, has stopped.
  'scheduled_checks_stopped',
  // The check that the scheduled checks run needs a person: GitHub refused
  // it (a token expired or was revoked), rate-limited it for want of a token,
  // the token cannot be sent, or GitHub's answer changed shape.
  'scheduled_checks_unreadable',
  // A periodic drill that proves the alert path works; no action needed.
  'operational_alert_drill',
] as const;

export type OperationalAlertKind = (typeof OPERATIONAL_ALERT_KINDS)[number];

export type OperationalAlert = {
  kind: OperationalAlertKind;
  count: number;
};

/**
 * What became of a raised alert: handed to the alert channel, suppressed by a
 * cooldown because one went out recently, or failed and logged.
 */
export type OperationalAlertOutcome = 'sent' | 'suppressed' | 'failed';

export interface OperationalAlerts {
  /**
   * Resolves once the alert is sent, suppressed by a cooldown, or failed and
   * logged, saying which. It never rejects: an alert that cannot be sent must
   * not change the caller's outcome.
   */
  raise(alert: OperationalAlert): Promise<OperationalAlertOutcome>;
}
