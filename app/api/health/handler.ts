import { type SQLWrapper, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { HEALTH_CHECK_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import type { RateLimiter } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';

export type HealthHandlerDeps = {
  db: {
    execute: (query: string | SQLWrapper) => unknown;
  };
  logger: Logger;
  rateLimiter: RateLimiter;
  now: () => Date;
};

export function createHealthHandler(deps: HealthHandlerDeps) {
  return async function POST(req: Request) {
    try {
      const ip = getClientIp(req.headers);

      const rate = await deps.rateLimiter.limit({
        key: `health:${ip}`,
        ...HEALTH_CHECK_RATE_LIMIT,
      });

      if (!rate.success) {
        return NextResponse.json(
          { ok: false, error: 'Too many requests' },
          {
            status: 429,
            headers: {
              'Retry-After': String(rate.retryAfterSeconds),
              'X-RateLimit-Limit': String(rate.limit),
              'X-RateLimit-Remaining': String(rate.remaining),
            },
          },
        );
      }
    } catch (error) {
      deps.logger.error({ error }, 'Health check rate limiter failed');
      return NextResponse.json(
        { ok: false, error: 'Rate limiter unavailable' },
        { status: 503 },
      );
    }

    try {
      await deps.db.execute(sql`SELECT 1`);

      return NextResponse.json({
        ok: true,
        db: true,
        timestamp: deps.now().toISOString(),
      });
    } catch (error) {
      deps.logger.error({ error }, 'Health check failed');
      return NextResponse.json(
        {
          ok: false,
          error: 'Database connection failed',
        },
        { status: 500 },
      );
    }
  };
}
