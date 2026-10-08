import { describe, expect, it, vi } from 'vitest';
import {
  FakeLogger,
  FakeOperationalAlerts,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
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

// DEBT-505: the alert drill's gate. Held by default, so each test sees only
// the alerts it is about.
const DRILL_HELD = {
  success: false,
  limit: 1,
  remaining: 0,
  retryAfterSeconds: 60,
};

type AnnualRenewals = SendDueRenewalNoticesJobDeps['renewalQueries'];

function createDeps(): {
  deps: SendDueRenewalNoticesJobDeps;
  listDue: ReturnType<typeof vi.fn<AnnualRenewals['listDue']>>;
  listPastNoticeDeadline: ReturnType<
    typeof vi.fn<AnnualRenewals['listPastNoticeDeadline']>
  >;
  listActiveMonthly: ReturnType<
    typeof vi.fn<AnnualRenewals['listActiveMonthly']>
  >;
  listAnniversaryReminders: ReturnType<
    typeof vi.fn<AnnualRenewals['listAnniversaryReminders']>
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
  alerts: FakeOperationalAlerts;
  alertDrillGate: FakeRateLimiter;
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
  const listActiveMonthly = vi.fn<AnnualRenewals['listActiveMonthly']>(
    async () => [],
  );
  const listAnniversaryReminders = vi.fn<
    AnnualRenewals['listAnniversaryReminders']
  >(async () => []);
  const pruneExpiredTrialPaymentMethodSetups = vi.fn(async () => 3);
  const logger = new FakeLogger();
  const alerts = new FakeOperationalAlerts();
  const alertDrillGate = new FakeRateLimiter(
    Array.from({ length: 10 }, () => DRILL_HELD),
  );
  return {
    alerts,
    alertDrillGate,
    listDue,
    listPastNoticeDeadline,
    listActiveMonthly,
    listAnniversaryReminders,
    execute,
    pruneExpiredTrialPaymentMethodSetups,
    logger,
    deps: {
      now: () => now,
      monotonicNow,
      renewalQueries: {
        listDue,
        listPastNoticeDeadline,
        listActiveMonthly,
        listAnniversaryReminders,
      },
      sendDueRenewalNotices: { execute },
      pruneExpiredTrialPaymentMethodSetups,
      logger,
      alerts,
      alertDrillGate,
      annualPlan: {
        planName: 'Pro Annual',
        amountCents: 19900,
        currency: 'usd',
        frequency: 'year',
        disclosureVersion: '2026-08-05',
        cancellationMethod:
          'Cancel on the Billing page in the app or email support@addictionboards.com.',
      },
      monthlyPlan: {
        planName: 'Pro Monthly',
        amountCents: 2900,
        currency: 'usd',
        frequency: 'month',
        disclosureVersion: '2026-09-27',
        cancellationMethod:
          'Cancel on the Billing page in the app or email support@addictionboards.com.',
      },
    },
  };
}

// An anniversary reminder already stored for a monthly subscription.
function reminderRecord(
  externalSubscriptionId: string,
  applicableAt: string,
  status: 'queued' | 'accepted' | 'delivered' | 'terminal_failure',
) {
  return {
    externalSubscriptionId,
    applicableAt: new Date(applicableAt),
    disclosureVersion: '2026-09-27',
    destination: `${externalSubscriptionId}@example.com`,
    status,
  };
}

// A monthly subscription whose service and billing began on `anchor`, so
// its yearly reminder falls before the renewal twelve months later.
function monthlySubscription(
  externalSubscriptionId: string,
  anchor: string | null,
) {
  const at = anchor === null ? null : new Date(anchor);
  return {
    externalSubscriptionId,
    destination: `${externalSubscriptionId}@example.com`,
    startedAt: at,
    billingCycleAnchor: at,
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
    const { deps, execute, listPastNoticeDeadline, logger, alerts } =
      createDeps();
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
    expect(alerts.raised).toEqual([
      { kind: 'renewal_notice_deadline_missed', count: 1 },
    ]);
  });

  it('raises no alert when every renewal inside 30 days has delivered notices', async () => {
    const { deps, logger, alerts } = createDeps();

    await sendDueRenewalNotices(
      { subscriptionLimit: 50, dispatchLimit: 100 },
      deps,
    );

    expect(logger.errorCalls).toEqual([]);
    expect(alerts.raised).toEqual([]);
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
      anniversaries: 0,
      queued: 2,
      queueFailures: 0,
      rejectedNotices: 0,
      selected: 2,
      staleUnknown: 0,
      dispatchFailures: 0,
      expiredSetupOperationsPruned: 3,
      durationMs: 250,
      alertDrill: 'not_due',
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

  // DEBT-414 F02: monthly subscribers get a yearly reminder before the renewal
  // that carries them past each twelve months, in the same 30-35-day window.
  describe('monthly anniversary reminders', () => {
    it('schedules a reminder for each renewal 30 to 35 days out that starts another year', async () => {
      const { deps, execute, listActiveMonthly } = createDeps();
      listActiveMonthly.mockResolvedValueOnce([
        // Renews into its second year on 2026-09-10: 34 days out.
        monthlySubscription('sub_due', '2025-09-10T12:00:00.000Z'),
        // 2026-09-12 is 36 days out: tomorrow's run.
        monthlySubscription('sub_later', '2025-09-12T12:00:00.000Z'),
        // 2026-09-05 is 29 days out: inside the minimum, never scheduled.
        monthlySubscription('sub_late', '2025-09-05T12:00:00.000Z'),
      ]);

      await sendDueRenewalNotices(
        { subscriptionLimit: 50, dispatchLimit: 100 },
        deps,
      );

      const notices = execute.mock.calls[0]?.[0].notices ?? [];
      expect(
        notices.filter(
          (notice) => notice.noticeKind === 'anniversary_reminder',
        ),
      ).toEqual([
        {
          noticeKind: 'anniversary_reminder',
          externalSubscriptionId: 'sub_due',
          applicableAt: new Date('2026-09-10T12:00:00.000Z'),
          disclosureVersion: '2026-09-27',
          destination: 'sub_due@example.com',
          planName: 'Pro Monthly',
          amountCents: 2900,
          currency: 'usd',
          frequency: 'month',
          cancellationMethod:
            'Cancel on the Billing page in the app or email support@addictionboards.com.',
          changeDescription: null,
        },
      ]);
    });

    it('pages through every active monthly subscription', async () => {
      const { deps, listActiveMonthly } = createDeps();
      const page = Array.from({ length: 500 }, (_, index) =>
        monthlySubscription(`sub_${String(index).padStart(3, '0')}`, null),
      );
      listActiveMonthly
        .mockResolvedValueOnce(page)
        .mockResolvedValueOnce([
          monthlySubscription('sub_last', '2025-09-10T12:00:00.000Z'),
        ]);

      await sendDueRenewalNotices(
        { subscriptionLimit: 50, dispatchLimit: 100 },
        deps,
      );

      expect(listActiveMonthly.mock.calls).toEqual([
        [{ afterExternalSubscriptionId: null, limit: 500 }],
        [{ afterExternalSubscriptionId: 'sub_499', limit: 500 }],
      ]);
    });

    // #1169 review: renewals already queued on earlier runs stay in the
    // five-day window; they must not take the slots of renewals entering it.
    it('schedules renewals entering the window ahead of ones already queued', async () => {
      const { deps, execute, listActiveMonthly, listAnniversaryReminders } =
        createDeps();
      const queued = Array.from({ length: 40 }, (_, index) =>
        monthlySubscription(
          `sub_queued_${String(index).padStart(2, '0')}`,
          '2025-09-07T12:00:00.000Z',
        ),
      );
      listActiveMonthly.mockResolvedValueOnce([
        ...queued,
        monthlySubscription('sub_new_b', '2025-09-11T12:00:00.000Z'),
        monthlySubscription('sub_new_a', '2025-09-11T12:00:00.000Z'),
      ]);
      listAnniversaryReminders.mockResolvedValueOnce(
        queued.map((subscription) =>
          reminderRecord(
            subscription.externalSubscriptionId,
            '2026-09-07T12:00:00.000Z',
            'queued',
          ),
        ),
      );

      await sendDueRenewalNotices(
        { subscriptionLimit: 50, dispatchLimit: 100 },
        deps,
      );

      expect(
        (execute.mock.calls[0]?.[0].notices ?? [])
          .filter((notice) => notice.noticeKind === 'anniversary_reminder')
          .map((notice) => notice.externalSubscriptionId),
      ).toEqual(['sub_new_a', 'sub_new_b']);
    });

    it('stops reading monthly subscriptions when a page makes no progress', async () => {
      const { deps, execute, listActiveMonthly, logger } = createDeps();
      const page = Array.from({ length: 500 }, () =>
        monthlySubscription('sub_same', null),
      );
      listActiveMonthly.mockResolvedValue(page);

      await sendDueRenewalNotices(
        { subscriptionLimit: 50, dispatchLimit: 100 },
        deps,
      );

      expect(listActiveMonthly).toHaveBeenCalledTimes(2);
      expect(execute.mock.calls[0]?.[0].notices).toHaveLength(2);
      expect(logger.errorCalls).toEqual([
        {
          msg: 'Monthly anniversary selection failed',
          context: { error: expect.any(Object) },
        },
      ]);
    });

    it('reports a failed anniversary deadline check without failing the run', async () => {
      const { deps, listActiveMonthly, listAnniversaryReminders, logger } =
        createDeps();
      listActiveMonthly.mockResolvedValueOnce([
        monthlySubscription('sub_late', '2025-09-05T12:00:00.000Z'),
      ]);
      listAnniversaryReminders.mockRejectedValueOnce(new Error('query failed'));

      await expect(
        sendDueRenewalNotices(
          { subscriptionLimit: 50, dispatchLimit: 100 },
          deps,
        ),
      ).resolves.toMatchObject({ queued: 2 });
      expect(logger.errorCalls).toEqual([
        {
          msg: 'Monthly anniversary reminder deadline check failed',
          context: { error: expect.any(Object) },
        },
      ]);
    });

    it('still sends the annual notices when the monthly read fails', async () => {
      const { deps, execute, listActiveMonthly, logger } = createDeps();
      listActiveMonthly.mockRejectedValueOnce(new Error('query failed'));

      await sendDueRenewalNotices(
        { subscriptionLimit: 50, dispatchLimit: 100 },
        deps,
      );

      expect(execute.mock.calls[0]?.[0].notices).toHaveLength(2);
      expect(logger.errorCalls).toEqual([
        {
          msg: 'Monthly anniversary selection failed',
          context: { error: expect.any(Object) },
        },
      ]);
    });

    it('alerts on monthly subscriptions whose service start or anchor is unknown', async () => {
      const { deps, listActiveMonthly, logger } = createDeps();
      listActiveMonthly.mockResolvedValueOnce([
        monthlySubscription('sub_unknown', null),
      ]);

      await sendDueRenewalNotices(
        { subscriptionLimit: 50, dispatchLimit: 100 },
        deps,
      );

      expect(logger.errorCalls).toContainEqual({
        msg: 'Monthly subscription anniversary unknown',
        context: { count: 1, externalSubscriptionIds: ['sub_unknown'] },
      });
    });

    it('alerts on an anniversary renewal inside 30 days without a sent reminder, after dispatching', async () => {
      const {
        deps,
        execute,
        listActiveMonthly,
        listAnniversaryReminders,
        logger,
        alerts,
      } = createDeps();
      listActiveMonthly.mockResolvedValueOnce([
        monthlySubscription('sub_late', '2025-09-05T12:00:00.000Z'),
        monthlySubscription('sub_sent', '2025-08-20T12:00:00.000Z'),
      ]);
      listAnniversaryReminders.mockImplementation(async () => {
        expect(execute).toHaveBeenCalledOnce();
        return [
          reminderRecord('sub_sent', '2026-08-20T12:00:00.000Z', 'accepted'),
          // A reminder sent for an earlier year does not cover this one.
          reminderRecord('sub_late', '2025-09-05T12:00:00.000Z', 'delivered'),
          // Nor does one that was queued but never sent.
          reminderRecord('sub_late', '2026-09-05T12:00:00.000Z', 'queued'),
        ];
      });

      await sendDueRenewalNotices(
        { subscriptionLimit: 50, dispatchLimit: 100 },
        deps,
      );

      expect(listAnniversaryReminders).toHaveBeenCalledWith({
        externalSubscriptionIds: ['sub_late', 'sub_sent'],
      });
      expect(logger.errorCalls).toEqual([
        {
          msg: 'Monthly anniversary reminder deadline missed',
          context: { count: 1, externalSubscriptionIds: ['sub_late'] },
        },
      ]);
      expect(alerts.raised).toEqual([
        { kind: 'anniversary_reminder_deadline_missed', count: 1 },
      ]);
    });
  });
});

// DEBT-505: the drill runs in this job, the one that raises the legal
// deadline alerts, so its email also shows the job runs and can raise them.
describe('the operational alert drill', () => {
  it('raises the drill first when its window is open, and reports it', async () => {
    const { deps, alerts } = createDeps();
    deps.alertDrillGate = new FakeRateLimiter();

    const result = await sendDueRenewalNotices(
      { subscriptionLimit: 10, dispatchLimit: 10 },
      deps,
    );

    expect(result.alertDrill).toBe('raised');
    expect(alerts.raised[0]).toEqual({
      kind: 'operational_alert_drill',
      count: 1,
    });
  });

  it('still runs the notices when the drill gate fails', async () => {
    const { deps, alerts, execute } = createDeps();
    deps.alertDrillGate = new FakeRateLimiter(
      new Error('database unavailable'),
    );

    const result = await sendDueRenewalNotices(
      { subscriptionLimit: 10, dispatchLimit: 10 },
      deps,
    );

    expect(result.alertDrill).toBe('gate_unavailable');
    expect(alerts.raised).not.toContainEqual(
      expect.objectContaining({ kind: 'operational_alert_drill' }),
    );
    expect(execute).toHaveBeenCalled();
  });
});
