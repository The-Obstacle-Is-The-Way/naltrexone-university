export type StripeRequestOptions = {
  idempotencyKey?: string;
};

export type CustomerCreateParams = {
  email?: string;
  metadata?: Record<string, string>;
};

export type StripeCustomer = { id?: string };

export type CustomerSearchParams = {
  query: string;
  limit?: number;
};

export type StripeCustomerSearchResult = { data: StripeCustomer[] };

export type CheckoutSessionCreateParams = {
  mode: 'subscription' | 'payment' | 'setup';
  customer: string;
  line_items: Array<{ price: string; quantity: number }>;
  allow_promotion_codes?: boolean;
  billing_address_collection?: 'auto' | 'required';
  success_url: string;
  cancel_url: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
  payment_method_collection?: 'always' | 'if_required';
  subscription_data?: {
    metadata?: Record<string, string>;
    trial_period_days?: number;
    trial_settings?: {
      end_behavior: {
        missing_payment_method: 'cancel' | 'pause' | 'create_invoice';
      };
    };
  };
};

export type StripeCheckoutSessionStatus = 'open' | 'complete' | 'expired';

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  created?: number | undefined;
  status?: StripeCheckoutSessionStatus | null | undefined;
  expires_at?: number | undefined;
  metadata?: Record<string, string> | null;
  payment_method_collection?: 'always' | 'if_required' | null;
};

export type StripeCheckoutSessionList = { data: StripeCheckoutSession[] };

export type StripeCheckoutSessionLineItem = {
  price?: { id?: string } | null;
};

export type StripeCheckoutSessionRetrieved = StripeCheckoutSession & {
  line_items?: { data?: StripeCheckoutSessionLineItem[] };
};

export type BillingPortalSessionCreateParams = {
  customer: string;
  return_url: string;
};

export type StripeBillingPortalSession = { url: string | null };

export type StripeSubscription = unknown;
export const STRIPE_SUBSCRIPTION_STATUSES = [
  'active',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'paused',
  'trialing',
  'unpaid',
] as const;
export type StripeSubscriptionStatus =
  (typeof STRIPE_SUBSCRIPTION_STATUSES)[number];
export type StripeListedSubscription = {
  id?: string;
  status?: StripeSubscriptionStatus;
};
export type StripeSubscriptionListParams = {
  customer: string;
  status?: StripeSubscriptionStatus | 'all';
  limit?: number;
};
export type StripeSubscriptionListResult = {
  data: StripeListedSubscription[];
};

export type StripeClient = {
  customers: {
    create(
      params: CustomerCreateParams,
      options?: StripeRequestOptions,
    ): Promise<StripeCustomer>;
    search?: (
      params: CustomerSearchParams,
      options?: StripeRequestOptions,
    ) => Promise<StripeCustomerSearchResult>;
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
        params?: undefined,
        options?: StripeRequestOptions,
      ): Promise<StripeCheckoutSession>;
    };
  };
  subscriptions?: {
    retrieve(
      subscriptionId: string,
      params?: undefined,
      options?: StripeRequestOptions,
    ): Promise<StripeSubscription>;
    list?(
      params: StripeSubscriptionListParams,
      options?: StripeRequestOptions,
    ): Promise<StripeSubscriptionListResult>;
    cancel?(
      subscriptionId: string,
      params?: undefined,
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
