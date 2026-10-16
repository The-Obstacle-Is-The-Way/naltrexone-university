import { describe, expect, it } from 'vitest';
import {
  FakeLogger,
  FakeOperationalAlerts,
} from '@/src/application/test-helpers/fakes';
import {
  checkScheduledChecksRunning,
  OPERATIONAL_ALERT_WATCHER_WORKFLOW,
  PRODUCTION_RELEASE_WATCH_WORKFLOW,
  type ScheduledWorkflowsStatus,
  ScheduledWorkflowsUnavailable,
  ScheduledWorkflowsUnreadable,
  UPSTREAM_ADVISORY_WATCH_WORKFLOW,
} from './scheduled-checks';

// DEBT-505: GitHub disables a public repository's scheduled workflows after
// 60 days without activity, and a stopped watcher reads like a quiet one. The
// renewal job, on Vercel, checks the GitHub side daily, as the GitHub watcher
// checks the job through Sentry, so either one stopping is reported.
const now = new Date('2026-10-20T09:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
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
        path: UPSTREAM_ADVISORY_WATCH_WORKFLOW,
        state: 'active',
        createdAt: ago(30 * DAY_MS),
      },
      {
        path: PRODUCTION_RELEASE_WATCH_WORKFLOW,
        state: 'active',
        createdAt: ago(30 * DAY_MS),
      },
    ],
    watcherLastSuccessAt: ago(DAY_MS),
    watchLastScheduledSuccessAt: {
      [PRODUCTION_RELEASE_WATCH_WORKFLOW]: ago(2 * HOUR_MS),
      [UPSTREAM_ADVISORY_WATCH_WORKFLOW]: ago(5 * HOUR_MS),
    },
    ...overrides,
  };
}

function withWorkflow(
  path: string,
  change: (workflow: ScheduledWorkflowsStatus['workflows'][number]) => void,
) {
  const workflows = status().workflows;
  const workflow = workflows.find((candidate) => candidate.path === path);
  if (!workflow) throw new Error(`No such workflow in the fixture: ${path}`);
  change(workflow);
  return workflows;
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
          disabledForInactivity: [UPSTREAM_ADVISORY_WATCH_WORKFLOW],
          watcherStale: false,
          schedulesStopped: [],
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
      throw new ScheduledWorkflowsUnreadable('refused', 401);
    });

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe('unreadable');
    expect(alerts.raised).toEqual([
      { kind: 'scheduled_checks_unreadable', count: 1 },
    ]);
    // The reason and status tell an expired token from a lost permission.
    expect(logger.errorCalls).toEqual([
      {
        context: { reason: 'refused', status: 401 },
        msg: 'Scheduled checks unreadable',
      },
    ]);
  });

  it("logs an unavailable read's status, so a passing outage can be told from one that lasts", async () => {
    const { deps, alerts, logger } = setup(async () => {
      throw new ScheduledWorkflowsUnavailable(503);
    });

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe(
      'unavailable',
    );
    expect(alerts.raised).toEqual([]);
    expect(logger.warnCalls).toEqual([
      { context: { status: 503 }, msg: 'scheduled_checks_unavailable' },
    ]);
  });

  it('raises nothing for a watcher that succeeded just under three days ago', async () => {
    const { deps, alerts } = setup(async () =>
      status({ watcherLastSuccessAt: ago(3 * DAY_MS - 60_000) }),
    );

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe('running');
    expect(alerts.raised).toEqual([]);
  });

  it('counts the watcher once when it is itself disabled for inactivity', async () => {
    const workflows = status().workflows;
    const watcher = workflows[0];
    if (watcher) watcher.state = 'disabled_inactivity';
    const { deps, alerts } = setup(async () => status({ workflows }));

    await expect(checkScheduledChecksRunning(deps)).resolves.toBe('stopped');
    expect(alerts.raised).toEqual([
      { kind: 'scheduled_checks_stopped', count: 1 },
    ]);
  });

  // DEBT-523: GitHub can stop a schedule without notice, and a watch that
  // never runs reads like one with nothing to report.
  describe("a watch's schedule", () => {
    it('raises an alert when a watch has had no successful scheduled run for a day', async () => {
      const { deps, alerts, logger } = setup(async () =>
        status({
          watchLastScheduledSuccessAt: {
            ...status().watchLastScheduledSuccessAt,
            [PRODUCTION_RELEASE_WATCH_WORKFLOW]: ago(DAY_MS + 60_000),
          },
        }),
      );

      await expect(checkScheduledChecksRunning(deps)).resolves.toBe('stopped');
      expect(alerts.raised).toEqual([
        { kind: 'scheduled_checks_stopped', count: 1 },
      ]);
      expect(logger.errorCalls).toEqual([
        {
          context: {
            disabledForInactivity: [],
            watcherStale: false,
            schedulesStopped: [PRODUCTION_RELEASE_WATCH_WORKFLOW],
          },
          msg: 'Scheduled checks stopped',
        },
      ]);
    });

    it('raises nothing for a watch whose last scheduled success was just under a day ago', async () => {
      const { deps, alerts } = setup(async () =>
        status({
          watchLastScheduledSuccessAt: {
            ...status().watchLastScheduledSuccessAt,
            [UPSTREAM_ADVISORY_WATCH_WORKFLOW]: ago(DAY_MS - 60_000),
          },
        }),
      );

      await expect(checkScheduledChecksRunning(deps)).resolves.toBe('running');
      expect(alerts.raised).toEqual([]);
    });

    // A watch added in the last day may not have been scheduled yet.
    it('allows a new watch a day for its first scheduled success', async () => {
      const { deps, alerts } = setup(async () =>
        status({
          workflows: withWorkflow(
            PRODUCTION_RELEASE_WATCH_WORKFLOW,
            (watch) => {
              watch.createdAt = ago(20 * HOUR_MS);
            },
          ),
          watchLastScheduledSuccessAt: {
            ...status().watchLastScheduledSuccessAt,
            [PRODUCTION_RELEASE_WATCH_WORKFLOW]: null,
          },
        }),
      );

      await expect(checkScheduledChecksRunning(deps)).resolves.toBe('running');
      expect(alerts.raised).toEqual([]);
    });

    it('raises an alert when a watch older than a day never succeeded on schedule', async () => {
      const { deps, alerts } = setup(async () =>
        status({
          watchLastScheduledSuccessAt: {
            ...status().watchLastScheduledSuccessAt,
            [PRODUCTION_RELEASE_WATCH_WORKFLOW]: null,
          },
        }),
      );

      await expect(checkScheduledChecksRunning(deps)).resolves.toBe('stopped');
      expect(alerts.raised).toEqual([
        { kind: 'scheduled_checks_stopped', count: 1 },
      ]);
    });

    it.each(['disabled_manually', 'deleted'])(
      'raises an alert when a watch is %s',
      async (state) => {
        const { deps, alerts } = setup(async () =>
          status({
            workflows: withWorkflow(
              UPSTREAM_ADVISORY_WATCH_WORKFLOW,
              (watch) => {
                watch.state = state;
              },
            ),
          }),
        );

        await expect(checkScheduledChecksRunning(deps)).resolves.toBe(
          'stopped',
        );
        expect(alerts.raised).toEqual([
          { kind: 'scheduled_checks_stopped', count: 1 },
        ]);
      },
    );

    it('raises an alert when a watch workflow is gone', async () => {
      const { deps, alerts } = setup(async () =>
        status({
          workflows: status().workflows.filter(
            (workflow) => workflow.path !== PRODUCTION_RELEASE_WATCH_WORKFLOW,
          ),
        }),
      );

      await expect(checkScheduledChecksRunning(deps)).resolves.toBe('stopped');
      expect(alerts.raised).toEqual([
        { kind: 'scheduled_checks_stopped', count: 1 },
      ]);
    });

    // The count is the number of stopped checks, not whether any stopped.
    it('counts each stopped watch and a stale watcher separately', async () => {
      const { deps, alerts } = setup(async () =>
        status({
          watcherLastSuccessAt: ago(4 * DAY_MS),
          watchLastScheduledSuccessAt: {
            [PRODUCTION_RELEASE_WATCH_WORKFLOW]: ago(2 * DAY_MS),
            [UPSTREAM_ADVISORY_WATCH_WORKFLOW]: null,
          },
        }),
      );

      await expect(checkScheduledChecksRunning(deps)).resolves.toBe('stopped');
      expect(alerts.raised).toEqual([
        { kind: 'scheduled_checks_stopped', count: 3 },
      ]);
    });

    it('counts a watch once when it is itself disabled for inactivity', async () => {
      const { deps, alerts } = setup(async () =>
        status({
          workflows: withWorkflow(
            PRODUCTION_RELEASE_WATCH_WORKFLOW,
            (watch) => {
              watch.state = 'disabled_inactivity';
            },
          ),
          watchLastScheduledSuccessAt: {
            ...status().watchLastScheduledSuccessAt,
            [PRODUCTION_RELEASE_WATCH_WORKFLOW]: ago(3 * DAY_MS),
          },
        }),
      );

      await expect(checkScheduledChecksRunning(deps)).resolves.toBe('stopped');
      expect(alerts.raised).toEqual([
        { kind: 'scheduled_checks_stopped', count: 1 },
      ]);
    });
  });
});
