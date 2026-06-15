import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripePortalSession,
  processStripeWebhookEvent,
} from '@/src/adapters/gateways/stripe';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import type {
  CheckoutSessionInput,
  CheckoutSessionOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  PaymentGateway,
  PaymentGatewayRequestOptions,
  PortalSessionInput,
  PortalSessionOutput,
  WebhookEventResult,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';

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
