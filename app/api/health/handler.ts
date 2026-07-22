import { type SQLWrapper, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_TOO_MANY_REQUESTS,
} from '@/src/adapters/shared/http-status';
import { HEALTH_CHECK_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { RateLimiter } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';

export type HealthHandlerDeps = {
  db: {
    execute: (query: string | SQLWrapper) => unknown;
  };
  logger: Logger;
  rateLimiter: RateLimiter;
};

async function handleHealthCheck(deps: HealthHandlerDeps, req: Request) {
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
          status: HTTP_TOO_MANY_REQUESTS,
          headers: {
            'Retry-After': String(rate.retryAfterSeconds),
            'X-RateLimit-Limit': String(rate.limit),
            'X-RateLimit-Remaining': String(rate.remaining),
          },
        },
      );
    }
  } catch (error) {
    deps.logger.error(
      { error: projectSafeErrorDiagnostics(error) },
      'Health check rate limiter failed',
    );
    return NextResponse.json(
      { ok: false, error: 'Rate limiter unavailable' },
      { status: HTTP_SERVICE_UNAVAILABLE },
    );
  }

  try {
    await deps.db.execute(sql`SELECT 1`);

    return NextResponse.json({
      ok: true,
      db: true,
    });
  } catch (error) {
    deps.logger.error(
      { error: projectSafeErrorDiagnostics(error) },
      'Health check failed',
    );
    return NextResponse.json(
      {
        ok: false,
        error: 'Database connection failed',
      },
      { status: HTTP_INTERNAL_SERVER_ERROR },
    );
  }
}

export function createHealthHandler(deps: HealthHandlerDeps) {
  return {
    GET: (req: Request) => handleHealthCheck(deps, req),
    POST: (req: Request) => handleHealthCheck(deps, req),
  };
}
