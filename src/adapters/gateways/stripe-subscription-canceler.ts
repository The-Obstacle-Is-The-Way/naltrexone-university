import { isAlreadyCanceledError } from '@/src/adapters/gateways/stripe';
import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import { DEFAULT_RETRY_OPTIONS } from '@/src/adapters/shared/retry-defaults';
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

const STRIPE_LIST_LIMIT = 100;

export async function cancelStripeCustomerSubscriptions(
  stripe: StripeClientLike,
  logger: Logger,
  stripeCustomerId: string,
): Promise<void> {
  for await (const subscription of stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'all',
    limit: STRIPE_LIST_LIMIT,
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
        { ...DEFAULT_RETRY_OPTIONS, shouldRetry: isTransientExternalError },
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
