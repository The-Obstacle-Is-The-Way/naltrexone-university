import { sql } from 'drizzle-orm';
import { rateLimits } from '@/db/schema';
import type {
  RateLimiter,
  RateLimitInput,
  RateLimitResult,
} from '@/src/application/ports/gateways';
import type { DrizzleDb } from '../shared/database-types';

const SECOND_MS = 1000;

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export class DrizzleRateLimiter implements RateLimiter {
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
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
      Math.ceil((resetAtMs - nowMs) / SECOND_MS),
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

    const count = row?.count ?? 1;
    const remaining = Math.max(0, input.limit - count);

    return {
      success: count <= input.limit,
      limit: input.limit,
      remaining,
      retryAfterSeconds,
    };
  }
}
