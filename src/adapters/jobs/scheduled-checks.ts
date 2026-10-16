import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger, OperationalAlerts } from '@/src/application/ports';

/** The GitHub workflow that watches the alert path from outside Sentry. */
export const OPERATIONAL_ALERT_WATCHER_WORKFLOW =
  '.github/workflows/operational-alert-watcher.yml';

// The watcher runs daily; three days allows for a GitHub Actions outage.
const WATCHER_STALE_MS = 3 * 24 * 60 * 60 * 1000;

/** DEBT-523: the watch that checks that production serves `main`'s head. */
export const PRODUCTION_RELEASE_WATCH_WORKFLOW =
  '.github/workflows/production-release-watch.yml';
/** DEBT-509: the watch that reads upstream security advisories. */
export const UPSTREAM_ADVISORY_WATCH_WORKFLOW =
  '.github/workflows/upstream-advisory-watch.yml';
/** The watches whose schedules the renewal job checks (DEBT-523). */
export const SCHEDULED_WATCHES = [
  PRODUCTION_RELEASE_WATCH_WORKFLOW,
  UPSTREAM_ADVISORY_WATCH_WORKFLOW,
] as const;
export type ScheduledWatch = (typeof SCHEDULED_WATCHES)[number];

// A day without a successful scheduled run means the watch is not watching:
// its schedule stopped, or every run failed. From 2026-10-08 to 2026-10-16
// the advisory watch's longest gap between scheduled runs was 10.4 hours,
// so a working schedule does not trip it; its 47.5 hours of failed runs that
// week (BUG-344) would have.
const WATCH_SCHEDULE_STALE_MS = 24 * 60 * 60 * 1000;

export type ScheduledWorkflow = {
  path: string;
  /** GitHub's state: `active`, `disabled_inactivity`, `disabled_manually`… */
  state: string;
  createdAt: Date;
};

export type ScheduledWorkflowsStatus = {
  workflows: ScheduledWorkflow[];
  /** When the alert watcher last ran successfully, or null if never. */
  watcherLastSuccessAt: Date | null;
  /**
   * When each watch's latest successful scheduled run was created, or null
   * if it has none. A manual run does not count: it would hide a stopped
   * schedule.
   */
  watchLastScheduledSuccessAt: Record<ScheduledWatch, Date | null>;
};

export type ScheduledWorkflowsUnreadableReason =
  /** GitHub refused the read: a token expired, was revoked or lost access. */
  | 'refused'
  /** GitHub rate-limited a read made without a token: the token is missing. */
  | 'rate_limited_without_token'
  /** The configured token cannot be sent as a header. */
  | 'token_not_header_safe'
  /** GitHub answered in a shape the read cannot use: its API changed. */
  | 'unexpected_shape';

/**
 * A read that does not pass by itself and needs a person, with why and,
 * when GitHub answered, its HTTP status.
 */
export class ScheduledWorkflowsUnreadable extends Error {
  override readonly name = 'ScheduledWorkflowsUnreadable';
  constructor(
    readonly reason: ScheduledWorkflowsUnreadableReason,
    readonly status?: number,
  ) {
    super(
      `GitHub read unreadable: ${reason}${status ? ` (HTTP ${status})` : ''}`,
    );
  }
}

/**
 * A read GitHub could not answer now: an outage, a timeout, or a rate limit
 * despite the token. It passes by itself.
 */
export class ScheduledWorkflowsUnavailable extends Error {
  override readonly name = 'ScheduledWorkflowsUnavailable';
  constructor(readonly status?: number) {
    super(`GitHub read unavailable${status ? ` (HTTP ${status})` : ''}`);
  }
}

/**
 * The repository's GitHub Actions workflows, as GitHub reports them. `read`
 * rejects with `ScheduledWorkflowsUnreadable` when the read needs a person,
 * and with `ScheduledWorkflowsUnavailable` when GitHub cannot answer now.
 */
export type ScheduledWorkflows = {
  read: () => Promise<ScheduledWorkflowsStatus>;
};

export type ScheduledChecksOutcome =
  | 'running'
  | 'stopped'
  | 'unreadable'
  | 'unavailable';

/**
 * DEBT-505: GitHub disables a public repository's scheduled workflows after
 * 60 days without activity, silently, and a watcher that stops reads like one
 * with nothing to report. The renewal job checks the GitHub side each day, as
 * the GitHub watcher checks the job through Sentry, so either one stopping is
 * reported by the other. It alerts when any workflow is disabled for
 * inactivity, or when the watcher is not active or has not succeeded for
 * three days. DEBT-523: GitHub can also stop a schedule without notice, so
 * it alerts when a watch is missing or not active, or has had no successful
 * scheduled run for a day. A read that needs a person alerts too, since an
 * expired or missing token would otherwise stop the check silently. An outage, or a rate
 * limit despite the token, passes and is only logged: GitHub unreachable from
 * Vercel for days is the one silent case left. It never throws: the renewal
 * job it runs in must not fail because of it.
 */
export async function checkScheduledChecksRunning(deps: {
  now: () => Date;
  workflows: ScheduledWorkflows;
  alerts: OperationalAlerts;
  logger: Pick<Logger, 'warn' | 'error'>;
}): Promise<ScheduledChecksOutcome> {
  let status: ScheduledWorkflowsStatus;
  try {
    status = await deps.workflows.read();
  } catch (error) {
    if (error instanceof ScheduledWorkflowsUnreadable) {
      deps.logger.error(
        { reason: error.reason, status: error.status ?? null },
        'Scheduled checks unreadable',
      );
      await deps.alerts.raise({
        kind: 'scheduled_checks_unreadable',
        count: 1,
      });
      return 'unreadable';
    }
    deps.logger.warn(
      error instanceof ScheduledWorkflowsUnavailable
        ? { status: error.status ?? null }
        : { error: projectSafeErrorDiagnostics(error) },
      'scheduled_checks_unavailable',
    );
    return 'unavailable';
  }
  const disabledForInactivity = status.workflows
    .filter((workflow) => workflow.state === 'disabled_inactivity')
    .map((workflow) => workflow.path);
  const watcher = status.workflows.find(
    (workflow) => workflow.path === OPERATIONAL_ALERT_WATCHER_WORKFLOW,
  );
  const watcherStale =
    watcher?.state !== 'active' ||
    deps.now().getTime() -
      (status.watcherLastSuccessAt ?? watcher.createdAt).getTime() >
      WATCHER_STALE_MS;
  // A watch disabled for inactivity is already counted above.
  const schedulesStopped = SCHEDULED_WATCHES.filter((path) => {
    const watch = status.workflows.find((workflow) => workflow.path === path);
    if (watch?.state === 'disabled_inactivity') return false;
    if (watch?.state !== 'active') return true;
    const since = status.watchLastScheduledSuccessAt[path] ?? watch.createdAt;
    return deps.now().getTime() - since.getTime() > WATCH_SCHEDULE_STALE_MS;
  });
  if (
    disabledForInactivity.length === 0 &&
    !watcherStale &&
    schedulesStopped.length === 0
  )
    return 'running';
  deps.logger.error(
    { disabledForInactivity, watcherStale, schedulesStopped },
    'Scheduled checks stopped',
  );
  const watcherCounted =
    watcherStale &&
    !disabledForInactivity.includes(OPERATIONAL_ALERT_WATCHER_WORKFLOW);
  await deps.alerts.raise({
    kind: 'scheduled_checks_stopped',
    count:
      disabledForInactivity.length +
      (watcherCounted ? 1 : 0) +
      schedulesStopped.length,
  });
  return 'stopped';
}
