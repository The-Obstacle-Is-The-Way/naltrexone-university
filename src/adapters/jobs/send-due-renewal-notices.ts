import { and, asc, eq, gte, lte, notExists, or } from 'drizzle-orm';
import {
  renewalNoticeDeliveries,
  stripeSubscriptions,
  users,
} from '@/db/schema';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import type {
  ScheduledRenewalNotice,
  SendDueRenewalNoticesResult,
  SendDueRenewalNoticesUseCase,
} from '@/src/application/use-cases';
import { DAY_MS } from '@/src/domain/services';

export const SEND_RENEWAL_NOTICES_DEFAULT_SUBSCRIPTION_LIMIT = 50;
export const SEND_RENEWAL_NOTICES_DEFAULT_DISPATCH_LIMIT = 100;
export const SEND_RENEWAL_NOTICES_MAX_LIMIT = 500;
const ANNUAL_RENEWAL_NOTICE_EARLIEST_DAYS = 15;
const ANNUAL_RENEWAL_NOTICE_LATEST_DAYS = 45;

export type AnnualSubscriptionDueForNotice = {
  externalSubscriptionId: string;
  renewalAt: Date;
  destination: string;
};

export async function listAnnualSubscriptionsDue(
  input: {
    renewalAtOrAfter: Date;
    renewalAtOrBefore: Date;
    disclosureVersion: string;
    limit: number;
  },
  deps: { db: DrizzleDb; annualPriceId: string },
): Promise<AnnualSubscriptionDueForNotice[]> {
  return deps.db
    .select({
      externalSubscriptionId: stripeSubscriptions.stripeSubscriptionId,
      renewalAt: stripeSubscriptions.currentPeriodEnd,
      destination: users.email,
    })
    .from(stripeSubscriptions)
    .innerJoin(users, eq(users.id, stripeSubscriptions.userId))
    .where(
      and(
        eq(stripeSubscriptions.status, 'active'),
        eq(stripeSubscriptions.priceId, deps.annualPriceId),
        eq(stripeSubscriptions.cancelAtPeriodEnd, false),
        gte(stripeSubscriptions.currentPeriodEnd, input.renewalAtOrAfter),
        lte(stripeSubscriptions.currentPeriodEnd, input.renewalAtOrBefore),
        or(
          notExists(
            deps.db
              .select({ id: renewalNoticeDeliveries.id })
              .from(renewalNoticeDeliveries)
              .where(
                and(
                  eq(renewalNoticeDeliveries.noticeKind, 'annual_reminder'),
                  eq(
                    renewalNoticeDeliveries.stripeSubscriptionId,
                    stripeSubscriptions.stripeSubscriptionId,
                  ),
                  eq(
                    renewalNoticeDeliveries.applicableAt,
                    stripeSubscriptions.currentPeriodEnd,
                  ),
                  eq(
                    renewalNoticeDeliveries.disclosureVersion,
                    input.disclosureVersion,
                  ),
                  eq(renewalNoticeDeliveries.destination, users.email),
                ),
              ),
          ),
          notExists(
            deps.db
              .select({ id: renewalNoticeDeliveries.id })
              .from(renewalNoticeDeliveries)
              .where(
                and(
                  eq(renewalNoticeDeliveries.noticeKind, 'renewal_notice'),
                  eq(
                    renewalNoticeDeliveries.stripeSubscriptionId,
                    stripeSubscriptions.stripeSubscriptionId,
                  ),
                  eq(
                    renewalNoticeDeliveries.applicableAt,
                    stripeSubscriptions.currentPeriodEnd,
                  ),
                  eq(
                    renewalNoticeDeliveries.disclosureVersion,
                    input.disclosureVersion,
                  ),
                  eq(renewalNoticeDeliveries.destination, users.email),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(asc(stripeSubscriptions.currentPeriodEnd))
    .limit(input.limit);
}

export type SendDueRenewalNoticesJobDeps = {
  now: () => Date;
  monotonicNow: () => number;
  listAnnualSubscriptionsDue: (input: {
    renewalAtOrAfter: Date;
    renewalAtOrBefore: Date;
    disclosureVersion: string;
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
  durationMs: number;
};

function safeLimit(value: number, fallback: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(SEND_RENEWAL_NOTICES_MAX_LIMIT, Math.max(1, value));
}

export async function sendDueRenewalNotices(
  input: { subscriptionLimit: number; dispatchLimit: number },
  deps: SendDueRenewalNoticesJobDeps,
): Promise<SendDueRenewalNoticesJobResult> {
  const startedAt = deps.monotonicNow();
  const observedAt = deps.now();
  const subscriptionLimit = safeLimit(
    input.subscriptionLimit,
    SEND_RENEWAL_NOTICES_DEFAULT_SUBSCRIPTION_LIMIT,
  );
  const dispatchLimit = safeLimit(
    input.dispatchLimit,
    SEND_RENEWAL_NOTICES_DEFAULT_DISPATCH_LIMIT,
  );
  const subscriptions = await deps.listAnnualSubscriptionsDue({
    renewalAtOrAfter: new Date(
      observedAt.getTime() + ANNUAL_RENEWAL_NOTICE_EARLIEST_DAYS * DAY_MS,
    ),
    renewalAtOrBefore: new Date(
      observedAt.getTime() + ANNUAL_RENEWAL_NOTICE_LATEST_DAYS * DAY_MS,
    ),
    disclosureVersion: deps.annualPlan.disclosureVersion,
    limit: subscriptionLimit,
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
  const result = await deps.sendDueRenewalNotices.execute({
    notices,
    limit: dispatchLimit,
  });
  return {
    subscriptions: subscriptions.length,
    ...result,
    durationMs: Math.max(0, deps.monotonicNow() - startedAt),
  };
}
