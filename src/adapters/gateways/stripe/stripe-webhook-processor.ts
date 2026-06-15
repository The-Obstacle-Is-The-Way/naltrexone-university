import { z } from 'zod';
import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import { retrieveAndNormalizeStripeSubscription } from '@/src/adapters/gateways/stripe/stripe-subscription-normalizer';
import {
  extractSubscriptionRef,
  stripeEventWithSubscriptionRefSchema,
  stripeSubscriptionSchema,
  subscriptionEventTypes,
} from '@/src/adapters/gateways/stripe/stripe-webhook-schemas';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import type { WebhookEventResult } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';

async function getSubscriptionUpdateForSubscriptionRefEvent(input: {
  stripe: StripeClient;
  event: ReturnType<StripeClient['webhooks']['constructEvent']>;
  priceIds: StripePriceIds;
  logger: Logger;
  webhookE2EOwner?: string | undefined;
}): Promise<WebhookEventResult['subscriptionUpdate'] | undefined> {
  const parsedPayload = stripeEventWithSubscriptionRefSchema.safeParse(
    input.event.data.object,
  );
  if (!parsedPayload.success) {
    input.logger.error(
      {
        eventId: input.event.id,
        type: input.event.type,
        error: z.flattenError(parsedPayload.error),
      },
      `Invalid Stripe ${input.event.type} webhook payload`,
    );

    throw new ApplicationError(
      'INVALID_WEBHOOK_PAYLOAD',
      `Invalid Stripe ${input.event.type} webhook payload`,
    );
  }

  const payload = parsedPayload.data;
  const subscriptionRef = extractSubscriptionRef(payload);
  if (!subscriptionRef) return undefined;

  return retrieveAndNormalizeStripeSubscription({
    stripe: input.stripe,
    subscriptionRef,
    event: input.event,
    priceIds: input.priceIds,
    logger: input.logger,
    webhookE2EOwner: input.webhookE2EOwner,
  });
}

export async function processStripeWebhookEvent({
  stripe,
  webhookSecret,
  rawBody,
  signature,
  priceIds,
  logger,
  webhookE2EOwner,
}: {
  stripe: StripeClient;
  webhookSecret: string;
  rawBody: string;
  signature: string;
  priceIds: StripePriceIds;
  logger: Logger;
  webhookE2EOwner?: string | undefined;
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
        webhookE2EOwner,
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
        error: z.flattenError(parsedSubscription.error),
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
    webhookE2EOwner,
  });

  return { ...result, subscriptionUpdate };
}
