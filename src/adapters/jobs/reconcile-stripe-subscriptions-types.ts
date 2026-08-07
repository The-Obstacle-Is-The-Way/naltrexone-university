import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import type { Logger } from '@/src/application/ports/logger';
import type {
  RenewalConsentRecordRepository,
  StripeCustomerRepository,
  SubscriptionRepository,
} from '@/src/application/ports/repositories';

export type StripeSubscriptionRefRow = {
  userId: string;
  stripeSubscriptionId: string;
  version: number | null;
};

export type ReconcileStripeSubscriptionsInput = {
  limit: number;
  offset: number;
  dryRun?: boolean;
  concurrency?: number;
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
  now: () => Date;
  webhookE2EOwner?: string | undefined;
  listLocalSubscriptions: (
    input: ReconcileStripeSubscriptionsInput,
  ) => Promise<readonly StripeSubscriptionRefRow[]>;
  transaction: <T>(
    fn: (tx: {
      stripeCustomers: StripeCustomerRepository;
      subscriptions: SubscriptionRepository;
      renewalConsentRecords: RenewalConsentRecordRepository;
    }) => Promise<T>,
  ) => Promise<T>;
};
