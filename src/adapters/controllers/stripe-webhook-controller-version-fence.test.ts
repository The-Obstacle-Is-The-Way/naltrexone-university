import { describe, expect, it } from 'vitest';
import {
  processStripeWebhook,
  type StripeWebhookDeps,
} from '@/src/adapters/controllers/stripe-webhook-controller';
import type {
  SubscriptionUpsertInput,
  SubscriptionUpsertResult,
} from '@/src/application/ports/repositories';
import { SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS } from '@/src/application/shared/persist-subscription-observation';
import {
  FakeLogger,
  FakePaymentGateway,
  FakeStripeCustomerRepository,
  FakeStripeEventRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';

class AlwaysConflictingSubscriptionRepository extends FakeSubscriptionRepository {
  readonly inputs: SubscriptionUpsertInput[] = [];

  override async findObservationVersionByUserId(): Promise<number> {
    return this.inputs.length;
  }

  override async upsert(
    input: SubscriptionUpsertInput,
  ): Promise<SubscriptionUpsertResult> {
    this.inputs.push(input);
    return { persisted: false, reason: 'version_conflict' };
  }
}

describe('processStripeWebhook observation-version fence', () => {
  it('re-fetches after discovery and persists exhaustion through the failure ledger', async () => {
    const userId = crypto.randomUUID();
    const eventId = 'evt_webhook_version_exhaustion';
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_test',
      checkoutUrl: 'https://stripe.test/checkout',
      portalUrl: 'https://stripe.test/portal',
      webhookResult: {
        eventId,
        type: 'customer.subscription.updated',
        subscriptionUpdate: {
          userId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          status: 'active',
          currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      },
    });
    const stripeEvents = new FakeStripeEventRepository();
    const subscriptions = new AlwaysConflictingSubscriptionRepository();
    const stripeCustomers = new FakeStripeCustomerRepository();
    const deps = {
      paymentGateway,
      subscriptionVersions: subscriptions,
      logger: new FakeLogger(),
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      transaction: async (fn) =>
        fn({ stripeEvents, subscriptions, stripeCustomers }),
    } as StripeWebhookDeps;

    await expect(
      processStripeWebhook(deps, { rawBody: 'raw', signature: 'sig' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: `Subscription observation version conflicted after ${SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS} attempts`,
    });

    expect(paymentGateway.webhookInputs).toHaveLength(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS + 1,
    );
    expect(subscriptions.inputs).toHaveLength(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
    const storedEvent = await stripeEvents.lock(eventId);
    expect(storedEvent.processedAt).toBeNull();
    expect(JSON.parse(storedEvent.error ?? '{}')).toEqual({
      name: 'SubscriptionObservationAttemptsExhaustedError',
      code: 'CONFLICT',
    });
    expect(storedEvent.error).not.toContain(
      `Subscription observation version conflicted after ${SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS} attempts`,
    );
  });
});
