import { isAlreadyCanceledError } from '@/src/adapters/gateways/stripe';
import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import type { Logger } from '@/src/application/ports/logger';

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
  logger: Logger,
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

    try {
      await retry(
        () =>
          stripe.subscriptions.cancel(subscription.id, {
            idempotencyKey: `cancel_subscription:${subscription.id}`,
          }),
        { ...STRIPE_RETRY_OPTIONS, shouldRetry: isTransientExternalError },
      );
    } catch (error) {
      if (isAlreadyCanceledError(error)) {
        logger.info(
          { stripeSubscriptionId: subscription.id },
          'Subscription already canceled externally',
        );
        continue;
      }

      throw error;
    }
  }
}
