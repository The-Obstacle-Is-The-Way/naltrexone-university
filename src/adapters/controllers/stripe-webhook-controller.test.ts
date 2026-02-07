import { describe, expect, it, vi } from 'vitest';
import {
  processStripeWebhook,
  type StripeWebhookDeps,
} from '@/src/adapters/controllers/stripe-webhook-controller';
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

function createDeps(overrides: {
  paymentGateway: FakePaymentGateway;
  stripeEvents?: FakeStripeEventRepository;
  subscriptions?: FakeSubscriptionRepository;
  stripeCustomers?: FakeStripeCustomerRepository;
  logger?: FakeLogger;
}): {
  deps: StripeWebhookDeps;
  stripeEvents: FakeStripeEventRepository;
  subscriptions: FakeSubscriptionRepository;
  stripeCustomers: FakeStripeCustomerRepository;
  logger: FakeLogger;
} {
  const stripeEvents =
    overrides.stripeEvents ?? new FakeStripeEventRepository();
  const subscriptions =
    overrides.subscriptions ?? new FakeSubscriptionRepository();
  const stripeCustomers =
    overrides.stripeCustomers ?? new FakeStripeCustomerRepository();
  const logger = overrides.logger ?? new FakeLogger();

  return {
    deps: {
      paymentGateway: overrides.paymentGateway,
      logger,
      transaction: async (fn) =>
        fn({ stripeEvents, subscriptions, stripeCustomers }),
    },
    stripeEvents,
    subscriptions,
    stripeCustomers,
    logger,
  };
}

describe('processStripeWebhook', () => {
  it('claims, processes, and marks subscription events idempotently', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_1',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId: 'user_1',
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });

    const { deps, subscriptions, stripeCustomers } = createDeps({
      paymentGateway,
    });
    const insertSpy = vi.spyOn(stripeCustomers, 'insert');

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    await expect(subscriptions.findByUserId('user_1')).resolves.toMatchObject({
      userId: 'user_1',
      plan: 'monthly',
      status: 'active',
    });
    await expect(
      subscriptions.findByExternalSubscriptionId('sub_123'),
    ).resolves.toMatchObject({
      userId: 'user_1',
    });
    expect(insertSpy).toHaveBeenCalledTimes(1);

    // Second delivery of the same event should short-circuit (no double upsert).
    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it('marks non-subscription events as processed (no subscription update)', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_2',
        type: 'checkout.session.completed',
      },
    });

    const { deps, stripeEvents } = createDeps({ paymentGateway });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    await expect(stripeEvents.lock('evt_2')).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('updates stale stripe customer mappings in webhook context instead of failing', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_customer_remap',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId: 'user_1',
          externalCustomerId: 'cus_new',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });

    const { deps, stripeCustomers } = createDeps({ paymentGateway });
    await stripeCustomers.insert('user_1', 'cus_old');

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    await expect(stripeCustomers.findByUserId('user_1')).resolves.toEqual({
      stripeCustomerId: 'cus_new',
    });
  });

  it('prunes old processed stripe events after successful processing', async () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-02-01T00:00:00Z');
      vi.setSystemTime(now);

      const paymentGateway = new FakePaymentGateway({
        externalCustomerId: 'cus_test',
        checkoutUrl: 'https://stripe/checkout',
        portalUrl: 'https://stripe/portal',
        webhookResult: {
          eventId: 'evt_prune',
          type: 'checkout.session.completed',
        },
      });

      const { deps, stripeEvents } = createDeps({ paymentGateway });
      const pruneSpy = vi.spyOn(stripeEvents, 'pruneProcessedBefore');

      await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

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
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_prune_fail',
        type: 'checkout.session.completed',
      },
    });

    const stripeEvents = new FailingStripeEventRepository();
    const { deps, logger } = createDeps({ paymentGateway, stripeEvents });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        eventId: 'evt_prune_fail',
        error: 'boom',
      }),
      msg: 'Stripe event pruning failed',
    });
  });

  it('still succeeds when pruning processed stripe events fails', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_prune_fail_2',
        type: 'checkout.session.completed',
      },
    });

    const stripeEvents = new FailingStripeEventRepository();
    const { deps } = createDeps({ paymentGateway, stripeEvents });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    await expect(stripeEvents.lock('evt_prune_fail_2')).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('returns early when the event was already processed', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_3',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId: 'user_1',
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
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
    const lockSpy = vi.spyOn(stripeEvents, 'lock');

    const { deps, stripeCustomers } = createDeps({
      paymentGateway,
      stripeEvents,
    });
    const insertSpy = vi.spyOn(stripeCustomers, 'insert');

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(insertSpy).not.toHaveBeenCalled();
    expect(lockSpy).not.toHaveBeenCalled();
  });

  it('returns call to prune processed stripe events when event already processed', async () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-02-01T00:00:00Z');
      vi.setSystemTime(now);

      const paymentGateway = new FakePaymentGateway({
        externalCustomerId: 'cus_test',
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

      const { deps } = createDeps({ paymentGateway, stripeEvents });
      const pruneSpy = vi.spyOn(stripeEvents, 'pruneProcessedBefore');

      await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

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
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_4',
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId: 'user_1',
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
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

    const subscriptions = new FailingSubscriptionRepository();
    const { deps, stripeEvents } = createDeps({
      paymentGateway,
      subscriptions,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
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
