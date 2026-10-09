import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { operationalAlertDrillCycles } from '@/src/adapters/jobs/operational-alert-drill';
import { closeConnection, createIntegrationDb } from './helpers';

const { db, sql } = createIntegrationDb();
// Cycle numbers far beyond any real one, so no run of this test meets a row
// the app wrote.
const testCycles: number[] = [];
function testCycle(): number {
  const cycle = 1_000_000 + Math.floor(Math.random() * 1_000_000_000);
  testCycles.push(cycle);
  return cycle;
}

afterEach(async () => {
  if (testCycles.length === 0) return;
  await db
    .delete(schema.operationalAlertDrills)
    .where(inArray(schema.operationalAlertDrills.cycle, testCycles.splice(0)));
});

afterAll(async () => {
  await closeConnection(sql);
});

// DEBT-505: the drill's once-per-cycle claim on real Postgres, as the renewal
// job makes it across cron runs and server instances.
describe('the operational alert drill cycles on Postgres', () => {
  it('lets exactly one of six concurrent claims of a cycle win, each on its own connection', async () => {
    const cycle = testCycle();
    const sessions = Array.from({ length: 6 }, () => createIntegrationDb());
    try {
      await Promise.all(sessions.map((session) => session.sql`select 1`));

      const claims = await Promise.all(
        sessions.map((session) =>
          operationalAlertDrillCycles({ db: session.db }).claim(cycle),
        ),
      );

      expect(claims.filter(Boolean)).toHaveLength(1);
    } finally {
      await Promise.all(
        sessions.map((session) => closeConnection(session.sql)),
      );
    }
  });

  it('lets a cycle given back be claimed again, and the next cycle be claimed', async () => {
    const cycles = operationalAlertDrillCycles({ db });
    const cycle = testCycle();
    const next = cycle + 1;
    testCycles.push(next);

    await expect(cycles.claim(cycle)).resolves.toBe(true);
    await expect(cycles.claim(cycle)).resolves.toBe(false);
    await cycles.release(cycle);
    await expect(cycles.claim(cycle)).resolves.toBe(true);
    await expect(cycles.claim(next)).resolves.toBe(true);
  });
});
