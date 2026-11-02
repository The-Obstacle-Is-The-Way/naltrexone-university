import { sql } from 'drizzle-orm';
import type { ClerkBackendCallUsageBucket } from '@/src/adapters/shared/clerk-backend-call-keys';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { RATE_LIMIT_WINDOW_RETENTION_TARGET_MS } from '@/src/adapters/shared/rate-limits';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger } from '@/src/application/ports';

/** The advisory lock every roll-up holds while it writes. */
export const CLERK_BACKEND_CALL_USAGE_LOCK = 'clerk_backend_call_usage';

export type ClerkBackendCallUsageOutcome =
  | 'rolled_up'
  | 'up_to_date'
  | 'unavailable';

/** The roll-ups of the Clerk limiter's counters, kept in `clerk_backend_call_usage`. */
export type ClerkBackendCallUsageRollUps = {
  /** Writes a row, zero counts included, for each bucket with minutes to roll up; returns how many. */
  rollUp: () => Promise<number>;
};

/**
 * DEBT-503 item 4, step 1, in Postgres. One statement rolls each bucket's
 * settled minutes since its previous row into a new row. It goes back at most
 * as far as rate_limits keeps counters, and leaves out the minute still open
 * and the one before it: the limiter picks a counter's minute by the server's
 * clock before its write reaches the database. Runs hold one advisory lock and
 * read the database's clock once they have it, so a run that waited starts
 * where the earlier one ended.
 */
export function clerkBackendCallUsageRollUps(deps: {
  db: DrizzleDb;
  buckets: readonly ClerkBackendCallUsageBucket[];
}): ClerkBackendCallUsageRollUps {
  const buckets = sql.join(
    deps.buckets.map(
      (bucket, order) =>
        sql`(${bucket.bucket}::text, ${bucket.match}::text, ${bucket.prefix}::boolean, ${bucket.perMinuteLimit}::integer, ${order}::integer)`,
    ),
    sql`, `,
  );
  const retentionSeconds = RATE_LIMIT_WINDOW_RETENTION_TARGET_MS / 1_000;
  return {
    rollUp: () =>
      deps.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${CLERK_BACKEND_CALL_USAGE_LOCK}), 0)`,
        );
        const written = await tx.execute<{ bucket: string }>(sql`
          WITH bucket (name, match, prefix, per_minute_limit, position) AS (
            VALUES ${buckets}
          ),
          clock AS (
            SELECT
              date_trunc('minute', statement_timestamp())
                - make_interval(secs => ${retentionSeconds}) AS kept_from,
              date_trunc('minute', statement_timestamp())
                - interval '1 minute' AS settled_until
          ),
          period AS (
            SELECT
              bucket.name,
              bucket.per_minute_limit,
              greatest(
                clock.kept_from,
                (
                  SELECT max(usage.period_end)
                  FROM clerk_backend_call_usage usage
                  WHERE usage.bucket = bucket.name
                )
              ) AS period_start,
              clock.settled_until AS period_end
            FROM bucket, clock
          ),
          counter AS (
            SELECT DISTINCT ON (rate_limits.key, rate_limits.window_start)
              bucket.name,
              rate_limits.window_start,
              rate_limits.count
            FROM rate_limits
            CROSS JOIN clock
            JOIN bucket ON CASE
              WHEN bucket.prefix THEN starts_with(rate_limits.key, bucket.match)
              ELSE rate_limits.key = bucket.match
            END
            WHERE rate_limits.window_start >= clock.kept_from
              AND rate_limits.window_start < clock.settled_until
            ORDER BY rate_limits.key, rate_limits.window_start, bucket.position
          )
          INSERT INTO clerk_backend_call_usage (
            bucket,
            period_start,
            period_end,
            per_minute_limit,
            counted,
            busiest_minute,
            windows_over_limit,
            counted_over_limit
          )
          SELECT
            period.name,
            period.period_start,
            period.period_end,
            period.per_minute_limit,
            coalesce(sum(counter.count), 0),
            coalesce(max(counter.count), 0),
            count(counter.count) FILTER (
              WHERE counter.count > period.per_minute_limit
            ),
            coalesce(
              sum(counter.count - period.per_minute_limit) FILTER (
                WHERE counter.count > period.per_minute_limit
              ),
              0
            )
          FROM period
          LEFT JOIN counter
            ON counter.name = period.name
            AND counter.window_start >= period.period_start
            AND counter.window_start < period.period_end
          WHERE period.period_start < period.period_end
          GROUP BY
            period.name,
            period.period_start,
            period.period_end,
            period.per_minute_limit
          ON CONFLICT DO NOTHING
          RETURNING bucket
        `);
        return written.length;
      }),
  };
}

/**
 * DEBT-503 item 4, step 1: rolls the Clerk limiter's counters up, so the
 * busiest minutes and the requests refused outlast the day the counters are
 * kept. The renewal and reconcile jobs both run it, so runs are always less
 * than a day apart. It never throws: the job it runs in must not fail because
 * of it.
 */
export async function rollUpClerkBackendCallUsage(deps: {
  rollUps: ClerkBackendCallUsageRollUps;
  logger: Pick<Logger, 'warn'>;
}): Promise<ClerkBackendCallUsageOutcome> {
  try {
    return (await deps.rollUps.rollUp()) > 0 ? 'rolled_up' : 'up_to_date';
  } catch (error) {
    deps.logger.warn(
      { error: projectSafeErrorDiagnostics(error) },
      'clerk_backend_call_usage_roll_up_unavailable',
    );
    return 'unavailable';
  }
}
