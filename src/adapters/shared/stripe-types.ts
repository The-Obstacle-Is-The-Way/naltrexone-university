export type StripeRequestOptions = {
  idempotencyKey?: string;
};

export type CustomerCreateParams = {
  email?: string;
  metadata?: Record<string, string>;
};

export type StripeCustomer = { id?: string };

export type CheckoutSessionCreateParams = {
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

export type StripeCheckoutSession = { id: string; url: string | null };

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

export type StripeClient = {
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
