import {
  callStripeWithRetry,
  isAlreadyCanceledError,
  retrieveAndNormalizeStripeSubscription,
} from '@/src/adapters/gateways/stripe';
import type {
  ReconcileStripeSubscriptionsDeps,
  ReconcileStripeSubscriptionsInput,
  ReconcileStripeSubscriptionsOutput,
} from '@/src/adapters/jobs/reconcile-stripe-subscriptions-types';
import { mapWithConcurrencyLimit } from '@/src/adapters/shared/concurrency';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import { ApplicationError } from '@/src/application/errors';
import { persistSubscriptionObservation } from '@/src/application/shared/persist-subscription-observation';
import { compareCanonicalSubscriptionCandidates } from '@/src/application/shared/subscription-canonicalization';

export const RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_LIMIT = 100;
export const RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT = 500;
export const RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY = 10;
export const RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_CONCURRENCY = 25;
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
    RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
    Math.max(
      1,
      toSafeInt(input.limit, RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_LIMIT),
    ),
  );
  const safeOffset = Math.max(0, toSafeInt(input.offset, 0));
  const dryRun = input.dryRun ?? true;
  const safeConcurrency = Math.min(
    RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_CONCURRENCY,
    Math.max(
      1,
      toSafeInt(
        input.concurrency ?? RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
        RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
      ),
    ),
  );

  const rows = await deps.listLocalSubscriptions({
    limit: safeLimit,
    offset: safeOffset,
  });

  const subscriptionsClient = deps.stripe.subscriptions;
  const listSubscriptions =
    subscriptionsClient?.list?.bind(subscriptionsClient);
  const cancelSubscription =
    subscriptionsClient?.cancel?.bind(subscriptionsClient);
  if (!listSubscriptions || !cancelSubscription) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe subscriptions API is unavailable for reconciliation',
    );
  }

  const results = await mapWithConcurrencyLimit(
    rows,
    safeConcurrency,
    async (row) => {
      try {
        const retrieveObservation = async () => {
          // Phase 1: normalize the local row's Stripe subscription and validate user identity.
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
              webhookE2EOwner: deps.webhookE2EOwner,
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

          // Phase 2: fetch and normalize all blocking subscriptions for the same customer.
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
          const canonicalById = new Map<string, typeof localSubscriptionUpdate>(
            [
              [
                localSubscriptionUpdate.externalSubscriptionId,
                localSubscriptionUpdate,
              ],
            ],
          );
          let duplicateIds: string[] = [];
          let keptSubscriptionId: string | null = null;

          // Intentionally sequential: in this per-row callback we iterate
          // blockingSubscriptionIds one-at-a-time. retrieveAndNormalizeStripeSubscription
          // still runs concurrently across rows (bounded by safeConcurrency), but
          // keeping this loop sequential avoids hammering Stripe for a single
          // customer while building canonicalById.
          for (const blockingId of blockingSubscriptionIds) {
            if (canonicalById.has(blockingId)) continue;
            const blockingUpdate = await retrieveAndNormalizeStripeSubscription(
              {
                stripe: deps.stripe,
                subscriptionRef: blockingId,
                event: {
                  id: `cron_reconcile:${blockingId}`,
                  type: 'cron.reconcile_stripe_subscriptions',
                },
                priceIds: deps.priceIds,
                logger: deps.logger,
                webhookE2EOwner: deps.webhookE2EOwner,
              },
            );

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
            // Phase 3: select the canonical subscription via entitlement tier,
            // period-end sort, and deterministic tie-break.
            const keptSubscription = blockingSubscriptionIds
              .map((id) => canonicalById.get(id))
              .filter((subscription): subscription is typeof canonical => {
                return subscription !== undefined;
              })
              .sort((a, b) =>
                compareCanonicalSubscriptionCandidates(
                  {
                    subscriptionIdentity: a.externalSubscriptionId,
                    status: a.status,
                    currentPeriodEnd: a.currentPeriodEnd,
                  },
                  {
                    subscriptionIdentity: b.externalSubscriptionId,
                    status: b.status,
                    currentPeriodEnd: b.currentPeriodEnd,
                  },
                ),
              )[0];

            const keptSubscriptionIdCandidate =
              keptSubscription?.externalSubscriptionId;
            if (!keptSubscriptionIdCandidate) {
              throw new ApplicationError(
                'STRIPE_ERROR',
                'Unable to determine canonical Stripe subscription',
              );
            }

            keptSubscriptionId = keptSubscriptionIdCandidate;
            const kept = canonicalById.get(keptSubscriptionId);
            if (!kept) {
              throw new ApplicationError(
                'STRIPE_ERROR',
                'Canonical Stripe subscription data is missing',
              );
            }
            canonical = kept;

            duplicateIds = blockingSubscriptionIds.filter(
              (id) => id !== keptSubscriptionId,
            );
          }

          return {
            canonical,
            duplicateIds,
            keptSubscriptionId,
            localSubscriptionUpdate,
          };
        };

        const { observation } = await persistSubscriptionObservation({
          userId: row.userId,
          initialExpectedVersion: row.version,
          readVersion: (userId) =>
            deps.transaction(({ subscriptions }) =>
              subscriptions.findObservationVersionByUserId(userId),
            ),
          retrieve: retrieveObservation,
          getUserId: ({ canonical }) => canonical.userId,
          persist: ({ canonical }, expectedVersion) =>
            deps.transaction(
              async ({
                stripeCustomers,
                subscriptions,
                renewalConsentRecords,
              }) => {
                // Phase 4: persist canonical subscription and customer mapping atomically.
                // Stripe webhook, checkout-success, and reconcile use advisory(user)
                // -> stripe_subscriptions -> stripe_customers. User deletion is the
                // fourth writer and takes the same advisory before its inverse cascade.
                const write = await subscriptions.upsert({
                  userId: canonical.userId,
                  externalSubscriptionId: canonical.externalSubscriptionId,
                  plan: canonical.plan,
                  status: canonical.status,
                  currentPeriodEnd: canonical.currentPeriodEnd,
                  cancelAtPeriodEnd: canonical.cancelAtPeriodEnd,
                  expectedVersion,
                });
                if (!write.persisted && write.reason === 'version_conflict') {
                  return write;
                }

                await stripeCustomers.insert(
                  canonical.userId,
                  canonical.externalCustomerId,
                  { conflictStrategy: 'authoritative' },
                );
                if (write.persisted && canonical.status === 'canceled') {
                  await renewalConsentRecords.markSubscriptionTerminated({
                    externalSubscriptionId: canonical.externalSubscriptionId,
                    terminatedAt: deps.now(),
                  });
                }
                return write;
              },
            ),
        });
        const {
          canonical,
          duplicateIds,
          keptSubscriptionId,
          localSubscriptionUpdate,
        } = observation;
        const alreadyCanceledDuplicateIds: string[] = [];

        if (duplicateIds.length > 0) {
          // Phase 5: cancel duplicate blocking subscriptions when not in dry-run mode.
          if (!dryRun) {
            for (const duplicateId of duplicateIds) {
              try {
                await callStripeWithRetry({
                  operation: 'subscriptions.cancel',
                  fn: () =>
                    cancelSubscription(duplicateId, undefined, {
                      idempotencyKey: `reconcile_duplicate_subscription:${duplicateId}`,
                    }),
                  logger: deps.logger,
                });
              } catch (error) {
                if (isAlreadyCanceledError(error)) {
                  alreadyCanceledDuplicateIds.push(duplicateId);
                  deps.logger.info(
                    { stripeSubscriptionId: duplicateId },
                    'Duplicate subscription already canceled externally',
                  );
                  continue;
                }
                throw error;
              }
            }
          }

          const canceledDuplicateIds = duplicateIds.filter(
            (duplicateId) => !alreadyCanceledDuplicateIds.includes(duplicateId),
          );

          deps.logger.warn(
            {
              userId: row.userId,
              stripeCustomerId: localSubscriptionUpdate.externalCustomerId,
              keptSubscriptionId:
                keptSubscriptionId ?? canonical.externalSubscriptionId,
              duplicateSubscriptionIds: duplicateIds,
              ...(dryRun
                ? {}
                : {
                    canceledDuplicateSubscriptionIds: canceledDuplicateIds,
                  }),
              ...(alreadyCanceledDuplicateIds.length > 0
                ? {
                    alreadyCanceledSubscriptionIds: alreadyCanceledDuplicateIds,
                  }
                : {}),
              dryRun,
            },
            dryRun
              ? 'Detected duplicate Stripe subscriptions (dry-run)'
              : canceledDuplicateIds.length > 0
                ? 'Canceled duplicate Stripe subscriptions'
                : 'Duplicate Stripe subscriptions already canceled externally',
          );
        }

        return { ok: true as const };
      } catch (error) {
        const message = toErrorMessage(error);
        deps.logger.error(
          {
            stripeSubscriptionId: row.stripeSubscriptionId,
            error: projectSafeErrorDiagnostics(error),
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
