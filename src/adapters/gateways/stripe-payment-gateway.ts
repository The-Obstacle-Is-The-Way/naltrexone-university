import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripePortalSession,
  createStripeTrialPaymentMethodSetupSession,
  processStripeWebhookEvent,
} from '@/src/adapters/gateways/stripe';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import type {
  AttachTrialPaymentMethodInput,
  CheckoutSessionInput,
  CheckoutSessionOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  DetachTrialPaymentMethodInput,
  PaymentGateway,
  PaymentGatewayRequestOptions,
  PortalSessionInput,
  PortalSessionOutput,
  SetTrialSubscriptionDefaultPaymentMethodInput,
  TrialPaymentMethodSetupSessionInput,
  TrialPaymentMethodSetupSessionOutput,
  WebhookEventResult,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { callStripeWithRetry } from './stripe/stripe-retry';

export type StripePaymentGatewayDeps = {
  stripe: StripeClient;
  webhookSecret: string;
  consentStateSecret?: string | undefined;
  priceIds: StripePriceIds;
  logger: Logger;
  webhookE2EOwner?: string | undefined;
};

export class StripePaymentGateway implements PaymentGateway {
  constructor(private readonly deps: StripePaymentGatewayDeps) {}

  async createCustomer(
    input: CreateCustomerInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<CreateCustomerOutput> {
    return createStripeCustomer({
      stripe: this.deps.stripe,
      input,
      options,
      logger: this.deps.logger,
    });
  }

  async createCheckoutSession(
    input: CheckoutSessionInput,
    _options?: PaymentGatewayRequestOptions,
  ): Promise<CheckoutSessionOutput> {
    // Checkout sessions use deterministic Stripe idempotency keys by user and
    // plan so concurrent same-plan starts collapse to one active session.
    return createStripeCheckoutSession({
      stripe: this.deps.stripe,
      input,
      priceIds: this.deps.priceIds,
      logger: this.deps.logger,
    });
  }

  async createTrialPaymentMethodSetupSession(
    input: TrialPaymentMethodSetupSessionInput,
  ): Promise<TrialPaymentMethodSetupSessionOutput> {
    const stateSecret = this.requireConsentStateSecret();
    return createStripeTrialPaymentMethodSetupSession({
      stripe: this.deps.stripe,
      input,
      logger: this.deps.logger,
      stateSecret,
    });
  }

  async attachTrialPaymentMethod(
    input: AttachTrialPaymentMethodInput,
  ): Promise<void> {
    const paymentMethods = this.deps.stripe.paymentMethods;
    if (!paymentMethods) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe PaymentMethod API is unavailable',
      );
    }
    const current = await callStripeWithRetry({
      operation: 'payment_methods.retrieve_trial_setup',
      fn: () => paymentMethods.retrieve(input.externalPaymentMethodId),
      logger: this.deps.logger,
    });
    const currentCustomerId =
      typeof current.customer === 'string'
        ? current.customer
        : current.customer?.id;
    if (currentCustomerId === input.externalCustomerId) return;
    if (currentCustomerId) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Trial PaymentMethod is attached to a different customer',
      );
    }

    const attached = await callStripeWithRetry({
      operation: 'payment_methods.attach_trial_setup',
      fn: () =>
        paymentMethods.attach(
          input.externalPaymentMethodId,
          { customer: input.externalCustomerId },
          {
            idempotencyKey: `trial_setup:${input.sessionId}:attach_payment_method`,
          },
        ),
      logger: this.deps.logger,
    });
    const attachedCustomerId =
      typeof attached.customer === 'string'
        ? attached.customer
        : attached.customer?.id;
    if (attachedCustomerId !== input.externalCustomerId) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe did not confirm the verified PaymentMethod customer',
      );
    }
  }

  async detachTrialPaymentMethod(
    input: DetachTrialPaymentMethodInput,
  ): Promise<void> {
    const paymentMethods = this.deps.stripe.paymentMethods;
    const detach = paymentMethods?.detach?.bind(paymentMethods);
    if (!paymentMethods || !detach) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe PaymentMethod API is unavailable',
      );
    }
    const current = await callStripeWithRetry({
      operation: 'payment_methods.retrieve_trial_setup_for_detach',
      fn: () => paymentMethods.retrieve(input.externalPaymentMethodId),
      logger: this.deps.logger,
    });
    const currentCustomerId =
      typeof current.customer === 'string'
        ? current.customer
        : current.customer?.id;
    if (currentCustomerId !== input.externalCustomerId) return;

    await callStripeWithRetry({
      operation: 'payment_methods.detach_trial_setup',
      fn: () =>
        detach(input.externalPaymentMethodId, undefined, {
          idempotencyKey: `trial_setup:${input.sessionId}:detach_payment_method`,
        }),
      logger: this.deps.logger,
    });
  }

  async setTrialSubscriptionDefaultPaymentMethod(
    input: SetTrialSubscriptionDefaultPaymentMethodInput,
  ): Promise<void> {
    const subscriptions = this.deps.stripe.subscriptions;
    const updateSubscription = subscriptions?.update?.bind(subscriptions);
    if (!updateSubscription) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe Subscription update API is unavailable',
      );
    }
    await callStripeWithRetry({
      operation: 'subscriptions.set_trial_setup_default_payment_method',
      fn: () =>
        updateSubscription(
          input.externalSubscriptionId,
          { default_payment_method: input.externalPaymentMethodId },
          {
            idempotencyKey: `trial_setup:${input.sessionId}:set_subscription_default`,
          },
        ),
      logger: this.deps.logger,
    });
  }

  async createPortalSession(
    input: PortalSessionInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<PortalSessionOutput> {
    return createStripePortalSession({
      stripe: this.deps.stripe,
      input,
      options,
      logger: this.deps.logger,
    });
  }

  async processWebhookEvent(
    rawBody: string,
    signature: string,
  ): Promise<WebhookEventResult> {
    return processStripeWebhookEvent({
      stripe: this.deps.stripe,
      webhookSecret: this.deps.webhookSecret,
      consentStateSecret: this.deps.consentStateSecret,
      rawBody,
      signature,
      priceIds: this.deps.priceIds,
      logger: this.deps.logger,
      webhookE2EOwner: this.deps.webhookE2EOwner,
    });
  }

  private requireConsentStateSecret(): string {
    const secret = this.deps.consentStateSecret;
    if (!secret) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Trial consent-state signing is not configured',
      );
    }
    return secret;
  }
}
