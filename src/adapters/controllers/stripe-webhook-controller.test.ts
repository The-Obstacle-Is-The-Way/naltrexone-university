import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type {
  StripeCustomerRepository,
  StripeEventRepository,
} from '@/src/application/ports/repositories';
import {
  FakePaymentGateway,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { processStripeWebhook } from './stripe-webhook-controller';

class FakeStripeEventRepository implements StripeEventRepository {
  private readonly rows = new Map<
    string,
    { type: string; processedAt: Date | null; error: string | null }
  >();

  async claim(eventId: string, type: string): Promise<boolean> {
    if (this.rows.has(eventId)) return false;
    this.rows.set(eventId, { type, processedAt: null, error: null });
    return true;
  }

  async lock(
    eventId: string,
  ): Promise<{ processedAt: Date | null; error: string | null }> {
    const row = this.rows.get(eventId);
    if (!row) {
      throw new ApplicationError('NOT_FOUND', 'Stripe event not found');
    }
    return { processedAt: row.processedAt, error: row.error };
  }

  async markProcessed(eventId: string): Promise<void> {
    const row = this.rows.get(eventId);
    if (!row) {
      throw new ApplicationError('NOT_FOUND', 'Stripe event not found');
    }
    row.processedAt = new Date('2026-02-01T00:00:00Z');
    row.error = null;
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    const row = this.rows.get(eventId);
    if (!row) {
      throw new ApplicationError('NOT_FOUND', 'Stripe event not found');
    }
    row.processedAt = null;
    row.error = error;
  }

  seedProcessed(eventId: string, type: string) {
    this.rows.set(eventId, {
      type,
      processedAt: new Date('2026-02-01T00:00:00Z'),
      error: null,
    });
  }
}

class FakeStripeCustomerRepository implements StripeCustomerRepository {
  insertCalls = 0;

  private readonly byUserId = new Map<string, { stripeCustomerId: string }>();
  private readonly userIdByStripeCustomerId = new Map<string, string>();

  async findByUserId(
    userId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    return this.byUserId.get(userId) ?? null;
  }

  async insert(userId: string, stripeCustomerId: string): Promise<void> {
    this.insertCalls += 1;

    const existing = this.byUserId.get(userId);
    if (existing && existing.stripeCustomerId !== stripeCustomerId) {
      throw new ApplicationError(
        'CONFLICT',
        'Stripe customer already exists with a different stripeCustomerId',
      );
    }

    const mappedUserId = this.userIdByStripeCustomerId.get(stripeCustomerId);
    if (mappedUserId && mappedUserId !== userId) {
      throw new ApplicationError(
        'CONFLICT',
        'Stripe customer id is already mapped to a different user',
      );
    }

    this.byUserId.set(userId, { stripeCustomerId });
    this.userIdByStripeCustomerId.set(stripeCustomerId, userId);
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

    await processStripeWebhook(
      {
        paymentGateway,
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
    expect(stripeCustomers.insertCalls).toBe(1);

    // Second delivery of the same event should short-circuit (no double upsert).
    await processStripeWebhook(
      {
        paymentGateway,
        transaction: async (fn) =>
          fn({ stripeEvents, subscriptions, stripeCustomers }),
      },
      { rawBody: 'raw', signature: 'sig' },
    );

    expect(stripeCustomers.insertCalls).toBe(1);
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

    await processStripeWebhook(
      {
        paymentGateway,
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
    stripeEvents.seedProcessed('evt_3', 'customer.subscription.updated');

    const subscriptions = new FakeSubscriptionRepository();
    const stripeCustomers = new FakeStripeCustomerRepository();

    await processStripeWebhook(
      {
        paymentGateway,
        transaction: async (fn) =>
          fn({ stripeEvents, subscriptions, stripeCustomers }),
      },
      { rawBody: 'raw', signature: 'sig' },
    );

    expect(stripeCustomers.insertCalls).toBe(0);
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
