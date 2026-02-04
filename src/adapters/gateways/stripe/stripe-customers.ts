import type {
  CustomerCreateParams,
  StripeClient,
} from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import type {
  CreateCustomerInput,
  PaymentGatewayRequestOptions,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { callStripeWithRetry } from './stripe-retry';

export async function createStripeCustomer({
  stripe,
  input,
  options,
  logger,
}: {
  stripe: StripeClient;
  input: CreateCustomerInput;
  options?: PaymentGatewayRequestOptions;
  logger: Logger;
}): Promise<{ stripeCustomerId: string }> {
  const params = {
    email: input.email,
    metadata: {
      user_id: input.userId,
      clerk_user_id: input.clerkUserId,
    },
  } satisfies CustomerCreateParams;

  const idempotencyKey = options?.idempotencyKey;
  const customer = idempotencyKey
    ? await callStripeWithRetry({
        operation: 'customers.create',
        fn: () =>
          stripe.customers.create(params, {
            idempotencyKey,
          }),
        logger,
      })
    : await stripe.customers.create(params);

  if (!customer.id) {
    throw new ApplicationError('STRIPE_ERROR', 'Stripe customer id is missing');
  }

  return { stripeCustomerId: customer.id };
}
