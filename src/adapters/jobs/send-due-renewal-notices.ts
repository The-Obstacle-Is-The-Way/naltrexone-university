import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  lte,
  notExists,
  or,
} from 'drizzle-orm';
import {
  renewalNoticeDeliveries,
  stripeSubscriptions,
  users,
} from '@/db/schema';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger, OperationalAlerts } from '@/src/application/ports';
import { RENEWAL_NOTICE_MINIMUM_DAYS } from '@/src/application/shared/renewal-notice-schedule';
import type {
  ScheduledRenewalNotice,
  SendDueRenewalNoticesResult,
  SendDueRenewalNoticesUseCase,
} from '@/src/application/use-cases';
import type { RenewalNoticeDeliveryStatus } from '@/src/domain/entities';
import { DAY_MS, nextAnniversaryRenewalAt } from '@/src/domain/services';
import type { CronMonitor } from '../shared/cron-monitor';
import {
  type OperationalAlertDrillCycles,
  type OperationalAlertDrillOutcome,
  raiseOperationalAlertDrillIfDue,
} from './operational-alert-drill';
import {
  checkScheduledChecksRunning,
  type ScheduledChecksOutcome,
  type ScheduledWorkflows,
} from './scheduled-checks';

export const SEND_RENEWAL_NOTICES_DEFAULT_SUBSCRIPTION_LIMIT = 40;
export const SEND_RENEWAL_NOTICES_DEFAULT_DISPATCH_LIMIT = 80;
export const SEND_RENEWAL_NOTICES_MAX_LIMIT = 40;
export const SEND_RENEWAL_NOTICES_MAX_DISPATCH_LIMIT = 80;
export const SEND_RENEWAL_NOTICES_MAX_DURATION_SECONDS = 300;
export const SEND_RENEWAL_NOTICES_PROVIDER_BUDGET_RATIO = 0.7;
// DEBT-505: the job's Sentry cron monitor. Vercel's Hobby plan starts a daily
// cron at any time within its hour, so a run counts as missed only after 90
// minutes; one still running after six counts as timed out, since the
// function stops at five.
export const SEND_RENEWAL_NOTICES_MONITOR: CronMonitor = {
  slug: 'send-renewal-notices',
  schedule: '0 9 * * *',
  checkinMarginMinutes: 90,
  maxRuntimeMinutes: 6,
};
// DEBT-414 F01: renewals are first selected at 35 days and retried daily down
// to the shared 30-day minimum (RENEWAL_NOTICE_MINIMUM_DAYS); one inside that
// minimum without a sent notice is alerted, and dispatch refuses it (F07).
const ANNUAL_RENEWAL_NOTICE_TARGET_DAYS = 35;
// DEBT-414 F02: every active monthly subscription is read in pages of this
// size, because its yearly renewal is computed in code, not in SQL.
const MONTHLY_SUBSCRIPTION_PAGE_SIZE = 500;
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

export type ActiveMonthlySubscription = {
  externalSubscriptionId: string;
  destination: string;
  startedAt: Date | null;
  billingCycleAnchor: Date | null;
};

// An anniversary reminder already stored, in any status.
export type AnniversaryReminderRecord = {
  externalSubscriptionId: string;
  applicableAt: Date;
  disclosureVersion: string;
  destination: string;
  status: RenewalNoticeDeliveryStatus;
};

const SENT_STATUSES: ReadonlySet<RenewalNoticeDeliveryStatus> = new Set([
  'accepted',
  'delivered',
]);

// The renewal reads the job schedules from and checks deadlines with.
export type RenewalNoticeQueries = {
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
  listActiveMonthly: (input: {
    afterExternalSubscriptionId: string | null;
    limit: number;
  }) => Promise<ActiveMonthlySubscription[]>;
  listAnniversaryReminders: (input: {
    externalSubscriptionIds: readonly string[];
  }) => Promise<AnniversaryReminderRecord[]>;
};

// DEBT-414 F02: active, renewing monthly subscriptions in id order, with the
// facts that locate each one's yearly reminder.
export async function listActiveMonthlySubscriptions(
  input: { afterExternalSubscriptionId: string | null; limit: number },
  deps: { db: DrizzleDb; monthlyPriceId: string },
): Promise<ActiveMonthlySubscription[]> {
  return deps.db
    .select({
      externalSubscriptionId: stripeSubscriptions.stripeSubscriptionId,
      destination: users.email,
      startedAt: stripeSubscriptions.startedAt,
      billingCycleAnchor: stripeSubscriptions.billingCycleAnchor,
    })
    .from(stripeSubscriptions)
    .innerJoin(users, eq(users.id, stripeSubscriptions.userId))
    .where(
      and(
        eq(stripeSubscriptions.status, 'active'),
        eq(stripeSubscriptions.priceId, deps.monthlyPriceId),
        eq(stripeSubscriptions.cancelAtPeriodEnd, false),
        input.afterExternalSubscriptionId === null
          ? undefined
          : gt(
              stripeSubscriptions.stripeSubscriptionId,
              input.afterExternalSubscriptionId,
            ),
      ),
    )
    .orderBy(asc(stripeSubscriptions.stripeSubscriptionId))
    .limit(input.limit);
}

// Every stored anniversary reminder for the given subscriptions, any year
// and any status: scheduling skips renewals that already have one, and the
// deadline check counts only accepted or delivered ones.
export async function listAnniversaryReminders(
  input: { externalSubscriptionIds: readonly string[] },
  deps: { db: DrizzleDb },
): Promise<AnniversaryReminderRecord[]> {
  if (input.externalSubscriptionIds.length === 0) return [];
  const rows = await deps.db
    .select({
      externalSubscriptionId: renewalNoticeDeliveries.stripeSubscriptionId,
      applicableAt: renewalNoticeDeliveries.applicableAt,
      disclosureVersion: renewalNoticeDeliveries.disclosureVersion,
      destination: renewalNoticeDeliveries.destination,
      status: renewalNoticeDeliveries.status,
    })
    .from(renewalNoticeDeliveries)
    .where(
      and(
        eq(renewalNoticeDeliveries.noticeKind, 'anniversary_reminder'),
        inArray(renewalNoticeDeliveries.stripeSubscriptionId, [
          ...input.externalSubscriptionIds,
        ]),
      ),
    );
  // The key-shape check requires both for every scheduled kind.
  return rows.filter(isKeyedReminder);
}

function isKeyedReminder(row: {
  externalSubscriptionId: string | null;
  applicableAt: Date | null;
  disclosureVersion: string;
  destination: string;
  status: RenewalNoticeDeliveryStatus;
}): row is AnniversaryReminderRecord {
  return row.externalSubscriptionId !== null && row.applicableAt !== null;
}

// Unlike listAnnualSubscriptionsDue, a sent notice counts whatever its
// destination: dispatch refuses a notice whose destination is no longer the
// account email (F07), so a sent one went to the address of record.
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
          // Provider acceptance, or later delivery evidence, counts as sent.
          inArray(renewalNoticeDeliveries.status, ['accepted', 'delivered']),
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
  renewalQueries: RenewalNoticeQueries;
  sendDueRenewalNotices: Pick<SendDueRenewalNoticesUseCase, 'execute'>;
  pruneExpiredTrialPaymentMethodSetups: (input: {
    expiredBefore: Date;
    limit: number;
  }) => Promise<number>;
  logger: Pick<Logger, 'warn' | 'error'>;
  alerts: OperationalAlerts;
  /** The alert drill's once-per-cycle claims. */
  alertDrillCycles: OperationalAlertDrillCycles;
  /** The repository's GitHub workflows, the alert watcher among them. */
  scheduledWorkflows: ScheduledWorkflows;
  annualPlan: PlanNoticeTerms;
  monthlyPlan: PlanNoticeTerms;
};

type PlanNoticeTerms = Pick<
  ScheduledRenewalNotice,
  | 'planName'
  | 'amountCents'
  | 'currency'
  | 'frequency'
  | 'disclosureVersion'
  | 'cancellationMethod'
>;

export type SendDueRenewalNoticesJobResult = SendDueRenewalNoticesResult & {
  subscriptions: number;
  anniversaries: number;
  expiredSetupOperationsPruned: number;
  durationMs: number;
  alertDrill: OperationalAlertDrillOutcome;
  scheduledChecks: ScheduledChecksOutcome;
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
  // DEBT-505: first, so the drill and the scheduled-checks check run whatever
  // the notices do.
  const alertDrill = await raiseOperationalAlertDrillIfDue({
    now: deps.now,
    cycles: deps.alertDrillCycles,
    alerts: deps.alerts,
    logger: deps.logger,
  });
  const scheduledChecks = await checkScheduledChecksRunning({
    now: deps.now,
    workflows: deps.scheduledWorkflows,
    alerts: deps.alerts,
    logger: deps.logger,
  });
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
  const renewalNoticeWindowEnd = new Date(
    observedAt.getTime() + ANNUAL_RENEWAL_NOTICE_TARGET_DAYS * DAY_MS,
  );
  const subscriptions = await deps.renewalQueries.listDue({
    renewalAtOrAfter: noticeDeadline,
    renewalAtOrBefore: renewalNoticeWindowEnd,
    disclosureVersion: deps.annualPlan.disclosureVersion,
    limit: subscriptionLimit,
  });
  const annualNotices = subscriptions.flatMap(
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
  const monthly = await readActiveMonthlySubscriptions(deps);
  const anniversaryNotices = await scheduleAnniversaryReminders(
    monthly ?? [],
    { atOrAfter: noticeDeadline, atOrBefore: renewalNoticeWindowEnd },
    subscriptionLimit,
    deps,
  );
  const result = await deps.sendDueRenewalNotices.execute({
    notices: [...annualNotices, ...anniversaryNotices],
    limit: dispatchLimit,
  });
  await alertOnMissedNoticeDeadlines(
    { renewalAfter: observedAt, renewalAtOrBefore: noticeDeadline },
    subscriptionLimit,
    deps,
  );
  if (monthly !== null) {
    await alertOnMissedAnniversaryReminders(
      monthly,
      { renewalAfter: observedAt, renewalAtOrBefore: noticeDeadline },
      deps,
    );
  }
  return {
    subscriptions: subscriptions.length,
    anniversaries: anniversaryNotices.length,
    expiredSetupOperationsPruned,
    ...result,
    durationMs: Math.max(0, deps.monotonicNow() - startedAt),
    alertDrill,
    scheduledChecks,
  };
}

// Runs after dispatch, so a notice sent in this run is not flagged.
async function alertOnMissedNoticeDeadlines(
  window: { renewalAfter: Date; renewalAtOrBefore: Date },
  limit: number,
  deps: SendDueRenewalNoticesJobDeps,
): Promise<void> {
  let missed: AnnualRenewalPastNoticeDeadline[];
  try {
    missed = await deps.renewalQueries.listPastNoticeDeadline({
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
  await deps.alerts.raise({
    kind: 'renewal_notice_deadline_missed',
    count: missed.length,
  });
}

type KnownAnniversary = {
  subscription: ActiveMonthlySubscription;
  startedAt: Date;
  billingCycleAnchor: Date;
};

function knownAnniversaries(
  monthly: readonly ActiveMonthlySubscription[],
): KnownAnniversary[] {
  return monthly.flatMap((subscription) =>
    subscription.startedAt !== null && subscription.billingCycleAnchor !== null
      ? [
          {
            subscription,
            startedAt: subscription.startedAt,
            billingCycleAnchor: subscription.billingCycleAnchor,
          },
        ]
      : [],
  );
}

// DEBT-414 F02: every active monthly subscription, read in id-ordered pages.
// A failed read is logged and skips monthly reminders for this run without
// holding back the annual notices; a subscription whose service start or
// billing anchor is still unknown is alerted, never silently skipped.
async function readActiveMonthlySubscriptions(
  deps: SendDueRenewalNoticesJobDeps,
): Promise<ActiveMonthlySubscription[] | null> {
  const monthly: ActiveMonthlySubscription[] = [];
  let after: string | null = null;
  try {
    for (;;) {
      const page = await deps.renewalQueries.listActiveMonthly({
        afterExternalSubscriptionId: after,
        limit: MONTHLY_SUBSCRIPTION_PAGE_SIZE,
      });
      monthly.push(...page);
      const last = page.at(-1);
      if (page.length < MONTHLY_SUBSCRIPTION_PAGE_SIZE || last === undefined) {
        break;
      }
      if (last.externalSubscriptionId === after) {
        throw new Error('Monthly subscription paging made no progress');
      }
      after = last.externalSubscriptionId;
    }
  } catch (error) {
    deps.logger.error(
      { error: projectSafeErrorDiagnostics(error) },
      'Monthly anniversary selection failed',
    );
    return null;
  }
  const unknown = monthly.filter(
    (subscription) =>
      subscription.startedAt === null ||
      subscription.billingCycleAnchor === null,
  );
  if (unknown.length > 0) {
    deps.logger.error(
      {
        count: unknown.length,
        externalSubscriptionIds: unknown.map(
          (subscription) => subscription.externalSubscriptionId,
        ),
      },
      'Monthly subscription anniversary unknown',
    );
  }
  return monthly;
}

function reminderKey(
  externalSubscriptionId: string,
  applicableAt: Date,
  destination?: string,
): string {
  return `${externalSubscriptionId}|${applicableAt.getTime()}|${destination ?? ''}`;
}

// The anniversary renewals inside the notice window that have no reminder
// yet, earliest first, up to the limit. Like the annual query, a renewal with
// a stored reminder for this version and destination is skipped before the
// limit applies, so reminders queued on earlier runs cannot take the slots of
// renewals entering the window (#1169 review).
async function scheduleAnniversaryReminders(
  monthly: readonly ActiveMonthlySubscription[],
  window: { atOrAfter: Date; atOrBefore: Date },
  limit: number,
  deps: SendDueRenewalNoticesJobDeps,
): Promise<ScheduledRenewalNotice[]> {
  const plan = deps.monthlyPlan;
  const inWindow = knownAnniversaries(monthly)
    .map((known) => ({
      subscription: known.subscription,
      renewalAt: nextAnniversaryRenewalAt({
        startedAt: known.startedAt,
        billingCycleAnchor: known.billingCycleAnchor,
        notBefore: window.atOrAfter,
      }),
    }))
    .filter(({ renewalAt }) => renewalAt <= window.atOrBefore);
  if (inWindow.length === 0) return [];
  let stored: AnniversaryReminderRecord[];
  try {
    stored = await deps.renewalQueries.listAnniversaryReminders({
      externalSubscriptionIds: inWindow.map(
        ({ subscription }) => subscription.externalSubscriptionId,
      ),
    });
  } catch (error) {
    deps.logger.error(
      { error: projectSafeErrorDiagnostics(error) },
      'Monthly anniversary selection failed',
    );
    return [];
  }
  const scheduled = new Set(
    stored
      .filter(
        (reminder) => reminder.disclosureVersion === plan.disclosureVersion,
      )
      .map((reminder) =>
        reminderKey(
          reminder.externalSubscriptionId,
          reminder.applicableAt,
          reminder.destination,
        ),
      ),
  );
  return inWindow
    .filter(
      ({ subscription, renewalAt }) =>
        !scheduled.has(
          reminderKey(
            subscription.externalSubscriptionId,
            renewalAt,
            subscription.destination,
          ),
        ),
    )
    .sort(
      (a, b) =>
        a.renewalAt.getTime() - b.renewalAt.getTime() ||
        (a.subscription.externalSubscriptionId <
        b.subscription.externalSubscriptionId
          ? -1
          : 1),
    )
    .slice(0, limit)
    .map(({ subscription, renewalAt }) => ({
      noticeKind: 'anniversary_reminder',
      externalSubscriptionId: subscription.externalSubscriptionId,
      applicableAt: renewalAt,
      disclosureVersion: plan.disclosureVersion,
      destination: subscription.destination,
      planName: plan.planName,
      amountCents: plan.amountCents,
      currency: plan.currency,
      frequency: plan.frequency,
      cancellationMethod: plan.cancellationMethod,
      changeDescription: null,
    }));
}

// Runs after dispatch, like the annual check: a monthly subscription whose
// anniversary renewal is inside the 30-day minimum without a sent reminder
// for that renewal has missed its notice.
async function alertOnMissedAnniversaryReminders(
  monthly: readonly ActiveMonthlySubscription[],
  window: { renewalAfter: Date; renewalAtOrBefore: Date },
  deps: SendDueRenewalNoticesJobDeps,
): Promise<void> {
  const due = knownAnniversaries(monthly)
    .map((known) => ({
      externalSubscriptionId: known.subscription.externalSubscriptionId,
      renewalAt: nextAnniversaryRenewalAt({
        startedAt: known.startedAt,
        billingCycleAnchor: known.billingCycleAnchor,
        notBefore: new Date(window.renewalAfter.getTime() + 1),
      }),
    }))
    .filter(({ renewalAt }) => renewalAt <= window.renewalAtOrBefore);
  if (due.length === 0) return;
  let stored: AnniversaryReminderRecord[];
  try {
    stored = await deps.renewalQueries.listAnniversaryReminders({
      externalSubscriptionIds: due.map(
        (anniversary) => anniversary.externalSubscriptionId,
      ),
    });
  } catch (error) {
    deps.logger.error(
      { error: projectSafeErrorDiagnostics(error) },
      'Monthly anniversary reminder deadline check failed',
    );
    return;
  }
  // Sent to the address of record when it was sent, as for annual notices.
  const sentKeys = new Set(
    stored
      .filter((reminder) => SENT_STATUSES.has(reminder.status))
      .map((reminder) =>
        reminderKey(reminder.externalSubscriptionId, reminder.applicableAt),
      ),
  );
  const missed = due.filter(
    (anniversary) =>
      !sentKeys.has(
        reminderKey(anniversary.externalSubscriptionId, anniversary.renewalAt),
      ),
  );
  if (missed.length === 0) return;
  deps.logger.error(
    {
      count: missed.length,
      externalSubscriptionIds: missed.map(
        (anniversary) => anniversary.externalSubscriptionId,
      ),
    },
    'Monthly anniversary reminder deadline missed',
  );
  await deps.alerts.raise({
    kind: 'anniversary_reminder_deadline_missed',
    count: missed.length,
  });
}
