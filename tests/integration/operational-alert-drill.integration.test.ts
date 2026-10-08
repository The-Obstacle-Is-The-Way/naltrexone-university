import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleRateLimiter } from '@/src/adapters/gateways/drizzle-rate-limiter';
import {
  OPERATIONAL_ALERT_DRILL_INTERVAL_MS,
  raiseOperationalAlertDrillIfDue,
} from '@/src/adapters/jobs/operational-alert-drill';
import {
  FakeLogger,
  FakeOperationalAlerts,
} from '@/src/application/test-helpers/fakes';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

// DEBT-505: the drill's 30-day gate on real Postgres, as the renewal job uses
// it across cron runs and server instances.
describe('the operational alert drill on Postgres', () => {
  it('raises one drill per 30-day window, however many runs ask', async () => {
    const key = `operational-alert-drill-test-${randomUUID()}`;
    cleanup.rateLimitKeys.push(key);
    const windowStart =
      Math.floor(Date.now() / OPERATIONAL_ALERT_DRILL_INTERVAL_MS) *
      OPERATIONAL_ALERT_DRILL_INTERVAL_MS;
    const at = (offsetMs: number) => () => new Date(windowStart + offsetMs);
    const alerts = new FakeOperationalAlerts();
    const run = (now: () => Date) =>
      raiseOperationalAlertDrillIfDue(
        {
          rateLimiter: new DrizzleRateLimiter(db, now),
          alerts,
          logger: new FakeLogger(),
        },
        { key },
      );

    const outcomes = [
      await run(at(60_000)),
      await run(at(24 * 60 * 60 * 1000)),
      ...(await Promise.all([
        run(at(2 * 60 * 60 * 1000)),
        run(at(3 * 60 * 60 * 1000)),
      ])),
      await run(at(OPERATIONAL_ALERT_DRILL_INTERVAL_MS + 60_000)),
    ];

    expect(outcomes).toEqual([
      'raised',
      'not_due',
      'not_due',
      'not_due',
      'raised',
    ]);
    expect(alerts.raised).toHaveLength(2);
  });
});
