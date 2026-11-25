import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
} from 'drizzle-orm';
import { stripeReconcileRuns } from '@/db/schema';
import type {
  FinishedStripeReconcileRun,
  StripeReconcileRunRepository,
  StripeReconcileRunStart,
} from '@/src/application/ports/repositories';
import type { DrizzleDb } from '../shared/database-types';

/** DEBT-501 item 9: the scheduled reconcile's runs, in `stripe_reconcile_runs`. */
export class DrizzleStripeReconcileRunRepository
  implements StripeReconcileRunRepository
{
  constructor(private readonly db: DrizzleDb) {}

  async recordStart(startedAt: Date): Promise<string> {
    const [row] = await this.db
      .insert(stripeReconcileRuns)
      .values({ startedAt })
      .returning({ id: stripeReconcileRuns.id });
    if (!row) throw new Error('Reconcile run start returned no row');
    return row.id;
  }

  async recordFinish(
    runId: string,
    finishedAt: Date,
    failedSubscriptionIds: readonly string[],
  ): Promise<void> {
    await this.db
      .update(stripeReconcileRuns)
      .set({ finishedAt, failedSubscriptionIds: [...failedSubscriptionIds] })
      .where(eq(stripeReconcileRuns.id, runId));
  }

  async latestStartedAt(): Promise<Date | null> {
    const [row] = await this.db
      .select({ startedAt: stripeReconcileRuns.startedAt })
      .from(stripeReconcileRuns)
      .orderBy(desc(stripeReconcileRuns.startedAt))
      .limit(1);
    return row?.startedAt ?? null;
  }

  async listUnreportedUnfinished(
    startedBefore: Date,
  ): Promise<StripeReconcileRunStart[]> {
    return this.db
      .select({
        id: stripeReconcileRuns.id,
        startedAt: stripeReconcileRuns.startedAt,
      })
      .from(stripeReconcileRuns)
      .where(
        and(
          isNull(stripeReconcileRuns.finishedAt),
          isNull(stripeReconcileRuns.reportedAt),
          lt(stripeReconcileRuns.startedAt, startedBefore),
        ),
      )
      .orderBy(asc(stripeReconcileRuns.startedAt));
  }

  async listLatestFinished(
    limit: number,
  ): Promise<FinishedStripeReconcileRun[]> {
    return this.db
      .select({
        id: stripeReconcileRuns.id,
        startedAt: stripeReconcileRuns.startedAt,
        failedSubscriptionIds: stripeReconcileRuns.failedSubscriptionIds,
      })
      .from(stripeReconcileRuns)
      .where(isNotNull(stripeReconcileRuns.finishedAt))
      .orderBy(desc(stripeReconcileRuns.startedAt))
      .limit(limit);
  }

  async markReported(
    runIds: readonly string[],
    reportedAt: Date,
  ): Promise<void> {
    if (runIds.length === 0) return;
    await this.db
      .update(stripeReconcileRuns)
      .set({ reportedAt })
      .where(inArray(stripeReconcileRuns.id, [...runIds]));
  }
}
