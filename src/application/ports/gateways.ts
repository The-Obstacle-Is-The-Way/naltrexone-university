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

export type CheckoutSessionInput = {
  userId: string; // internal UUID
  userEmail: string;
  plan: SubscriptionPlan; // domain plan (monthly/annual)
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSessionOutput = { url: string };

export type PortalSessionInput = {
  stripeCustomerId: string; // opaque external id
  returnUrl: string;
};

export type PortalSessionOutput = { url: string };

export type WebhookEventResult = {
  eventId: string;
  type:
    | 'checkout.session.completed'
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted'
    | (string & {});
  processed: boolean;
  subscriptionUpdate?: {
    userId: string; // internal UUID
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    priceId: string; // persisted for audit/debug (not a domain concept)
  };
};

export interface PaymentGateway {
  createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionOutput>;

  createPortalSession(input: PortalSessionInput): Promise<PortalSessionOutput>;

  /**
   * Verifies signature and normalizes the Stripe event for the use case/controller.
   */
  processWebhookEvent(
    rawBody: string,
    signature: string,
  ): Promise<WebhookEventResult>;
}
