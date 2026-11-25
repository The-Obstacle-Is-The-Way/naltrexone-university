/** A scheduled full Stripe reconcile run whose start is recorded. */
export type StripeReconcileRunStart = {
  id: string;
  startedAt: Date;
};

/** A run whose reconciliation returned with a row that did not fail. */
export type FinishedStripeReconcileRun = StripeReconcileRunStart & {
  /** The Stripe subscription IDs of the rows that failed in that run. */
  failedSubscriptionIds: readonly string[];
};

/**
 * DEBT-501 item 9: one row per scheduled full reconcile run, holding its
 * start, its finish and whether a stop was reported, so the renewal job can
 * notice a run that never started, never finished, or keeps failing a row.
 * Every timestamp comes from the caller's clock.
 */
export interface StripeReconcileRunRepository {
  /** Records a run's start and returns its ID. */
  recordStart(startedAt: Date): Promise<string>;
  recordFinish(
    runId: string,
    finishedAt: Date,
    failedSubscriptionIds: readonly string[],
  ): Promise<void>;
  /** The latest recorded start, or null when no run has started. */
  latestStartedAt(): Promise<Date | null>;
  /** Unreported runs started before `startedBefore` with no finish, oldest first. */
  listUnreportedUnfinished(
    startedBefore: Date,
  ): Promise<StripeReconcileRunStart[]>;
  /** The latest finished runs, newest start first. */
  listLatestFinished(limit: number): Promise<FinishedStripeReconcileRun[]>;
  markReported(runIds: readonly string[], reportedAt: Date): Promise<void>;
}
