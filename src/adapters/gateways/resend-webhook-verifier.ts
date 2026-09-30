import { Resend } from 'resend';

// The endpoint refuses every report until the owner configures the webhook's
// signing secret, so an unsigned report is never processed.
export class ResendWebhookNotConfiguredError extends Error {
  constructor() {
    super('Resend webhook is not configured');
    this.name = 'ResendWebhookNotConfiguredError';
  }
}

// DEBT-414 F07: verifies a Resend webhook report's signature (Standard
// Webhooks, sent as svix-* headers) over the raw body, and returns its event.
export function createResendWebhookVerifier(config: {
  apiKey?: string | undefined;
  webhookSecret?: string | undefined;
}): (rawBody: string, headers: Headers) => unknown {
  return (rawBody, headers) => {
    if (!config.apiKey || !config.webhookSecret) {
      throw new ResendWebhookNotConfiguredError();
    }
    return new Resend(config.apiKey).webhooks.verify({
      payload: rawBody,
      headers: {
        id: headers.get('svix-id') ?? '',
        timestamp: headers.get('svix-timestamp') ?? '',
        signature: headers.get('svix-signature') ?? '',
      },
      webhookSecret: config.webhookSecret,
    });
  };
}
