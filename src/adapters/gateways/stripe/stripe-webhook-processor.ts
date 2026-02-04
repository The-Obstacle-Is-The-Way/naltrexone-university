import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import type { StripeClient } from '@/src/adapters/gateways/stripe/stripe-client';
import { ApplicationError } from '@/src/application/errors';
import type { WebhookEventResult } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import {
  normalizeStripeSubscriptionUpdate,
  retrieveAndNormalizeStripeSubscription,
} from './stripe-subscription-normalizer';
import {
  type StripeEventWithSubscriptionRef,
  stripeEventWithSubscriptionRefSchema,
  stripeSubscriptionSchema,
  subscriptionEventTypes,
} from './stripe-webhook-schemas';

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

  if (event.type === 'checkout.session.completed') {
    const parsedSession = stripeEventWithSubscriptionRefSchema.safeParse(
      event.data.object,
    );
    if (!parsedSession.success) {
      logger.error(
        {
          eventId: event.id,
          type: event.type,
          error: parsedSession.error.flatten(),
        },
        'Invalid Stripe checkout.session.completed webhook payload',
      );

      throw new ApplicationError(
        'INVALID_WEBHOOK_PAYLOAD',
        'Invalid Stripe checkout.session.completed webhook payload',
      );
    }

    const payload = parsedSession.data as StripeEventWithSubscriptionRef;
    const subscriptionRef = payload.subscription;
    if (!subscriptionRef) {
      return result;
    }

    const subscriptionUpdate = await retrieveAndNormalizeStripeSubscription({
      stripe,
      subscriptionRef,
      event,
      priceIds,
      logger,
    });

    return subscriptionUpdate ? { ...result, subscriptionUpdate } : result;
  }

  if (event.type === 'invoice.payment_failed') {
    const parsedInvoice = stripeEventWithSubscriptionRefSchema.safeParse(
      event.data.object,
    );
    if (!parsedInvoice.success) {
      logger.error(
        {
          eventId: event.id,
          type: event.type,
          error: parsedInvoice.error.flatten(),
        },
        'Invalid Stripe invoice.payment_failed webhook payload',
      );

      throw new ApplicationError(
        'INVALID_WEBHOOK_PAYLOAD',
        'Invalid Stripe invoice.payment_failed webhook payload',
      );
    }

    const payload = parsedInvoice.data as StripeEventWithSubscriptionRef;
    const subscriptionRef = payload.subscription;
    if (!subscriptionRef) {
      return result;
    }

    const subscriptionUpdate = await retrieveAndNormalizeStripeSubscription({
      stripe,
      subscriptionRef,
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

  const subscriptionUpdate = normalizeStripeSubscriptionUpdate({
    subscription: parsedSubscription.data,
    eventId: event.id,
    type: event.type,
    priceIds,
    logger,
  });

  return subscriptionUpdate ? { ...result, subscriptionUpdate } : result;
}
