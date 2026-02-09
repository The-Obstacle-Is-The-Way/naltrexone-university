import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import type { Logger } from '@/src/application/ports/logger';
import type {
  StripeCustomerRepository,
  SubscriptionRepository,
} from '@/src/application/ports/repositories';
import type { StripePriceIds } from '../config/stripe-prices';

export type StripeSubscriptionRefRow = {
  userId: string;
  stripeSubscriptionId: string;
};

export type ReconcileStripeSubscriptionsInput = {
  limit: number;
  offset: number;
  dryRun?: boolean;
};

export type ReconcileStripeSubscriptionsOutput = {
  scanned: number;
  updated: number;
  failed: number;
  failures: Array<{ stripeSubscriptionId: string; error: string }>;
};

export type ReconcileStripeSubscriptionsDeps = {
  stripe: StripeClient;
  priceIds: StripePriceIds;
  logger: Logger;
  listLocalSubscriptions: (
    input: ReconcileStripeSubscriptionsInput,
  ) => Promise<readonly StripeSubscriptionRefRow[]>;
  transaction: <T>(
    fn: (tx: {
      stripeCustomers: StripeCustomerRepository;
      subscriptions: SubscriptionRepository;
    }) => Promise<T>,
  ) => Promise<T>;
};
