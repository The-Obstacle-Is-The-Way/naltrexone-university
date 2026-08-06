import { z } from 'zod';
import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import { retrieveAndNormalizeStripeSubscription } from '@/src/adapters/gateways/stripe/stripe-subscription-normalizer';
import {
  extractSubscriptionRef,
  stripeEventWithSubscriptionRefSchema,
  stripeSetupIntentSchema,
  stripeSubscriptionCheckoutConsentSessionSchema,
  stripeSubscriptionSchema,
  stripeTrialPaymentMethodSetupSessionSchema,
  subscriptionEventTypes,
} from '@/src/adapters/gateways/stripe/stripe-webhook-schemas';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import type { WebhookEventResult } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { isValidStripeConsentStateSignature } from './stripe-consent-state';

function isSetupSessionPayload(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as Record<string, unknown>).mode === 'setup'
  );
}

function expandableId(value: string | { id: string }): string {
  return typeof value === 'string' ? value : value.id;
}

function eventOccurredAt(event: { created?: number }): Date | undefined {
  const created = event.created;
  if (created === undefined || !Number.isInteger(created) || created <= 0) {
    return undefined;
  }
  return new Date(created * 1000);
}

function eventAcceptedAt(event: { created?: number }): Date {
  const occurredAt = eventOccurredAt(event);
  if (!occurredAt) {
    throw new ApplicationError(
      'INVALID_WEBHOOK_PAYLOAD',
      'Stripe consent event has no valid creation timestamp',
    );
  }
  return occurredAt;
}

function hasInitialSubscriptionConsentMarker(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  const record = payload as Record<string, unknown>;
  const metadata = record.metadata;
  const consent = record.consent;
  return (
    (typeof metadata === 'object' &&
      metadata !== null &&
      Object.keys(metadata).some((key) => key.startsWith('renewal_'))) ||
    (typeof consent === 'object' &&
      consent !== null &&
      (consent as Record<string, unknown>).terms_of_service === 'accepted')
  );
}

function getInitialSubscriptionConsent(input: {
  event: ReturnType<StripeClient['webhooks']['constructEvent']>;
  subscriptionUpdate: NonNullable<WebhookEventResult['subscriptionUpdate']>;
  logger: Logger;
}): NonNullable<WebhookEventResult['initialSubscriptionConsent']> | undefined {
  if (!hasInitialSubscriptionConsentMarker(input.event.data.object)) {
    return undefined;
  }

  const parsed = stripeSubscriptionCheckoutConsentSessionSchema.safeParse(
    input.event.data.object,
  );
  if (!parsed.success) {
    input.logger.error(
      {
        eventId: input.event.id,
        type: input.event.type,
        error: z.flattenError(parsed.error),
      },
      'Invalid Stripe subscription Checkout consent completion',
    );
    throw new ApplicationError(
      'INVALID_WEBHOOK_PAYLOAD',
      'Invalid Stripe subscription Checkout consent completion',
    );
  }

  const metadata = parsed.data.metadata;
  const update = input.subscriptionUpdate;
  if (
    metadata.renewal_user_id !== update.userId ||
    parsed.data.client_reference_id !== update.userId ||
    expandableId(parsed.data.customer) !== update.externalCustomerId ||
    expandableId(parsed.data.subscription) !== update.externalSubscriptionId ||
    metadata.renewal_plan !== update.plan ||
    (metadata.renewal_plan === 'monthly' &&
      metadata.renewal_frequency !== 'month') ||
    (metadata.renewal_plan === 'annual' &&
      metadata.renewal_frequency !== 'year')
  ) {
    throw new ApplicationError(
      'INVALID_WEBHOOK_PAYLOAD',
      'Stripe subscription Checkout consent does not match the subscription',
    );
  }

  return {
    checkoutSessionId: parsed.data.id,
    userId: update.userId,
    externalCustomerId: update.externalCustomerId,
    externalSubscriptionId: update.externalSubscriptionId,
    plan: metadata.renewal_plan,
    amountCents: Number(metadata.renewal_amount_cents),
    currency: metadata.renewal_currency,
    frequency: metadata.renewal_frequency,
    disclosureSnapshot: metadata.renewal_disclosure_snapshot,
    disclosureVersion: metadata.renewal_disclosure_version,
    termsVersion: metadata.renewal_terms_version,
    termsHash: metadata.renewal_terms_hash,
    cancellationMethod: metadata.renewal_cancellation_method,
    acceptedAt: eventAcceptedAt(input.event),
  };
}

async function getTrialPaymentMethodSetupCompletion(input: {
  stripe: StripeClient;
  event: ReturnType<StripeClient['webhooks']['constructEvent']>;
  stateSecret: string;
  logger: Logger;
}): Promise<
  NonNullable<WebhookEventResult['trialPaymentMethodSetupCompletion']>
> {
  const parsed = stripeTrialPaymentMethodSetupSessionSchema.safeParse(
    input.event.data.object,
  );
  if (!parsed.success) {
    input.logger.error(
      {
        eventId: input.event.id,
        type: input.event.type,
        error: z.flattenError(parsed.error),
      },
      'Invalid Stripe trial payment-method setup completion',
    );
    throw new ApplicationError(
      'INVALID_WEBHOOK_PAYLOAD',
      'Invalid Stripe trial payment-method setup completion',
    );
  }

  const { consent_state_signature: signature, ...signedMetadata } =
    parsed.data.metadata;
  if (
    !isValidStripeConsentStateSignature(
      signedMetadata,
      signature,
      input.stateSecret,
    )
  ) {
    throw new ApplicationError(
      'INVALID_WEBHOOK_PAYLOAD',
      'Invalid trial payment-method setup state signature',
    );
  }

  const setupIntents = input.stripe.setupIntents;
  if (!setupIntents) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe SetupIntent retrieval is unavailable',
    );
  }
  const setupIntent = stripeSetupIntentSchema.safeParse(
    await setupIntents.retrieve(expandableId(parsed.data.setup_intent)),
  );
  if (!setupIntent.success) {
    throw new ApplicationError(
      'INVALID_WEBHOOK_PAYLOAD',
      'Stripe SetupIntent has no completed payment method',
    );
  }

  const metadata = parsed.data.metadata;
  return {
    sessionId: parsed.data.id,
    userId: metadata.consent_user_id,
    externalCustomerId: metadata.consent_customer_id,
    externalSubscriptionId: metadata.consent_subscription_id,
    plan: metadata.consent_plan,
    amountCents: Number(metadata.consent_amount_cents),
    currency: metadata.consent_currency,
    frequency: metadata.consent_frequency,
    trialEndsAt: new Date(metadata.consent_trial_ends_at),
    disclosureVersion: metadata.consent_disclosure_version,
    termsVersion: metadata.consent_terms_version,
    termsHash: metadata.consent_terms_hash,
    stripePaymentMethodId: expandableId(setupIntent.data.payment_method),
    acceptedAt: eventAcceptedAt(input.event),
  };
}

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
    event.type === 'checkout.session.completed' &&
    isSetupSessionPayload(event.data.object)
  ) {
    const trialPaymentMethodSetupCompletion =
      await getTrialPaymentMethodSetupCompletion({
        stripe,
        event,
        stateSecret: webhookSecret,
        logger,
      });
    return { ...result, trialPaymentMethodSetupCompletion };
  }

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

    if (!subscriptionUpdate) {
      if (
        event.type === 'checkout.session.completed' &&
        hasInitialSubscriptionConsentMarker(event.data.object)
      ) {
        throw new ApplicationError(
          'INVALID_WEBHOOK_PAYLOAD',
          'Stripe consent completion has no subscription',
        );
      }
      return result;
    }

    const initialSubscriptionConsent =
      event.type === 'checkout.session.completed'
        ? getInitialSubscriptionConsent({
            event,
            subscriptionUpdate,
            logger,
          })
        : undefined;
    const occurredAt = eventOccurredAt(event);
    return initialSubscriptionConsent
      ? {
          ...result,
          ...(occurredAt ? { occurredAt } : {}),
          subscriptionUpdate,
          initialSubscriptionConsent,
        }
      : {
          ...result,
          ...(occurredAt ? { occurredAt } : {}),
          subscriptionUpdate,
        };
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

  const occurredAt = eventOccurredAt(event);
  return {
    ...result,
    ...(occurredAt ? { occurredAt } : {}),
    subscriptionUpdate,
  };
}
