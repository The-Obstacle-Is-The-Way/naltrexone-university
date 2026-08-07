import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { SendDueRenewalNoticesJobResult } from '@/src/adapters/jobs/send-due-renewal-notices';
import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_TOO_MANY_REQUESTS,
  HTTP_UNAUTHORIZED,
} from '@/src/adapters/shared/http-status';
import { CRON_SEND_RENEWAL_NOTICES_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger, RateLimiter } from '@/src/application/ports';

const ROUTE = '/api/cron/send-renewal-notices';

type AuthorizationTokenResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: 'missing_authorization_header' | 'malformed_authorization_header';
    };

export type RenewalNoticeCronHandlerDependencies = {
  cronSecret: string | undefined;
  logger: Pick<Logger, 'warn' | 'error'>;
  createRateLimiter: () => RateLimiter;
  run: () => Promise<SendDueRenewalNoticesJobResult>;
};

function getAuthorizationToken(req: Request): AuthorizationTokenResult {
  const header = req.headers.get('authorization');
  if (!header) {
    return { ok: false, reason: 'missing_authorization_header' };
  }
  const separatorIndex = header.indexOf(' ');
  if (separatorIndex < 0) {
    return { ok: false, reason: 'malformed_authorization_header' };
  }
  const scheme = header.slice(0, separatorIndex);
  const token = header.slice(separatorIndex + 1);
  if (scheme !== 'Bearer' || !token) {
    return { ok: false, reason: 'malformed_authorization_header' };
  }
  return { ok: true, token };
}

function isValidCronToken(token: string, secret: string): boolean {
  const tokenHash = createHash('sha256').update(token).digest();
  const secretHash = createHash('sha256').update(secret).digest();
  return timingSafeEqual(tokenHash, secretHash);
}

export function createRenewalNoticeCronHandler(
  resolveDependencies: () => RenewalNoticeCronHandlerDependencies,
): (req: Request) => Promise<NextResponse> {
  return async (req) => {
    const dependencies = resolveDependencies();
    const authorization = getAuthorizationToken(req);
    if (!authorization.ok) {
      dependencies.logger.warn(
        { route: ROUTE, reason: authorization.reason },
        'Unauthorized cron request',
      );
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: HTTP_UNAUTHORIZED },
      );
    }

    if (!dependencies.cronSecret) {
      dependencies.logger.error(
        { route: ROUTE },
        'CRON_SECRET is not configured',
      );
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: HTTP_UNAUTHORIZED },
      );
    }
    if (!isValidCronToken(authorization.token, dependencies.cronSecret)) {
      dependencies.logger.warn(
        { route: ROUTE, reason: 'invalid_token' },
        'Unauthorized cron request',
      );
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: HTTP_UNAUTHORIZED },
      );
    }

    try {
      const rate = await dependencies.createRateLimiter().limit({
        key: 'cron:send-renewal-notices',
        ...CRON_SEND_RENEWAL_NOTICES_RATE_LIMIT,
      });
      if (!rate.success) {
        return NextResponse.json(
          { error: 'Too many requests' },
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
      dependencies.logger.error(
        { route: ROUTE, error: projectSafeErrorDiagnostics(error) },
        'Renewal notice cron rate limiter failed',
      );
      return NextResponse.json(
        { error: 'Rate limiter unavailable' },
        { status: HTTP_SERVICE_UNAVAILABLE },
      );
    }

    try {
      const result = await dependencies.run();
      return NextResponse.json(result, { status: HTTP_OK });
    } catch (error) {
      dependencies.logger.error(
        { route: ROUTE, error: projectSafeErrorDiagnostics(error) },
        'Renewal notice cron failed',
      );
      return NextResponse.json(
        { error: 'Internal error' },
        { status: HTTP_INTERNAL_SERVER_ERROR },
      );
    }
  };
}
