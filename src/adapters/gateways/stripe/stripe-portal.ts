import type {
  BillingPortalSessionCreateParams,
  StripeClient,
} from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import type {
  PaymentGatewayRequestOptions,
  PortalSessionInput,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { callStripeWithRetry } from './stripe-retry';

export async function createStripePortalSession({
  stripe,
  input,
  options,
  logger,
}: {
  stripe: StripeClient;
  input: PortalSessionInput;
  options?: PaymentGatewayRequestOptions;
  logger: Logger;
}): Promise<{ url: string }> {
  const params = {
    customer: input.stripeCustomerId,
    return_url: input.returnUrl,
  } satisfies BillingPortalSessionCreateParams;

  const idempotencyKey = options?.idempotencyKey;
  const requestOptions = idempotencyKey ? { idempotencyKey } : undefined;

  const session = requestOptions
    ? await callStripeWithRetry({
        operation: 'billingPortal.sessions.create',
        fn: () => stripe.billingPortal.sessions.create(params, requestOptions),
        logger,
      })
    : await stripe.billingPortal.sessions.create(params);

  if (!session.url) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe Billing Portal Session URL is missing',
    );
  }

  return { url: session.url };
}
