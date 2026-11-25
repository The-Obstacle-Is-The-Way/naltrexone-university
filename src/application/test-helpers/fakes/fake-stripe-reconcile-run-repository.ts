import type {
  FinishedStripeReconcileRun,
  StripeReconcileRunRepository,
  StripeReconcileRunStart,
} from '@/src/application/ports/repositories';

type StoredRun = {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  failedSubscriptionIds: readonly string[];
  reportedAt: Date | null;
};

/** A run to seed: its start and, when it finished, its finish. */
export type SeededStripeReconcileRun = {
  startedAt: Date;
  finishedAt: Date | null;
  failedSubscriptionIds?: readonly string[];
};

/**
 * In-memory reconcile runs; `stripe-reconcile-run-contract.ts` pins it to
 * Postgres. Like Postgres, it copies every Date it stores or returns.
 */
export class FakeStripeReconcileRunRepository
  implements StripeReconcileRunRepository
{
  private readonly runs = new Map<string, StoredRun>();

  constructor(seed: readonly SeededStripeReconcileRun[] = []) {
    for (const run of seed) {
      const id = crypto.randomUUID();
      this.runs.set(id, {
        id,
        startedAt: new Date(run.startedAt),
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
        failedSubscriptionIds: [...(run.failedSubscriptionIds ?? [])],
        reportedAt: null,
      });
    }
  }

  async recordStart(startedAt: Date): Promise<string> {
    const id = crypto.randomUUID();
    this.runs.set(id, {
      id,
      startedAt: new Date(startedAt),
      finishedAt: null,
      failedSubscriptionIds: [],
      reportedAt: null,
    });
    return id;
  }

  async recordFinish(
    runId: string,
    finishedAt: Date,
    failedSubscriptionIds: readonly string[],
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    this.runs.set(runId, {
      ...run,
      finishedAt: new Date(finishedAt),
      failedSubscriptionIds: [...failedSubscriptionIds],
    });
  }

  async latestStartedAt(): Promise<Date | null> {
    const starts = [...this.runs.values()].map((run) => run.startedAt);
    if (starts.length === 0) return null;
    return new Date(Math.max(...starts.map((start) => start.getTime())));
  }

  async listUnreportedUnfinished(
    startedBefore: Date,
  ): Promise<StripeReconcileRunStart[]> {
    return [...this.runs.values()]
      .filter(
        (run) =>
          run.finishedAt === null &&
          run.reportedAt === null &&
          run.startedAt < startedBefore,
      )
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      .map(({ id, startedAt }) => ({ id, startedAt: new Date(startedAt) }));
  }

  async listLatestFinished(
    limit: number,
  ): Promise<FinishedStripeReconcileRun[]> {
    return [...this.runs.values()]
      .filter((run) => run.finishedAt !== null)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit)
      .map(({ id, startedAt, failedSubscriptionIds }) => ({
        id,
        startedAt: new Date(startedAt),
        failedSubscriptionIds: [...failedSubscriptionIds],
      }));
  }

  async markReported(
    runIds: readonly string[],
    reportedAt: Date,
  ): Promise<void> {
    for (const id of runIds) {
      const run = this.runs.get(id);
      if (run) this.runs.set(id, { ...run, reportedAt: new Date(reportedAt) });
    }
  }
}
