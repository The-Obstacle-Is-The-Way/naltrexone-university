import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import { constructStripeWebhookEvent } from './stripe-webhook-signature';

// The real SDK signs and verifies offline (an HMAC over the payload), so these
// cases prove real signatures, not a double's.
const stripe = new Stripe('sk_test_signature_only', {
  apiVersion: STRIPE_API_VERSION,
});
const CURRENT_SECRET = 'whsec_current_endpoint';
const NEXT_SECRET = 'whsec_next_endpoint';
const payload = JSON.stringify({
  id: 'evt_signature',
  object: 'event',
  type: 'invoice.updated',
  data: { object: {} },
});

function signedBy(secret: string): string {
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

function construct(signature: string, nextSecret?: string) {
  return constructStripeWebhookEvent({
    webhooks: stripe.webhooks,
    rawBody: payload,
    signature,
    secret: CURRENT_SECRET,
    nextSecret,
  });
}

describe('constructStripeWebhookEvent', () => {
  it('accepts an event signed with the configured secret', () => {
    expect(construct(signedBy(CURRENT_SECRET))).toMatchObject({
      id: 'evt_signature',
    });
  });

  it("accepts the next endpoint's event while a migration configures its secret", () => {
    expect(construct(signedBy(NEXT_SECRET), NEXT_SECRET)).toMatchObject({
      id: 'evt_signature',
    });
  });

  it("keeps accepting the configured endpoint's event while the next secret is set", () => {
    expect(construct(signedBy(CURRENT_SECRET), NEXT_SECRET)).toMatchObject({
      id: 'evt_signature',
    });
  });

  it("rejects the next endpoint's event when no next secret is configured", () => {
    expect(() => construct(signedBy(NEXT_SECRET))).toThrow(
      /No signatures found matching the expected signature/,
    );
  });

  it("rejects an event signed with neither secret, giving the configured secret's reason", () => {
    const stale = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: CURRENT_SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });

    // The configured secret matches but the timestamp is outside tolerance;
    // the next secret matches nothing. The configured secret's reason is the
    // one that tells a stale delivery from a forgery.
    expect(() => construct(stale, NEXT_SECRET)).toThrow(
      /Timestamp outside the tolerance zone/,
    );
  });
});
