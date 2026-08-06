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
    return createStripeTrialPaymentMethodSetupSession({
      stripe: this.deps.stripe,
      input,
      logger: this.deps.logger,
      stateSecret: this.deps.webhookSecret,
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
    await callStripeWithRetry({
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
      rawBody,
      signature,
      priceIds: this.deps.priceIds,
      logger: this.deps.logger,
      webhookE2EOwner: this.deps.webhookE2EOwner,
    });
  }
}
