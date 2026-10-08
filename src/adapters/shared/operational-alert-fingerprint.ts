// DEBT-505: marks an operational alert's Sentry event, so `scrubEvent` keeps
// it to its fixed fields. A module of its own, with no imports, so Sentry's
// settings can read it without loading the alert sender.
export const OPERATIONAL_ALERT_FINGERPRINT = 'operational-alert';
