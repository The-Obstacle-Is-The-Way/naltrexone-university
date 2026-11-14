// DEBT-505: the drill's Sentry title, which must read as a drill in the
// owner's inbox. A module of its own, with no imports, so the operational
// alert watcher can tell a drill's copy from an alert's without loading the
// alert sender (BUG-377).
export const OPERATIONAL_ALERT_DRILL_TITLE =
  'Operational alert drill: no action needed';
