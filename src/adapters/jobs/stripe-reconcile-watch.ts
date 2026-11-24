import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type {
  Logger,
  OperationalAlerts,
  StripeReconcileRunRepository,
} from '@/src/application/ports';

/**
 * The reconcile route's `maxDuration` (`app/api/cron/reconcile-stripe-subscriptions/route.ts`).
 * Next.js needs that one to be a literal, so a test pins the two together. A
 * run started longer ago than this has finished or was killed.
 */
export const RECONCILE_RUN_MAX_DURATION_SECONDS = 60;

const SECOND_MS = 1000;
// The reconcile cron runs daily; a day without a start means it stopped.
const RECONCILE_START_STALE_MS = 24 * 60 * 60 * SECOND_MS;
// A row that failed in each of this many finished runs in a row is reported.
const FAILING_ROW_RUNS = 3;

export type StripeReconcileWatchOutcome = {
  reconcile: 'running' | 'stopped' | 'unreadable';
  /** Subscriptions that failed in each of the last three finished runs. */
  failingRows: number;
};

function failingInEveryRun(
  runs: ReadonlyArray<{ failedSubscriptionIds: readonly string[] }>,
): string[] {
  const [first, ...rest] = runs;
  if (!first || runs.length < FAILING_ROW_RUNS) return [];
  return [...new Set(first.failedSubscriptionIds)].filter((id) =>
    rest.every((run) => run.failedSubscriptionIds.includes(id)),
  );
}

/**
 * DEBT-501 item 9: webhooks sync each subscription, and the daily reconcile
 * is the repair path behind them, so a reconcile that stops leaves drift and
 * duplicates unrepaired with no signal. The renewal job runs this each day,
 * as it checks GitHub's schedules. It reports a stop when no scheduled full
 * run started in the past day, or when any unreported run started longer ago
 * than the route can run and has no finish. A firewall rule, a failed
 * deployment, a rejected `CRON_SECRET`, a thrown reconciliation or a run in
 * which every row failed all look like that. Every unreported start is read,
 * not only the latest, since Hobby fires each cron anywhere in its hour and a
 * watch can be missed. Only a sent alert marks runs reported; a suppressed or
 * failed one leaves them for the next watch. It also reports a subscription
 * that failed in each of the last three finished runs, since a row whose
 * Stripe listing fails never reaches duplicate detection. It never throws:
 * the renewal job it runs in must not fail because of it.
 */
export async function checkStripeReconcileRunning(deps: {
  now: () => Date;
  runs: StripeReconcileRunRepository;
  alerts: OperationalAlerts;
  logger: Pick<Logger, 'error'>;
}): Promise<StripeReconcileWatchOutcome> {
  const now = deps.now();
  try {
    const latestStartedAt = await deps.runs.latestStartedAt();
    const noRecentStart =
      latestStartedAt === null ||
      now.getTime() - latestStartedAt.getTime() > RECONCILE_START_STALE_MS;
    const killed = await deps.runs.listUnreportedUnfinished(
      new Date(now.getTime() - RECONCILE_RUN_MAX_DURATION_SECONDS * SECOND_MS),
    );
    let reconcile: StripeReconcileWatchOutcome['reconcile'] = 'running';
    if (noRecentStart || killed.length > 0) {
      reconcile = 'stopped';
      deps.logger.error(
        {
          latestStartedAt: latestStartedAt?.toISOString() ?? null,
          unfinishedRunStarts: killed.map((run) => run.startedAt.toISOString()),
        },
        'Stripe reconcile stopped',
      );
      const outcome = await deps.alerts.raise({
        kind: 'stripe_reconcile_stopped',
        count: killed.length + (noRecentStart ? 1 : 0),
      });
      if (outcome === 'sent' && killed.length > 0) {
        await deps.runs.markReported(
          killed.map((run) => run.id),
          now,
        );
      }
    }

    const failing = failingInEveryRun(
      await deps.runs.listLatestFinished(FAILING_ROW_RUNS),
    );
    if (failing.length > 0) {
      deps.logger.error(
        { failingSubscriptionCount: failing.length },
        'Stripe reconcile keeps failing a row',
      );
      await deps.alerts.raise({
        kind: 'stripe_reconcile_row_failing',
        count: failing.length,
      });
    }
    return { reconcile, failingRows: failing.length };
  } catch (error) {
    deps.logger.error(
      { error: projectSafeErrorDiagnostics(error) },
      'Stripe reconcile runs unreadable',
    );
    return { reconcile: 'unreadable', failingRows: 0 };
  }
}
