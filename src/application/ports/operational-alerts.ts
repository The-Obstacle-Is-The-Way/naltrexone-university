// DEBT-505: conditions a person must act on. An alert carries fixed fields
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
  // A periodic drill that proves the alert path works; no action needed.
  'operational_alert_drill',
] as const;

export type OperationalAlertKind = (typeof OPERATIONAL_ALERT_KINDS)[number];

export type OperationalAlert = {
  kind: OperationalAlertKind;
  count: number;
};

export interface OperationalAlerts {
  /**
   * Resolves once the alert is sent, held back by a cooldown, or failed and
   * logged. It never rejects: an alert that cannot be sent must not change the
   * caller's outcome.
   */
  raise(alert: OperationalAlert): Promise<void>;
}
