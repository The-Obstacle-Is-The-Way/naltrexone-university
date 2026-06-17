import { describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  RECONCILE_ALL_STRIPE_SUBSCRIPTION_PAGES_DEFAULT_TIME_BUDGET_MS,
  reconcileAllStripeSubscriptionPages,
} from './reconcile-all-stripe-subscription-pages';
import type {
  ReconcileStripeSubscriptionsInput,
  ReconcileStripeSubscriptionsOutput,
} from './reconcile-stripe-subscriptions-types';

type ReconcilePage = (
  input: ReconcileStripeSubscriptionsInput,
) => Promise<ReconcileStripeSubscriptionsOutput>;

function createPagedReconcileJob(totalRows: number): ReconcilePage {
  return vi.fn(async ({ limit, offset }) => {
    const scanned = Math.min(limit, Math.max(0, totalRows - offset));

    return {
      scanned,
      updated: scanned,
      failed: 0,
      failures: [],
    };
  });
}

function createDeps(input: {
  reconcilePage: ReconcilePage;
  logger?: FakeLogger | undefined;
  now?: (() => number) | undefined;
}) {
  return {
    reconcilePage: input.reconcilePage,
    logger: input.logger ?? new FakeLogger(),
    now: input.now ?? (() => 0),
  };
}

function pageOffsets(reconcilePage: ReconcilePage): number[] {
  return vi.mocked(reconcilePage).mock.calls.map(([input]) => input.offset);
}

describe('reconcileAllStripeSubscriptionPages', () => {
  it('scans later pages and stops on a short final page', async () => {
    const reconcilePage = createPagedReconcileJob(25);

    const result = await reconcileAllStripeSubscriptionPages(
      { limit: 10, dryRun: true },
      createDeps({ reconcilePage }),
    );

    expect(pageOffsets(reconcilePage)).toEqual([0, 10, 20]);
    expect(result).toEqual({
      scanned: 25,
      updated: 25,
      failed: 0,
      failures: [],
      pagesScanned: 3,
      stoppedEarly: false,
      nextOffset: null,
    });
  });

  it('queries one empty boundary page when row count is an exact multiple', async () => {
    const reconcilePage = createPagedReconcileJob(20);

    const result = await reconcileAllStripeSubscriptionPages(
      { limit: 10 },
      createDeps({ reconcilePage }),
    );

    expect(pageOffsets(reconcilePage)).toEqual([0, 10, 20]);
    expect(result).toMatchObject({
      scanned: 20,
      updated: 20,
      failed: 0,
      pagesScanned: 3,
      stoppedEarly: false,
      nextOffset: null,
    });
  });

  it('queries the first page once when the local table is empty', async () => {
    const reconcilePage = createPagedReconcileJob(0);

    const result = await reconcileAllStripeSubscriptionPages(
      { limit: 10 },
      createDeps({ reconcilePage }),
    );

    expect(pageOffsets(reconcilePage)).toEqual([0]);
    expect(result).toMatchObject({
      scanned: 0,
      pagesScanned: 1,
      stoppedEarly: false,
      nextOffset: null,
    });
  });

  it('stops early and warns when maxPages is reached before full coverage', async () => {
    const logger = new FakeLogger();
    const reconcilePage = createPagedReconcileJob(25);

    const result = await reconcileAllStripeSubscriptionPages(
      { limit: 10, maxPages: 2 },
      createDeps({ reconcilePage, logger }),
    );

    expect(pageOffsets(reconcilePage)).toEqual([0, 10]);
    expect(result).toEqual({
      scanned: 20,
      updated: 20,
      failed: 0,
      failures: [],
      pagesScanned: 2,
      stoppedEarly: true,
      nextOffset: 20,
    });
    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        reason: 'max_pages',
        nextOffset: 20,
      }),
      msg: 'Stripe subscription reconciliation stopped before full coverage; resume at offset 20',
    });
  });

  it('stops early and warns when the injected time budget is exhausted', async () => {
    const logger = new FakeLogger();
    let now = 0;
    const reconcilePage = vi.fn(async () => {
      now = RECONCILE_ALL_STRIPE_SUBSCRIPTION_PAGES_DEFAULT_TIME_BUDGET_MS + 1;
      return {
        scanned: 10,
        updated: 10,
        failed: 0,
        failures: [],
      };
    });

    const result = await reconcileAllStripeSubscriptionPages(
      { limit: 10 },
      createDeps({ reconcilePage, logger, now: () => now }),
    );

    expect(pageOffsets(reconcilePage)).toEqual([0]);
    expect(result).toEqual({
      scanned: 10,
      updated: 10,
      failed: 0,
      failures: [],
      pagesScanned: 1,
      stoppedEarly: true,
      nextOffset: 10,
    });
    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        reason: 'time_budget',
        nextOffset: 10,
      }),
      msg: 'Stripe subscription reconciliation stopped before full coverage; resume at offset 10',
    });
  });

  it('propagates dryRun and concurrency unchanged to every page', async () => {
    const reconcilePage = createPagedReconcileJob(25);

    await reconcileAllStripeSubscriptionPages(
      { limit: 10, dryRun: false, concurrency: 3 },
      createDeps({ reconcilePage }),
    );

    expect(vi.mocked(reconcilePage).mock.calls).toEqual([
      [{ limit: 10, offset: 0, dryRun: false, concurrency: 3 }],
      [{ limit: 10, offset: 10, dryRun: false, concurrency: 3 }],
      [{ limit: 10, offset: 20, dryRun: false, concurrency: 3 }],
    ]);
  });

  it('concatenates failures from multiple pages', async () => {
    const reconcilePage = vi.fn(async ({ offset }) => {
      if (offset === 0) {
        return {
          scanned: 10,
          updated: 9,
          failed: 1,
          failures: [{ stripeSubscriptionId: 'sub_page_1', error: 'first' }],
        };
      }

      return {
        scanned: 5,
        updated: 4,
        failed: 1,
        failures: [{ stripeSubscriptionId: 'sub_page_2', error: 'second' }],
      };
    });

    const result = await reconcileAllStripeSubscriptionPages(
      { limit: 10 },
      createDeps({ reconcilePage }),
    );

    expect(result).toEqual({
      scanned: 15,
      updated: 13,
      failed: 2,
      failures: [
        { stripeSubscriptionId: 'sub_page_1', error: 'first' },
        { stripeSubscriptionId: 'sub_page_2', error: 'second' },
      ],
      pagesScanned: 2,
      stoppedEarly: false,
      nextOffset: null,
    });
  });

  it('returns partial progress with a synthetic failure when a later page rejects', async () => {
    const logger = new FakeLogger();
    const reconcilePage = vi.fn(async ({ offset }) => {
      if (offset === 10) {
        throw new Error('Stripe unavailable');
      }

      return {
        scanned: 10,
        updated: 10,
        failed: 0,
        failures: [],
      };
    });

    const result = await reconcileAllStripeSubscriptionPages(
      { limit: 10 },
      createDeps({ reconcilePage, logger }),
    );

    expect(pageOffsets(reconcilePage)).toEqual([0, 10]);
    expect(result).toEqual({
      scanned: 10,
      updated: 10,
      failed: 1,
      failures: [
        {
          stripeSubscriptionId: '(page@offset=10)',
          error: 'Stripe unavailable',
        },
      ],
      pagesScanned: 1,
      stoppedEarly: true,
      nextOffset: 10,
    });
    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        reason: 'page_rejected',
        nextOffset: 10,
        error: 'Stripe unavailable',
      }),
      msg: 'Stripe subscription reconciliation stopped before full coverage; resume at offset 10',
    });
  });

  it('rethrows when the first page rejects', async () => {
    const logger = new FakeLogger();
    const reconcilePage = vi.fn(async () => {
      throw new Error('Stripe unavailable');
    });

    await expect(
      reconcileAllStripeSubscriptionPages(
        { limit: 10 },
        createDeps({ reconcilePage, logger }),
      ),
    ).rejects.toThrow('Stripe unavailable');
    expect(logger.warnCalls).toHaveLength(0);
  });
});
