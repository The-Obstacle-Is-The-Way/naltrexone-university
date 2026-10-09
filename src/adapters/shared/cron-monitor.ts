import * as Sentry from '@sentry/nextjs';

export type CronMonitor = {
  slug: string;
  /** The crontab schedule, in UTC, that `vercel.json` gives the job. */
  schedule: string;
  /** Minutes after the scheduled time before a run counts as missed. */
  checkinMarginMinutes: number;
  /** Minutes a started run may take before it counts as timed out. */
  maxRuntimeMinutes: number;
};

const FLUSH_TIMEOUT_MS = 2_000;

// DEBT-505: Sentry Crons records each run of a scheduled job, so a run that
// fails, overruns or never starts shows on the monitor, which the watcher
// outside Sentry's email reads (scripts/operational-alert-watcher.ts). A
// check-in carries the monitor's name, status and timing only. Flushing
// before resolving keeps a serverless instance from freezing with a check-in
// still buffered; one that is lost anyway reads as a missed run, which the
// watcher reports.
export async function withCronMonitor<T>(
  monitor: CronMonitor,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await Sentry.withMonitor(monitor.slug, run, {
      schedule: { type: 'crontab', value: monitor.schedule },
      timezone: 'Etc/UTC',
      checkinMargin: monitor.checkinMarginMinutes,
      maxRuntime: monitor.maxRuntimeMinutes,
      failureIssueThreshold: 1,
      recoveryThreshold: 1,
    });
  } finally {
    await Sentry.flush(FLUSH_TIMEOUT_MS);
  }
}
