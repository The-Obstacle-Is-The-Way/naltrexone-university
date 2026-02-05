import { retrieveAndNormalizeStripeSubscription } from '@/src/adapters/gateways/stripe/stripe-subscription-normalizer';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
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

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function toSafeInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (!Number.isInteger(value)) return fallback;
  return value;
}

export async function reconcileStripeSubscriptions(
  input: ReconcileStripeSubscriptionsInput,
  deps: ReconcileStripeSubscriptionsDeps,
): Promise<ReconcileStripeSubscriptionsOutput> {
  const safeLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, toSafeInt(input.limit, DEFAULT_LIMIT)),
  );
  const safeOffset = Math.max(0, toSafeInt(input.offset, 0));

  const rows = await deps.listLocalSubscriptions({
    limit: safeLimit,
    offset: safeOffset,
  });

  const failures: Array<{ stripeSubscriptionId: string; error: string }> = [];
  let updated = 0;

  for (const row of rows) {
    try {
      const subscriptionUpdate = await retrieveAndNormalizeStripeSubscription({
        stripe: deps.stripe,
        subscriptionRef: row.stripeSubscriptionId,
        event: {
          id: `cron_reconcile:${row.stripeSubscriptionId}`,
          type: 'cron.reconcile_stripe_subscriptions',
        },
        priceIds: deps.priceIds,
        logger: deps.logger,
      });

      if (subscriptionUpdate.userId !== row.userId) {
        deps.logger.error(
          {
            stripeSubscriptionId: row.stripeSubscriptionId,
            expectedUserId: row.userId,
            actualUserId: subscriptionUpdate.userId,
          },
          'Stripe subscription metadata.user_id does not match local user id',
        );
        throw new ApplicationError(
          'CONFLICT',
          'Stripe subscription user id mismatch',
        );
      }

      await deps.transaction(async ({ stripeCustomers, subscriptions }) => {
        await stripeCustomers.insert(
          subscriptionUpdate.userId,
          subscriptionUpdate.externalCustomerId,
        );
        await subscriptions.upsert({
          userId: subscriptionUpdate.userId,
          externalSubscriptionId: subscriptionUpdate.externalSubscriptionId,
          plan: subscriptionUpdate.plan,
          status: subscriptionUpdate.status,
          currentPeriodEnd: subscriptionUpdate.currentPeriodEnd,
          cancelAtPeriodEnd: subscriptionUpdate.cancelAtPeriodEnd,
        });
      });

      updated += 1;
    } catch (error) {
      const message = toErrorMessage(error);
      deps.logger.error(
        {
          stripeSubscriptionId: row.stripeSubscriptionId,
          error: message,
        },
        'Stripe subscription reconciliation failed',
      );
      failures.push({
        stripeSubscriptionId: row.stripeSubscriptionId,
        error: message,
      });
    }
  }

  return {
    scanned: rows.length,
    updated,
    failed: failures.length,
    failures,
  };
}
