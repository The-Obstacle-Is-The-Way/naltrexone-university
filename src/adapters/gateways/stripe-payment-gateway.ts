import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import { createStripeCheckoutSession } from '@/src/adapters/gateways/stripe/stripe-checkout-sessions';
import { createStripeCustomer } from '@/src/adapters/gateways/stripe/stripe-customers';
import { createStripePortalSession } from '@/src/adapters/gateways/stripe/stripe-portal';
import { processStripeWebhookEvent } from '@/src/adapters/gateways/stripe/stripe-webhook-processor';
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
    options?: PaymentGatewayRequestOptions,
  ): Promise<CheckoutSessionOutput> {
    return createStripeCheckoutSession({
      stripe: this.deps.stripe,
      input,
      options,
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
    });
  }
}
