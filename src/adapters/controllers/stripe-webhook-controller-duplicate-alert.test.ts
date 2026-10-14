import { describe, expect, it } from 'vitest';
import { FakeSubscriptionRepository } from '@/src/application/test-helpers/fakes';
import { createTestWebhookSubscriptionUpdate } from '@/src/application/test-helpers/webhook-event-results';
import { createSubscription } from '@/src/domain/test-helpers';
import type { SubscriptionStatus } from '@/src/domain/value-objects';
import { processStripeWebhook } from './stripe-webhook-controller';
import {
  createStripeWebhookTestHarness,
  createWebhookPaymentGateway,
} from './test-helpers/stripe-webhook-controller-harness';

// The write guard keeps the stored subscription when the incoming one ranks
// lower. When the incoming one is entitled too, the user holds two live
// subscriptions.
class WriteGuardRejectingSubscriptionRepository extends FakeSubscriptionRepository {
  override async upsert() {
    return {
      persisted: false as const,
      reason: 'write_guard_rejected' as const,
      current: createSubscription(),
    };
  }
}

// BUG-343 option 5.
describe('processStripeWebhook duplicate-subscription alert', () => {
  const input = { rawBody: '{}', signature: 'sig' };
  const now = new Date('2026-10-14T12:00:00.000Z');

  function rejectedEvent(status: SubscriptionStatus, currentPeriodEnd: Date) {
    return createWebhookPaymentGateway({
      eventId: `evt_rejected_${status}`,
      type: 'customer.subscription.updated',
      subscriptionUpdate: createTestWebhookSubscriptionUpdate({
        userId: crypto.randomUUID(),
        status,
        currentPeriodEnd,
      }),
    });
  }

  it('raises a duplicate-subscription alert when it keeps the stored subscription over an entitled competitor', async () => {
    const harness = createStripeWebhookTestHarness({
      paymentGateway: rejectedEvent('active', new Date('2026-11-14T12:00:00Z')),
      subscriptions: new WriteGuardRejectingSubscriptionRepository(),
      now: () => now,
    });

    await processStripeWebhook(harness.deps, input);

    expect(harness.acknowledgment.operationalAlerts.raised).toEqual([
      { kind: 'stripe_duplicate_subscription', count: 1 },
    ]);
    expect(harness.logger.warnCalls).toContainEqual(
      expect.objectContaining({
        msg: 'Kept the stored subscription over an entitled competing one',
      }),
    );
  });

  it.each([
    ['a canceled one', 'canceled' as const, new Date('2026-11-14T12:00:00Z')],
    [
      'one whose period has ended',
      'active' as const,
      new Date('2026-10-01T12:00:00Z'),
    ],
  ])(
    'raises no alert when the competitor it rejects is %s',
    async (_label, status, currentPeriodEnd) => {
      const harness = createStripeWebhookTestHarness({
        paymentGateway: rejectedEvent(status, currentPeriodEnd),
        subscriptions: new WriteGuardRejectingSubscriptionRepository(),
        now: () => now,
      });

      await processStripeWebhook(harness.deps, input);

      expect(harness.acknowledgment.operationalAlerts.raised).toEqual([]);
    },
  );
});
