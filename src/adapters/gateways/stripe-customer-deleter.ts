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

function isMissingStripeCustomerError(error: unknown): boolean {
  return (
    getNumberProperty(error, 'statusCode') === 404 ||
    getNumberProperty(error, 'status') === 404
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
