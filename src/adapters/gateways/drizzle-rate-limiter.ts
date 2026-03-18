import { and, asc, eq, lt, or, sql } from 'drizzle-orm';
import { rateLimits } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  RateLimiter,
  RateLimitInput,
  RateLimitResult,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { DAY_MS, MS_PER_SECOND } from '@/src/domain/services';
import type { DrizzleDb } from '../shared/database-types';
import { PRUNE_BATCH_LIMIT } from '../shared/prune-constants';

const PRUNE_RETENTION_DAYS = 90;
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
      // Best-effort cleanup so stale windows do not accumulate forever.
      // Pruning failures must not block request handling.
      const cutoff = new Date(nowMs - PRUNE_RETENTION_DAYS * DAY_MS);
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

    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          key: rateLimits.key,
          windowStart: rateLimits.windowStart,
        })
        .from(rateLimits)
        .where(lt(rateLimits.windowStart, before))
        .orderBy(asc(rateLimits.windowStart))
        .limit(limit);

      if (rows.length === 0) return 0;

      const conditions = rows.map((row) =>
        and(
          eq(rateLimits.key, row.key),
          eq(rateLimits.windowStart, row.windowStart),
        ),
      );

      const deleted = await tx
        .delete(rateLimits)
        .where(or(...conditions))
        .returning({ key: rateLimits.key });

      return deleted.length;
    });
  }
}
