import { describe, expect, it, vi } from 'vitest';
import { cancelStripeCustomerSubscriptions } from '@/src/adapters/gateways/stripe-subscription-canceler';
import { FakeLogger } from '@/src/application/test-helpers/fakes';

describe('cancelStripeCustomerSubscriptions', () => {
  it('cancels all non-terminal Stripe subscriptions for a customer', async () => {
    const logger = new FakeLogger();

    async function* list() {
      yield { id: 'sub_active', status: 'active' };
      yield { id: 'sub_canceled', status: 'canceled' };
      yield { id: 'sub_expired', status: 'incomplete_expired' };
      yield { id: 'sub_past_due', status: 'past_due' };
    }

    let capturedListInput: unknown;
    const cancel = vi.fn(async () => undefined);
    const stripe = {
      subscriptions: {
        list: vi.fn(async function* (input: unknown) {
          capturedListInput = input;
          yield* list();
        }),
        cancel,
      },
    };

    await cancelStripeCustomerSubscriptions(stripe, logger, 'cus_123');

    expect(capturedListInput).toEqual({
      customer: 'cus_123',
      status: 'all',
      limit: 100,
    });
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenNthCalledWith(1, 'sub_active', {
      idempotencyKey: 'cancel_subscription:sub_active',
    });
    expect(cancel).toHaveBeenNthCalledWith(2, 'sub_past_due', {
      idempotencyKey: 'cancel_subscription:sub_past_due',
    });
  });

  it('continues canceling remaining subscriptions when one is already canceled externally', async () => {
    const logger = new FakeLogger();

    const alreadyCanceledError = Object.assign(
      new Error('No such subscription: sub_missing'),
      {
        rawType: 'invalid_request_error',
        code: 'resource_missing',
      },
    );

    const cancel = vi.fn(async (subscriptionId: string) => {
      if (subscriptionId === 'sub_missing') {
        throw alreadyCanceledError;
      }
    });
    const stripe = {
      subscriptions: {
        list: async function* () {
          yield { id: 'sub_missing', status: 'active' };
          yield { id: 'sub_active', status: 'active' };
        },
        cancel,
      },
    };

    await expect(
      cancelStripeCustomerSubscriptions(stripe, logger, 'cus_123'),
    ).resolves.toBeUndefined();

    expect(cancel).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenNthCalledWith(1, 'sub_missing', {
      idempotencyKey: 'cancel_subscription:sub_missing',
    });
    expect(cancel).toHaveBeenNthCalledWith(2, 'sub_active', {
      idempotencyKey: 'cancel_subscription:sub_active',
    });
    expect(logger.infoCalls).toEqual([
      {
        context: { stripeSubscriptionId: 'sub_missing' },
        msg: 'Subscription already canceled externally',
      },
    ]);
  });

  it('throws when Stripe cancel returns an unexpected error', async () => {
    const logger = new FakeLogger();

    const unexpectedError = Object.assign(new Error('Invalid API Key'), {
      rawType: 'authentication_error',
    });

    const cancel = vi.fn(async () => {
      throw unexpectedError;
    });
    const stripe = {
      subscriptions: {
        list: async function* () {
          yield { id: 'sub_active', status: 'active' };
        },
        cancel,
      },
    };

    await expect(
      cancelStripeCustomerSubscriptions(stripe, logger, 'cus_123'),
    ).rejects.toBe(unexpectedError);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(logger.infoCalls).toEqual([]);
  });
});
