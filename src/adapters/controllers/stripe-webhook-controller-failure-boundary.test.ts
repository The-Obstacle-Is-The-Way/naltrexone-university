import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeLogger,
  FakePaymentGateway,
  FakeStripeCustomerRepository,
  FakeStripeEventRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  processStripeWebhook,
  type StripeWebhookDeps,
} from './stripe-webhook-controller';

class ThrowingStripeCustomerRepository extends FakeStripeCustomerRepository {
  constructor(private readonly error: unknown) {
    super();
  }

  override async insert(): Promise<never> {
    throw this.error;
  }
}

function createPaymentGateway(eventId: string): FakePaymentGateway {
  return new FakePaymentGateway({
    externalCustomerId: 'cus_test',
    checkoutUrl: 'https://stripe/checkout',
    portalUrl: 'https://stripe/portal',
    webhookResult: {
      eventId,
      type: 'customer.subscription.updated',
      subscriptionUpdate: {
        userId: crypto.randomUUID(),
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      },
    },
  });
}

function createAbortedTransactionDeps(input: {
  paymentGateway: FakePaymentGateway;
  processingError: unknown;
  transactionError: unknown;
  persistenceError?: unknown;
  stripeEvents?: FakeStripeEventRepository;
}): {
  deps: StripeWebhookDeps;
  stripeEvents: FakeStripeEventRepository;
  logger: FakeLogger;
  transactionCallCount: () => number;
} {
  const stripeEvents = input.stripeEvents ?? new FakeStripeEventRepository();
  const logger = new FakeLogger();
  let transactionCallCount = 0;

  return {
    deps: {
      paymentGateway: input.paymentGateway,
      logger,
      now: () => new Date(),
      transaction: async (fn) => {
        transactionCallCount += 1;

        if (transactionCallCount === 1) {
          try {
            await fn({
              stripeEvents: new FakeStripeEventRepository(),
              subscriptions: new FakeSubscriptionRepository(),
              stripeCustomers: new ThrowingStripeCustomerRepository(
                input.processingError,
              ),
            });
          } catch {
            // postgres.js can surface the scope's first statement error instead
            // of the mapped error thrown by the transaction callback.
          }

          throw input.transactionError;
        }

        if (input.persistenceError !== undefined) {
          throw input.persistenceError;
        }

        return fn({
          stripeEvents,
          subscriptions: new FakeSubscriptionRepository(),
          stripeCustomers: new FakeStripeCustomerRepository(),
        });
      },
    },
    stripeEvents,
    logger,
    transactionCallCount: () => transactionCallCount,
  };
}

describe('processStripeWebhook failure boundary', () => {
  it('persists processing failure in a fresh transaction and throws the original mapped error', async () => {
    const processingError = new ApplicationError(
      'CONFLICT',
      'Stripe customer id is already mapped to a different user',
    );
    const eventId = 'evt_aborted_transaction_failure';
    const harness = createAbortedTransactionDeps({
      paymentGateway: createPaymentGateway(eventId),
      processingError,
      transactionError: new Error('raw Postgres 23505'),
    });

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).rejects.toBe(processingError);

    expect(harness.transactionCallCount()).toBe(2);
    const stored = await harness.stripeEvents.lock(eventId);
    expect(JSON.parse(stored.error ?? '{}')).toMatchObject({
      name: 'ApplicationError',
      code: 'CONFLICT',
      message: 'Stripe customer id is already mapped to a different user',
    });
  });

  it('throws the original processing error when fresh failure persistence also fails', async () => {
    const processingError = new ApplicationError(
      'CONFLICT',
      'Stripe customer id is already mapped to a different user',
    );
    const persistenceError = new Error('failure ledger unavailable');
    const harness = createAbortedTransactionDeps({
      paymentGateway: createPaymentGateway('evt_persistence_failure'),
      processingError,
      transactionError: new Error('raw Postgres 23505'),
      persistenceError,
    });

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).rejects.toBe(processingError);

    expect(harness.transactionCallCount()).toBe(2);
    expect(harness.logger.errorCalls).toContainEqual({
      context: {
        eventId: 'evt_persistence_failure',
        error: persistenceError.message,
      },
      msg: 'Failed to persist Stripe webhook failure state',
    });
  });

  it('does not overwrite an event completed before fresh failure persistence locks it', async () => {
    const eventId = 'evt_concurrently_processed';
    const stripeEvents = new FakeStripeEventRepository();
    await stripeEvents.claim(eventId, 'customer.subscription.updated');
    await stripeEvents.markProcessed(eventId);
    const markFailedSpy = vi.spyOn(stripeEvents, 'markFailed');
    const processingError = new ApplicationError(
      'CONFLICT',
      'Stripe customer id is already mapped to a different user',
    );
    const harness = createAbortedTransactionDeps({
      paymentGateway: createPaymentGateway(eventId),
      processingError,
      transactionError: new Error('raw Postgres 23505'),
      stripeEvents,
    });

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).rejects.toBe(processingError);

    expect(harness.transactionCallCount()).toBe(2);
    expect(markFailedSpy).not.toHaveBeenCalled();
    await expect(stripeEvents.lock(eventId)).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });
});
