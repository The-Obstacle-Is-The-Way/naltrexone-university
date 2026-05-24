import {
  callStripeWithRetry,
  isAlreadyCanceledError,
} from '@/src/adapters/gateways/stripe';
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
    input: undefined,
    options: { idempotencyKey: string },
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
      await callStripeWithRetry({
        operation: 'subscriptions.cancel',
        fn: () =>
          stripe.subscriptions.cancel(subscription.id, undefined, {
            idempotencyKey: `cancel_subscription:${subscription.id}`,
          }),
        logger,
      });
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
