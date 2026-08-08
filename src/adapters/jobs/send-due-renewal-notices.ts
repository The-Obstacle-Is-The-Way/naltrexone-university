import { and, asc, eq, gte, lte, notExists, or } from 'drizzle-orm';
import {
  renewalNoticeDeliveries,
  stripeSubscriptions,
  users,
} from '@/db/schema';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger } from '@/src/application/ports';
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
const ANNUAL_RENEWAL_NOTICE_EARLIEST_DAYS = 15;
const ANNUAL_RENEWAL_NOTICE_LATEST_DAYS = 45;
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
  pruneExpiredTrialPaymentMethodSetups: (input: {
    expiredBefore: Date;
    limit: number;
  }) => Promise<number>;
  logger: Pick<Logger, 'warn'>;
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
    expiredSetupOperationsPruned,
    ...result,
    durationMs: Math.max(0, deps.monotonicNow() - startedAt),
  };
}
