import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createResendWebhookHandler,
  type ResendWebhookRouteContainer,
} from '@/app/api/webhooks/resend/handler';
import { createResendWebhookVerifier } from '@/src/adapters/gateways/resend-webhook-verifier';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import {
  FakeLogger,
  FakeRateLimiter,
  FakeRenewalNoticeDeliveryRepository,
} from '@/src/application/test-helpers/fakes';
import { FakeSha256Hasher } from '@/src/application/test-helpers/fakes/fake-sha256-hasher';
import { RecordRenewalNoticeProviderOutcomeUseCase } from '@/src/application/use-cases/record-renewal-notice-provider-outcome';

const secretBytes = randomBytes(24);
const webhookSecret = `whsec_${secretBytes.toString('base64')}`;
const now = new Date('2026-09-30T12:00:00.000Z');
const deliveryId = '11111111-1111-4111-8111-111111111111';

async function acceptedNotice() {
  const hasher = new FakeSha256Hasher();
  const deliveries = new FakeRenewalNoticeDeliveryRepository(() => now, hasher);
  const payload = createTransactionalEmailPayloadSnapshot(
    {
      from: 'Addiction Boards <notices@addictionboards.com>',
      to: 'subscriber@example.com',
      replyTo: 'support@addictionboards.com',
      subject: 'Annual subscription reminder',
      html: '<p>Annual subscription reminder</p>',
      text: 'Annual subscription reminder',
    },
    hasher,
  );
  await deliveries.saveQueued({
    id: deliveryId,
    noticeKind: 'annual_reminder',
    consentRecordId: null,
    externalSubscriptionId: 'sub_notice',
    applicableAt: new Date('2026-11-04T12:00:00.000Z'),
    disclosureVersion: '2026-08-05',
    destination: 'subscriber@example.com',
    providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(deliveryId),
    payloadSnapshot: payload.snapshot,
    payloadHash: payload.hash,
  });
  await deliveries.claim({ id: deliveryId, attemptId: 'a1', startedAt: now });
  await deliveries.markAccepted({
    id: deliveryId,
    attemptId: 'a1',
    providerEventId: 'email_123',
    completedAt: now,
  });
  return deliveries;
}

type SetupOptions = {
  configured?: boolean;
  rateLimited?: boolean;
  rateLimiterFails?: boolean;
  recordingFails?: boolean;
};

async function setup({
  configured = true,
  rateLimited = false,
  rateLimiterFails = false,
  recordingFails = false,
}: SetupOptions = {}) {
  const logger = new FakeLogger();
  const rateLimiter = new FakeRateLimiter(
    rateLimiterFails
      ? new Error('rate limiter down')
      : {
          success: !rateLimited,
          limit: 100,
          remaining: rateLimited ? 0 : 99,
          retryAfterSeconds: rateLimited ? 30 : 0,
        },
  );
  const deliveries = await acceptedNotice();
  const container: ResendWebhookRouteContainer = {
    logger,
    createRateLimiter: () => rateLimiter,
    verifyWebhook: createResendWebhookVerifier(
      configured ? { apiKey: 're_test', webhookSecret } : {},
    ),
    recordProviderOutcome: recordingFails
      ? {
          execute: async () => {
            throw new Error('database unavailable');
          },
        }
      : new RecordRenewalNoticeProviderOutcomeUseCase(deliveries, logger),
  };
  return {
    POST: createResendWebhookHandler(() => container),
    deliveries,
    logger,
  };
}

// A request signed as Resend signs it (Standard Webhooks, svix-* headers).
function signedRequest(event: unknown, { key = secretBytes } = {}): Request {
  const body = JSON.stringify(event);
  const id = 'msg_test';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return new Request('https://addictionboards.com/api/webhooks/resend', {
    method: 'POST',
    body,
    headers: {
      'svix-id': id,
      'svix-timestamp': String(timestamp),
      'svix-signature': `v1,${signature}`,
      'x-forwarded-for': '203.0.113.7',
    },
  });
}

const delivered = {
  type: 'email.delivered',
  created_at: '2026-09-30T12:05:00.000Z',
  data: { email_id: 'email_123' },
};

// DEBT-414 F07: Resend's delivery and bounce reports for renewal notices.
describe('POST /api/webhooks/resend', () => {
  it('records a signed delivery report', async () => {
    const { POST, deliveries } = await setup();

    const response = await POST(signedRequest(delivered));

    expect(response.status).toBe(200);
    await expect(deliveries.findById(deliveryId)).resolves.toMatchObject({
      status: 'delivered',
    });
  });

  it('records a signed bounce as a notice that did not arrive', async () => {
    const { POST, deliveries } = await setup();

    const response = await POST(
      signedRequest({
        type: 'email.bounced',
        created_at: '2026-09-30T12:05:00.000Z',
        data: {
          email_id: 'email_123',
          bounce: { type: 'Permanent', subType: 'General', message: 'x' },
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(deliveries.findById(deliveryId)).resolves.toMatchObject({
      status: 'terminal_failure',
      failureClass: 'provider_bounced',
    });
  });

  it('refuses a report signed with another secret, and changes nothing', async () => {
    const { POST, deliveries, logger } = await setup();

    const response = await POST(
      signedRequest(delivered, { key: randomBytes(24) }),
    );

    expect(response.status).toBe(400);
    await expect(deliveries.findById(deliveryId)).resolves.toMatchObject({
      status: 'accepted',
    });
    expect(logger.errorCalls.map((call) => call.msg)).toContain(
      'Resend webhook signature verification failed',
    );
  });

  it('refuses every report until the webhook is configured', async () => {
    const { POST, deliveries, logger } = await setup({ configured: false });

    const response = await POST(signedRequest(delivered));

    expect(response.status).toBe(503);
    await expect(deliveries.findById(deliveryId)).resolves.toMatchObject({
      status: 'accepted',
    });
    expect(logger.errorCalls.map((call) => call.msg)).toContain(
      'Resend webhook is not configured',
    );
  });

  it('rejects a signed report with an invalid payload', async () => {
    const { POST } = await setup();

    const response = await POST(
      signedRequest({ ...delivered, data: { email_id: '' } }),
    );

    expect(response.status).toBe(400);
  });

  it('returns 503 when the rate limiter fails', async () => {
    const { POST } = await setup({ rateLimiterFails: true });

    const response = await POST(signedRequest(delivered));

    expect(response.status).toBe(503);
  });

  it('returns 500 when recording fails, so Resend retries', async () => {
    const { POST, logger } = await setup({ recordingFails: true });

    const response = await POST(signedRequest(delivered));

    expect(response.status).toBe(500);
    expect(logger.errorCalls.map((call) => call.msg)).toContain(
      'Resend webhook failed',
    );
  });

  it('returns 429 when rate limited, before verifying', async () => {
    const { POST, deliveries } = await setup({ rateLimited: true });

    const response = await POST(signedRequest(delivered));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    await expect(deliveries.findById(deliveryId)).resolves.toMatchObject({
      status: 'accepted',
    });
  });
});
