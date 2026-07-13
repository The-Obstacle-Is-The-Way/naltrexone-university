import type { Logger } from '@/src/application/ports/logger';
import type { PendingStripeCustomerCleanupRepository } from '@/src/application/ports/repositories';

export const PENDING_STRIPE_CUSTOMER_CLEANUP_STALE_AFTER_MINUTES = 15;
export const PENDING_STRIPE_CUSTOMER_CLEANUP_BATCH_LIMIT = 25;
export const PENDING_STRIPE_CUSTOMER_CLEANUP_MAX_PAGES = 3;

type DrainPendingStripeCustomerCleanupsInput = {
  olderThan: Date;
  dryRun?: boolean;
  limit?: number;
};

type DrainPendingStripeCustomerCleanupsDeps = {
  pendingStripeCustomerCleanups: PendingStripeCustomerCleanupRepository;
  deleteStripeCustomer: (stripeCustomerId: string) => Promise<void>;
  logger: Logger;
};

type DrainPendingStripeCustomerCleanupsFailure = {
  eventId: string;
  error: string;
};

export type DrainPendingStripeCustomerCleanupsOutput = {
  scanned: number;
  drained: number;
  failed: number;
  failures: DrainPendingStripeCustomerCleanupsFailure[];
  hasMore: boolean;
  dryRun: boolean;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

export async function drainPendingStripeCustomerCleanups(
  input: DrainPendingStripeCustomerCleanupsInput,
  deps: DrainPendingStripeCustomerCleanupsDeps,
): Promise<DrainPendingStripeCustomerCleanupsOutput> {
  const dryRun = input.dryRun ?? true;
  const limit = input.limit ?? PENDING_STRIPE_CUSTOMER_CLEANUP_BATCH_LIMIT;

  if (dryRun) {
    const probeRows = await deps.pendingStripeCustomerCleanups.listStale(
      input.olderThan,
      limit + 1,
    );
    const scanned = Math.min(probeRows.length, limit);
    if (scanned > 0) {
      deps.logger.warn(
        {
          count: scanned,
          oldestCreatedAt: probeRows[0]?.createdAt.toISOString(),
          olderThan: input.olderThan.toISOString(),
          dryRun,
        },
        'Detected stale pending Stripe customer cleanups (dry-run)',
      );
    }
    return {
      scanned,
      drained: 0,
      failed: 0,
      failures: [],
      hasMore: probeRows.length > limit,
      dryRun,
    };
  }

  const failures: DrainPendingStripeCustomerCleanupsFailure[] = [];
  const failedEventIds: string[] = [];
  let drained = 0;
  let scanned = 0;

  // Page past retained failures so a poisoned head cannot starve newer
  // obligations; the page budget bounds Stripe calls per cron run.
  for (
    let page = 0;
    page < PENDING_STRIPE_CUSTOMER_CLEANUP_MAX_PAGES;
    page += 1
  ) {
    const pendingRows = await deps.pendingStripeCustomerCleanups.listStale(
      input.olderThan,
      limit,
      failedEventIds,
    );
    if (pendingRows.length === 0) break;

    scanned += pendingRows.length;
    deps.logger.warn(
      {
        count: pendingRows.length,
        page: page + 1,
        oldestCreatedAt: pendingRows[0]?.createdAt.toISOString(),
        olderThan: input.olderThan.toISOString(),
        dryRun,
      },
      'Draining stale pending Stripe customer cleanups',
    );

    for (const row of pendingRows) {
      try {
        await deps.deleteStripeCustomer(row.stripeCustomerId);
        await deps.pendingStripeCustomerCleanups.deleteByEventId(row.eventId);
        drained += 1;
      } catch (error) {
        const message = toErrorMessage(error);
        failures.push({ eventId: row.eventId, error: message });
        failedEventIds.push(row.eventId);
        deps.logger.error(
          { eventId: row.eventId, error: message },
          'Pending Stripe customer cleanup drain failed',
        );
      }
    }

    if (pendingRows.length < limit) break;
  }

  const [nextPending] = await deps.pendingStripeCustomerCleanups.listStale(
    input.olderThan,
    1,
    failedEventIds,
  );
  const hasMore = nextPending !== undefined;
  if (hasMore) {
    deps.logger.warn(
      {
        olderThan: input.olderThan.toISOString(),
        failed: failures.length,
        drained,
      },
      'Pending Stripe customer cleanup backlog remains after drain run',
    );
  }

  return {
    scanned,
    drained,
    failed: failures.length,
    failures,
    hasMore,
    dryRun,
  };
}
