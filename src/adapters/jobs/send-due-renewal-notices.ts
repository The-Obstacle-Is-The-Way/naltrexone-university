import { and, asc, eq, gt, gte, lte, notExists, or } from 'drizzle-orm';
import {
  renewalNoticeDeliveries,
  stripeSubscriptions,
  users,
} from '@/db/schema';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger } from '@/src/application/ports';
import { RENEWAL_NOTICE_MINIMUM_DAYS } from '@/src/application/shared/renewal-notice-schedule';
import type {
  ScheduledRenewalNotice,
  SendDueRenewalNoticesResult,
  SendDueRenewalNoticesUseCase,
} from '@/src/application/use-cases';
import { DAY_MS } from '@/src/domain/services';

export const SEND_RENEWAL_NOTICES_DEFAULT_SUBSCRIPTION_LIMIT = 40;
export const SEND_RENEWAL_NOTICES_DEFAULT_DISPATCH_LIMIT = 80;
export const SEND_RENEWAL_NOTICES_MAX_LIMIT = 40;
export const SEND_RENEWAL_NOTICES_MAX_DISPATCH_LIMIT = 80;
export const SEND_RENEWAL_NOTICES_MAX_DURATION_SECONDS = 300;
export const SEND_RENEWAL_NOTICES_PROVIDER_BUDGET_RATIO = 0.7;
// DEBT-414 F01: renewals are first selected at 35 days and retried daily down
// to the shared 30-day minimum (RENEWAL_NOTICE_MINIMUM_DAYS); one inside that
// minimum without delivered notices is alerted, and dispatch refuses it (F07).
const ANNUAL_RENEWAL_NOTICE_TARGET_DAYS = 35;
const EXPIRED_SETUP_OPERATION_RETENTION_DAYS = 30;
const EXPIRED_SETUP_OPERATION_PRUNE_LIMIT = 100;

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
    .orderBy(
      asc(stripeSubscriptions.currentPeriodEnd),
      asc(stripeSubscriptions.stripeSubscriptionId),
    )
    .limit(input.limit);
}

export type AnnualRenewalPastNoticeDeadline = {
  externalSubscriptionId: string;
  renewalAt: Date;
};

// The annual-renewal reads the job schedules from and checks deadlines with.
export type AnnualRenewalQueries = {
  listDue: (input: {
    renewalAtOrAfter: Date;
    renewalAtOrBefore: Date;
    disclosureVersion: string;
    limit: number;
  }) => Promise<AnnualSubscriptionDueForNotice[]>;
  listPastNoticeDeadline: (input: {
    renewalAfter: Date;
    renewalAtOrBefore: Date;
    limit: number;
  }) => Promise<AnnualRenewalPastNoticeDeadline[]>;
};

export async function listAnnualRenewalsPastNoticeDeadline(
  input: { renewalAfter: Date; renewalAtOrBefore: Date; limit: number },
  deps: { db: DrizzleDb; annualPriceId: string },
): Promise<AnnualRenewalPastNoticeDeadline[]> {
  const deliveredNotice = (noticeKind: 'annual_reminder' | 'renewal_notice') =>
    deps.db
      .select({ id: renewalNoticeDeliveries.id })
      .from(renewalNoticeDeliveries)
      .where(
        and(
          eq(renewalNoticeDeliveries.noticeKind, noticeKind),
          eq(
            renewalNoticeDeliveries.stripeSubscriptionId,
            stripeSubscriptions.stripeSubscriptionId,
          ),
          eq(
            renewalNoticeDeliveries.applicableAt,
            stripeSubscriptions.currentPeriodEnd,
          ),
          eq(renewalNoticeDeliveries.status, 'delivered'),
        ),
      );

  return deps.db
    .select({
      externalSubscriptionId: stripeSubscriptions.stripeSubscriptionId,
      renewalAt: stripeSubscriptions.currentPeriodEnd,
    })
    .from(stripeSubscriptions)
    .where(
      and(
        eq(stripeSubscriptions.status, 'active'),
        eq(stripeSubscriptions.priceId, deps.annualPriceId),
        eq(stripeSubscriptions.cancelAtPeriodEnd, false),
        gt(stripeSubscriptions.currentPeriodEnd, input.renewalAfter),
        lte(stripeSubscriptions.currentPeriodEnd, input.renewalAtOrBefore),
        or(
          notExists(deliveredNotice('annual_reminder')),
          notExists(deliveredNotice('renewal_notice')),
        ),
      ),
    )
    .orderBy(
      asc(stripeSubscriptions.currentPeriodEnd),
      asc(stripeSubscriptions.stripeSubscriptionId),
    )
    .limit(input.limit);
}

export type SendDueRenewalNoticesJobDeps = {
  now: () => Date;
  monotonicNow: () => number;
  annualRenewals: AnnualRenewalQueries;
  sendDueRenewalNotices: Pick<SendDueRenewalNoticesUseCase, 'execute'>;
  pruneExpiredTrialPaymentMethodSetups: (input: {
    expiredBefore: Date;
    limit: number;
  }) => Promise<number>;
  logger: Pick<Logger, 'warn' | 'error'>;
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
  expiredSetupOperationsPruned: number;
  durationMs: number;
};

function safeLimit(value: number, fallback: number, maximum: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(maximum, Math.max(1, value));
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
    SEND_RENEWAL_NOTICES_MAX_LIMIT,
  );
  const dispatchLimit = safeLimit(
    input.dispatchLimit,
    SEND_RENEWAL_NOTICES_DEFAULT_DISPATCH_LIMIT,
    SEND_RENEWAL_NOTICES_MAX_DISPATCH_LIMIT,
  );
  let expiredSetupOperationsPruned = 0;
  try {
    expiredSetupOperationsPruned =
      await deps.pruneExpiredTrialPaymentMethodSetups({
        expiredBefore: new Date(
          observedAt.getTime() -
            EXPIRED_SETUP_OPERATION_RETENTION_DAYS * DAY_MS,
        ),
        limit: EXPIRED_SETUP_OPERATION_PRUNE_LIMIT,
      });
  } catch (error) {
    deps.logger.warn(
      { error: projectSafeErrorDiagnostics(error) },
      'Expired trial setup-operation pruning failed',
    );
  }
  const noticeDeadline = new Date(
    observedAt.getTime() + RENEWAL_NOTICE_MINIMUM_DAYS * DAY_MS,
  );
  const subscriptions = await deps.annualRenewals.listDue({
    renewalAtOrAfter: noticeDeadline,
    renewalAtOrBefore: new Date(
      observedAt.getTime() + ANNUAL_RENEWAL_NOTICE_TARGET_DAYS * DAY_MS,
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
  await alertOnMissedNoticeDeadlines(
    { renewalAfter: observedAt, renewalAtOrBefore: noticeDeadline },
    subscriptionLimit,
    deps,
  );
  return {
    subscriptions: subscriptions.length,
    expiredSetupOperationsPruned,
    ...result,
    durationMs: Math.max(0, deps.monotonicNow() - startedAt),
  };
}

// Runs after dispatch, so a notice delivered in this run is not flagged.
async function alertOnMissedNoticeDeadlines(
  window: { renewalAfter: Date; renewalAtOrBefore: Date },
  limit: number,
  deps: SendDueRenewalNoticesJobDeps,
): Promise<void> {
  let missed: AnnualRenewalPastNoticeDeadline[];
  try {
    missed = await deps.annualRenewals.listPastNoticeDeadline({
      ...window,
      limit,
    });
  } catch (error) {
    deps.logger.error(
      { error: projectSafeErrorDiagnostics(error) },
      'Annual renewal notice deadline check failed',
    );
    return;
  }
  if (missed.length === 0) return;
  deps.logger.error(
    {
      count: missed.length,
      externalSubscriptionIds: missed.map(
        (renewal) => renewal.externalSubscriptionId,
      ),
    },
    'Annual renewal notice deadline missed',
  );
}
