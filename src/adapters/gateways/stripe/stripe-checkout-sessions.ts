import { randomUUID } from 'node:crypto';
import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import { getStripePriceId } from '@/src/adapters/config/stripe-prices';
import type {
  CheckoutSessionCreateParams,
  StripeClient,
  StripeListedSubscription,
  StripeSubscriptionStatus,
} from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import type {
  CheckoutSessionInput,
  PaymentGatewayRequestOptions,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { callStripeWithRetry } from './stripe-retry';

export const SUBSCRIPTION_LIST_LIMIT = 10;

const BLOCKING_SUBSCRIPTION_STATUSES = new Set<StripeSubscriptionStatus>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);

function getBlockingSubscriptionStatus(
  subscription: StripeListedSubscription | undefined,
): StripeSubscriptionStatus | null {
  if (!subscription) return null;
  if (!subscription.status) return null;
  if (!BLOCKING_SUBSCRIPTION_STATUSES.has(subscription.status)) return null;
  return subscription.status;
}

export async function createStripeCheckoutSession({
  stripe,
  input,
  options,
  priceIds,
  logger,
}: {
  stripe: StripeClient;
  input: CheckoutSessionInput;
  options?: PaymentGatewayRequestOptions;
  priceIds: StripePriceIds;
  logger: Logger;
}): Promise<{ url: string }> {
  const priceId = getStripePriceId(input.plan, priceIds);
  const subscriptionsList = stripe.subscriptions?.list?.bind(
    stripe.subscriptions,
  );
  if (subscriptionsList) {
    const subscriptions = await callStripeWithRetry({
      operation: 'subscriptions.list',
      fn: () =>
        subscriptionsList({
          customer: input.externalCustomerId,
          status: 'all',
          limit: SUBSCRIPTION_LIST_LIMIT,
        }),
      logger,
    });

    let blockingSubscription: StripeListedSubscription | null = null;
    let blockingStatus: StripeSubscriptionStatus | null = null;
    for (const subscription of subscriptions.data) {
      const status = getBlockingSubscriptionStatus(subscription);
      if (!status) continue;
      blockingSubscription = subscription;
      blockingStatus = status;
      break;
    }

    if (blockingSubscription && blockingStatus) {
      logger.warn(
        {
          userId: input.userId,
          externalCustomerId: input.externalCustomerId,
          externalSubscriptionId: blockingSubscription.id ?? null,
          subscriptionStatus: blockingStatus,
        },
        'Stripe already has a blocking subscription for customer',
      );
      throw new ApplicationError(
        'ALREADY_SUBSCRIBED',
        'Subscription already exists for this customer',
      );
    }
  }

  const existing = await callStripeWithRetry({
    operation: 'checkout.sessions.list',
    fn: () =>
      stripe.checkout.sessions.list({
        customer: input.externalCustomerId,
        status: 'open',
        limit: 1,
      }),
    logger,
  });

  const existingSession = existing.data[0];
  const existingUrl = existingSession?.url;
  if (existingSession && existingUrl) {
    let existingPriceId: string | undefined;
    try {
      const session = await callStripeWithRetry({
        operation: 'checkout.sessions.retrieve',
        fn: () =>
          stripe.checkout.sessions.retrieve(existingSession.id, {
            expand: ['line_items'],
          }),
        logger,
      });
      existingPriceId = session.line_items?.data?.[0]?.price?.id;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.warn(
        {
          sessionId: existingSession.id,
          error: errorMessage,
          cause: error,
        },
        'Failed to inspect existing checkout session',
      );
    }

    if (existingPriceId === priceId) {
      return { url: existingUrl };
    }

    if (existingPriceId) {
      // Avoid reusing a checkout session for a different plan. If the user
      // changes plans, we expire the old session and create a new one so the
      // Stripe UI matches their selection.
      logger.warn(
        {
          sessionId: existingSession.id,
          existingPriceId,
          requestedPriceId: priceId,
        },
        'Expiring mismatched checkout session',
      );

      try {
        await callStripeWithRetry({
          operation: 'checkout.sessions.expire',
          fn: () =>
            stripe.checkout.sessions.expire(existingSession.id, {
              idempotencyKey: `expire_checkout_session:${existingSession.id}`,
            }),
          logger,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error(
          {
            sessionId: existingSession.id,
            existingPriceId,
            requestedPriceId: priceId,
            error: errorMessage,
          },
          'Failed to expire mismatched checkout session',
        );
        throw new ApplicationError(
          'STRIPE_ERROR',
          'Failed to expire existing checkout session',
        );
      }
    }
  }

  const params = {
    mode: 'subscription',
    customer: input.externalCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: false,
    billing_address_collection: 'auto',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    subscription_data: {
      metadata: {
        user_id: input.userId,
      },
    },
  } satisfies CheckoutSessionCreateParams;

  const idempotencyKey =
    options?.idempotencyKey ??
    `checkout_session:${input.userId}:${randomUUID()}`;
  const session = await callStripeWithRetry({
    operation: 'checkout.sessions.create',
    fn: () =>
      stripe.checkout.sessions.create(params, {
        idempotencyKey,
      }),
    logger,
  });

  if (!session.url) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe Checkout Session URL is missing',
    );
  }

  return { url: session.url };
}
