import type {
  CustomerCreateParams,
  StripeClient,
} from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import type {
  CreateCustomerInput,
  CreateCustomerOutput,
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
}): Promise<CreateCustomerOutput> {
  const params = {
    email: input.email,
    metadata: {
      user_id: input.userId,
      clerk_user_id: input.clerkUserId,
    },
  } satisfies CustomerCreateParams;

  const customersSearch = stripe.customers.search?.bind(stripe.customers);
  if (customersSearch) {
    const query = `metadata['user_id']:'${input.userId}'`;
    const existing = await callStripeWithRetry({
      operation: 'customers.search',
      fn: () =>
        customersSearch({
          query,
          limit: 2,
        }),
      logger,
    });

    const matches = existing.data.filter(
      (customer): customer is { id: string } => typeof customer.id === 'string',
    );

    if (matches.length > 1) {
      logger.error(
        {
          userId: input.userId,
          clerkUserId: input.clerkUserId,
          matchCount: matches.length,
        },
        'Multiple Stripe customers found for user metadata.user_id',
      );
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Multiple Stripe customers found for this user',
      );
    }

    const existingId = matches[0]?.id;
    if (existingId) {
      return { externalCustomerId: existingId };
    }
  }

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

  return { externalCustomerId: customer.id };
}
