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
// The reconcile cron runs daily in its 08:00 UTC hour and the watch in the
// 09:00 hour, so a missed day is reported that same day. A start recorded in
// the first seconds after 09:00, read by a watch in those same seconds, could
// still be reported as a stop; DEBT-501 item 9 accepts that rare edge.
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

type WatchDeps = {
  now: () => Date;
  runs: StripeReconcileRunRepository;
  alerts: OperationalAlerts;
  logger: Pick<Logger, 'error'>;
};

async function checkRunsStartAndFinish(
  deps: WatchDeps,
  now: Date,
): Promise<StripeReconcileWatchOutcome['reconcile']> {
  let latestStartedAt: Date | null;
  let killed: Awaited<
    ReturnType<WatchDeps['runs']['listUnreportedUnfinished']>
  >;
  try {
    latestStartedAt = await deps.runs.latestStartedAt();
    killed = await deps.runs.listUnreportedUnfinished(
      new Date(now.getTime() - RECONCILE_RUN_MAX_DURATION_SECONDS * SECOND_MS),
    );
  } catch (error) {
    deps.logger.error(
      { error: projectSafeErrorDiagnostics(error) },
      'Stripe reconcile runs unreadable',
    );
    return 'unreadable';
  }
  const noRecentStart =
    latestStartedAt === null ||
    now.getTime() - latestStartedAt.getTime() > RECONCILE_START_STALE_MS;
  if (!noRecentStart && killed.length === 0) return 'running';
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
    try {
      await deps.runs.markReported(
        killed.map((run) => run.id),
        now,
      );
    } catch (error) {
      // The alert went out; the next watch reports these runs again.
      deps.logger.error(
        { error: projectSafeErrorDiagnostics(error) },
        'Stripe reconcile runs not marked reported',
      );
    }
  }
  return 'stopped';
}

async function checkFailingRows(deps: WatchDeps): Promise<number> {
  let failing: string[];
  try {
    failing = failingInEveryRun(
      await deps.runs.listLatestFinished(FAILING_ROW_RUNS),
    );
  } catch (error) {
    deps.logger.error(
      { error: projectSafeErrorDiagnostics(error) },
      'Stripe reconcile finished runs unreadable',
    );
    return 0;
  }
  if (failing.length === 0) return 0;
  deps.logger.error(
    { failingSubscriptionCount: failing.length },
    'Stripe reconcile keeps failing a row',
  );
  await deps.alerts.raise({
    kind: 'stripe_reconcile_row_failing',
    count: failing.length,
  });
  return failing.length;
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
 * Stripe listing fails never reaches duplicate detection. Each check fails
 * on its own and is logged, so one failed read or write never hides the
 * other, and it never throws: the renewal job it runs in must not fail
 * because of it. `OperationalAlerts.raise` never rejects.
 */
export async function checkStripeReconcileRunning(
  deps: WatchDeps,
): Promise<StripeReconcileWatchOutcome> {
  const now = deps.now();
  const reconcile = await checkRunsStartAndFinish(deps, now);
  const failingRows = await checkFailingRows(deps);
  return { reconcile, failingRows };
}
