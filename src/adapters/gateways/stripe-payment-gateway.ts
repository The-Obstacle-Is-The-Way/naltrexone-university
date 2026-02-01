import { ApplicationError } from '@/src/application/errors';
import type {
  CheckoutSessionInput,
  CheckoutSessionOutput,
  PaymentGateway,
  PortalSessionInput,
  PortalSessionOutput,
  WebhookEventResult,
} from '@/src/application/ports/gateways';
import { isValidSubscriptionStatus } from '@/src/domain/value-objects';
import {
  getStripePriceId,
  getSubscriptionPlanFromPriceId,
  type StripePriceIds,
} from '../config/stripe-prices';

type StripeCheckoutSession = { url: string | null };
type StripeBillingPortalSession = { url: string | null };

type StripeClient = {
  checkout: {
    sessions: {
      create(...args: unknown[]): Promise<StripeCheckoutSession>;
    };
  };
  billingPortal: {
    sessions: {
      create(...args: unknown[]): Promise<StripeBillingPortalSession>;
    };
  };
  webhooks: {
    constructEvent: (
      rawBody: string,
      signature: string,
      secret: string,
    ) => {
      id: string;
      type: string;
      data: { object: unknown };
    };
  };
};

export type StripePaymentGatewayDeps = {
  stripe: StripeClient;
  webhookSecret: string;
  priceIds: StripePriceIds;
};

type StripeSubscriptionLike = {
  id?: string;
  status?: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ price?: { id?: string } }> };
};

export class StripePaymentGateway implements PaymentGateway {
  constructor(private readonly deps: StripePaymentGatewayDeps) {}

  async createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionOutput> {
    const priceId = getStripePriceId(input.plan, this.deps.priceIds);

    const session = await this.deps.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: input.stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: false,
      billing_address_collection: 'auto',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.userId,
      subscription_data: {
        metadata: {
          user_id: input.userId,
        },
      },
    });

    if (!session.url) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe Checkout Session URL is missing',
      );
    }

    return { url: session.url };
  }

  async createPortalSession(
    input: PortalSessionInput,
  ): Promise<PortalSessionOutput> {
    const session = await this.deps.stripe.billingPortal.sessions.create({
      customer: input.stripeCustomerId,
      return_url: input.returnUrl,
    });

    if (!session.url) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe Billing Portal Session URL is missing',
      );
    }

    return { url: session.url };
  }

  async processWebhookEvent(
    rawBody: string,
    signature: string,
  ): Promise<WebhookEventResult> {
    const event = this.deps.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.deps.webhookSecret,
    );

    const result: WebhookEventResult = {
      eventId: event.id,
      type: event.type,
    };

    if (
      event.type !== 'customer.subscription.created' &&
      event.type !== 'customer.subscription.updated' &&
      event.type !== 'customer.subscription.deleted'
    ) {
      return result;
    }

    const subscription = event.data.object as StripeSubscriptionLike;
    const userId = subscription.metadata?.user_id;
    if (!userId) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription metadata.user_id is required',
      );
    }

    const stripeSubscriptionId = subscription.id;
    if (!stripeSubscriptionId) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription id is required',
      );
    }

    const status = subscription.status;
    if (!status || !isValidSubscriptionStatus(status)) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription status is invalid',
      );
    }

    const currentPeriodEndSeconds = subscription.current_period_end;
    if (typeof currentPeriodEndSeconds !== 'number') {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription current_period_end is required',
      );
    }

    const cancelAtPeriodEnd = subscription.cancel_at_period_end;
    if (typeof cancelAtPeriodEnd !== 'boolean') {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription cancel_at_period_end is required',
      );
    }

    const priceId = subscription.items?.data?.[0]?.price?.id;
    if (!priceId) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription price id is required',
      );
    }

    const plan = getSubscriptionPlanFromPriceId(priceId, this.deps.priceIds);
    if (!plan) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription price id does not match a configured plan',
      );
    }

    return {
      ...result,
      subscriptionUpdate: {
        userId,
        stripeSubscriptionId,
        plan,
        status,
        currentPeriodEnd: new Date(currentPeriodEndSeconds * 1000),
        cancelAtPeriodEnd,
      },
    };
  }
}
