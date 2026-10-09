import { describe, expect, it } from 'vitest';
import {
  FakeLogger,
  FakeOperationalAlerts,
} from '@/src/application/test-helpers/fakes';
import {
  OPERATIONAL_ALERT_DRILL_INTERVAL_MS,
  operationalAlertDrillCycle,
  raiseOperationalAlertDrillIfDue,
} from './operational-alert-drill';

// DEBT-505: a drill alert, sent through the real alert path once per fixed
// 30-day cycle, so the owner's inbox proves the path works and a missing drill
// shows it broke. The cycle claim's own behaviour runs on real Postgres.
const at = new Date('2026-10-08T09:00:00Z');

function setup(
  claim: (cycle: number) => Promise<boolean>,
  release: (cycle: number) => Promise<void> = async () => {},
) {
  const claims: number[] = [];
  const releases: number[] = [];
  const alerts = new FakeOperationalAlerts();
  const logger = new FakeLogger();
  return {
    alerts,
    logger,
    claims,
    releases,
    deps: {
      now: () => at,
      cycles: {
        claim: (cycle: number) => {
          claims.push(cycle);
          return claim(cycle);
        },
        release: (cycle: number) => {
          releases.push(cycle);
          return release(cycle);
        },
      },
      alerts,
      logger,
    },
  };
}

describe('operationalAlertDrillCycle', () => {
  it('numbers fixed 30-day cycles from the epoch', () => {
    const start = 691 * OPERATIONAL_ALERT_DRILL_INTERVAL_MS;

    expect(operationalAlertDrillCycle(new Date(start - 1))).toBe(690);
    expect(operationalAlertDrillCycle(new Date(start))).toBe(691);
    expect(new Date(start).toISOString()).toBe('2026-10-04T00:00:00.000Z');
  });
});

describe('raiseOperationalAlertDrillIfDue', () => {
  it('raises one drill when it claims the current cycle', async () => {
    const { deps, alerts, claims, releases } = setup(async () => true);

    await expect(raiseOperationalAlertDrillIfDue(deps)).resolves.toBe('raised');

    expect(claims).toEqual([operationalAlertDrillCycle(at)]);
    expect(alerts.raised).toEqual([
      { kind: 'operational_alert_drill', count: 1 },
    ]);
    // A sent drill keeps its cycle, or every daily run would send another.
    expect(releases).toEqual([]);
  });

  // A drill that did not go out gives its cycle back, so the next daily run
  // tries again instead of the cycle passing with no drill.
  it.each(['failed', 'suppressed'] as const)(
    'gives the cycle back when the drill is %s',
    async (outcome) => {
      const { deps, alerts, releases } = setup(async () => true);
      alerts.nextOutcomes(outcome);

      await expect(raiseOperationalAlertDrillIfDue(deps)).resolves.toBe(
        'not_sent',
      );
      expect(releases).toEqual([operationalAlertDrillCycle(at)]);
    },
  );

  it('logs, and still resolves, when the cycle cannot be given back', async () => {
    const { deps, alerts, logger } = setup(
      async () => true,
      async () => {
        throw new Error('database unavailable');
      },
    );
    alerts.nextOutcomes('failed');

    await expect(raiseOperationalAlertDrillIfDue(deps)).resolves.toBe(
      'not_sent',
    );
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        msg: 'operational_alert_drill_release_failed',
      }),
    ]);
  });

  it('raises nothing when this cycle was already claimed', async () => {
    const { deps, alerts } = setup(async () => false);

    await expect(raiseOperationalAlertDrillIfDue(deps)).resolves.toBe(
      'not_due',
    );
    expect(alerts.raised).toEqual([]);
  });

  // The drill runs inside the renewal job, which must not fail because of it.
  it('raises nothing, and logs, when the claim cannot be made', async () => {
    const { deps, alerts, logger } = setup(async () => {
      throw new Error('database unavailable');
    });

    await expect(raiseOperationalAlertDrillIfDue(deps)).resolves.toBe(
      'claim_unavailable',
    );
    expect(alerts.raised).toEqual([]);
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        msg: 'operational_alert_drill_claim_unavailable',
      }),
    ]);
  });
});
