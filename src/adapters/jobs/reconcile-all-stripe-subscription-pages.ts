import type { Logger, LoggerContext } from '@/src/application/ports/logger';
import {
  RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_LIMIT,
  RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
} from './reconcile-stripe-subscriptions';
import type {
  ReconcileStripeSubscriptionsInput,
  ReconcileStripeSubscriptionsOutput,
} from './reconcile-stripe-subscriptions-types';

export const RECONCILE_ALL_STRIPE_SUBSCRIPTION_PAGES_DEFAULT_MAX_PAGES = 100;
export const RECONCILE_ALL_STRIPE_SUBSCRIPTION_PAGES_DEFAULT_TIME_BUDGET_MS = 40_000;

export type ReconcileAllStripeSubscriptionPagesInput = Omit<
  ReconcileStripeSubscriptionsInput,
  'offset'
> & {
  maxPages?: number;
  timeBudgetMs?: number;
};

export type ReconcileAllStripeSubscriptionPagesOutput =
  ReconcileStripeSubscriptionsOutput & {
    pagesScanned: number;
    stoppedEarly: boolean;
    nextOffset: number | null;
  };

export type ReconcileAllStripeSubscriptionPagesDeps = {
  reconcilePage: (
    input: ReconcileStripeSubscriptionsInput,
  ) => Promise<ReconcileStripeSubscriptionsOutput>;
  logger: Logger;
  now: () => number;
};

type StopReason = 'max_pages' | 'time_budget' | 'page_rejected';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function toSafeInt(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  if (!Number.isInteger(value)) return fallback;
  return value;
}

function createPageInput(
  input: ReconcileAllStripeSubscriptionPagesInput,
  limit: number,
  offset: number,
): ReconcileStripeSubscriptionsInput {
  const pageInput: ReconcileStripeSubscriptionsInput = { limit, offset };

  if (input.dryRun !== undefined) {
    pageInput.dryRun = input.dryRun;
  }
  if (input.concurrency !== undefined) {
    pageInput.concurrency = input.concurrency;
  }

  return pageInput;
}

function warnStoppedEarly(
  logger: Logger,
  reason: StopReason,
  nextOffset: number,
  context: LoggerContext,
): void {
  logger.warn(
    {
      reason,
      nextOffset,
      ...context,
    },
    `Stripe subscription reconciliation stopped before full coverage; resume at offset ${nextOffset}`,
  );
}

function stoppedEarlyResult(
  aggregate: ReconcileStripeSubscriptionsOutput & { pagesScanned: number },
  nextOffset: number,
): ReconcileAllStripeSubscriptionPagesOutput {
  return {
    ...aggregate,
    stoppedEarly: true,
    nextOffset,
  };
}

export async function reconcileAllStripeSubscriptionPages(
  input: ReconcileAllStripeSubscriptionPagesInput,
  deps: ReconcileAllStripeSubscriptionPagesDeps,
): Promise<ReconcileAllStripeSubscriptionPagesOutput> {
  const limit = Math.min(
    RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
    Math.max(
      1,
      toSafeInt(input.limit, RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_LIMIT),
    ),
  );
  const maxPages = Math.max(
    1,
    toSafeInt(
      input.maxPages,
      RECONCILE_ALL_STRIPE_SUBSCRIPTION_PAGES_DEFAULT_MAX_PAGES,
    ),
  );
  const timeBudgetMs = Math.max(
    0,
    toSafeInt(
      input.timeBudgetMs,
      RECONCILE_ALL_STRIPE_SUBSCRIPTION_PAGES_DEFAULT_TIME_BUDGET_MS,
    ),
  );
  const startedAt = deps.now();
  const aggregate: ReconcileStripeSubscriptionsOutput & {
    pagesScanned: number;
  } = {
    scanned: 0,
    updated: 0,
    failed: 0,
    failures: [],
    pagesScanned: 0,
  };

  let offset = 0;

  while (true) {
    if (aggregate.pagesScanned >= maxPages) {
      warnStoppedEarly(deps.logger, 'max_pages', offset, {
        pagesScanned: aggregate.pagesScanned,
        maxPages,
      });
      return stoppedEarlyResult(aggregate, offset);
    }

    if (aggregate.pagesScanned > 0 && deps.now() - startedAt >= timeBudgetMs) {
      warnStoppedEarly(deps.logger, 'time_budget', offset, {
        pagesScanned: aggregate.pagesScanned,
        timeBudgetMs,
      });
      return stoppedEarlyResult(aggregate, offset);
    }

    let page: ReconcileStripeSubscriptionsOutput;
    try {
      page = await deps.reconcilePage(createPageInput(input, limit, offset));
    } catch (error) {
      if (aggregate.pagesScanned === 0) {
        throw error;
      }

      const message = toErrorMessage(error);
      warnStoppedEarly(deps.logger, 'page_rejected', offset, {
        pagesScanned: aggregate.pagesScanned,
        error: message,
      });
      return stoppedEarlyResult(
        {
          ...aggregate,
          failed: aggregate.failed + 1,
          failures: [
            ...aggregate.failures,
            {
              stripeSubscriptionId: `(page@offset=${offset})`,
              error: message,
            },
          ],
        },
        offset,
      );
    }

    aggregate.scanned += page.scanned;
    aggregate.updated += page.updated;
    aggregate.failed += page.failed;
    aggregate.failures.push(...page.failures);
    aggregate.pagesScanned += 1;

    if (page.scanned < limit) {
      return {
        ...aggregate,
        stoppedEarly: false,
        nextOffset: null,
      };
    }

    // Offset pagination keeps the existing single-page contract intact. If this
    // ever stops early often or OFFSET latency becomes material, keyset paging
    // over a stable cursor is the next escalation.
    offset += limit;
  }
}
