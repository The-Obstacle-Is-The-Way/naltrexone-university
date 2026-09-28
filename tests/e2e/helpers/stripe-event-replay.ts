import { expect, type Page } from '@playwright/test';
import type Stripe from 'stripe';
import { createStripeTestClient } from './stripe-test-client';

// Stripe cannot push events to localhost, so the observational lanes fetch
// Stripe's real event and replay it through the app's signed webhook route.
// Only a local app with its webhook secret, and no configured email delivery,
// may receive a replay.

export async function findLatestStripeEvent(input: {
  stripe?: Stripe;
  type: string;
  objectId: string;
  createdSince: number;
  timeoutMs?: number;
}): Promise<Stripe.Event> {
  const stripe = input.stripe ?? createStripeTestClient();
  let found: Stripe.Event | undefined;
  await expect
    .poll(
      async () => {
        // Other test runs share the account's event stream, so every page
        // since createdSince is searched, up to a bound (#1179 review).
        const events = await stripe.events
          .list({
            type: input.type,
            created: { gte: input.createdSince },
            limit: 100,
          })
          .autoPagingToArray({ limit: 2_000 });
        found = events.find(
          (candidate) =>
            (candidate.data.object as { id?: string }).id === input.objectId,
        );
        return found !== undefined;
      },
      { timeout: input.timeoutMs ?? 15_000 },
    )
    .toBe(true);
  if (!found || found.livemode) {
    throw new Error(`Expected a real Stripe TEST ${input.type} event.`);
  }
  return found;
}

export async function replayStripeEventToLocalApp(
  page: Page,
  event: Stripe.Event,
): Promise<void> {
  const appUrl = new URL(page.url());
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!['localhost', '127.0.0.1'].includes(appUrl.hostname) || !webhookSecret) {
    throw new Error(
      'Stripe event replay requires a local app and its webhook secret.',
    );
  }
  if (process.env.RESEND_API_KEY) {
    throw new Error('Disable email delivery before replaying Stripe events.');
  }
  const stripe = createStripeTestClient();
  const payload = JSON.stringify(event);
  const response = await page.request.post(
    new URL('/api/stripe/webhook', appUrl).href,
    {
      data: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripe.webhooks.generateTestHeaderString({
          payload,
          secret: webhookSecret,
        }),
      },
    },
  );
  expect(response.ok()).toBe(true);
}
