import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  StripeCustomerRepository,
  SubscriptionRepository,
} from '@/src/application/ports/repositories';

export type StripeCheckoutSessionLike = {
  customer?: unknown;
  subscription?: unknown;
};

export type StripeSubscriptionLike = {
  id?: string;
  customer?: unknown;
  status?: string;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: {
    data?: Array<{
      current_period_end?: number;
      price?: { id?: string };
    }>;
  };
};

export type StripeClientLike = {
  checkout: {
    sessions: {
      retrieve: (
        sessionId: string,
        params?: { expand?: string[] },
      ) => Promise<StripeCheckoutSessionLike>;
    };
  };
  subscriptions: {
    retrieve: (subscriptionId: string) => Promise<StripeSubscriptionLike>;
  };
};

export type ClerkAuthLike = {
  userId: string | null;
  redirectToSignIn: (opts: { returnBackUrl: string | URL }) => never;
};

export type CheckoutSuccessLogger = {
  error: (context: Record<string, unknown>, message: string) => void;
  warn?: (context: Record<string, unknown>, message: string) => void;
};

export type CheckoutSuccessTransaction = {
  stripeCustomers: StripeCustomerRepository;
  subscriptions: SubscriptionRepository;
};

export type CheckoutSuccessDeps = {
  authGateway: AuthGateway;
  getClerkAuth: () => Promise<ClerkAuthLike>;
  logger: CheckoutSuccessLogger;
  stripe: StripeClientLike;
  priceIds: StripePriceIds;
  appUrl: string;
  transaction: <T>(
    fn: (tx: CheckoutSuccessTransaction) => Promise<T>,
  ) => Promise<T>;
};

export type SyncCheckoutSuccessInput = {
  sessionId: string | null;
};

export type CheckoutSuccessSearchParams = {
  session_id?: string;
};

export type CheckoutSuccessContainerLike = {
  createAuthGateway: () => AuthGateway;
  logger: CheckoutSuccessLogger;
  env: {
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: string;
    NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: string;
    NEXT_PUBLIC_APP_URL: string;
  };
  db: {
    transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  };
  createStripeCustomerRepository: (tx: unknown) => StripeCustomerRepository;
  createSubscriptionRepository: (tx: unknown) => SubscriptionRepository;
};

export type CheckoutSuccessModuleLoaders = {
  loadContainer: () => Promise<{ createContainer: () => unknown }>;
  loadStripe: () => Promise<{ stripe: StripeClientLike }>;
  loadClerkServer: () => Promise<{ auth: () => Promise<ClerkAuthLike> }>;
};
