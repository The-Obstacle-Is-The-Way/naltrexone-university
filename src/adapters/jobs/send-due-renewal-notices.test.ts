import { describe, expect, it, vi } from 'vitest';
import type {
  ScheduledRenewalNotice,
  SendDueRenewalNoticesResult,
} from '@/src/application/use-cases';
import {
  type SendDueRenewalNoticesJobDeps,
  sendDueRenewalNotices,
} from './send-due-renewal-notices';

const now = new Date('2026-08-07T12:00:00.000Z');

function createDeps(): {
  deps: SendDueRenewalNoticesJobDeps;
  listAnnualSubscriptionsDue: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
} {
  const listAnnualSubscriptionsDue = vi.fn(async () => [
    {
      externalSubscriptionId: 'sub_annual_123',
      renewalAt: new Date('2026-09-06T12:00:00.000Z'),
      destination: 'subscriber@example.com',
    },
  ]);
  const execute = vi.fn(
    async (): Promise<SendDueRenewalNoticesResult> => ({
      queued: 2,
      selected: 2,
      staleUnknown: 0,
    }),
  );
  return {
    listAnnualSubscriptionsDue,
    execute,
    deps: {
      now: () => now,
      listAnnualSubscriptionsDue,
      sendDueRenewalNotices: { execute },
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

    await sendDueRenewalNotices({ limit: 100 }, deps);

    expect(listAnnualSubscriptionsDue).toHaveBeenCalledWith({
      renewalAtOrAfter: new Date('2026-08-22T12:00:00.000Z'),
      renewalAtOrBefore: new Date('2026-09-21T12:00:00.000Z'),
      disclosureVersion: '2026-08-05',
      limit: 100,
    });
  });

  it('queues one annual reminder and one annual renewal notice per subscription', async () => {
    const { deps, execute } = createDeps();

    const result = await sendDueRenewalNotices({ limit: 100 }, deps);

    const call = execute.mock.calls[0]?.[0] as
      | { notices: ScheduledRenewalNotice[]; limit: number }
      | undefined;
    expect(call?.limit).toBe(100);
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
      selected: 2,
      staleUnknown: 0,
    });
  });

  it('clamps unsafe limits before querying or dispatching', async () => {
    const { deps, listAnnualSubscriptionsDue, execute } = createDeps();

    await sendDueRenewalNotices({ limit: 50_000 }, deps);

    expect(listAnnualSubscriptionsDue).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 }),
    );
  });
});
