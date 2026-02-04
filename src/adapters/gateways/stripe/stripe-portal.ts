import type {
  BillingPortalSessionCreateParams,
  StripeClient,
} from '@/src/adapters/gateways/stripe/stripe-client';
import { ApplicationError } from '@/src/application/errors';
import type { PortalSessionInput } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { callStripeWithRetry } from './stripe-retry';

export async function createStripePortalSession({
  stripe,
  input,
  logger,
}: {
  stripe: StripeClient;
  input: PortalSessionInput;
  logger: Logger;
}): Promise<{ url: string }> {
  const params = {
    customer: input.stripeCustomerId,
    return_url: input.returnUrl,
  } satisfies BillingPortalSessionCreateParams;

  const session = input.idempotencyKey
    ? await callStripeWithRetry({
        operation: 'billingPortal.sessions.create',
        fn: () =>
          stripe.billingPortal.sessions.create(params, {
            idempotencyKey: input.idempotencyKey,
          }),
        logger,
      })
    : await callStripeWithRetry({
        operation: 'billingPortal.sessions.create',
        fn: () => stripe.billingPortal.sessions.create(params),
        logger,
      });

  if (!session.url) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe Billing Portal Session URL is missing',
    );
  }

  return { url: session.url };
}
