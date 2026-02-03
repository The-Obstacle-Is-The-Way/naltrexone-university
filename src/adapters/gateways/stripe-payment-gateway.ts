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
import type { Logger } from '../shared/logger';
import { isTransientExternalError, retry } from '../shared/retry';

type StripeCheckoutSession = { id: string; url: string | null };
type StripeBillingPortalSession = { url: string | null };
type StripeCustomer = { id?: string };

type StripeCheckoutSessionList = { data: StripeCheckoutSession[] };

type StripeSubscription = unknown;

type StripeEventWithSubscriptionRef = {
  subscription?: string | { id: string } | null;
};

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

type StripeRequestOptions = {
  idempotencyKey?: string;
};

type StripeClient = {
  customers: {
    create(
      params: CustomerCreateParams,
      options?: StripeRequestOptions,
    ): Promise<StripeCustomer>;
  };
  checkout: {
    sessions: {
      create(
        params: CheckoutSessionCreateParams,
        options?: StripeRequestOptions,
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
      expire(
        sessionId: string,
        options?: StripeRequestOptions,
      ): Promise<StripeCheckoutSession>;
    };
  };
  subscriptions?: {
    retrieve(
      subscriptionId: string,
      options?: StripeRequestOptions,
    ): Promise<StripeSubscription>;
  };
  billingPortal: {
    sessions: {
      create(
        params: BillingPortalSessionCreateParams,
        options?: StripeRequestOptions,
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
  logger: Logger;
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

const stripeCheckoutSessionSchema = z
  .object({
    subscription: z
      .union([z.string(), z.object({ id: z.string() }).passthrough()])
      .nullable()
      .optional(),
  })
  .passthrough();

const stripeEventWithSubscriptionRefSchema = stripeCheckoutSessionSchema;

const subscriptionEventTypes = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
]);

const STRIPE_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 100,
  factor: 2,
  maxDelayMs: 1000,
} as const;

function toStripeErrorContext(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const record = error as Error & Record<string, unknown>;
    return {
      name: error.name,
      message: error.message,
      code: typeof record.code === 'string' ? record.code : null,
      statusCode:
        typeof record.statusCode === 'number' ? record.statusCode : null,
      status: typeof record.status === 'number' ? record.status : null,
    };
  }

  return { error: String(error) };
}

export class StripePaymentGateway implements PaymentGateway {
  constructor(private readonly deps: StripePaymentGatewayDeps) {}

  private callStripe<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    return retry(fn, {
      ...STRIPE_RETRY_OPTIONS,
      shouldRetry: isTransientExternalError,
      onRetry: ({ attempt, maxAttempts, delayMs, error }) => {
        this.deps.logger.warn(
          {
            operation,
            attempt,
            maxAttempts,
            delayMs,
            error: toStripeErrorContext(error),
          },
          'Retrying Stripe API call',
        );
      },
    });
  }

  private async retrieveAndNormalizeSubscription(
    event: { id: string; type: string },
    subscriptionRef: string | { id: string },
  ): Promise<WebhookEventResult['subscriptionUpdate'] | null> {
    const stripeSubscriptionId =
      typeof subscriptionRef === 'string'
        ? subscriptionRef
        : subscriptionRef.id;

    const stripeSubscriptions = this.deps.stripe.subscriptions;
    if (!stripeSubscriptions) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe subscriptions client is unavailable',
      );
    }

    const subscription = await this.callStripe('subscriptions.retrieve', () =>
      stripeSubscriptions.retrieve(stripeSubscriptionId),
    );

    const parsedSubscription = stripeSubscriptionSchema.safeParse(subscription);
    if (!parsedSubscription.success) {
      this.deps.logger.error(
        {
          eventId: event.id,
          type: event.type,
          stripeSubscriptionId,
          error: parsedSubscription.error.flatten(),
        },
        `Invalid Stripe subscription payload retrieved from ${event.type}`,
      );

      throw new ApplicationError(
        'INVALID_WEBHOOK_PAYLOAD',
        'Invalid Stripe subscription webhook payload',
      );
    }

    return this.normalizeSubscriptionUpdate({
      subscription: parsedSubscription.data,
      eventId: event.id,
      type: event.type,
    });
  }

  private normalizeSubscriptionUpdate(input: {
    subscription: z.infer<typeof stripeSubscriptionSchema>;
    eventId: string;
    type: string;
  }): WebhookEventResult['subscriptionUpdate'] | null {
    const { subscription } = input;
    const userId = subscription.metadata?.user_id;
    if (!userId) {
      if (
        input.type === 'customer.subscription.created' ||
        input.type === 'checkout.session.completed'
      ) {
        const message =
          input.type === 'customer.subscription.created'
            ? 'Skipping subscription.created event without metadata.user_id'
            : 'Skipping checkout.session.completed event without metadata.user_id';

        this.deps.logger.warn(
          {
            eventId: input.eventId,
            stripeSubscriptionId: subscription.id ?? null,
            stripeCustomerId: subscription.customer ?? null,
          },
          message,
        );
        return null;
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
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      plan,
      status,
      currentPeriodEnd: new Date(currentPeriodEndSeconds * 1000),
      cancelAtPeriodEnd,
    };
  }

  async createCustomer(
    input: CreateCustomerInput,
  ): Promise<CreateCustomerOutput> {
    const params = {
      email: input.email,
      metadata: {
        user_id: input.userId,
        clerk_user_id: input.clerkUserId,
      },
    } satisfies CustomerCreateParams;

    const customer = input.idempotencyKey
      ? await this.callStripe('customers.create', () =>
          this.deps.stripe.customers.create(params, {
            idempotencyKey: input.idempotencyKey,
          }),
        )
      : await this.deps.stripe.customers.create(params);

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

    const existing = await this.callStripe('checkout.sessions.list', () =>
      this.deps.stripe.checkout.sessions.list({
        customer: input.stripeCustomerId,
        status: 'open',
        limit: 1,
      }),
    );

    const existingSession = existing.data[0];
    const existingUrl = existingSession?.url;
    if (existingSession && existingUrl) {
      try {
        const session = await this.callStripe(
          'checkout.sessions.retrieve',
          () =>
            this.deps.stripe.checkout.sessions.retrieve(existingSession.id, {
              expand: ['line_items'],
            }),
        );
        const existingPriceId = session.line_items?.data?.[0]?.price?.id;
        if (existingPriceId === priceId) {
          return { url: existingUrl };
        }

        // Avoid reusing a checkout session for a different plan. If the user
        // changes plans, we expire the old session and create a new one so the
        // Stripe UI matches their selection.
        this.deps.logger.warn(
          {
            sessionId: existingSession.id,
            existingPriceId: existingPriceId ?? null,
            requestedPriceId: priceId,
          },
          'Expiring mismatched checkout session',
        );
        await this.callStripe('checkout.sessions.expire', () =>
          this.deps.stripe.checkout.sessions.expire(existingSession.id, {
            idempotencyKey: `expire_checkout_session:${existingSession.id}`,
          }),
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.deps.logger.warn(
          {
            sessionId: existingSession.id,
            error: errorMessage,
          },
          'Failed to inspect existing checkout session',
        );
      }
    }

    const params = {
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
    } satisfies CheckoutSessionCreateParams;

    const session = input.idempotencyKey
      ? await this.callStripe('checkout.sessions.create', () =>
          this.deps.stripe.checkout.sessions.create(params, {
            idempotencyKey: input.idempotencyKey,
          }),
        )
      : await this.deps.stripe.checkout.sessions.create(params);

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
    const params = {
      customer: input.stripeCustomerId,
      return_url: input.returnUrl,
    } satisfies BillingPortalSessionCreateParams;

    const session = input.idempotencyKey
      ? await this.callStripe('billingPortal.sessions.create', () =>
          this.deps.stripe.billingPortal.sessions.create(params, {
            idempotencyKey: input.idempotencyKey,
          }),
        )
      : await this.callStripe('billingPortal.sessions.create', () =>
          this.deps.stripe.billingPortal.sessions.create(params),
        );

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

      this.deps.logger.error(
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
        this.deps.logger.error(
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

      const subscriptionUpdate = await this.retrieveAndNormalizeSubscription(
        event,
        subscriptionRef,
      );

      return subscriptionUpdate ? { ...result, subscriptionUpdate } : result;
    }

    if (event.type === 'invoice.payment_failed') {
      const parsedInvoice = stripeEventWithSubscriptionRefSchema.safeParse(
        event.data.object,
      );
      if (!parsedInvoice.success) {
        this.deps.logger.error(
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

      const subscriptionUpdate = await this.retrieveAndNormalizeSubscription(
        event,
        subscriptionRef,
      );

      return subscriptionUpdate ? { ...result, subscriptionUpdate } : result;
    }

    if (!subscriptionEventTypes.has(event.type)) {
      return result;
    }

    const parsedSubscription = stripeSubscriptionSchema.safeParse(
      event.data.object,
    );
    if (!parsedSubscription.success) {
      this.deps.logger.error(
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

    const subscriptionUpdate = this.normalizeSubscriptionUpdate({
      subscription: parsedSubscription.data,
      eventId: event.id,
      type: event.type,
    });

    return subscriptionUpdate ? { ...result, subscriptionUpdate } : result;
  }
}
