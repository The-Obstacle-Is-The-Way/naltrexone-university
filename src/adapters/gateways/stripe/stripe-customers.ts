import type {
  CustomerCreateParams,
  StripeClient,
} from '@/src/adapters/gateways/stripe/stripe-client';
import { ApplicationError } from '@/src/application/errors';
import type { CreateCustomerInput } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { callStripeWithRetry } from './stripe-retry';

export async function createStripeCustomer({
  stripe,
  input,
  logger,
}: {
  stripe: StripeClient;
  input: CreateCustomerInput;
  logger: Logger;
}): Promise<{ stripeCustomerId: string }> {
  const params = {
    email: input.email,
    metadata: {
      user_id: input.userId,
      clerk_user_id: input.clerkUserId,
    },
  } satisfies CustomerCreateParams;

  const customer = input.idempotencyKey
    ? await callStripeWithRetry({
        operation: 'customers.create',
        fn: () =>
          stripe.customers.create(params, {
            idempotencyKey: input.idempotencyKey,
          }),
        logger,
      })
    : await stripe.customers.create(params);

  if (!customer.id) {
    throw new ApplicationError('STRIPE_ERROR', 'Stripe customer id is missing');
  }

  return { stripeCustomerId: customer.id };
}
