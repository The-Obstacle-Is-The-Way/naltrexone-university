import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import type { WebhookEventResult } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { retrieveAndNormalizeStripeSubscription } from './stripe-subscription-normalizer';
import {
  stripeEventWithSubscriptionRefSchema,
  stripeSubscriptionSchema,
  subscriptionEventTypes,
} from './stripe-webhook-schemas';

async function getSubscriptionUpdateForSubscriptionRefEvent(input: {
  stripe: StripeClient;
  event: ReturnType<StripeClient['webhooks']['constructEvent']>;
  priceIds: StripePriceIds;
  logger: Logger;
}): Promise<WebhookEventResult['subscriptionUpdate'] | undefined> {
  const parsedPayload = stripeEventWithSubscriptionRefSchema.safeParse(
    input.event.data.object,
  );
  if (!parsedPayload.success) {
    input.logger.error(
      {
        eventId: input.event.id,
        type: input.event.type,
        error: parsedPayload.error.flatten(),
      },
      `Invalid Stripe ${input.event.type} webhook payload`,
    );

    throw new ApplicationError(
      'INVALID_WEBHOOK_PAYLOAD',
      `Invalid Stripe ${input.event.type} webhook payload`,
    );
  }

  const payload = parsedPayload.data;
  const subscriptionRef = payload.subscription;
  if (!subscriptionRef) return undefined;

  return retrieveAndNormalizeStripeSubscription({
    stripe: input.stripe,
    subscriptionRef,
    event: input.event,
    priceIds: input.priceIds,
    logger: input.logger,
  });
}

export async function processStripeWebhookEvent({
  stripe,
  webhookSecret,
  rawBody,
  signature,
  priceIds,
  logger,
}: {
  stripe: StripeClient;
  webhookSecret: string;
  rawBody: string;
  signature: string;
  priceIds: StripePriceIds;
  logger: Logger;
}): Promise<WebhookEventResult> {
  let event: ReturnType<StripeClient['webhooks']['constructEvent']>;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error(
      { error: errorMessage },
      'Webhook signature verification failed',
    );

    throw new ApplicationError(
      'INVALID_WEBHOOK_SIGNATURE',
      `Invalid webhook signature: ${errorMessage}`,
    );
  }

  const result: WebhookEventResult = {
    eventId: event.id,
    type: event.type,
  };

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.expired' ||
    event.type === 'invoice.payment_failed' ||
    event.type === 'invoice.payment_succeeded' ||
    event.type === 'invoice.payment_action_required'
  ) {
    const subscriptionUpdate =
      await getSubscriptionUpdateForSubscriptionRefEvent({
        stripe,
        event,
        priceIds,
        logger,
      });

    return subscriptionUpdate ? { ...result, subscriptionUpdate } : result;
  }

  if (!subscriptionEventTypes.has(event.type)) {
    return result;
  }

  const parsedSubscription = stripeSubscriptionSchema.safeParse(
    event.data.object,
  );
  if (!parsedSubscription.success) {
    logger.error(
      {
        eventId: event.id,
        type: event.type,
        error: parsedSubscription.error.flatten(),
      },
      'Invalid Stripe subscription webhook payload',
    );

    throw new ApplicationError(
      'INVALID_WEBHOOK_PAYLOAD',
      'Invalid Stripe subscription webhook payload',
    );
  }

  const subscriptionUpdate = await retrieveAndNormalizeStripeSubscription({
    stripe,
    subscriptionRef: parsedSubscription.data.id,
    event,
    priceIds,
    logger,
  });

  return { ...result, subscriptionUpdate };
}
