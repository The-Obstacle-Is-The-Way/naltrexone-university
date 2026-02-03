import { describe, expect, it, vi } from 'vitest';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import {
  FakeLogger,
  FakePaymentGateway,
  FakeStripeCustomerRepository,
  FakeStripeEventRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';

class FailingStripeEventRepository extends FakeStripeEventRepository {
  async pruneProcessedBefore(_cutoff: Date, _limit: number): Promise<number> {
    throw new Error('boom');
  }
}

describe('processStripeWebhook', () => {
  it('claims, processes, and marks subscription events idempotently', async () => {
    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_1',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId: 'user_1',
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });

    const stripeEvents = new FakeStripeEventRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const stripeCustomers = new FakeStripeCustomerRepository();
    const insertSpy = vi.spyOn(stripeCustomers, 'insert');
    const logger = new FakeLogger();

    await processStripeWebhook(
      {
        paymentGateway,
        logger,
        transaction: async (fn) =>
          fn({ stripeEvents, subscriptions, stripeCustomers }),
      },
      { rawBody: 'raw', signature: 'sig' },
    );

    await expect(subscriptions.findByUserId('user_1')).resolves.toMatchObject({
      userId: 'user_1',
      plan: 'monthly',
      status: 'active',
    });
    await expect(
      subscriptions.findByStripeSubscriptionId('sub_123'),
    ).resolves.toMatchObject({
      userId: 'user_1',
    });
    expect(insertSpy).toHaveBeenCalledTimes(1);

    // Second delivery of the same event should short-circuit (no double upsert).
    await processStripeWebhook(
      {
        paymentGateway,
        logger,
        transaction: async (fn) =>
          fn({ stripeEvents, subscriptions, stripeCustomers }),
      },
      { rawBody: 'raw', signature: 'sig' },
    );

    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it('marks non-subscription events as processed (no subscription update)', async () => {
    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_2',
        type: 'checkout.session.completed',
      },
    });

    const stripeEvents = new FakeStripeEventRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const stripeCustomers = new FakeStripeCustomerRepository();
    const logger = new FakeLogger();

    await processStripeWebhook(
      {
        paymentGateway,
        logger,
        transaction: async (fn) =>
          fn({ stripeEvents, subscriptions, stripeCustomers }),
      },
      { rawBody: 'raw', signature: 'sig' },
    );

    await expect(stripeEvents.lock('evt_2')).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('prunes old processed stripe events after successful processing', async () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-02-01T00:00:00Z');
      vi.setSystemTime(now);

      const paymentGateway = new FakePaymentGateway({
        stripeCustomerId: 'cus_test',
        checkoutUrl: 'https://stripe/checkout',
        portalUrl: 'https://stripe/portal',
        webhookResult: {
          eventId: 'evt_prune',
          type: 'checkout.session.completed',
        },
      });

      const stripeEvents = new FakeStripeEventRepository();
      const subscriptions = new FakeSubscriptionRepository();
      const stripeCustomers = new FakeStripeCustomerRepository();
      const pruneSpy = vi.spyOn(stripeEvents, 'pruneProcessedBefore');
      const logger = new FakeLogger();

      await processStripeWebhook(
        {
          paymentGateway,
          logger,
          transaction: async (fn) =>
            fn({ stripeEvents, subscriptions, stripeCustomers }),
        },
        { rawBody: 'raw', signature: 'sig' },
      );

      const ninetyDaysMs = 86_400_000 * 90;
      expect(pruneSpy).toHaveBeenCalledWith(
        new Date(now.getTime() - ninetyDaysMs),
        100,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs a warning when pruning processed stripe events fails', async () => {
    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_prune_fail',
        type: 'checkout.session.completed',
      },
    });

    const stripeEvents = new FailingStripeEventRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const stripeCustomers = new FakeStripeCustomerRepository();
    const logger = new FakeLogger();

    await expect(
      processStripeWebhook(
        {
          paymentGateway,
          logger,
          transaction: async (fn) =>
            fn({ stripeEvents, subscriptions, stripeCustomers }),
        },
        { rawBody: 'raw', signature: 'sig' },
      ),
    ).resolves.toBeUndefined();

    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        eventId: 'evt_prune_fail',
        error: 'boom',
        retentionDays: 90,
        pruneLimit: 100,
      }),
      msg: 'Stripe event pruning failed',
    });
  });

  it('still succeeds when pruning processed stripe events fails', async () => {
    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_prune_fail_2',
        type: 'checkout.session.completed',
      },
    });

    const stripeEvents = new FailingStripeEventRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const stripeCustomers = new FakeStripeCustomerRepository();

    await processStripeWebhook(
      {
        paymentGateway,
        logger: new FakeLogger(),
        transaction: async (fn) =>
          fn({ stripeEvents, subscriptions, stripeCustomers }),
      },
      { rawBody: 'raw', signature: 'sig' },
    );

    await expect(stripeEvents.lock('evt_prune_fail_2')).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('returns early when the event was already processed', async () => {
    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_3',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId: 'user_1',
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });

    const stripeEvents = new FakeStripeEventRepository();
    await stripeEvents.claim('evt_3', 'customer.subscription.updated');
    await stripeEvents.markProcessed('evt_3');

    const subscriptions = new FakeSubscriptionRepository();
    const stripeCustomers = new FakeStripeCustomerRepository();
    const insertSpy = vi.spyOn(stripeCustomers, 'insert');
    const logger = new FakeLogger();

    await processStripeWebhook(
      {
        paymentGateway,
        logger,
        transaction: async (fn) =>
          fn({ stripeEvents, subscriptions, stripeCustomers }),
      },
      { rawBody: 'raw', signature: 'sig' },
    );

    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('still prunes old processed stripe events when the event was already processed', async () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-02-01T00:00:00Z');
      vi.setSystemTime(now);

      const paymentGateway = new FakePaymentGateway({
        stripeCustomerId: 'cus_test',
        checkoutUrl: 'https://stripe/checkout',
        portalUrl: 'https://stripe/portal',
        webhookResult: {
          eventId: 'evt_already_processed_prune',
          type: 'checkout.session.completed',
        },
      });

      const stripeEvents = new FakeStripeEventRepository();
      await stripeEvents.claim(
        'evt_already_processed_prune',
        'checkout.session.completed',
      );
      await stripeEvents.markProcessed('evt_already_processed_prune');

      const subscriptions = new FakeSubscriptionRepository();
      const stripeCustomers = new FakeStripeCustomerRepository();
      const pruneSpy = vi.spyOn(stripeEvents, 'pruneProcessedBefore');

      await processStripeWebhook(
        {
          paymentGateway,
          logger: new FakeLogger(),
          transaction: async (fn) =>
            fn({ stripeEvents, subscriptions, stripeCustomers }),
        },
        { rawBody: 'raw', signature: 'sig' },
      );

      const ninetyDaysMs = 86_400_000 * 90;
      expect(pruneSpy).toHaveBeenCalledWith(
        new Date(now.getTime() - ninetyDaysMs),
        100,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the event failed when processing throws', async () => {
    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_4',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId: 'user_1',
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });

    class FailingSubscriptionRepository extends FakeSubscriptionRepository {
      async upsert(): Promise<void> {
        throw new Error('boom');
      }
    }

    const stripeEvents = new FakeStripeEventRepository();
    const subscriptions = new FailingSubscriptionRepository();
    const stripeCustomers = new FakeStripeCustomerRepository();

    await expect(
      processStripeWebhook(
        {
          paymentGateway,
          logger: new FakeLogger(),
          transaction: async (fn) =>
            fn({ stripeEvents, subscriptions, stripeCustomers }),
        },
        { rawBody: 'raw', signature: 'sig' },
      ),
    ).rejects.toMatchObject({ message: 'boom' });

    const stored = await stripeEvents.lock('evt_4');

    expect(stored).toMatchObject({
      processedAt: null,
      error: expect.any(String),
    });

    const errorData = JSON.parse(stored.error ?? '{}') as Record<
      string,
      unknown
    >;
    expect(errorData).toMatchObject({
      name: 'Error',
      message: 'boom',
    });
  });
});
