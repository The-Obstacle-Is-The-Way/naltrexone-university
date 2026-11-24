import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  OperationalAlertOutcome,
  StripeReconcileRunRepository,
} from '@/src/application/ports';
import {
  FakeLogger,
  FakeOperationalAlerts,
  FakeStripeReconcileRunRepository,
} from '@/src/application/test-helpers/fakes';
import {
  checkStripeReconcileRunning,
  RECONCILE_RUN_MAX_DURATION_SECONDS,
} from './stripe-reconcile-watch';

const NOW = new Date('2026-11-25T09:30:00.000Z');

/** The maintained fake, with its reads failing as a lost database would. */
class UnreadableStripeReconcileRuns extends FakeStripeReconcileRunRepository {
  override async latestStartedAt(): Promise<Date | null> {
    throw new Error('database unavailable');
  }
}

/** The maintained fake, failing only to mark runs reported. */
class UnmarkableStripeReconcileRuns extends FakeStripeReconcileRunRepository {
  override async markReported(): Promise<void> {
    throw new Error('database unavailable');
  }
}

/** The maintained fake, failing only to list finished runs. */
class UnlistableStripeReconcileRuns extends FakeStripeReconcileRunRepository {
  override async listLatestFinished(): Promise<never> {
    throw new Error('database unavailable');
  }
}
const SECOND_MS = 1000;
const HOUR_MS = 60 * 60 * SECOND_MS;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function setUp() {
  const runs = new FakeStripeReconcileRunRepository();
  const alerts = new FakeOperationalAlerts();
  const logger = new FakeLogger();
  const watch = () =>
    checkStripeReconcileRunning({ now: () => NOW, runs, alerts, logger });
  return { runs, alerts, logger, watch };
}

async function finishedRun(
  runs: StripeReconcileRunRepository,
  startedAt: Date,
  failedSubscriptionIds: readonly string[] = [],
) {
  const id = await runs.recordStart(startedAt);
  await runs.recordFinish(id, new Date(startedAt.getTime() + 20 * SECOND_MS), [
    ...failedSubscriptionIds,
  ]);
  return id;
}

describe('checkStripeReconcileRunning', () => {
  it('raises nothing while the daily run starts and finishes', async () => {
    const { runs, alerts, watch } = setUp();
    await finishedRun(runs, ago(1 * HOUR_MS));

    expect(await watch()).toEqual({ reconcile: 'running', failingRows: 0 });
    expect(alerts.raised).toEqual([]);
  });

  it('reports a stop when no run has ever started', async () => {
    const { alerts, logger, watch } = setUp();

    expect(await watch()).toEqual({ reconcile: 'stopped', failingRows: 0 });
    expect(alerts.raised).toEqual([
      { kind: 'stripe_reconcile_stopped', count: 1 },
    ]);
    expect(logger.errorCalls.map((call) => call.msg)).toEqual([
      'Stripe reconcile stopped',
    ]);
  });

  it('reports a stop when no run started in the past 24 hours', async () => {
    const { runs, alerts, watch } = setUp();
    await finishedRun(runs, ago(25 * HOUR_MS));

    expect((await watch()).reconcile).toBe('stopped');
    expect(alerts.raised).toEqual([
      { kind: 'stripe_reconcile_stopped', count: 1 },
    ]);
  });

  it('reports a run that started more than 60 seconds ago and never finished, once', async () => {
    const { runs, alerts, watch } = setUp();
    await runs.recordStart(ago(1 * HOUR_MS));

    expect((await watch()).reconcile).toBe('stopped');
    expect(await watch()).toEqual({ reconcile: 'running', failingRows: 0 });
    expect(alerts.raised).toEqual([
      { kind: 'stripe_reconcile_stopped', count: 1 },
    ]);
  });

  it('leaves a run that may still be running inside its 60 seconds alone', async () => {
    const { runs, alerts, watch } = setUp();
    await finishedRun(runs, ago(2 * HOUR_MS));
    await runs.recordStart(ago(30 * SECOND_MS));

    expect((await watch()).reconcile).toBe('running');
    expect(alerts.raised).toEqual([]);
  });

  it('reports a killed run first seen after a missed watch, even when a later run finished', async () => {
    const { runs, alerts, watch } = setUp();
    await runs.recordStart(ago(30 * HOUR_MS));
    await finishedRun(runs, ago(1 * HOUR_MS));

    expect((await watch()).reconcile).toBe('stopped');
    expect(alerts.raised).toEqual([
      { kind: 'stripe_reconcile_stopped', count: 1 },
    ]);
  });

  it('counts each killed run and a missing start together, and marks every killed run reported', async () => {
    const { runs, alerts, watch } = setUp();
    await runs.recordStart(ago(50 * HOUR_MS));
    await runs.recordStart(ago(26 * HOUR_MS));

    await watch();
    await watch();

    expect(alerts.raised).toEqual([
      { kind: 'stripe_reconcile_stopped', count: 3 },
      { kind: 'stripe_reconcile_stopped', count: 1 },
    ]);
  });

  it('reports a run that started 61 seconds ago with no finish', async () => {
    const { runs, watch } = setUp();
    await finishedRun(runs, ago(2 * HOUR_MS));
    await runs.recordStart(ago(61 * SECOND_MS));

    expect((await watch()).reconcile).toBe('stopped');
  });

  it('keeps the stop and still checks rows when marking runs reported fails', async () => {
    const alerts = new FakeOperationalAlerts();
    const logger = new FakeLogger();
    const runs = new UnmarkableStripeReconcileRuns();
    await finishedRun(runs, ago(49 * HOUR_MS), ['sub_stuck']);
    await finishedRun(runs, ago(25 * HOUR_MS), ['sub_stuck']);
    await finishedRun(runs, ago(2 * HOUR_MS), ['sub_stuck']);
    await runs.recordStart(ago(1 * HOUR_MS));

    const outcome = await checkStripeReconcileRunning({
      now: () => NOW,
      runs,
      alerts,
      logger,
    });

    expect(outcome).toEqual({ reconcile: 'stopped', failingRows: 1 });
    expect(alerts.raised.map((alert) => alert.kind)).toEqual([
      'stripe_reconcile_stopped',
      'stripe_reconcile_row_failing',
    ]);
    expect(logger.errorCalls.map((call) => call.msg)).toContain(
      'Stripe reconcile runs not marked reported',
    );
  });

  it('keeps the stop check when the finished runs cannot be read', async () => {
    const alerts = new FakeOperationalAlerts();
    const logger = new FakeLogger();
    const runs = new UnlistableStripeReconcileRuns();
    await finishedRun(runs, ago(1 * HOUR_MS));

    const outcome = await checkStripeReconcileRunning({
      now: () => NOW,
      runs,
      alerts,
      logger,
    });

    expect(outcome).toEqual({ reconcile: 'running', failingRows: 0 });
    expect(logger.errorCalls.map((call) => call.msg)).toEqual([
      'Stripe reconcile finished runs unreadable',
    ]);
  });

  it.each<OperationalAlertOutcome>(['suppressed', 'failed'])(
    'leaves killed runs for the next watch when the alert is %s',
    async (outcome) => {
      const { runs, alerts, watch } = setUp();
      await runs.recordStart(ago(1 * HOUR_MS));
      alerts.nextOutcomes(outcome);

      await watch();
      await watch();

      expect(alerts.raised).toEqual([
        { kind: 'stripe_reconcile_stopped', count: 1 },
        { kind: 'stripe_reconcile_stopped', count: 1 },
      ]);
    },
  );

  it('reports a subscription that failed in each of the last three finished runs', async () => {
    const { runs, alerts, logger, watch } = setUp();
    await finishedRun(runs, ago(49 * HOUR_MS), ['sub_stuck', 'sub_once']);
    await finishedRun(runs, ago(25 * HOUR_MS), ['sub_stuck']);
    await finishedRun(runs, ago(1 * HOUR_MS), ['sub_other', 'sub_stuck']);

    expect(await watch()).toEqual({ reconcile: 'running', failingRows: 1 });
    expect(alerts.raised).toEqual([
      { kind: 'stripe_reconcile_row_failing', count: 1 },
    ]);
    expect(logger.errorCalls.map((call) => call.msg)).toEqual([
      'Stripe reconcile keeps failing a row',
    ]);
  });

  it('does not report a subscription that failed in only two of the last three finished runs', async () => {
    const { runs, alerts, watch } = setUp();
    await finishedRun(runs, ago(73 * HOUR_MS), ['sub_flaky']);
    await finishedRun(runs, ago(49 * HOUR_MS), []);
    await finishedRun(runs, ago(25 * HOUR_MS), ['sub_flaky']);
    await finishedRun(runs, ago(1 * HOUR_MS), ['sub_flaky']);

    expect((await watch()).failingRows).toBe(0);
    expect(alerts.raised).toEqual([]);
  });

  it('does not report a failing row before three runs have finished', async () => {
    const { runs, alerts, watch } = setUp();
    await finishedRun(runs, ago(25 * HOUR_MS), ['sub_new']);
    await finishedRun(runs, ago(1 * HOUR_MS), ['sub_new']);

    expect((await watch()).failingRows).toBe(0);
    expect(alerts.raised).toEqual([]);
  });

  it('logs and returns when the runs cannot be read, without throwing', async () => {
    const { alerts, logger } = setUp();
    const unreadable = new UnreadableStripeReconcileRuns();

    const outcome = await checkStripeReconcileRunning({
      now: () => NOW,
      runs: unreadable,
      alerts,
      logger,
    });

    expect(outcome).toEqual({ reconcile: 'unreadable', failingRows: 0 });
    expect(alerts.raised).toEqual([]);
    expect(logger.errorCalls.map((call) => call.msg)).toEqual([
      'Stripe reconcile runs unreadable',
    ]);
  });
});

describe('RECONCILE_RUN_MAX_DURATION_SECONDS', () => {
  // Next.js reads maxDuration as a literal, so the route cannot import it.
  it("is the reconcile route's maxDuration", () => {
    const route = readFileSync(
      'app/api/cron/reconcile-stripe-subscriptions/route.ts',
      'utf8',
    );

    expect(route).toContain(
      `export const maxDuration = ${RECONCILE_RUN_MAX_DURATION_SECONDS};`,
    );
  });
});
