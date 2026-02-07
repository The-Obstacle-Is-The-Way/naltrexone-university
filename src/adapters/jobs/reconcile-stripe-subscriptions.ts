import { callStripeWithRetry } from '@/src/adapters/gateways/stripe/stripe-retry';
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

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const SUBSCRIPTION_LIST_LIMIT = 100;
const BLOCKING_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function toSafeInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (!Number.isInteger(value)) return fallback;
  return value;
}

function isBlockingStatus(status: unknown): status is string {
  return typeof status === 'string' && BLOCKING_STATUSES.has(status);
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
  const dryRun = input.dryRun ?? true;

  const rows = await deps.listLocalSubscriptions({
    limit: safeLimit,
    offset: safeOffset,
  });

  const failures: Array<{ stripeSubscriptionId: string; error: string }> = [];
  let updated = 0;

  for (const row of rows) {
    try {
      const localSubscriptionUpdate =
        await retrieveAndNormalizeStripeSubscription({
          stripe: deps.stripe,
          subscriptionRef: row.stripeSubscriptionId,
          event: {
            id: `cron_reconcile:${row.stripeSubscriptionId}`,
            type: 'cron.reconcile_stripe_subscriptions',
          },
          priceIds: deps.priceIds,
          logger: deps.logger,
        });

      if (localSubscriptionUpdate.userId !== row.userId) {
        deps.logger.error(
          {
            stripeSubscriptionId: row.stripeSubscriptionId,
            expectedUserId: row.userId,
            actualUserId: localSubscriptionUpdate.userId,
          },
          'Stripe subscription metadata.user_id does not match local user id',
        );
        throw new ApplicationError(
          'CONFLICT',
          'Stripe subscription user id mismatch',
        );
      }

      const subscriptionsClient = deps.stripe.subscriptions;
      const listSubscriptions =
        subscriptionsClient?.list?.bind(subscriptionsClient);
      if (!listSubscriptions) {
        throw new ApplicationError(
          'STRIPE_ERROR',
          'Stripe subscriptions.list is unavailable for reconciliation',
        );
      }

      const listedSubscriptions = await callStripeWithRetry({
        operation: 'subscriptions.list',
        fn: () =>
          listSubscriptions({
            customer: localSubscriptionUpdate.externalCustomerId,
            status: 'all',
            limit: SUBSCRIPTION_LIST_LIMIT,
          }),
        logger: deps.logger,
      });

      const blockingSubscriptionIds = listedSubscriptions.data
        .filter((subscription) => isBlockingStatus(subscription.status))
        .map((subscription) => subscription.id)
        .filter((id): id is string => typeof id === 'string');

      let canonical = localSubscriptionUpdate;
      const canonicalById = new Map<string, typeof localSubscriptionUpdate>([
        [
          localSubscriptionUpdate.externalSubscriptionId,
          localSubscriptionUpdate,
        ],
      ]);

      for (const blockingId of blockingSubscriptionIds) {
        if (canonicalById.has(blockingId)) continue;
        const blockingUpdate = await retrieveAndNormalizeStripeSubscription({
          stripe: deps.stripe,
          subscriptionRef: blockingId,
          event: {
            id: `cron_reconcile:${blockingId}`,
            type: 'cron.reconcile_stripe_subscriptions',
          },
          priceIds: deps.priceIds,
          logger: deps.logger,
        });

        if (blockingUpdate.userId !== row.userId) {
          deps.logger.error(
            {
              stripeSubscriptionId: blockingId,
              expectedUserId: row.userId,
              actualUserId: blockingUpdate.userId,
            },
            'Blocking Stripe subscription metadata.user_id mismatch during reconciliation',
          );
          throw new ApplicationError(
            'CONFLICT',
            'Blocking Stripe subscription user id mismatch',
          );
        }

        canonicalById.set(blockingId, blockingUpdate);
      }

      if (blockingSubscriptionIds.length > 0) {
        const keptSubscriptionId = blockingSubscriptionIds.includes(
          row.stripeSubscriptionId,
        )
          ? row.stripeSubscriptionId
          : blockingSubscriptionIds
              .map((id) => canonicalById.get(id))
              .filter((subscription): subscription is typeof canonical => {
                return subscription !== undefined;
              })
              .sort((a, b) => {
                const periodDiff =
                  b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime();
                if (periodDiff !== 0) return periodDiff;
                return a.externalSubscriptionId.localeCompare(
                  b.externalSubscriptionId,
                );
              })[0]?.externalSubscriptionId;

        if (!keptSubscriptionId) {
          throw new ApplicationError(
            'STRIPE_ERROR',
            'Unable to determine canonical Stripe subscription',
          );
        }

        const kept = canonicalById.get(keptSubscriptionId);
        if (!kept) {
          throw new ApplicationError(
            'STRIPE_ERROR',
            'Canonical Stripe subscription data is missing',
          );
        }
        canonical = kept;

        const duplicateIds = blockingSubscriptionIds.filter(
          (id) => id !== keptSubscriptionId,
        );

        if (!dryRun && duplicateIds.length > 0) {
          const cancelSubscription =
            subscriptionsClient?.cancel?.bind(subscriptionsClient);
          if (!cancelSubscription) {
            throw new ApplicationError(
              'STRIPE_ERROR',
              'Stripe subscriptions.cancel is unavailable for reconciliation',
            );
          }

          for (const duplicateId of duplicateIds) {
            await callStripeWithRetry({
              operation: 'subscriptions.cancel',
              fn: () =>
                cancelSubscription(duplicateId, {
                  idempotencyKey: `reconcile_duplicate_subscription:${duplicateId}`,
                }),
              logger: deps.logger,
            });
          }
        }

        if (duplicateIds.length > 0) {
          deps.logger.warn(
            {
              userId: row.userId,
              stripeCustomerId: localSubscriptionUpdate.externalCustomerId,
              keptSubscriptionId,
              duplicateSubscriptionIds: duplicateIds,
              dryRun,
            },
            dryRun
              ? 'Detected duplicate Stripe subscriptions (dry-run)'
              : 'Canceled duplicate Stripe subscriptions',
          );
        }
      }

      await deps.transaction(async ({ stripeCustomers, subscriptions }) => {
        await stripeCustomers.insert(
          canonical.userId,
          canonical.externalCustomerId,
        );
        await subscriptions.upsert({
          userId: canonical.userId,
          externalSubscriptionId: canonical.externalSubscriptionId,
          plan: canonical.plan,
          status: canonical.status,
          currentPeriodEnd: canonical.currentPeriodEnd,
          cancelAtPeriodEnd: canonical.cancelAtPeriodEnd,
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
