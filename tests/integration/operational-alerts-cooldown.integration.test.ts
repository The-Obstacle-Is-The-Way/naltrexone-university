import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  CooldownOperationalAlerts,
  LocalAlertCooldown,
  OPERATIONAL_ALERT_COOLDOWN_MS,
} from '@/src/adapters/gateways/cooldown-operational-alerts';
import { DrizzleRateLimiter } from '@/src/adapters/gateways/drizzle-rate-limiter';
import type { OperationalAlertEvent } from '@/src/adapters/shared/operational-alert-events';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
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

// One fixed instant inside a single six-hour window, so a run that crosses a
// window boundary cannot see two windows.
const insideOneWindow = new Date(
  Math.floor(Date.now() / OPERATIONAL_ALERT_COOLDOWN_MS) *
    OPERATIONAL_ALERT_COOLDOWN_MS +
    60_000,
);

function uniqueKeyPrefix(): string {
  const keyPrefix = `operational-alert-test-${randomUUID()}:`;
  cleanup.rateLimitKeys.push(`${keyPrefix}renewal_notice_outcome_unknown`);
  return keyPrefix;
}

// Each instance has its own in-process cooldown, as a separate server process
// or a restarted one would.
function serverInstance(keyPrefix: string, sent: OperationalAlertEvent[]) {
  return new CooldownOperationalAlerts({
    rateLimiter: new DrizzleRateLimiter(db, () => insideOneWindow),
    send: async (event) => {
      sent.push(event);
    },
    logger: new FakeLogger(),
    now: () => insideOneWindow,
    localCooldown: new LocalAlertCooldown(),
    keyPrefix,
  });
}

describe('operational alert cooldown on Postgres', () => {
  it('sends one event when eight instances raise the same kind at once', async () => {
    const keyPrefix = uniqueKeyPrefix();
    const sent: OperationalAlertEvent[] = [];

    await Promise.all(
      Array.from({ length: 8 }, () =>
        serverInstance(keyPrefix, sent).raise({
          kind: 'renewal_notice_outcome_unknown',
          count: 1,
        }),
      ),
    );

    expect(sent).toEqual([
      {
        kind: 'renewal_notice_outcome_unknown',
        count: 1,
        sharedCooldown: 'held',
      },
    ]);
  });

  it('keeps the window across a restart', async () => {
    const keyPrefix = uniqueKeyPrefix();
    const sent: OperationalAlertEvent[] = [];
    const alert = { kind: 'renewal_notice_outcome_unknown', count: 1 } as const;

    await serverInstance(keyPrefix, sent).raise(alert);
    await serverInstance(keyPrefix, sent).raise(alert);

    expect(sent).toHaveLength(1);
  });
});
