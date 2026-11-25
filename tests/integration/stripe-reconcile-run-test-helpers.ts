import * as schema from '@/db/schema';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';

const HOUR_MS = 60 * 60 * 1000;

/**
 * DEBT-501 item 9: empties `stripe_reconcile_runs` and records one daily run
 * that started and finished an hour before `now`, so the renewal job's watch
 * raises no stop and takes no alert cooldown. Only the reconcile writes that
 * table, and integration files run one at a time.
 */
export async function resetToRecentReconcileRun(
  db: DrizzleDb,
  now: Date,
): Promise<void> {
  const startedAt = new Date(now.getTime() - HOUR_MS);
  await db.delete(schema.stripeReconcileRuns);
  await db
    .insert(schema.stripeReconcileRuns)
    .values({ startedAt, finishedAt: startedAt });
}
