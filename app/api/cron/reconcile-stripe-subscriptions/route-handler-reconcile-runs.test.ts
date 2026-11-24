import { describe, expect, it } from 'vitest';
import type { ReconcileAllStripeSubscriptionPagesOutput } from '@/src/adapters/jobs/reconcile-all-stripe-subscription-pages';
import {
  FakeRateLimiter,
  FakeStripeReconcileRunRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createHarness,
  NOW,
  request,
  WATCH_TIME,
} from './route-handler-test-helpers';

// DEBT-501 item 9: each scheduled full run records its start and, when its
// reconciliation returns with a row that did not fail or with no rows, its
// finish, so the renewal job can tell a stopped reconcile from a working one.
describe('reconcile run records', () => {
  const someFailed: ReconcileAllStripeSubscriptionPagesOutput = {
    scanned: 3,
    updated: 1,
    failed: 2,
    failures: [
      { stripeSubscriptionId: 'sub_failing', error: 'row failed' },
      { stripeSubscriptionId: '(page@offset=500)', error: 'page rejected' },
    ],
    pagesScanned: 1,
    stoppedEarly: true,
    nextOffset: 500,
  };

  it('records the start and the finish of a full run, with its failed subscriptions', async () => {
    const harness = createHarness({ allPagesResult: someFailed });

    const response = await harness.handle(request({ query: '?dryRun=false' }));

    expect(response.status).toBe(200);
    expect(await harness.reconcileRuns.latestStartedAt()).toEqual(NOW);
    expect(await harness.reconcileRuns.listLatestFinished(5)).toEqual([
      {
        id: expect.any(String),
        startedAt: NOW,
        failedSubscriptionIds: ['sub_failing'],
      },
    ]);
  });

  it('records a finish for a full run that found no rows', async () => {
    const harness = createHarness();

    await harness.handle(request({ query: '?dryRun=false&scope=all' }));

    expect(await harness.reconcileRuns.listLatestFinished(5)).toHaveLength(1);
  });

  it('records no finish when the reconciliation throws', async () => {
    const harness = createHarness({
      allPagesError: new Error('stripe down'),
    });

    const response = await harness.handle(request({ query: '?dryRun=false' }));

    expect(response.status).toBe(500);
    expect(
      await harness.reconcileRuns.listUnreportedUnfinished(WATCH_TIME),
    ).toEqual([{ id: expect.any(String), startedAt: NOW }]);
  });

  it('records no finish when every row failed, though the route answers 200', async () => {
    const harness = createHarness({
      allPagesResult: { ...someFailed, scanned: 2, failed: 2 },
    });

    const response = await harness.handle(request({ query: '?dryRun=false' }));

    expect(response.status).toBe(200);
    expect(await harness.reconcileRuns.listLatestFinished(5)).toEqual([]);
    expect(
      await harness.reconcileRuns.listUnreportedUnfinished(WATCH_TIME),
    ).toHaveLength(1);
  });

  it('records the start of a run the rate limiter refuses, and no finish', async () => {
    const harness = createHarness({
      rateLimiter: new FakeRateLimiter({
        success: false,
        limit: 5,
        remaining: 0,
        retryAfterSeconds: 42,
      }),
    });

    const response = await harness.handle(request({ query: '?dryRun=false' }));

    expect(response.status).toBe(429);
    expect(
      await harness.reconcileRuns.listUnreportedUnfinished(WATCH_TIME),
    ).toHaveLength(1);
  });

  it.each([
    ['a dry run', '?scope=all'],
    ['a single-page run', '?scope=page&dryRun=false'],
  ])('records nothing for %s', async (_label, query) => {
    const harness = createHarness();

    await harness.handle(request({ query }));

    expect(await harness.reconcileRuns.latestStartedAt()).toBeNull();
  });

  it('records nothing for an unauthorized request', async () => {
    const harness = createHarness();

    await harness.handle(
      request({ query: '?dryRun=false', authorization: 'Bearer wrong' }),
    );

    expect(await harness.reconcileRuns.latestStartedAt()).toBeNull();
  });

  it('logs a start that cannot be recorded and still reconciles', async () => {
    const harness = createHarness({
      reconcileRuns: new UnwritableStripeReconcileRuns(),
    });

    const response = await harness.handle(request({ query: '?dryRun=false' }));

    expect(response.status).toBe(200);
    expect(harness.allPagesCalls).toHaveLength(1);
    expect(harness.logger.errorCalls.map((call) => call.msg)).toEqual([
      'Reconcile run start not recorded',
    ]);
  });

  it('logs a finish that cannot be recorded and still answers 200', async () => {
    const harness = createHarness({
      reconcileRuns: new UnfinishableStripeReconcileRuns(),
    });

    const response = await harness.handle(request({ query: '?dryRun=false' }));

    expect(response.status).toBe(200);
    expect(harness.logger.errorCalls.map((call) => call.msg)).toEqual([
      'Reconcile run finish not recorded',
    ]);
  });
});

/** The maintained fake, with its start write failing. */
class UnwritableStripeReconcileRuns extends FakeStripeReconcileRunRepository {
  override async recordStart(): Promise<string> {
    throw new Error('database unavailable');
  }
}

/** The maintained fake, with its finish write failing. */
class UnfinishableStripeReconcileRuns extends FakeStripeReconcileRunRepository {
  override async recordFinish(): Promise<void> {
    throw new Error('database unavailable');
  }
}
