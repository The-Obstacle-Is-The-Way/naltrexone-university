import type {
  ScheduledRenewalNotice,
  SendDueRenewalNoticesResult,
  SendDueRenewalNoticesUseCase,
} from '@/src/application/use-cases';
import { DAY_MS } from '@/src/domain/services';

export const SEND_RENEWAL_NOTICES_DEFAULT_LIMIT = 100;
export const SEND_RENEWAL_NOTICES_MAX_LIMIT = 500;
const ANNUAL_RENEWAL_NOTICE_EARLIEST_DAYS = 15;
const ANNUAL_RENEWAL_NOTICE_LATEST_DAYS = 45;

export type AnnualSubscriptionDueForNotice = {
  externalSubscriptionId: string;
  renewalAt: Date;
  destination: string;
};

export type SendDueRenewalNoticesJobDeps = {
  now: () => Date;
  listAnnualSubscriptionsDue: (input: {
    renewalAtOrAfter: Date;
    renewalAtOrBefore: Date;
    limit: number;
  }) => Promise<AnnualSubscriptionDueForNotice[]>;
  sendDueRenewalNotices: Pick<SendDueRenewalNoticesUseCase, 'execute'>;
  annualPlan: Pick<
    ScheduledRenewalNotice,
    | 'planName'
    | 'amountCents'
    | 'currency'
    | 'frequency'
    | 'disclosureVersion'
    | 'cancellationMethod'
  >;
};

export type SendDueRenewalNoticesJobResult = SendDueRenewalNoticesResult & {
  subscriptions: number;
};

function safeLimit(value: number): number {
  if (!Number.isInteger(value)) return SEND_RENEWAL_NOTICES_DEFAULT_LIMIT;
  return Math.min(SEND_RENEWAL_NOTICES_MAX_LIMIT, Math.max(1, value));
}

export async function sendDueRenewalNotices(
  input: { limit: number },
  deps: SendDueRenewalNoticesJobDeps,
): Promise<SendDueRenewalNoticesJobResult> {
  const observedAt = deps.now();
  const limit = safeLimit(input.limit);
  const subscriptions = await deps.listAnnualSubscriptionsDue({
    renewalAtOrAfter: new Date(
      observedAt.getTime() + ANNUAL_RENEWAL_NOTICE_EARLIEST_DAYS * DAY_MS,
    ),
    renewalAtOrBefore: new Date(
      observedAt.getTime() + ANNUAL_RENEWAL_NOTICE_LATEST_DAYS * DAY_MS,
    ),
    limit,
  });
  const notices = subscriptions.flatMap(
    (subscription): ScheduledRenewalNotice[] =>
      (['annual_reminder', 'renewal_notice'] as const).map((noticeKind) => ({
        noticeKind,
        externalSubscriptionId: subscription.externalSubscriptionId,
        applicableAt: subscription.renewalAt,
        disclosureVersion: deps.annualPlan.disclosureVersion,
        destination: subscription.destination,
        planName: deps.annualPlan.planName,
        amountCents: deps.annualPlan.amountCents,
        currency: deps.annualPlan.currency,
        frequency: deps.annualPlan.frequency,
        cancellationMethod: deps.annualPlan.cancellationMethod,
        changeDescription: null,
      })),
  );
  const result = await deps.sendDueRenewalNotices.execute({ notices, limit });
  return { subscriptions: subscriptions.length, ...result };
}
