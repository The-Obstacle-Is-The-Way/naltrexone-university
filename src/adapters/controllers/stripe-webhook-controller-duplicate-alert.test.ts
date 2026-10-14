import { describe, expect, it } from 'vitest';
import { FakeSubscriptionRepository } from '@/src/application/test-helpers/fakes';
import { createTestWebhookSubscriptionUpdate } from '@/src/application/test-helpers/webhook-event-results';
import type { SubscriptionStatus } from '@/src/domain/value-objects';
import { processStripeWebhook } from './stripe-webhook-controller';
import {
  createStripeWebhookTestHarness,
  createWebhookPaymentGateway,
} from './test-helpers/stripe-webhook-controller-harness';

// BUG-343 option 5: the write guard keeps the stored subscription when the
// incoming one ranks lower. When the incoming one is entitled too, the user
// holds two live subscriptions.
describe('processStripeWebhook duplicate-subscription alert', () => {
  const input = { rawBody: '{}', signature: 'sig' };
  const now = new Date('2026-10-14T12:00:00.000Z');
  const storedPeriodEnd = new Date('2026-12-14T12:00:00.000Z');

  // The user's stored subscription: active, its period ending after the
  // incoming one's unless a case says otherwise.
  async function storedSubscriptionFor(userId: string) {
    const subscriptions = new FakeSubscriptionRepository();
    await subscriptions.upsert({
      userId,
      externalSubscriptionId: 'sub_stored',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: storedPeriodEnd,
      cancelAtPeriodEnd: false,
      startedAt: new Date('2026-09-14T12:00:00.000Z'),
      billingCycleAnchor: new Date('2026-09-14T12:00:00.000Z'),
      expectedVersion: null,
    });
    return subscriptions;
  }

  async function deliver(input_: {
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
  }) {
    const userId = crypto.randomUUID();
    const harness = createStripeWebhookTestHarness({
      paymentGateway: createWebhookPaymentGateway({
        eventId: `evt_${input_.status}_${input_.currentPeriodEnd.getTime()}`,
        type: 'customer.subscription.updated',
        subscriptionUpdate: createTestWebhookSubscriptionUpdate({
          userId,
          externalSubscriptionId: 'sub_incoming',
          status: input_.status,
          currentPeriodEnd: input_.currentPeriodEnd,
        }),
      }),
      subscriptions: await storedSubscriptionFor(userId),
      now: () => now,
    });
    await processStripeWebhook(harness.deps, input);
    return { harness, userId };
  }

  it('raises a duplicate-subscription alert when it keeps the stored subscription over an entitled competitor', async () => {
    const { harness, userId } = await deliver({
      status: 'active',
      currentPeriodEnd: new Date('2026-11-14T12:00:00.000Z'),
    });

    await expect(
      harness.subscriptions.findByUserId(userId),
    ).resolves.toMatchObject({ currentPeriodEnd: storedPeriodEnd });
    expect(harness.acknowledgment.operationalAlerts.raised).toEqual([
      { kind: 'stripe_duplicate_subscription', count: 1 },
    ]);
    expect(harness.logger.warnCalls).toContainEqual(
      expect.objectContaining({
        msg: 'Kept the stored subscription over an entitled competing one',
      }),
    );
  });

  it('raises no alert when the incoming subscription outranks the stored one and is stored', async () => {
    const later = new Date('2027-01-14T12:00:00.000Z');
    const { harness, userId } = await deliver({
      status: 'active',
      currentPeriodEnd: later,
    });

    await expect(
      harness.subscriptions.findByUserId(userId),
    ).resolves.toMatchObject({ currentPeriodEnd: later });
    expect(harness.acknowledgment.operationalAlerts.raised).toEqual([]);
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
      const { harness } = await deliver({ status, currentPeriodEnd });

      expect(harness.acknowledgment.operationalAlerts.raised).toEqual([]);
    },
  );
});
