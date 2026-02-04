import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';

type StripeSubscriptionLike = {
  id: string;
  status: string;
};

type StripeSubscriptionsClient = {
  list: (input: {
    customer: string;
    status: 'all';
    limit: number;
  }) => AsyncIterable<StripeSubscriptionLike>;
  cancel: (
    subscriptionId: string,
    input: { idempotencyKey: string },
  ) => Promise<unknown>;
};

type StripeClientLike = {
  subscriptions: StripeSubscriptionsClient;
};

const STRIPE_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 100,
  factor: 2,
  maxDelayMs: 1000,
} as const;

export async function cancelStripeCustomerSubscriptions(
  stripe: StripeClientLike,
  stripeCustomerId: string,
): Promise<void> {
  for await (const subscription of stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'all',
    limit: 100,
  })) {
    if (
      subscription.status === 'canceled' ||
      subscription.status === 'incomplete_expired'
    ) {
      continue;
    }

    await retry(
      () =>
        stripe.subscriptions.cancel(subscription.id, {
          idempotencyKey: `cancel_subscription:${subscription.id}`,
        }),
      { ...STRIPE_RETRY_OPTIONS, shouldRetry: isTransientExternalError },
    );
  }
}
