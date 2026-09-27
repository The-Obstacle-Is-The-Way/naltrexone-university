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

type AnnualRenewals = SendDueRenewalNoticesJobDeps['annualRenewals'];

function createDeps(): {
  deps: SendDueRenewalNoticesJobDeps;
  listDue: ReturnType<typeof vi.fn<AnnualRenewals['listDue']>>;
  listPastNoticeDeadline: ReturnType<
    typeof vi.fn<AnnualRenewals['listPastNoticeDeadline']>
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
  const listDue = vi.fn<AnnualRenewals['listDue']>(async () => [
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
  const listPastNoticeDeadline = vi.fn<
    AnnualRenewals['listPastNoticeDeadline']
  >(async () => []);
  const pruneExpiredTrialPaymentMethodSetups = vi.fn(async () => 3);
  const logger = new FakeLogger();
  return {
    listDue,
    listPastNoticeDeadline,
    execute,
    pruneExpiredTrialPaymentMethodSetups,
    logger,
    deps: {
      now: () => now,
      monotonicNow,
      annualRenewals: { listDue, listPastNoticeDeadline },
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
  // DEBT-414 F01: the strictest applicable annual-notice window is 30-40 days
  // before the renewal (CO 25-40, VT/IL/DE/GA/HI 30-60, CA/NY 15-45). The job
  // first selects a renewal at 35 days and retries daily down to 30.
  it('selects active annual renewals 30 to 35 days out, targeting 35', async () => {
    const { deps, listDue } = createDeps();

    await sendDueRenewalNotices(
      { subscriptionLimit: 50, dispatchLimit: 100 },
      deps,
    );

    expect(listDue).toHaveBeenCalledWith({
      renewalAtOrAfter: new Date('2026-09-06T12:00:00.000Z'),
      renewalAtOrBefore: new Date('2026-09-11T12:00:00.000Z'),
      disclosureVersion: '2026-08-05',
      limit: 40,
    });
  });

  it('alerts on renewals inside 30 days that lack delivered notices, after dispatching', async () => {
    const { deps, execute, listPastNoticeDeadline, logger } = createDeps();
    listPastNoticeDeadline.mockImplementation(async () => {
      expect(execute).toHaveBeenCalledOnce();
      return [
        {
          externalSubscriptionId: 'sub_late_1',
          renewalAt: new Date('2026-08-27T12:00:00.000Z'),
        },
      ];
    });

    await sendDueRenewalNotices(
      { subscriptionLimit: 50, dispatchLimit: 100 },
      deps,
    );

    expect(listPastNoticeDeadline).toHaveBeenCalledWith({
      renewalAfter: now,
      renewalAtOrBefore: new Date('2026-09-06T12:00:00.000Z'),
      limit: 40,
    });
    expect(logger.errorCalls).toEqual([
      {
        msg: 'Annual renewal notice deadline missed',
        context: { count: 1, externalSubscriptionIds: ['sub_late_1'] },
      },
    ]);
  });

  it('raises no alert when every renewal inside 30 days has delivered notices', async () => {
    const { deps, logger } = createDeps();

    await sendDueRenewalNotices(
      { subscriptionLimit: 50, dispatchLimit: 100 },
      deps,
    );

    expect(logger.errorCalls).toEqual([]);
  });

  it('reports a failed deadline check without failing the run', async () => {
    const { deps, execute, listPastNoticeDeadline, logger } = createDeps();
    listPastNoticeDeadline.mockRejectedValueOnce(new Error('query failed'));

    await expect(
      sendDueRenewalNotices({ subscriptionLimit: 40, dispatchLimit: 80 }, deps),
    ).resolves.toMatchObject({ queued: 2 });
    expect(execute).toHaveBeenCalledOnce();
    expect(logger.errorCalls).toEqual([
      {
        msg: 'Annual renewal notice deadline check failed',
        context: { error: expect.any(Object) },
      },
    ]);
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
    const { deps, listDue, execute } = createDeps();

    await sendDueRenewalNotices(
      { subscriptionLimit: 50_000, dispatchLimit: 50_000 },
      deps,
    );

    expect(listDue).toHaveBeenCalledWith(
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
  ])(
    'normalizes $label independently',
    async ({
      subscriptionLimit,
      dispatchLimit,
      expectedSubscriptionLimit,
      expectedDispatchLimit,
    }) => {
      const { deps, listDue, execute } = createDeps();

      await sendDueRenewalNotices({ subscriptionLimit, dispatchLimit }, deps);

      expect(listDue).toHaveBeenCalledWith(
        expect.objectContaining({ limit: expectedSubscriptionLimit }),
      );
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ limit: expectedDispatchLimit }),
      );
    },
  );

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
