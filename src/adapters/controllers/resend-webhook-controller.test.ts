import { describe, expect, it } from 'vitest';
import type { RenewalNoticeProviderOutcome } from '@/src/application/ports/repositories';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { processResendWebhook } from './resend-webhook-controller';

type Recorded = {
  providerEventId: string;
  outcome: RenewalNoticeProviderOutcome;
  observedAt: Date;
};

function createDeps() {
  const recorded: Recorded[] = [];
  const logger = new FakeLogger();
  return {
    recorded,
    logger,
    deps: {
      recordProviderOutcome: {
        execute: async (input: Recorded) => {
          recorded.push(input);
          return 'recorded' as const;
        },
      },
      logger,
    },
  };
}

function emailEvent(type: string, data: Record<string, unknown> = {}) {
  return {
    type,
    created_at: '2026-09-30T12:05:00.000Z',
    data: {
      created_at: '2026-09-30T12:00:00.000Z',
      email_id: 'email_123',
      from: 'Addiction Boards <notices@addictionboards.com>',
      to: ['subscriber@example.com'],
      subject: 'Annual subscription reminder',
      ...data,
    },
  };
}

// DEBT-414 F07: Resend's report on a message, mapped to a notice outcome.
describe('processResendWebhook', () => {
  it.each([
    ['email.delivered', {}, { kind: 'delivered' }],
    [
      'email.bounced',
      { bounce: { type: 'Permanent', subType: 'General', message: 'x' } },
      {
        kind: 'failed',
        failureClass: 'provider_bounced',
        failureCode: 'Permanent',
      },
    ],
    [
      'email.failed',
      { failed: { reason: 'free text that may name the recipient' } },
      {
        kind: 'failed',
        failureClass: 'provider_send_failed',
        failureCode: 'failed',
      },
    ],
    [
      'email.suppressed',
      { suppressed: { type: 'OnAccountSuppressionList', message: 'x' } },
      {
        kind: 'failed',
        failureClass: 'provider_suppressed',
        failureCode: 'OnAccountSuppressionList',
      },
    ],
  ] as const)('records %s', async (type, data, outcome) => {
    const { deps, recorded } = createDeps();

    await processResendWebhook(deps, emailEvent(type, data));

    expect(recorded).toEqual([
      {
        providerEventId: 'email_123',
        outcome,
        observedAt: new Date('2026-09-30T12:05:00.000Z'),
      },
    ]);
  });

  it.each([
    'email.sent',
    'email.delivery_delayed',
    'email.complained',
    'email.opened',
    'contact.created',
  ])('ignores %s', async (type) => {
    const { deps, recorded } = createDeps();

    await processResendWebhook(deps, {
      type,
      created_at: '2026-09-30T12:05:00.000Z',
      data: {},
    });

    expect(recorded).toEqual([]);
  });

  it.each([
    ['no email id', emailEvent('email.delivered', { email_id: '' })],
    [
      'no event time',
      { ...emailEvent('email.delivered'), created_at: 'yesterday' },
    ],
    ['no type', { data: {} }],
  ])(
    'rejects a report with %s as an invalid payload',
    async (_label, event) => {
      const { deps } = createDeps();

      await expect(processResendWebhook(deps, event)).rejects.toMatchObject({
        code: 'INVALID_WEBHOOK_PAYLOAD',
      });
    },
  );

  it('keeps a bounce type within the stored failure code length', async () => {
    const { deps, recorded } = createDeps();

    await processResendWebhook(
      deps,
      emailEvent('email.bounced', {
        bounce: { type: 'x'.repeat(300), subType: '', message: '' },
      }),
    );

    expect(recorded[0]?.outcome).toMatchObject({
      failureCode: 'x'.repeat(128),
    });
  });
});
