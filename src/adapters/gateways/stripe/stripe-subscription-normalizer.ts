import type { z } from 'zod';
import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import { getSubscriptionPlanFromPriceId } from '@/src/adapters/config/stripe-prices';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import type { WebhookEventResult } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { isValidSubscriptionStatus } from '@/src/domain/value-objects';
import { callStripeWithRetry } from './stripe-retry';
import {
  type StripeSubscriptionRef,
  stripeSubscriptionSchema,
} from './stripe-webhook-schemas';

export function normalizeStripeSubscriptionUpdate(input: {
  subscription: z.infer<typeof stripeSubscriptionSchema>;
  eventId: string;
  type: string;
  priceIds: StripePriceIds;
  logger: Logger;
}): NonNullable<WebhookEventResult['subscriptionUpdate']> {
  const { subscription } = input;
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    input.logger.error(
      {
        eventId: input.eventId,
        type: input.type,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer,
      },
      'Stripe subscription metadata.user_id is required',
    );
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe subscription metadata.user_id is required',
    );
  }

  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = subscription.customer;

  const status = subscription.status;
  if (!status || !isValidSubscriptionStatus(status)) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe subscription status is invalid',
    );
  }

  const subscriptionItem = subscription.items.data[0];
  const currentPeriodEndSeconds = subscriptionItem.current_period_end;
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;
  const priceId = subscriptionItem.price.id;

  const plan = getSubscriptionPlanFromPriceId(priceId, input.priceIds);
  if (!plan) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe subscription price id does not match a configured plan',
    );
  }

  return {
    userId,
    externalCustomerId: stripeCustomerId,
    externalSubscriptionId: stripeSubscriptionId,
    plan,
    status,
    currentPeriodEnd: new Date(currentPeriodEndSeconds * 1000),
    cancelAtPeriodEnd,
  };
}

export async function retrieveAndNormalizeStripeSubscription(input: {
  stripe: StripeClient;
  subscriptionRef: StripeSubscriptionRef;
  event: { id: string; type: string };
  priceIds: StripePriceIds;
  logger: Logger;
}): Promise<NonNullable<WebhookEventResult['subscriptionUpdate']>> {
  const stripeSubscriptionId =
    typeof input.subscriptionRef === 'string'
      ? input.subscriptionRef
      : input.subscriptionRef.id;

  const stripeSubscriptions = input.stripe.subscriptions;
  if (!stripeSubscriptions) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe subscriptions client is unavailable',
    );
  }

  const subscription = await callStripeWithRetry({
    operation: 'subscriptions.retrieve',
    fn: () => stripeSubscriptions.retrieve(stripeSubscriptionId),
    logger: input.logger,
  });

  const parsedSubscription = stripeSubscriptionSchema.safeParse(subscription);
  if (!parsedSubscription.success) {
    input.logger.error(
      {
        eventId: input.event.id,
        type: input.event.type,
        stripeSubscriptionId,
        error: parsedSubscription.error.flatten(),
      },
      `Invalid Stripe subscription payload retrieved from ${input.event.type}`,
    );

    throw new ApplicationError(
      'INVALID_WEBHOOK_PAYLOAD',
      'Invalid Stripe subscription webhook payload',
    );
  }

  return normalizeStripeSubscriptionUpdate({
    subscription: parsedSubscription.data,
    eventId: input.event.id,
    type: input.event.type,
    priceIds: input.priceIds,
    logger: input.logger,
  });
}
