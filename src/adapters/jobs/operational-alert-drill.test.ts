import { describe, expect, it } from 'vitest';
import {
  FakeLogger,
  FakeOperationalAlerts,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import {
  OPERATIONAL_ALERT_DRILL_INTERVAL_MS,
  OPERATIONAL_ALERT_DRILL_KEY,
  raiseOperationalAlertDrillIfDue,
} from './operational-alert-drill';

// DEBT-505: a drill alert, sent through the real alert path about once every
// 30 days, so the owner's inbox proves the path works and a missing drill
// shows it broke.
const HELD = { success: false, limit: 1, remaining: 0, retryAfterSeconds: 60 };

function setup(gate: ConstructorParameters<typeof FakeRateLimiter>[0]) {
  const rateLimiter = new FakeRateLimiter(gate);
  const alerts = new FakeOperationalAlerts();
  const logger = new FakeLogger();
  return { rateLimiter, alerts, logger, deps: { rateLimiter, alerts, logger } };
}

describe('raiseOperationalAlertDrillIfDue', () => {
  it('raises one drill alert when its 30-day window is open', async () => {
    const { deps, alerts, rateLimiter } = setup(undefined);

    await expect(raiseOperationalAlertDrillIfDue(deps)).resolves.toBe('raised');

    expect(alerts.raised).toEqual([
      { kind: 'operational_alert_drill', count: 1 },
    ]);
    expect(rateLimiter.inputs).toEqual([
      {
        key: OPERATIONAL_ALERT_DRILL_KEY,
        limit: 1,
        windowMs: OPERATIONAL_ALERT_DRILL_INTERVAL_MS,
      },
    ]);
    expect(OPERATIONAL_ALERT_DRILL_INTERVAL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('raises nothing when this window already had its drill', async () => {
    const { deps, alerts } = setup(HELD);

    await expect(raiseOperationalAlertDrillIfDue(deps)).resolves.toBe(
      'not_due',
    );
    expect(alerts.raised).toEqual([]);
  });

  // The drill runs inside the renewal job, which must not fail because of it.
  it('raises nothing, and logs, when its gate cannot answer', async () => {
    const { deps, alerts, logger } = setup(new Error('database unavailable'));

    await expect(raiseOperationalAlertDrillIfDue(deps)).resolves.toBe(
      'gate_unavailable',
    );
    expect(alerts.raised).toEqual([]);
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        msg: 'operational_alert_drill_gate_unavailable',
      }),
    ]);
  });
});
