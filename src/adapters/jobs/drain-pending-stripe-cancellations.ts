import { isAlreadyCanceledError } from '@/src/adapters/gateways/stripe';
import type { Logger } from '@/src/application/ports/logger';
import type { PendingStripeCancellationRepository } from '@/src/application/ports/repositories';

export const PENDING_STRIPE_CANCELLATION_STALE_AFTER_MINUTES = 15;

type DrainPendingStripeCancellationsInput = {
  olderThan: Date;
  dryRun?: boolean;
};

type DrainPendingStripeCancellationsDeps = {
  pendingStripeCancellations: PendingStripeCancellationRepository;
  cancelStripeCustomerSubscriptions: (
    stripeCustomerId: string,
  ) => Promise<void>;
  logger: Logger;
};

type DrainPendingStripeCancellationsFailure = {
  eventId: string;
  error: string;
};

export type DrainPendingStripeCancellationsOutput = {
  scanned: number;
  drained: number;
  failed: number;
  failures: DrainPendingStripeCancellationsFailure[];
  dryRun: boolean;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

export async function drainPendingStripeCancellations(
  input: DrainPendingStripeCancellationsInput,
  deps: DrainPendingStripeCancellationsDeps,
): Promise<DrainPendingStripeCancellationsOutput> {
  const dryRun = input.dryRun ?? true;
  const pendingRows = await deps.pendingStripeCancellations.listStale(
    input.olderThan,
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
        ? 'Detected stale pending Stripe cancellations (dry-run)'
        : 'Draining stale pending Stripe cancellations',
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

  const failures: DrainPendingStripeCancellationsFailure[] = [];
  let drained = 0;

  for (const row of pendingRows) {
    try {
      try {
        await deps.cancelStripeCustomerSubscriptions(row.stripeCustomerId);
      } catch (error) {
        if (isAlreadyCanceledError(error)) {
          deps.logger.info(
            { eventId: row.eventId },
            'Pending Stripe cancellation already satisfied externally',
          );
        } else {
          throw error;
        }
      }

      await deps.pendingStripeCancellations.deleteByEventId(row.eventId);
      drained += 1;
    } catch (error) {
      const message = toErrorMessage(error);
      failures.push({ eventId: row.eventId, error: message });
      deps.logger.error(
        { eventId: row.eventId, error: message },
        'Pending Stripe cancellation drain failed',
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
