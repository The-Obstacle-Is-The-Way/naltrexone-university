import { describe, expect, it } from 'vitest';
import {
  FakeLogger,
  FakeOperationalAlerts,
} from '@/src/application/test-helpers/fakes';
import {
  checkScheduledChecksRunning,
  OPERATIONAL_ALERT_WATCHER_WORKFLOW,
  type ScheduledWorkflowsStatus,
  ScheduledWorkflowsUnreadable,
} from './scheduled-checks';

// DEBT-505: GitHub disables a public repository's scheduled workflows after
// 60 days without activity, and a stopped watcher reads like a quiet one. The
// renewal job, on Vercel, checks the GitHub side daily, as the GitHub watcher
// checks the job through Sentry, so either one stopping is reported.
const now = new Date('2026-10-20T09:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(now.getTime() - ms);

function status(
  overrides: Partial<ScheduledWorkflowsStatus> = {},
): ScheduledWorkflowsStatus {
  return {
    workflows: [
      {
        path: OPERATIONAL_ALERT_WATCHER_WORKFLOW,
        state: 'active',
        createdAt: ago(30 * DAY_MS),
      },
      {
        path: '.github/workflows/upstream-advisory-watch.yml',
        state: 'active',
        createdAt: ago(30 * DAY_MS),
      },
    ],
    watcherLastSuccessAt: ago(DAY_MS),
    ...overrides,
  };
}

function setup(read: () => Promise<ScheduledWorkflowsStatus>) {
  const alerts = new FakeOperationalAlerts();
  const logger = new FakeLogger();
  return {
    alerts,
    logger,
    deps: { now: () => now, workflows: { read }, alerts, logger },
  };
}

describe('checkScheduledChecksRunning', () => {
  it('raises nothing while every scheduled workflow is on and the watcher succeeded lately', async () => {
    const { deps, alerts } = setup(async () => status());

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe('running');
    expect(alerts.raised).toEqual([]);
  });

  it('raises an alert when GitHub disabled any scheduled workflow for inactivity', async () => {
    const workflows = status().workflows;
    const advisory = workflows[1];
    if (advisory) advisory.state = 'disabled_inactivity';
    const { deps, alerts, logger } = setup(async () => status({ workflows }));

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe('stopped');
    expect(alerts.raised).toEqual([
      { kind: 'scheduled_checks_stopped', count: 1 },
    ]);
    expect(logger.errorCalls).toEqual([
      {
        context: {
          disabledForInactivity: [
            '.github/workflows/upstream-advisory-watch.yml',
          ],
          watcherStale: false,
        },
        msg: 'Scheduled checks stopped',
      },
    ]);
  });

  it('raises an alert when the watcher has not succeeded for three days', async () => {
    const { deps, alerts } = setup(async () =>
      status({ watcherLastSuccessAt: ago(3 * DAY_MS + 60_000) }),
    );

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe('stopped');
    expect(alerts.raised).toEqual([
      { kind: 'scheduled_checks_stopped', count: 1 },
    ]);
  });

  it.each(['disabled_manually', 'deleted'])(
    'raises an alert when the watcher is %s',
    async (state) => {
      const workflows = status().workflows;
      const watcher = workflows[0];
      if (watcher) watcher.state = state;
      const { deps, alerts } = setup(async () => status({ workflows }));

      await expect(checkScheduledChecksRunning(deps)).resolves.toBe('stopped');
      expect(alerts.raised).toHaveLength(1);
    },
  );

  it('raises an alert when the watcher workflow is gone', async () => {
    const { deps, alerts } = setup(async () =>
      status({ workflows: status().workflows.slice(1) }),
    );

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe('stopped');
    expect(alerts.raised).toHaveLength(1);
  });

  // A watcher added in the last three days may not have run yet.
  it('allows a new watcher three days for its first success', async () => {
    const workflows = status().workflows;
    const watcher = workflows[0];
    if (watcher) watcher.createdAt = ago(2 * DAY_MS);
    const { deps, alerts } = setup(async () =>
      status({ workflows, watcherLastSuccessAt: null }),
    );

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe('running');
    expect(alerts.raised).toEqual([]);
  });

  it('raises an alert when a watcher older than three days never succeeded', async () => {
    const { deps, alerts } = setup(async () =>
      status({ watcherLastSuccessAt: null }),
    );

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe('stopped');
    expect(alerts.raised).toHaveLength(1);
  });

  // A rate limit or an outage passes, so it raises no false alarm.
  it('reports unavailable, logs it and raises nothing when GitHub cannot answer now', async () => {
    const { deps, alerts, logger } = setup(async () => {
      throw new Error('GitHub answered 403');
    });

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe(
      'unavailable',
    );
    expect(alerts.raised).toEqual([]);
    expect(logger.warnCalls).toEqual([
      {
        context: { error: { name: 'Error' } },
        msg: 'scheduled_checks_unavailable',
      },
    ]);
  });

  // A refused or unreadable answer does not pass by itself: an expired or
  // revoked token, or a changed API, would otherwise stop the check silently.
  it('raises an alert when GitHub refuses the check or answers in an unexpected shape', async () => {
    const { deps, alerts, logger } = setup(async () => {
      throw new ScheduledWorkflowsUnreadable('GitHub answered 401');
    });

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe('unreadable');
    expect(alerts.raised).toEqual([
      { kind: 'scheduled_checks_unreadable', count: 1 },
    ]);
    expect(logger.errorCalls).toEqual([
      {
        context: { error: { name: 'ScheduledWorkflowsUnreadable' } },
        msg: 'Scheduled checks unreadable',
      },
    ]);
  });
});
