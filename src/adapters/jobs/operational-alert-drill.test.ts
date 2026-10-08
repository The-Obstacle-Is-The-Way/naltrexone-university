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

function setup(claim: (cycle: number) => Promise<boolean>) {
  const claims: number[] = [];
  const alerts = new FakeOperationalAlerts();
  const logger = new FakeLogger();
  return {
    alerts,
    logger,
    claims,
    deps: {
      now: () => at,
      claimCycle: (cycle: number) => {
        claims.push(cycle);
        return claim(cycle);
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
    const { deps, alerts, claims } = setup(async () => true);

    await expect(raiseOperationalAlertDrillIfDue(deps)).resolves.toBe('raised');

    expect(claims).toEqual([operationalAlertDrillCycle(at)]);
    expect(alerts.raised).toEqual([
      { kind: 'operational_alert_drill', count: 1 },
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
