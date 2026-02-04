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
import type { StripePriceIds } from '../config/stripe-prices';
import { createStripeCheckoutSession } from './stripe/stripe-checkout-sessions';
import { createStripeCustomer } from './stripe/stripe-customers';
import { createStripePortalSession } from './stripe/stripe-portal';
import { processStripeWebhookEvent } from './stripe/stripe-webhook-processor';

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
