import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { createContainer } from '@/lib/container';
import { env } from '@/lib/env';
import { OPERATIONAL_ALERT_COOLDOWN_KEY_PREFIX } from '@/src/adapters/gateways/cooldown-operational-alerts';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
} from './helpers';

// DEBT-503 item 3: Clerk's SDK cannot be injected into the container's
// lookup, so its Backend API answers 429 here.
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: {
      getUser: async () => {
        throw Object.assign(new Error('Too Many Requests'), { status: 429 });
      },
    },
  }),
}));

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const ORIGINAL_ENV = snapshotProcessEnv();

afterEach(async () => {
  restoreProcessEnv(ORIGINAL_ENV);
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

  it("raises the refusal alert when Clerk answers 429 to the container's lookup", async () => {
    const key = `${OPERATIONAL_ALERT_COOLDOWN_KEY_PREFIX}clerk_backend_calls_refused`;
    cleanup.rateLimitKeys.push(key);
    // .env.test skips Clerk; this lookup must reach the stubbed SDK.
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    await expect(
      createContainer({ primitives: { db, env } }).getClerkUserById('user_x'),
    ).rejects.toMatchObject({ status: 429 });

    expect(await limiterCalls(key)).toBe(1);
  });
});
