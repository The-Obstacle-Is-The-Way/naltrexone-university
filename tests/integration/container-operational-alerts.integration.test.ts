import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { createContainer } from '@/lib/container';
import { env } from '@/lib/env';
import { OPERATIONAL_ALERT_COOLDOWN_KEY_PREFIX } from '@/src/adapters/gateways/cooldown-operational-alerts';
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

async function limiterCalls(key: string): Promise<number> {
  const rows = await db
    .select({ count: schema.rateLimits.count })
    .from(schema.rateLimits)
    .where(eq(schema.rateLimits.key, key));
  return rows.reduce((total, row) => total + row.count, 0);
}

// DEBT-505: a container is built per request, so the in-process cooldown must
// be one per server process. If each container had its own, a database outage
// would send one event per request instead of one per kind per instance.
describe('container operational alerts', () => {
  it('shares one in-process cooldown across the containers of a process', async () => {
    const key = `${OPERATIONAL_ALERT_COOLDOWN_KEY_PREFIX}checkout_stripe_holds_unrecorded`;
    cleanup.rateLimitKeys.push(key);
    const containerForRequest = () =>
      createContainer({ primitives: { db, env } });

    await containerForRequest()
      .createOperationalAlerts()
      .raise({ kind: 'checkout_stripe_holds_unrecorded', count: 1 });
    await containerForRequest()
      .createOperationalAlerts()
      .raise({ kind: 'checkout_stripe_holds_unrecorded', count: 1 });

    expect(await limiterCalls(key)).toBe(1);
  });
});
