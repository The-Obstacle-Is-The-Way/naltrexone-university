import type { User } from '@/src/domain/entities';
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/src/domain/value-objects';

export interface AuthGateway {
  /**
   * Returns the current authenticated user (internal UUID + email), or null.
   * Implementation lives in adapters and may upsert the DB user row.
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Returns the current authenticated user or throws ApplicationError('UNAUTHENTICATED').
   */
  requireUser(): Promise<User>;
}

export type PaymentGatewayRequestOptions = {
  /**
   * Optional idempotency key provided by the client for this logical operation.
   *
   * Adapters may forward this to external providers (e.g., Stripe idempotency keys)
   * to make retries safe and avoid duplicate external side effects.
   */
  idempotencyKey?: string;
};

export type CheckoutSessionInput = {
  userId: string; // internal UUID
  externalCustomerId: string; // opaque external id
  plan: SubscriptionPlan; // domain plan (monthly/annual)
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSessionOutput = { url: string };

export type PortalSessionInput = {
  externalCustomerId: string; // opaque external id
  returnUrl: string;
};

export type PortalSessionOutput = { url: string };

export type CreateCustomerInput = {
  userId: string; // internal UUID
  clerkUserId: string; // opaque external id
  email: string;
};

export type CreateCustomerOutput = { externalCustomerId: string };

export type WebhookEventResult = {
  eventId: string;
  type:
    | 'checkout.session.completed'
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted'
    | (string & {});
  subscriptionUpdate?: {
    userId: string; // internal UUID
    externalCustomerId: string; // opaque external id
    externalSubscriptionId: string; // opaque external id
    plan: SubscriptionPlan; // domain plan (monthly/annual)
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  };
};

export interface PaymentGateway {
  createCustomer(
    input: CreateCustomerInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<CreateCustomerOutput>;

  createCheckoutSession(
    input: CheckoutSessionInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<CheckoutSessionOutput>;

  createPortalSession(
    input: PortalSessionInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<PortalSessionOutput>;

  /**
   * Verifies signature and normalizes the Stripe event for the use case/controller.
   */
  processWebhookEvent(
    rawBody: string,
    signature: string,
  ): Promise<WebhookEventResult>;
}

export type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export interface RateLimiter {
  limit(input: RateLimitInput): Promise<RateLimitResult>;
  pruneExpiredWindows(before: Date, limit: number): Promise<number>;
}
