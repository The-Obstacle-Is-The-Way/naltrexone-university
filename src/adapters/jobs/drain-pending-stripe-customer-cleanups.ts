import type { Logger } from '@/src/application/ports/logger';
import type { PendingStripeCustomerCleanupRepository } from '@/src/application/ports/repositories';

export const PENDING_STRIPE_CUSTOMER_CLEANUP_STALE_AFTER_MINUTES = 15;
export const PENDING_STRIPE_CUSTOMER_CLEANUP_BATCH_LIMIT = 25;

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
  const pendingRows = await deps.pendingStripeCustomerCleanups.listStale(
    input.olderThan,
    limit,
  );

  if (pendingRows.length > 0) {
    deps.logger.warn(
      {
        count: pendingRows.length,
        oldestCreatedAt: pendingRows[0]?.createdAt.toISOString(),
        olderThan: input.olderThan.toISOString(),
        dryRun,
      },
      dryRun
        ? 'Detected stale pending Stripe customer cleanups (dry-run)'
        : 'Draining stale pending Stripe customer cleanups',
    );
  }

  if (dryRun) {
    return {
      scanned: pendingRows.length,
      drained: 0,
      failed: 0,
      failures: [],
      dryRun,
    };
  }

  const failures: DrainPendingStripeCustomerCleanupsFailure[] = [];
  let drained = 0;

  for (const row of pendingRows) {
    try {
      await deps.deleteStripeCustomer(row.stripeCustomerId);
      await deps.pendingStripeCustomerCleanups.deleteByEventId(row.eventId);
      drained += 1;
    } catch (error) {
      const message = toErrorMessage(error);
      failures.push({ eventId: row.eventId, error: message });
      deps.logger.error(
        { eventId: row.eventId, error: message },
        'Pending Stripe customer cleanup drain failed',
      );
    }
  }

  return {
    scanned: pendingRows.length,
    drained,
    failed: failures.length,
    failures,
    dryRun,
  };
}
