import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { claimOperationalAlertDrillCycle } from '@/src/adapters/jobs/operational-alert-drill';
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
// job makes it across cron runs, days and server instances.
describe('the operational alert drill cycle claim on Postgres', () => {
  it('lets exactly one of several concurrent claims of a cycle win', async () => {
    const cycle = testCycle();

    const claims = await Promise.all(
      Array.from({ length: 6 }, () =>
        claimOperationalAlertDrillCycle(cycle, { db }),
      ),
    );

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('lets the next cycle be claimed', async () => {
    const cycle = testCycle();
    const next = cycle + 1;
    testCycles.push(next);

    await expect(claimOperationalAlertDrillCycle(cycle, { db })).resolves.toBe(
      true,
    );
    await expect(claimOperationalAlertDrillCycle(next, { db })).resolves.toBe(
      true,
    );
  });
});
