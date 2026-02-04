import { describe, expect, it, vi } from 'vitest';
import { cancelStripeCustomerSubscriptions } from '@/src/adapters/gateways/stripe-subscription-canceler';

describe('cancelStripeCustomerSubscriptions', () => {
  it('cancels all non-terminal Stripe subscriptions for a customer', async () => {
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

    await cancelStripeCustomerSubscriptions(stripe, 'cus_123');

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
});
