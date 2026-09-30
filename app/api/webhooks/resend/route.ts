import { createContainer } from '@/lib/container';
import { createRequestContext, getRequestLogger } from '@/lib/request-context';
import { createResendWebhookHandler } from './handler';

export const maxDuration = 30;

// DEBT-414 F07: Resend's delivery and bounce reports for renewal notices.
export const POST = createResendWebhookHandler(() => {
  const ctx = createRequestContext();
  const logger = getRequestLogger(ctx);
  const container = createContainer({ primitives: { logger } });

  return {
    logger: container.logger,
    createRateLimiter: container.createRateLimiter,
    verifyWebhook: container.createResendWebhookVerifier(),
    recordProviderOutcome:
      container.createRecordRenewalNoticeProviderOutcomeUseCase(),
  };
});
