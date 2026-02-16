import {
  callStripeWithRetry,
  retrieveAndNormalizeStripeSubscription,
} from '@/src/adapters/gateways/stripe';
import type {
  ReconcileStripeSubscriptionsDeps,
  ReconcileStripeSubscriptionsInput,
  ReconcileStripeSubscriptionsOutput,
} from '@/src/adapters/jobs/reconcile-stripe-subscriptions-types';
import { ApplicationError } from '@/src/application/errors';

const DEFAULT_LIMIT = 100;
export const RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT = 500;
const DEFAULT_CONCURRENCY = 10;
const MAX_CONCURRENCY = 25;
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

async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (!item) continue;
      results[index] = await fn(item);
    }
  });

  await Promise.all(workers);
  return results;
}

export async function reconcileStripeSubscriptions(
  input: ReconcileStripeSubscriptionsInput,
  deps: ReconcileStripeSubscriptionsDeps,
): Promise<ReconcileStripeSubscriptionsOutput> {
  const safeLimit = Math.min(
    RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
    Math.max(1, toSafeInt(input.limit, DEFAULT_LIMIT)),
  );
  const safeOffset = Math.max(0, toSafeInt(input.offset, 0));
  const dryRun = input.dryRun ?? true;
  const safeConcurrency = Math.min(
    MAX_CONCURRENCY,
    Math.max(
      1,
      toSafeInt(input.concurrency ?? DEFAULT_CONCURRENCY, DEFAULT_CONCURRENCY),
    ),
  );

  const rows = await deps.listLocalSubscriptions({
    limit: safeLimit,
    offset: safeOffset,
  });

  const results = await mapWithConcurrencyLimit(
    rows,
    safeConcurrency,
    async (row) => {
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
            { conflictStrategy: 'authoritative' },
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

        return { ok: true as const };
      } catch (error) {
        const message = toErrorMessage(error);
        deps.logger.error(
          {
            stripeSubscriptionId: row.stripeSubscriptionId,
            error: message,
          },
          'Stripe subscription reconciliation failed',
        );
        return {
          ok: false as const,
          stripeSubscriptionId: row.stripeSubscriptionId,
          error: message,
        };
      }
    },
  );

  const failures = results.filter(
    (
      result,
    ): result is { ok: false; stripeSubscriptionId: string; error: string } =>
      !result.ok,
  );
  const updated = results.length - failures.length;

  return {
    scanned: rows.length,
    updated,
    failed: failures.length,
    failures,
  };
}
