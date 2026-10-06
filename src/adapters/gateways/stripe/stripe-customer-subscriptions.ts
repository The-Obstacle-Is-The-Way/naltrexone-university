import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import type { SubscriptionObservation } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import {
  getBlockingSubscriptionStatus,
  SUBSCRIPTION_LIST_LIMIT,
} from './stripe-checkout-sessions';
import { callStripeWithRetry } from './stripe-retry';
import { retrieveAndNormalizeStripeSubscription } from './stripe-subscription-normalizer';

// Names the read in the normalizer's logs, which expect an event.
const SYNC_SOURCE = {
  id: 'checkout_refusal_sync',
  type: 'customer.subscriptions.list',
} as const;

/**
 * BUG-321: the customer's subscriptions that make our checkout refuse a new
 * one, each retrieved afresh and normalized, so our database can record them.
 * Reads only: nothing is cancelled or changed.
 *
 * WHY sequential and bounded: a customer usually holds one blocking
 * subscription, so a refused click costs one list and one retrieve. The list
 * caps at SUBSCRIPTION_LIST_LIMIT, and the sync retries at most three version
 * conflicts, so the worst case is 3 x (1 + 10) calls, each with the shared
 * transient retry. Refused clicks are rate limited to 10 a minute.
 */
export async function listStripeBlockingCustomerSubscriptions(input: {
  stripe: StripeClient;
  externalCustomerId: string;
  priceIds: StripePriceIds;
  logger: Logger;
  webhookE2EOwner?: string | undefined;
}): Promise<SubscriptionObservation[]> {
  const { subscriptions } = input.stripe;
  const listed = await callStripeWithRetry({
    operation: 'subscriptions.list',
    fn: () =>
      subscriptions.list({
        customer: input.externalCustomerId,
        status: 'all',
        limit: SUBSCRIPTION_LIST_LIMIT,
      }),
    logger: input.logger,
  });

  const observations: SubscriptionObservation[] = [];
  for (const subscription of listed.data) {
    if (!getBlockingSubscriptionStatus(subscription) || !subscription.id) {
      continue;
    }
    const observation = await retrieveAndNormalizeStripeSubscription({
      stripe: input.stripe,
      subscriptionRef: subscription.id,
      event: SYNC_SOURCE,
      priceIds: input.priceIds,
      logger: input.logger,
      webhookE2EOwner: input.webhookE2EOwner,
    });
    if (observation.externalCustomerId !== input.externalCustomerId) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'A listed subscription belongs to a different Stripe customer',
      );
    }
    observations.push(observation);
  }
  return observations;
}
