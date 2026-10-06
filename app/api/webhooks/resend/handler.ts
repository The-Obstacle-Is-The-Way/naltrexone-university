import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import {
  processResendWebhook,
  type ResendWebhookDeps,
} from '@/src/adapters/controllers/resend-webhook-controller';
import { ResendWebhookNotConfiguredError } from '@/src/adapters/gateways/resend-webhook-verifier';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_TOO_MANY_REQUESTS,
} from '@/src/adapters/shared/http-status';
import { RESEND_WEBHOOK_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import { isApplicationError } from '@/src/application/errors';
import type { RateLimiter } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';

export type ResendWebhookRouteContainer = {
  logger: Logger;
  createRateLimiter: () => RateLimiter;
  verifyWebhook: (rawBody: string, headers: Headers) => unknown;
  recordProviderOutcome: ResendWebhookDeps['recordProviderOutcome'];
};

// DEBT-414 F07: Resend's delivery and bounce reports for sent emails. The
// signature is verified over the raw body before anything is parsed.
export function createResendWebhookHandler(
  createContainer: () => ResendWebhookRouteContainer,
) {
  return async function POST(req: Request) {
    const container = createContainer();

    try {
      const rate = await container.createRateLimiter().limit({
        key: `webhook:resend:${getClientIp(req.headers)}`,
        ...RESEND_WEBHOOK_RATE_LIMIT,
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
      container.logger.error(
        { error: projectSafeErrorDiagnostics(error) },
        'Resend webhook rate limiter failed',
      );
      return NextResponse.json(
        { error: 'Rate limiter unavailable' },
        { status: HTTP_SERVICE_UNAVAILABLE },
      );
    }

    let event: unknown;
    try {
      event = container.verifyWebhook(await req.text(), req.headers);
    } catch (error) {
      if (error instanceof ResendWebhookNotConfiguredError) {
        container.logger.error(
          { route: '/api/webhooks/resend' },
          'Resend webhook is not configured',
        );
        return NextResponse.json(
          { error: 'Webhook not configured' },
          { status: HTTP_SERVICE_UNAVAILABLE },
        );
      }
      // BUG-325: anyone can send a bad signature, so it is a warning; the
      // rate limiter bounds how many.
      container.logger.warn(
        {
          route: '/api/webhooks/resend',
          error: projectSafeErrorDiagnostics(error),
        },
        'Resend webhook signature verification failed',
      );
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: HTTP_BAD_REQUEST },
      );
    }

    try {
      await processResendWebhook(
        {
          recordProviderOutcome: container.recordProviderOutcome,
          logger: container.logger,
        },
        event,
      );
      return NextResponse.json({ received: true }, { status: HTTP_OK });
    } catch (error) {
      if (
        isApplicationError(error) &&
        error.code === 'INVALID_WEBHOOK_PAYLOAD'
      ) {
        container.logger.error(
          { error: projectSafeErrorDiagnostics(error) },
          'Resend webhook payload invalid',
        );
        return NextResponse.json(
          { error: 'Webhook validation failed' },
          { status: HTTP_BAD_REQUEST },
        );
      }
      container.logger.error(
        { error: projectSafeErrorDiagnostics(error) },
        'Resend webhook failed',
      );
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: HTTP_INTERNAL_SERVER_ERROR },
      );
    }
  };
}
