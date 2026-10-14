import { describe, expect, it } from 'vitest';
import type { WebhookEventResult } from '@/src/application/ports/gateways';
import { FakePaymentGateway } from '@/src/application/test-helpers/fakes';
import { createTestWebhookSubscriptionUpdate } from '@/src/application/test-helpers/webhook-event-results';
import { processStripeWebhook } from './stripe-webhook-controller';
import { createStripeWebhookTestHarness } from './test-helpers/stripe-webhook-controller-harness';

// BUG-343 option 3: once a completed subscription Checkout's subscription is
// stored, the webhook asks the gateway to end the customer's other open
// subscription Sessions. A failure fails the delivery, so Stripe sends it
// again; an event for a user this environment does not hold sweeps nothing.
describe('processStripeWebhook completion sweep', () => {
  const input = { rawBody: '{}', signature: 'sig' };
  const occurredAt = new Date('2026-10-14T05:00:00.000Z');

  function completion(eventId: string, userId: string): WebhookEventResult {
    return {
      eventId,
      type: 'checkout.session.completed',
      occurredAt,
      subscriptionUpdate: createTestWebhookSubscriptionUpdate({ userId }),
      completedSubscriptionCheckout: {
        sessionId: 'cs_completed',
        externalCustomerId: 'cus_test',
      },
    };
  }

  function gatewayFor(
    webhookResult: WebhookEventResult,
    otherCheckoutSessionsError?: Error,
  ): FakePaymentGateway {
    return new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult,
      ...(otherCheckoutSessionsError ? { otherCheckoutSessionsError } : {}),
    });
  }

  it("asks the gateway to expire the customer's other open Checkout Sessions created before the event, after storing the subscription", async () => {
    const userId = crypto.randomUUID();
    const paymentGateway = gatewayFor(completion('evt_completed', userId));
    const harness = createStripeWebhookTestHarness({ paymentGateway });

    await processStripeWebhook(harness.deps, input);

    expect(paymentGateway.otherCheckoutSessionInputs).toEqual([
      {
        externalCustomerId: 'cus_test',
        keepSessionId: 'cs_completed',
        createdBefore: occurredAt,
      },
    ]);
    expect(await harness.subscriptions.findByUserId(userId)).not.toBeNull();
  });

  it('fails the delivery when the sweep fails, and sweeps again when Stripe sends the event again', async () => {
    const userId = crypto.randomUUID();
    const event = completion('evt_sweep_failed', userId);
    const failing = gatewayFor(event, new Error('expire failed'));
    const harness = createStripeWebhookTestHarness({ paymentGateway: failing });

    await expect(processStripeWebhook(harness.deps, input)).rejects.toThrow(
      'expire failed',
    );
    const [[, stored] = []] = harness.stripeEvents.snapshot();
    expect(stored?.processedAt).not.toBeNull();

    const redelivered = gatewayFor(event);
    await processStripeWebhook(
      { ...harness.deps, paymentGateway: redelivered },
      input,
    );

    expect(redelivered.otherCheckoutSessionInputs).toHaveLength(1);
  });

  it('sweeps nothing for a user this environment does not hold', async () => {
    const userId = crypto.randomUUID();
    const paymentGateway = gatewayFor(completion('evt_foreign', userId));
    const harness = createStripeWebhookTestHarness({ paymentGateway });
    harness.subscriptions.markUserMissing(userId);

    await processStripeWebhook(harness.deps, input);

    expect(paymentGateway.otherCheckoutSessionInputs).toEqual([]);
  });

  it('does not sweep for an event that completes no subscription Checkout', async () => {
    const paymentGateway = gatewayFor({
      eventId: 'evt_updated',
      type: 'customer.subscription.updated',
      subscriptionUpdate: createTestWebhookSubscriptionUpdate({
        userId: crypto.randomUUID(),
      }),
    });
    const harness = createStripeWebhookTestHarness({ paymentGateway });

    await processStripeWebhook(harness.deps, input);

    expect(paymentGateway.otherCheckoutSessionInputs).toEqual([]);
  });
});
