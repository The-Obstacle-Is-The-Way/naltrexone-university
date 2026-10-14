import { describe, expect, it } from 'vitest';
import type { WebhookEventResult } from '@/src/application/ports/gateways';
import { FakePaymentGateway } from '@/src/application/test-helpers/fakes';
import { createTestWebhookSubscriptionUpdate } from '@/src/application/test-helpers/webhook-event-results';
import { processStripeWebhook } from './stripe-webhook-controller';
import { createStripeWebhookTestHarness } from './test-helpers/stripe-webhook-controller-harness';

// BUG-343 option 3: a completed subscription Checkout ends the customer's
// other open subscription Sessions before its subscription is stored, and a
// failure fails the delivery so Stripe sends it again.
describe('processStripeWebhook completion sweep', () => {
  const input = { rawBody: '{}', signature: 'sig' };

  function completion(eventId: string): WebhookEventResult {
    return {
      eventId,
      type: 'checkout.session.completed',
      subscriptionUpdate: createTestWebhookSubscriptionUpdate({
        userId: crypto.randomUUID(),
      }),
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

  it("expires the customer's other open Checkout Sessions when a subscription Checkout completes", async () => {
    const paymentGateway = gatewayFor(completion('evt_completed'));
    const harness = createStripeWebhookTestHarness({ paymentGateway });

    await processStripeWebhook(harness.deps, input);

    expect(paymentGateway.otherCheckoutSessionInputs).toEqual([
      { externalCustomerId: 'cus_test', keepSessionId: 'cs_completed' },
    ]);
  });

  it('records the delivery as failed, before storing anything, when the sweep fails', async () => {
    const event = completion('evt_sweep_failed');
    const paymentGateway = gatewayFor(event, new Error('expire failed'));
    const harness = createStripeWebhookTestHarness({ paymentGateway });

    await expect(processStripeWebhook(harness.deps, input)).rejects.toThrow(
      'expire failed',
    );

    const [[eventId, stored] = []] = harness.stripeEvents.snapshot();
    expect(eventId).toBe('evt_sweep_failed');
    expect(stored?.processedAt).toBeNull();
    expect(stored?.error).toEqual(expect.any(String));
    const userId = event.subscriptionUpdate?.userId;
    if (!userId) throw new Error('Expected a subscription update');
    expect(await harness.subscriptions.findByUserId(userId)).toBeNull();
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
