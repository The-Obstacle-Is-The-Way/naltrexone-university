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

function createPaymentGateway(
  eventId: string,
  userId = crypto.randomUUID(),
): FakePaymentGateway {
  return new FakePaymentGateway({
    externalCustomerId: 'cus_test',
    checkoutUrl: 'https://stripe/checkout',
    portalUrl: 'https://stripe/portal',
    webhookResult: {
      eventId,
      type: 'customer.subscription.updated',
      subscriptionUpdate: {
        userId,
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

function createMissingUserAcknowledgementHarness(input: {
  eventId: string;
  acknowledgementError: Error;
}) {
  const userId = crypto.randomUUID();
  const paymentGateway = createPaymentGateway(input.eventId, userId);
  const stripeEvents = new FakeStripeEventRepository();
  const missingSubscriptions = new FakeSubscriptionRepository();
  const logger = new FakeLogger();
  let acknowledgementShouldFail = true;
  let transactionCallCount = 0;
  missingSubscriptions.markUserMissing(userId);

  const deps: StripeWebhookDeps = {
    paymentGateway,
    subscriptionVersions: missingSubscriptions,
    logger,
    now: () => new Date(),
    transaction: async (fn) => {
      transactionCallCount += 1;
      const deliveryTransactionIndex = (transactionCallCount - 1) % 3;

      if (deliveryTransactionIndex === 0) {
        return fn({
          stripeEvents: new FakeStripeEventRepository(),
          subscriptions: missingSubscriptions,
          stripeCustomers: new FakeStripeCustomerRepository(),
        });
      }

      if (deliveryTransactionIndex === 1 && acknowledgementShouldFail) {
        throw input.acknowledgementError;
      }

      return fn({
        stripeEvents,
        subscriptions: new FakeSubscriptionRepository(),
        stripeCustomers: new FakeStripeCustomerRepository(),
      });
    },
  };

  return {
    deps,
    stripeEvents,
    allowAcknowledgement: () => {
      acknowledgementShouldFail = false;
    },
  };
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
  const subscriptionVersions = new FakeSubscriptionRepository();
  const logger = new FakeLogger();
  let transactionCallCount = 0;

  return {
    deps: {
      paymentGateway: input.paymentGateway,
      subscriptionVersions,
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
  it('persists and throws the acknowledgement failure after handling a missing subscription user', async () => {
    const eventId = 'evt_missing_user_ack_failure';
    const acknowledgementError = new Error('ack transaction unavailable');
    const harness = createMissingUserAcknowledgementHarness({
      eventId,
      acknowledgementError,
    });

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).rejects.toBe(acknowledgementError);

    const stored = await harness.stripeEvents.lock(eventId);
    expect(JSON.parse(stored.error ?? '{}')).toMatchObject({
      name: 'Error',
      message: acknowledgementError.message,
    });
  });

  it('acknowledges a missing-user event on a later healthy delivery', async () => {
    const eventId = 'evt_missing_user_ack_retry';
    const acknowledgementError = new Error('ack transaction unavailable');
    const harness = createMissingUserAcknowledgementHarness({
      eventId,
      acknowledgementError,
    });

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).rejects.toBe(acknowledgementError);
    harness.allowAcknowledgement();

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).resolves.toBeUndefined();
    await expect(harness.stripeEvents.lock(eventId)).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('acknowledges and records a subscription event when the local user is missing', async () => {
    const userId = crypto.randomUUID();
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_deleted_user',
        type: 'customer.subscription.deleted',
        subscriptionUpdate: {
          userId,
          externalCustomerId: 'cus_deleted_user',
          externalSubscriptionId: 'sub_deleted_user',
          plan: 'monthly',
          status: 'canceled',
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });
    const stripeEvents = new FakeStripeEventRepository();
    const subscriptions = new FakeSubscriptionRepository();
    const stripeCustomers = new FakeStripeCustomerRepository();
    const logger = new FakeLogger();
    subscriptions.markUserMissing(userId);
    const insertCustomer = vi.spyOn(stripeCustomers, 'insert');
    const deps: StripeWebhookDeps = {
      paymentGateway,
      subscriptionVersions: subscriptions,
      logger,
      now: () => new Date(),
      transaction: async (fn) =>
        fn({ stripeEvents, subscriptions, stripeCustomers }),
    };

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    await expect(stripeEvents.lock('evt_deleted_user')).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
    expect(insertCustomer).not.toHaveBeenCalled();
    expect(logger.warnCalls).toContainEqual({
      context: {
        reason: 'user_missing',
        eventId: 'evt_deleted_user',
        eventType: 'customer.subscription.deleted',
        stripeCustomerId: 'cus_deleted_user',
        userId,
      },
      msg: 'Acknowledging Stripe subscription webhook for missing local user',
    });
  });

  it('does not overwrite an event completed before missing-user acknowledgement locks it', async () => {
    const eventId = 'evt_missing_user_concurrently_processed';
    const userId = crypto.randomUUID();
    const paymentGateway = createPaymentGateway(eventId, userId);
    const stripeEvents = new FakeStripeEventRepository();
    const missingSubscriptions = new FakeSubscriptionRepository();
    const logger = new FakeLogger();
    const markProcessed = vi.spyOn(stripeEvents, 'markProcessed');
    let transactionCallCount = 0;
    missingSubscriptions.markUserMissing(userId);
    const deps: StripeWebhookDeps = {
      paymentGateway,
      subscriptionVersions: missingSubscriptions,
      logger,
      now: () => new Date(),
      transaction: async (fn) => {
        transactionCallCount += 1;
        if (transactionCallCount === 1) {
          try {
            return await fn({
              stripeEvents: new FakeStripeEventRepository(),
              subscriptions: missingSubscriptions,
              stripeCustomers: new FakeStripeCustomerRepository(),
            });
          } catch (error) {
            await stripeEvents.claim(eventId, 'customer.subscription.updated');
            await stripeEvents.markProcessed(eventId);
            throw error;
          }
        }

        return fn({
          stripeEvents,
          subscriptions: new FakeSubscriptionRepository(),
          stripeCustomers: new FakeStripeCustomerRepository(),
        });
      },
    };

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).resolves.toBeUndefined();

    expect(transactionCallCount).toBe(3);
    expect(markProcessed).toHaveBeenCalledTimes(1);
    await expect(stripeEvents.lock(eventId)).resolves.toMatchObject({
      processedAt: expect.any(Date),
      error: null,
    });
  });

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

  it('logs a non-Error failure-persistence rejection without replacing the processing error', async () => {
    const processingError = new ApplicationError(
      'CONFLICT',
      'Stripe customer id is already mapped to a different user',
    );
    const persistenceError = 'failure ledger unavailable';
    const harness = createAbortedTransactionDeps({
      paymentGateway: createPaymentGateway('evt_non_error_persistence_failure'),
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

    expect(harness.logger.errorCalls).toContainEqual({
      context: {
        eventId: 'evt_non_error_persistence_failure',
        error: persistenceError,
      },
      msg: 'Failed to persist Stripe webhook failure state',
    });
  });

  it('persists and rethrows a transaction rejection when no processing error was captured', async () => {
    const eventId = 'evt_transaction_rejection';
    const stripeEvents = new FakeStripeEventRepository();
    const transactionError = new Error('transaction could not start');
    let transactionCallCount = 0;
    const deps: StripeWebhookDeps = {
      paymentGateway: createPaymentGateway(eventId),
      subscriptionVersions: new FakeSubscriptionRepository(),
      logger: new FakeLogger(),
      now: () => new Date(),
      transaction: async (fn) => {
        transactionCallCount += 1;
        if (transactionCallCount === 1) throw transactionError;

        return fn({
          stripeEvents,
          subscriptions: new FakeSubscriptionRepository(),
          stripeCustomers: new FakeStripeCustomerRepository(),
        });
      },
    };

    await expect(
      processStripeWebhook(deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).rejects.toBe(transactionError);

    expect(transactionCallCount).toBe(2);
    const stored = await stripeEvents.lock(eventId);
    expect(JSON.parse(stored.error ?? '{}')).toMatchObject({
      name: 'Error',
      message: transactionError.message,
    });
  });

  it('persists and rethrows a non-Error processing failure without replacing it', async () => {
    const processingError = 'raw processing failure';
    const eventId = 'evt_non_error_failure';
    const harness = createAbortedTransactionDeps({
      paymentGateway: createPaymentGateway(eventId),
      processingError,
      transactionError: new Error('raw Postgres statement error'),
    });

    await expect(
      processStripeWebhook(harness.deps, {
        rawBody: 'raw',
        signature: 'sig',
      }),
    ).rejects.toBe(processingError);

    const stored = await harness.stripeEvents.lock(eventId);
    expect(JSON.parse(stored.error ?? '{}')).toEqual({
      message: 'Unknown error',
      raw: processingError,
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
