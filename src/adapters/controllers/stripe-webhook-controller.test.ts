import { describe, expect, it, vi } from 'vitest';
import { STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD } from '@/src/adapters/shared/stripe-subscription-errors';
import { ApplicationError } from '@/src/application/errors';
import {
  FakePaymentGateway,
  FakeStripeCustomerRepository,
  FakeStripeEventRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { createTestWebhookSubscriptionUpdate } from '@/src/application/test-helpers/webhook-event-results';
import { processStripeWebhook } from './stripe-webhook-controller';
import {
  createRollbackAwareStripeWebhookTestHarness,
  createStripeWebhookTestHarness,
  createWebhookPaymentGateway,
} from './test-helpers/stripe-webhook-controller-harness';

class FailingStripeEventRepository extends FakeStripeEventRepository {
  override async pruneProcessedBefore(
    _cutoff: Date,
    _limit: number,
  ): Promise<number> {
    throw new Error('boom');
  }
}

class FailingSubscriptionRepository extends FakeSubscriptionRepository {
  override async upsert(): Promise<never> {
    throw new Error('boom');
  }
}

class DriverFailingStripeCustomerRepository extends FakeStripeCustomerRepository {
  override async insert(): Promise<never> {
    const postgresError = Object.assign(
      new Error('duplicate key exposes raw Stripe customer text'),
      {
        code: '23505',
        constraint: 'stripe_customers_stripe_customer_id_unique',
        detail: 'Key (stripe_customer_id)=(cus_raw) already exists',
      },
    );
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Failed to upsert Stripe customer mapping',
      undefined,
      { cause: postgresError },
    );
  }
}

class ConcurrentlyCompletingStripeEventRepository extends FakeStripeEventRepository {
  override async peek(eventId: string) {
    const snapshot = await super.peek(eventId);
    await this.markProcessed(eventId);
    return snapshot;
  }
}

class ThrowingPaymentGateway extends FakePaymentGateway {
  constructor(private readonly error: unknown) {
    super({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_unused',
        type: 'customer.subscription.updated',
      },
    });
  }

  override async processWebhookEvent(): Promise<never> {
    throw this.error;
  }
}

function subscriptionUpdatedEvent(eventId: string, userId: string) {
  return createWebhookPaymentGateway({
    eventId,
    type: 'customer.subscription.updated',
    subscriptionUpdate: createTestWebhookSubscriptionUpdate({ userId }),
  });
}

// An event the controller records as processed without any domain write.
function unhandledEvent(eventId: string) {
  return createWebhookPaymentGateway({
    eventId,
    type: 'checkout.session.completed',
  });
}

const NINETY_DAYS_MS = 86_400_000 * 90;

describe('processStripeWebhook event lifecycle', () => {
  it('skips subscription webhooks that are missing metadata.user_id', async () => {
    const paymentGateway = new ThrowingPaymentGateway(
      new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription metadata.user_id is required',
        {
          'metadata.user_id': ['required'],
        },
      ),
    );

    const { deps, stripeEvents, logger } = createStripeWebhookTestHarness({
      paymentGateway,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    expect(stripeEvents.snapshot()).toEqual([]);
    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        reason: 'metadata_missing',
        code: 'STRIPE_ERROR',
        fieldErrors: {
          'metadata.user_id': ['required'],
        },
      }),
      msg: 'Skipping Stripe subscription webhook with missing metadata.user_id',
    });
  });

  it('skips subscription webhooks whose e2e owner differs from this webhook owner', async () => {
    const paymentGateway = new ThrowingPaymentGateway(
      new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription metadata.e2e_owner does not match this webhook owner',
        {
          [STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD]: ['mismatch'],
        },
      ),
    );

    const { deps, stripeEvents, logger } = createStripeWebhookTestHarness({
      paymentGateway,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    expect(stripeEvents.snapshot()).toEqual([]);
    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        reason: 'e2e_owner_mismatch',
        code: 'STRIPE_ERROR',
        fieldErrors: {
          [STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD]: ['mismatch'],
        },
      }),
      msg: 'Skipping Stripe subscription webhook from a different E2E owner',
    });
  });

  it('continues to throw unrelated Stripe processing errors', async () => {
    const paymentGateway = new ThrowingPaymentGateway(
      new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription price id does not match a configured plan',
      ),
    );

    const { deps, stripeEvents, logger } = createStripeWebhookTestHarness({
      paymentGateway,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe subscription price id does not match a configured plan',
    });

    expect(stripeEvents.snapshot()).toEqual([]);
    expect(logger.warnCalls).toEqual([]);
  });

  it('claims, processes, and marks subscription events idempotently', async () => {
    const userId = crypto.randomUUID();
    const paymentGateway = subscriptionUpdatedEvent('evt_1', userId);

    const { deps, subscriptions, stripeCustomers } =
      createStripeWebhookTestHarness({ paymentGateway });
    const insertSpy = vi.spyOn(stripeCustomers, 'insert');

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    await expect(subscriptions.findByUserId(userId)).resolves.toMatchObject({
      userId,
      plan: 'monthly',
      status: 'active',
    });
    await expect(
      subscriptions.findByExternalSubscriptionId('sub_123'),
    ).resolves.toMatchObject({
      userId,
    });
    expect(insertSpy).toHaveBeenCalledTimes(1);

    // Second delivery of the same event should short-circuit (no double upsert).
    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it('marks non-subscription events as processed (no subscription update)', async () => {
    const paymentGateway = unhandledEvent('evt_2');

    const { deps, stripeEvents } = createStripeWebhookTestHarness({
      paymentGateway,
    });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

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

      const paymentGateway = unhandledEvent('evt_prune');

      const { deps, stripeEvents } = createStripeWebhookTestHarness({
        paymentGateway,
      });
      const pruneSpy = vi.spyOn(stripeEvents, 'pruneProcessedBefore');

      await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

      expect(pruneSpy).toHaveBeenCalledWith(
        new Date(now.getTime() - NINETY_DAYS_MS),
        100,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call Date.now when computing stripe prune cutoff', async () => {
    const paymentGateway = unhandledEvent('evt_prune_clock_injection');

    const { deps } = createStripeWebhookTestHarness({ paymentGateway });
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now should not be used in processStripeWebhook');
    });

    try {
      await expect(
        processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
      ).resolves.toBeUndefined();
      expect(dateNowSpy).not.toHaveBeenCalled();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('logs a warning when pruning processed stripe events fails', async () => {
    const paymentGateway = unhandledEvent('evt_prune_fail');

    const stripeEvents = new FailingStripeEventRepository();
    const { deps, logger } = createStripeWebhookTestHarness({
      paymentGateway,
      stripeEvents,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        eventId: 'evt_prune_fail',
        error: { name: 'Error' },
      }),
      msg: 'Stripe event pruning failed',
    });
    expect(JSON.stringify(logger.warnCalls)).not.toContain('boom');
  });

  it('still succeeds when pruning processed stripe events fails', async () => {
    const paymentGateway = unhandledEvent('evt_prune_fail_2');

    const stripeEvents = new FailingStripeEventRepository();
    const { deps } = createStripeWebhookTestHarness({
      paymentGateway,
      stripeEvents,
    });

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    await expect(stripeEvents.lock('evt_prune_fail_2')).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('isolates Stripe-event and renewal-consent pruning in separate transactions', async () => {
    const paymentGateway = unhandledEvent('evt_prune_transaction_isolation');
    const { deps } = createStripeWebhookTestHarness({ paymentGateway });
    const originalTransaction = deps.transaction;
    let transactionCount = 0;
    deps.transaction = async (fn) => {
      transactionCount += 1;
      return originalTransaction(fn);
    };

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(transactionCount).toBe(3);
  });

  it('returns early when the event was already processed', async () => {
    const paymentGateway = subscriptionUpdatedEvent(
      'evt_3',
      crypto.randomUUID(),
    );

    const stripeEvents = new FakeStripeEventRepository();
    await stripeEvents.claim('evt_3', 'customer.subscription.updated');
    await stripeEvents.markProcessed('evt_3');
    const lockSpy = vi.spyOn(stripeEvents, 'lock');

    const { deps, stripeCustomers } = createStripeWebhookTestHarness({
      paymentGateway,
      stripeEvents,
    });
    const insertSpy = vi.spyOn(stripeCustomers, 'insert');

    await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

    expect(insertSpy).not.toHaveBeenCalled();
    expect(lockSpy).not.toHaveBeenCalled();
  });

  it('does not reprocess an event completed between peek and lock', async () => {
    const paymentGateway = subscriptionUpdatedEvent(
      'evt_concurrent_completion',
      crypto.randomUUID(),
    );
    const stripeEvents = new ConcurrentlyCompletingStripeEventRepository();
    await stripeEvents.claim(
      'evt_concurrent_completion',
      'customer.subscription.updated',
    );
    const { deps, subscriptions } = createStripeWebhookTestHarness({
      paymentGateway,
      stripeEvents,
    });
    const upsertSpy = vi.spyOn(subscriptions, 'upsert');

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    expect(upsertSpy).not.toHaveBeenCalled();
    await expect(
      stripeEvents.lock('evt_concurrent_completion'),
    ).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('returns call to prune processed stripe events when event already processed', async () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-02-01T00:00:00Z');
      vi.setSystemTime(now);

      const paymentGateway = unhandledEvent('evt_already_processed_prune');

      const stripeEvents = new FakeStripeEventRepository();
      await stripeEvents.claim(
        'evt_already_processed_prune',
        'checkout.session.completed',
      );
      await stripeEvents.markProcessed('evt_already_processed_prune');

      const { deps } = createStripeWebhookTestHarness({
        paymentGateway,
        stripeEvents,
      });
      const pruneSpy = vi.spyOn(stripeEvents, 'pruneProcessedBefore');

      await processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' });

      expect(pruneSpy).toHaveBeenCalledWith(
        new Date(now.getTime() - NINETY_DAYS_MS),
        100,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists failure state even when the transaction would rollback on throw', async () => {
    const paymentGateway = subscriptionUpdatedEvent(
      'evt_rollback_failure_state',
      crypto.randomUUID(),
    );

    const subscriptions = new FailingSubscriptionRepository();
    const { deps, stripeEvents } = createRollbackAwareStripeWebhookTestHarness({
      paymentGateway,
      subscriptions,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({ message: 'boom' });

    await expect(
      stripeEvents.lock('evt_rollback_failure_state'),
    ).resolves.toMatchObject({
      processedAt: null,
      error: expect.any(String),
    });
  });

  it('persists only safe driver diagnostics for a failed Stripe event', async () => {
    const paymentGateway = subscriptionUpdatedEvent(
      'evt_safe_driver_diagnostics',
      crypto.randomUUID(),
    );
    const stripeCustomers = new DriverFailingStripeCustomerRepository();
    const { deps, stripeEvents } = createRollbackAwareStripeWebhookTestHarness({
      paymentGateway,
      stripeCustomers,
    });

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    const stored = await stripeEvents.lock('evt_safe_driver_diagnostics');
    const diagnostics = JSON.parse(stored.error ?? '{}');
    expect(diagnostics).toEqual({
      name: 'ApplicationError',
      code: 'INTERNAL_ERROR',
      sqlState: '23505',
      constraint: 'stripe_customers_stripe_customer_id_unique',
    });
    expect(stored.error).not.toContain('raw Stripe customer');
    expect(stored.error).not.toContain('cus_raw');
  });

  it('marks the event failed when processing throws', async () => {
    const paymentGateway = subscriptionUpdatedEvent(
      'evt_4',
      crypto.randomUUID(),
    );

    const subscriptions = new FailingSubscriptionRepository();
    const { deps, stripeEvents } = createStripeWebhookTestHarness({
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
    expect(errorData).toEqual({
      name: 'Error',
    });
    expect(stored.error).not.toContain('boom');
  });
});
