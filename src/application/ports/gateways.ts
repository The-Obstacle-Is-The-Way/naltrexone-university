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

export type RenewalTermsSnapshot = {
  plan: SubscriptionPlan;
  amountCents: number;
  currency: 'usd';
  frequency: 'month' | 'year';
  disclosureVersion: string;
  termsVersion: string;
  termsHash: string;
  disclosureSnapshot: string;
  cancellationMethod: string;
};

export type CheckoutSessionInput = RenewalTermsSnapshot & {
  userId: string; // internal UUID
  externalCustomerId: string; // opaque external id
  successUrl: string;
  cancelUrl: string;
  trialPeriodDays?: number;
};

export type CheckoutSessionOutput = { url: string };

export type TrialPaymentMethodSetupSessionInput = RenewalTermsSnapshot & {
  userId: string;
  externalCustomerId: string;
  externalSubscriptionId: string;
  trialEndsAt: Date;
  successUrl: string;
  cancelUrl: string;
};

export type TrialPaymentMethodSetupSessionOutput = {
  sessionId: string;
  url: string;
};

export type AttachTrialPaymentMethodInput = {
  sessionId: string;
  externalPaymentMethodId: string;
  externalCustomerId: string;
};

export type DetachTrialPaymentMethodInput = {
  sessionId: string;
  externalPaymentMethodId: string;
};

export type SetTrialSubscriptionDefaultPaymentMethodInput = {
  sessionId: string;
  externalPaymentMethodId: string;
  externalSubscriptionId: string;
};

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
  occurredAt?: Date;
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
  initialSubscriptionConsent?: RenewalTermsSnapshot & {
    checkoutSessionId: string;
    userId: string;
    externalCustomerId: string;
    externalSubscriptionId: string;
    acceptedAt: Date;
  };
  trialPaymentMethodSetupCompletion?: {
    sessionId: string;
    userId: string;
    externalCustomerId: string;
    externalSubscriptionId: string;
    plan: SubscriptionPlan;
    amountCents: number;
    currency: 'usd';
    frequency: 'month' | 'year';
    trialEndsAt: Date;
    disclosureVersion: string;
    termsVersion: string;
    termsHash: string;
    stripePaymentMethodId: string;
    acceptedAt: Date;
  };
  trialPaymentMethodSetupExpiration?: {
    sessionId: string;
    userId: string;
    externalCustomerId: string;
    externalSubscriptionId: string;
    plan: SubscriptionPlan;
    amountCents: number;
    currency: 'usd';
    frequency: 'month' | 'year';
    trialEndsAt: Date;
    disclosureVersion: string;
    termsVersion: string;
    termsHash: string;
    expiredAt: Date;
  };
};

export interface PaymentGateway {
  createCustomer(
    input: CreateCustomerInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<CreateCustomerOutput>;

  /**
   * Creates a checkout session for the selected plan.
   *
   * Callers may provide request options for application-level idempotency
   * plumbing, but adapters can intentionally choose provider-specific
   * idempotency. The Stripe adapter uses a deterministic key derived from
   * userId and plan so concurrent same-plan checkout starts collapse to one
   * active external session.
   */
  createCheckoutSession(
    input: CheckoutSessionInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<CheckoutSessionOutput>;

  createTrialPaymentMethodSetupSession(
    input: TrialPaymentMethodSetupSessionInput,
  ): Promise<TrialPaymentMethodSetupSessionOutput>;

  attachTrialPaymentMethod(input: AttachTrialPaymentMethodInput): Promise<void>;

  detachTrialPaymentMethod(input: DetachTrialPaymentMethodInput): Promise<void>;

  setTrialSubscriptionDefaultPaymentMethod(
    input: SetTrialSubscriptionDefaultPaymentMethodInput,
  ): Promise<void>;

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
