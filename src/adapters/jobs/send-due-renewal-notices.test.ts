import { describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import type { SendDueRenewalNoticesResult } from '@/src/application/use-cases';
import { RENEWAL_NOTICE_DISPATCH_CONCURRENCY } from '@/src/application/use-cases/send-due-renewal-notices';
import { RESEND_PROVIDER_TIMEOUT_MS } from '../gateways/resend-transactional-email-gateway';
import {
  SEND_RENEWAL_NOTICES_MAX_DISPATCH_LIMIT,
  SEND_RENEWAL_NOTICES_MAX_DURATION_SECONDS,
  SEND_RENEWAL_NOTICES_MAX_LIMIT,
  SEND_RENEWAL_NOTICES_PROVIDER_BUDGET_RATIO,
  type SendDueRenewalNoticesJobDeps,
  sendDueRenewalNotices,
} from './send-due-renewal-notices';

const now = new Date('2026-08-07T12:00:00.000Z');

function createDeps(): {
  deps: SendDueRenewalNoticesJobDeps;
  listAnnualSubscriptionsDue: ReturnType<
    typeof vi.fn<SendDueRenewalNoticesJobDeps['listAnnualSubscriptionsDue']>
  >;
  execute: ReturnType<
    typeof vi.fn<
      SendDueRenewalNoticesJobDeps['sendDueRenewalNotices']['execute']
    >
  >;
  pruneExpiredTrialPaymentMethodSetups: ReturnType<
    typeof vi.fn<
      SendDueRenewalNoticesJobDeps['pruneExpiredTrialPaymentMethodSetups']
    >
  >;
  logger: FakeLogger;
} {
  const listAnnualSubscriptionsDue = vi.fn<
    SendDueRenewalNoticesJobDeps['listAnnualSubscriptionsDue']
  >(async () => [
    {
      externalSubscriptionId: 'sub_annual_123',
      renewalAt: new Date('2026-09-06T12:00:00.000Z'),
      destination: 'subscriber@example.com',
    },
  ]);
  const execute = vi.fn<
    SendDueRenewalNoticesJobDeps['sendDueRenewalNotices']['execute']
  >(
    async (): Promise<SendDueRenewalNoticesResult> => ({
      queued: 2,
      queueFailures: 0,
      rejectedNotices: 0,
      selected: 2,
      staleUnknown: 0,
      dispatchFailures: 0,
    }),
  );
  const monotonicNow = vi
    .fn<() => number>()
    .mockReturnValueOnce(1_000)
    .mockReturnValueOnce(1_250);
  const pruneExpiredTrialPaymentMethodSetups = vi.fn(async () => 3);
  const logger = new FakeLogger();
  return {
    listAnnualSubscriptionsDue,
    execute,
    pruneExpiredTrialPaymentMethodSetups,
    logger,
    deps: {
      now: () => now,
      monotonicNow,
      listAnnualSubscriptionsDue,
      sendDueRenewalNotices: { execute },
      pruneExpiredTrialPaymentMethodSetups,
      logger,
      annualPlan: {
        planName: 'Pro Annual',
        amountCents: 19900,
        currency: 'usd',
        frequency: 'year',
        disclosureVersion: '2026-08-05',
        cancellationMethod:
          'Cancel on the Billing page in the app or email support@addictionboards.com.',
      },
    },
  };
}

describe('sendDueRenewalNotices job', () => {
  it('selects active annual renewals in the pinned 15-to-45-day window', async () => {
    const { deps, listAnnualSubscriptionsDue } = createDeps();

    await sendDueRenewalNotices(
      { subscriptionLimit: 50, dispatchLimit: 100 },
      deps,
    );

    expect(listAnnualSubscriptionsDue).toHaveBeenCalledWith({
      renewalAtOrAfter: new Date('2026-08-22T12:00:00.000Z'),
      renewalAtOrBefore: new Date('2026-09-21T12:00:00.000Z'),
      disclosureVersion: '2026-08-05',
      limit: 40,
    });
  });

  it('queues one annual reminder and one annual renewal notice per subscription', async () => {
    const { deps, execute } = createDeps();

    const result = await sendDueRenewalNotices(
      { subscriptionLimit: 50, dispatchLimit: 100 },
      deps,
    );

    const call = execute.mock.calls[0]?.[0];
    expect(call?.limit).toBe(80);
    expect(call?.notices).toEqual([
      expect.objectContaining({
        noticeKind: 'annual_reminder',
        externalSubscriptionId: 'sub_annual_123',
        applicableAt: new Date('2026-09-06T12:00:00.000Z'),
        destination: 'subscriber@example.com',
        changeDescription: null,
      }),
      expect.objectContaining({
        noticeKind: 'renewal_notice',
        externalSubscriptionId: 'sub_annual_123',
        applicableAt: new Date('2026-09-06T12:00:00.000Z'),
        destination: 'subscriber@example.com',
        changeDescription: null,
      }),
    ]);
    expect(call?.notices).toHaveLength(2);
    expect(result).toEqual({
      subscriptions: 1,
      queued: 2,
      queueFailures: 0,
      rejectedNotices: 0,
      selected: 2,
      staleUnknown: 0,
      dispatchFailures: 0,
      expiredSetupOperationsPruned: 3,
      durationMs: 250,
    });
  });

  it('prunes setup Sessions that expired more than 30 days ago', async () => {
    const { deps, pruneExpiredTrialPaymentMethodSetups } = createDeps();

    await sendDueRenewalNotices(
      { subscriptionLimit: 40, dispatchLimit: 80 },
      deps,
    );

    expect(pruneExpiredTrialPaymentMethodSetups).toHaveBeenCalledWith({
      expiredBefore: new Date('2026-07-08T12:00:00.000Z'),
      limit: 100,
    });
  });

  it('does not starve legal notices when abandoned-setup cleanup fails', async () => {
    const { deps, execute, logger, pruneExpiredTrialPaymentMethodSetups } =
      createDeps();
    pruneExpiredTrialPaymentMethodSetups.mockRejectedValueOnce(
      new Error('cleanup unavailable'),
    );

    await expect(
      sendDueRenewalNotices({ subscriptionLimit: 40, dispatchLimit: 80 }, deps),
    ).resolves.toMatchObject({ expiredSetupOperationsPruned: 0 });
    expect(execute).toHaveBeenCalledOnce();
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({ error: expect.any(Object) }),
      }),
    ]);
  });

  it('clamps unsafe limits before querying or dispatching', async () => {
    const { deps, listAnnualSubscriptionsDue, execute } = createDeps();

    await sendDueRenewalNotices(
      { subscriptionLimit: 50_000, dispatchLimit: 50_000 },
      deps,
    );

    expect(listAnnualSubscriptionsDue).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 40 }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 80 }),
    );
  });

  it.each([
    {
      label: 'NaN subscription limit',
      subscriptionLimit: Number.NaN,
      dispatchLimit: 100,
      expectedSubscriptionLimit: 40,
      expectedDispatchLimit: 80,
    },
    {
      label: 'fractional dispatch limit',
      subscriptionLimit: 50,
      dispatchLimit: 1.5,
      expectedSubscriptionLimit: 40,
      expectedDispatchLimit: 80,
    },
    {
      label: 'zero limits',
      subscriptionLimit: 0,
      dispatchLimit: 0,
      expectedSubscriptionLimit: 1,
      expectedDispatchLimit: 1,
    },
  ])('normalizes $label independently', async ({
    subscriptionLimit,
    dispatchLimit,
    expectedSubscriptionLimit,
    expectedDispatchLimit,
  }) => {
    const { deps, listAnnualSubscriptionsDue, execute } = createDeps();

    await sendDueRenewalNotices({ subscriptionLimit, dispatchLimit }, deps);

    expect(listAnnualSubscriptionsDue).toHaveBeenCalledWith(
      expect.objectContaining({ limit: expectedSubscriptionLimit }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ limit: expectedDispatchLimit }),
    );
  });

  it('bounds worst-case provider wait below the cron runtime budget', () => {
    const providerWaitMs =
      Math.ceil(
        SEND_RENEWAL_NOTICES_MAX_DISPATCH_LIMIT /
          RENEWAL_NOTICE_DISPATCH_CONCURRENCY,
      ) * RESEND_PROVIDER_TIMEOUT_MS;
    const runtimeBudgetMs =
      SEND_RENEWAL_NOTICES_MAX_DURATION_SECONDS *
      1_000 *
      SEND_RENEWAL_NOTICES_PROVIDER_BUDGET_RATIO;

    expect(providerWaitMs).toBeLessThanOrEqual(runtimeBudgetMs);
    expect(SEND_RENEWAL_NOTICES_MAX_LIMIT * 2).toBeLessThanOrEqual(
      SEND_RENEWAL_NOTICES_MAX_DISPATCH_LIMIT,
    );
  });
});
