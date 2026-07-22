import { sql } from 'drizzle-orm';
import { rateLimits } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  RateLimiter,
  RateLimitInput,
  RateLimitResult,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { MS_PER_SECOND } from '@/src/domain/services';
import type { DrizzleDb } from '../shared/database-types';
import { PRUNE_BATCH_LIMIT } from '../shared/prune-constants';
import { ONE_MINUTE_MS } from '../shared/rate-limits';

const RATE_LIMIT_WINDOW_RETENTION_TARGET_MS = 1_440 * ONE_MINUTE_MS;
const NOOP_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export class DrizzleRateLimiter implements RateLimiter {
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
    private readonly logger: Logger = NOOP_LOGGER,
  ) {}

  async limit(input: RateLimitInput): Promise<RateLimitResult> {
    if (!isPositiveInteger(input.limit) || !isPositiveInteger(input.windowMs)) {
      return {
        success: true,
        limit: input.limit,
        remaining: input.limit,
        retryAfterSeconds: 0,
      };
    }

    const now = this.now();
    const nowMs = now.getTime();
    const windowStartMs = nowMs - (nowMs % input.windowMs);
    const windowStart = new Date(windowStartMs);
    const resetAtMs = windowStartMs + input.windowMs;
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((resetAtMs - nowMs) / MS_PER_SECOND),
    );

    const [row] = await this.db
      .insert(rateLimits)
      .values({
        key: input.key,
        windowStart,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });

    if (!row || !isPositiveInteger(row.count)) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to update rate-limit counter',
      );
    }

    const count = row.count;
    const remaining = Math.max(0, input.limit - count);

    if (count === 1) {
      // This target is not a hard maximum row age: cleanup is trigger-driven,
      // batch-limited, and fail-open, so an older backlog can remain.
      const cutoff = new Date(nowMs - RATE_LIMIT_WINDOW_RETENTION_TARGET_MS);
      try {
        await this.pruneExpiredWindows(cutoff, PRUNE_BATCH_LIMIT);
      } catch (error) {
        this.logger.warn(
          {
            key: input.key,
            limit: input.limit,
            windowMs: input.windowMs,
            error: error instanceof Error ? error.message : String(error),
          },
          'Rate-limit window pruning failed',
        );
      }
    }

    return {
      success: count <= input.limit,
      limit: input.limit,
      remaining,
      retryAfterSeconds,
    };
  }

  async pruneExpiredWindows(before: Date, limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit <= 0) return 0;

    const cutoffParam = sql.param(before, rateLimits.windowStart);
    const deleted = await this.db.execute<{ deleted: number }>(sql`
      WITH candidates AS (
        SELECT
          ${rateLimits.windowStart} AS window_start,
          ${rateLimits.key} AS key
        FROM ${rateLimits}
        WHERE ${rateLimits.windowStart} < ${cutoffParam}
        ORDER BY ${rateLimits.windowStart}, ${rateLimits.key}
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM ${rateLimits}
      USING candidates
      WHERE ${rateLimits.windowStart} = candidates.window_start
        AND ${rateLimits.key} = candidates.key
      RETURNING 1 AS deleted
    `);

    return deleted.length;
  }
}
