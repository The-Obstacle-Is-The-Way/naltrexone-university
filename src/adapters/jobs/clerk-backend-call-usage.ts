import { sql } from 'drizzle-orm';
import type { ClerkBackendCallUsageBucket } from '@/src/adapters/shared/clerk-backend-call-keys';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger } from '@/src/application/ports';

export type ClerkBackendCallUsageOutcome =
  | 'rolled_up'
  | 'up_to_date'
  | 'unavailable';

/** The roll-ups of the Clerk limiter's counters, kept in `clerk_backend_call_usage`. */
export type ClerkBackendCallUsageRollUps = {
  /** Writes one row per bucket with counters to roll up; returns how many. */
  rollUp: () => Promise<number>;
};

/**
 * DEBT-503 item 4, step 1, in Postgres. One statement rolls each bucket's
 * closed minutes since its previous roll-up, at most a day back, into a row:
 * rate_limits prunes a counter once its window started a day ago, and the
 * minute still open is still counting. The period comes from the database's
 * clock, and a period already written is skipped, so two runs at once write
 * it once.
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
  return {
    rollUp: async () => {
      const written = await deps.db.execute<{ bucket: string }>(sql`
        WITH bucket (name, match, prefix, per_minute_limit, position) AS (
          VALUES ${buckets}
        ),
        period AS (
          SELECT
            bucket.name,
            bucket.per_minute_limit,
            greatest(
              date_trunc('minute', now()) - interval '1 day',
              (
                SELECT max(usage.period_end)
                FROM clerk_backend_call_usage usage
                WHERE usage.bucket = bucket.name
              )
            ) AS period_start,
            date_trunc('minute', now()) AS period_end
          FROM bucket
        ),
        counter AS (
          SELECT DISTINCT ON (rate_limits.key, rate_limits.window_start)
            bucket.name,
            rate_limits.window_start,
            rate_limits.count
          FROM rate_limits
          JOIN bucket ON CASE
            WHEN bucket.prefix THEN starts_with(rate_limits.key, bucket.match)
            ELSE rate_limits.key = bucket.match
          END
          WHERE rate_limits.window_start >= date_trunc('minute', now()) - interval '1 day'
            AND rate_limits.window_start < date_trunc('minute', now())
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
    },
  };
}

/**
 * DEBT-503 item 4, step 1: rolls the past day of the Clerk limiter's counters
 * up, so the busiest minutes and the requests refused outlast the day the
 * counters are kept. It never throws: the renewal job it runs in must not
 * fail because of it.
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
