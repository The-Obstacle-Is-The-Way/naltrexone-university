import { callStripeWithRetry } from '@/src/adapters/gateways/stripe';
import type { Logger } from '@/src/application/ports/logger';

type StripeCustomersClient = {
  del: (stripeCustomerId: string) => Promise<unknown>;
};

type StripeClientLike = {
  customers: StripeCustomersClient;
};

function getNumberProperty(value: unknown, key: string): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'number' ? property : null;
}

function getStringProperty(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'string' ? property : null;
}

function isMissingStripeCustomerError(error: unknown): boolean {
  return (
    getNumberProperty(error, 'statusCode') === 404 ||
    getNumberProperty(error, 'status') === 404 ||
    // Match resource_missing even when a wrapper strips the numeric status,
    // mirroring the retired canceler's already-canceled predicate (BUG-246).
    (getStringProperty(error, 'rawType') === 'invalid_request_error' &&
      getStringProperty(error, 'code') === 'resource_missing')
  );
}

/**
 * Fulfill the account-deletion obligation at its Stripe lifecycle owner.
 * Resolved deleted-customer objects and missing-customer 404s are both
 * idempotent done-states.
 */
export async function deleteStripeCustomer(
  stripe: StripeClientLike,
  logger: Logger,
  stripeCustomerId: string,
): Promise<void> {
  await callStripeWithRetry({
    operation: 'customers.del',
    fn: async () => {
      try {
        await stripe.customers.del(stripeCustomerId);
      } catch (error) {
        if (!isMissingStripeCustomerError(error)) throw error;

        logger.info(
          { stripeCustomerId },
          'Stripe customer already deleted or missing',
        );
      }
    },
    logger,
  });
}
