import type {
  StripeRequestOptions,
  StripeSubscriptionsClient,
} from '@/src/adapters/shared/stripe-types';

export type StripeRequestLimits = {
  timeoutMs: number;
  maxNetworkRetries: number;
};

/**
 * DEBT-501 item 1: the same subscriptions client, with every request held to
 * a time limit and a number of network retries. The SDK's defaults, an
 * 80-second timeout and two retries, let one unanswered request outlast a
 * job's function.
 */
export function limitStripeSubscriptionRequests(
  client: StripeSubscriptionsClient,
  limits: StripeRequestLimits,
): StripeSubscriptionsClient {
  const { subscriptions } = client;
  const limited = (options?: StripeRequestOptions): StripeRequestOptions => ({
    ...options,
    timeout: limits.timeoutMs,
    maxNetworkRetries: limits.maxNetworkRetries,
  });
  return {
    subscriptions: {
      retrieve: (subscriptionId, params, options) =>
        subscriptions.retrieve(subscriptionId, params, limited(options)),
      list: (params, options) => subscriptions.list(params, limited(options)),
      cancel: (subscriptionId, params, options) =>
        subscriptions.cancel(subscriptionId, params, limited(options)),
      update: (subscriptionId, params, options) =>
        subscriptions.update(subscriptionId, params, limited(options)),
    },
  };
}
