import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger, OperationalAlerts } from '@/src/application/ports';

/** The GitHub workflow that watches the alert path from outside Sentry. */
export const OPERATIONAL_ALERT_WATCHER_WORKFLOW =
  '.github/workflows/operational-alert-watcher.yml';

// The watcher runs daily; three days allows for a GitHub Actions outage.
const WATCHER_STALE_MS = 3 * 24 * 60 * 60 * 1000;

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
};

/**
 * GitHub refused the read, or answered in a shape it cannot read. Unlike a
 * rate limit or an outage, this does not pass by itself.
 */
export class ScheduledWorkflowsUnreadable extends Error {
  override readonly name = 'ScheduledWorkflowsUnreadable';
}

/**
 * The repository's GitHub Actions workflows, as GitHub reports them. `read`
 * rejects with `ScheduledWorkflowsUnreadable` when GitHub refuses it or
 * answers in an unexpected shape, and with any other error when GitHub
 * cannot answer now.
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
 * three days. A refused or unreadable answer alerts too, since an expired
 * token would otherwise stop the check silently; a rate limit or an outage
 * passes, so it is only logged. It never throws: the renewal job it runs in
 * must not fail because of it.
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
        { error: projectSafeErrorDiagnostics(error) },
        'Scheduled checks unreadable',
      );
      await deps.alerts.raise({
        kind: 'scheduled_checks_unreadable',
        count: 1,
      });
      return 'unreadable';
    }
    deps.logger.warn(
      { error: projectSafeErrorDiagnostics(error) },
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
  if (disabledForInactivity.length === 0 && !watcherStale) return 'running';
  deps.logger.error(
    { disabledForInactivity, watcherStale },
    'Scheduled checks stopped',
  );
  const watcherCounted =
    watcherStale &&
    !disabledForInactivity.includes(OPERATIONAL_ALERT_WATCHER_WORKFLOW);
  await deps.alerts.raise({
    kind: 'scheduled_checks_stopped',
    count: disabledForInactivity.length + (watcherCounted ? 1 : 0),
  });
  return 'stopped';
}
