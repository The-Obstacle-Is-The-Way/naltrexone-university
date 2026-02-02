import { z } from 'zod';
import { ApplicationError } from '@/src/application/errors';
import type {
  CheckoutSessionInput,
  CheckoutSessionOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
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

type StripeCheckoutSession = { id: string; url: string | null };
type StripeBillingPortalSession = { url: string | null };
type StripeCustomer = { id?: string };

type StripeCheckoutSessionList = { data: StripeCheckoutSession[] };

type StripeCheckoutSessionLineItem = {
  price?: { id?: string } | null;
};

type StripeCheckoutSessionRetrieved = StripeCheckoutSession & {
  line_items?: { data?: StripeCheckoutSessionLineItem[] };
};

type CheckoutSessionCreateParams = {
  mode: 'subscription' | 'payment' | 'setup';
  customer: string;
  line_items: Array<{ price: string; quantity: number }>;
  allow_promotion_codes?: boolean;
  billing_address_collection?: 'auto' | 'required';
  success_url: string;
  cancel_url: string;
  client_reference_id?: string;
  subscription_data?: {
    metadata?: Record<string, string>;
  };
};

type BillingPortalSessionCreateParams = {
  customer: string;
  return_url: string;
};

type CustomerCreateParams = {
  email?: string;
  metadata?: Record<string, string>;
};

type StripeClient = {
  customers: {
    create(params: CustomerCreateParams): Promise<StripeCustomer>;
  };
  checkout: {
    sessions: {
      create(
        params: CheckoutSessionCreateParams,
      ): Promise<StripeCheckoutSession>;
      list(params: {
        customer: string;
        status: 'open';
        limit: number;
      }): Promise<StripeCheckoutSessionList>;
      retrieve(
        sessionId: string,
        params?: { expand?: string[] },
      ): Promise<StripeCheckoutSessionRetrieved>;
      expire(sessionId: string): Promise<StripeCheckoutSession>;
    };
  };
  billingPortal: {
    sessions: {
      create(
        params: BillingPortalSessionCreateParams,
      ): Promise<StripeBillingPortalSession>;
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
  logger?: {
    error: (msg: string, context?: Record<string, unknown>) => void;
    warn?: (msg: string, context?: Record<string, unknown>) => void;
  };
};

const stripeSubscriptionItemSchema = z
  .object({
    current_period_end: z.number(),
    price: z.object({
      id: z.string(),
    }),
  })
  .passthrough();

const stripeSubscriptionSchema = z
  .object({
    id: z.string(),
    customer: z.string(),
    status: z.string(),
    cancel_at_period_end: z.boolean(),
    metadata: z.record(z.string()).optional(),
    items: z.object({
      data: z.array(stripeSubscriptionItemSchema).min(1),
    }),
  })
  .passthrough();

const subscriptionEventTypes = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
]);

export class StripePaymentGateway implements PaymentGateway {
  constructor(private readonly deps: StripePaymentGatewayDeps) {}

  async createCustomer(
    input: CreateCustomerInput,
  ): Promise<CreateCustomerOutput> {
    const customer = await this.deps.stripe.customers.create({
      email: input.email,
      metadata: {
        user_id: input.userId,
        clerk_user_id: input.clerkUserId,
      },
    });

    if (!customer.id) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe customer id is missing',
      );
    }

    return { stripeCustomerId: customer.id };
  }

  async createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionOutput> {
    const priceId = getStripePriceId(input.plan, this.deps.priceIds);

    const existing = await this.deps.stripe.checkout.sessions.list({
      customer: input.stripeCustomerId,
      status: 'open',
      limit: 1,
    });

    const existingSession = existing.data[0];
    const existingUrl = existingSession?.url;
    if (existingSession && existingUrl) {
      try {
        const session = await this.deps.stripe.checkout.sessions.retrieve(
          existingSession.id,
          { expand: ['line_items'] },
        );
        const existingPriceId = session.line_items?.data?.[0]?.price?.id;
        if (existingPriceId === priceId) {
          return { url: existingUrl };
        }

        // Avoid reusing a checkout session for a different plan. If the user
        // changes plans, we expire the old session and create a new one so the
        // Stripe UI matches their selection.
        this.deps.logger?.warn?.('Expiring mismatched checkout session', {
          sessionId: existingSession.id,
          existingPriceId: existingPriceId ?? null,
          requestedPriceId: priceId,
        });
        await this.deps.stripe.checkout.sessions.expire(existingSession.id);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.deps.logger?.warn?.(
          'Failed to inspect existing checkout session',
          {
            sessionId: existingSession.id,
            error: errorMessage,
          },
        );
      }
    }

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
    let event: ReturnType<StripeClient['webhooks']['constructEvent']>;
    try {
      event = this.deps.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.deps.webhookSecret,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.deps.logger?.error('Webhook signature verification failed', {
        error: errorMessage,
      });

      throw new ApplicationError(
        'INVALID_WEBHOOK_SIGNATURE',
        `Invalid webhook signature: ${errorMessage}`,
      );
    }

    const result: WebhookEventResult = {
      eventId: event.id,
      type: event.type,
    };

    if (!subscriptionEventTypes.has(event.type)) {
      return result;
    }

    const parsedSubscription = stripeSubscriptionSchema.safeParse(
      event.data.object,
    );
    if (!parsedSubscription.success) {
      this.deps.logger?.error('Invalid Stripe subscription webhook payload', {
        eventId: event.id,
        type: event.type,
        error: parsedSubscription.error.flatten(),
      });

      throw new ApplicationError(
        'INVALID_WEBHOOK_PAYLOAD',
        'Invalid Stripe subscription webhook payload',
      );
    }

    const subscription = parsedSubscription.data;
    const userId = subscription.metadata?.user_id;
    if (!userId) {
      // Stripe can emit `customer.subscription.created` without our metadata.
      // Without `user_id` we can't map the event to an internal user, so we skip
      // and rely on subsequent subscription events to sync.
      if (event.type === 'customer.subscription.created') {
        this.deps.logger?.warn?.(
          'Skipping subscription.created event without metadata.user_id',
          {
            eventId: event.id,
            stripeSubscriptionId: subscription.id ?? null,
            stripeCustomerId: subscription.customer ?? null,
          },
        );
        return result;
      }

      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription metadata.user_id is required',
      );
    }

    const stripeSubscriptionId = subscription.id;
    const stripeCustomerId = subscription.customer;

    const status = subscription.status;
    if (!status || !isValidSubscriptionStatus(status)) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscription status is invalid',
      );
    }

    const subscriptionItem = subscription.items.data[0];
    const currentPeriodEndSeconds = subscriptionItem.current_period_end;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;
    const priceId = subscriptionItem.price.id;

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
        stripeCustomerId,
        stripeSubscriptionId,
        plan,
        status,
        currentPeriodEnd: new Date(currentPeriodEndSeconds * 1000),
        cancelAtPeriodEnd,
      },
    };
  }
}
