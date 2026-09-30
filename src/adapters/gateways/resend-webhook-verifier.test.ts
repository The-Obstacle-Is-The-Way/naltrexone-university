import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createResendWebhookVerifier,
  ResendWebhookNotConfiguredError,
} from './resend-webhook-verifier';

const secretBytes = randomBytes(24);
const webhookSecret = `whsec_${secretBytes.toString('base64')}`;
const apiKey = 're_test';
const body = JSON.stringify({
  type: 'email.delivered',
  created_at: '2026-09-30T12:05:00.000Z',
  data: { email_id: 'email_123' },
});

// Signs as Resend does (Standard Webhooks: HMAC-SHA256 over id.timestamp.body).
function signedHeaders(
  payload: string,
  {
    key = secretBytes,
    timestamp = Math.floor(Date.now() / 1000),
  }: { key?: Buffer; timestamp?: number } = {},
): Headers {
  const id = 'msg_test';
  const signature = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return new Headers({
    'svix-id': id,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${signature}`,
  });
}

// DEBT-414 F07: only a report Resend signed is trusted.
describe('createResendWebhookVerifier', () => {
  const verify = createResendWebhookVerifier({ apiKey, webhookSecret });

  it('returns the event of a correctly signed report', () => {
    expect(verify(body, signedHeaders(body))).toEqual(JSON.parse(body));
  });

  it.each([
    ['a changed body', () => verify(`${body} `, signedHeaders(body))],
    [
      'another secret',
      () => verify(body, signedHeaders(body, { key: randomBytes(24) })),
    ],
    [
      'a stale timestamp',
      () =>
        verify(
          body,
          signedHeaders(body, {
            timestamp: Math.floor(Date.now() / 1000) - 3600,
          }),
        ),
    ],
    ['no signature headers', () => verify(body, new Headers())],
  ])('rejects %s', (_label, attempt) => {
    expect(attempt).toThrow();
  });

  it.each([
    ['no signing secret', { apiKey }],
    ['no API key', { webhookSecret }],
  ])('refuses every report while it has %s', (_label, config) => {
    expect(() =>
      createResendWebhookVerifier(config)(body, signedHeaders(body)),
    ).toThrow(ResendWebhookNotConfiguredError);
  });
});
