import { createContainer } from '@/lib/container';
import {
  ANNUAL_RENEWAL_NOTICE_VERSION,
  CANCELLATION_METHOD,
  MONTHLY_ANNIVERSARY_NOTICE_VERSION,
  PRICING_DATA,
} from '@/lib/pricing-data';
import { operationalAlertDrillCycles } from '@/src/adapters/jobs/operational-alert-drill';
import {
  listActiveMonthlySubscriptions,
  listAnniversaryReminders,
  listAnnualRenewalsPastNoticeDeadline,
  listAnnualSubscriptionsDue,
  SEND_RENEWAL_NOTICES_DEFAULT_DISPATCH_LIMIT,
  SEND_RENEWAL_NOTICES_DEFAULT_SUBSCRIPTION_LIMIT,
  sendDueRenewalNotices,
} from '@/src/adapters/jobs/send-due-renewal-notices';
import { createRenewalNoticeCronHandler } from './route-handler';

// Next.js requires route-segment configuration to be a statically analyzable literal.
export const maxDuration = 300;

type CronContainerResolver = () => ReturnType<typeof createContainer>;

export function createSendRenewalNoticesCronHandler(
  resolveContainer: CronContainerResolver = createContainer,
) {
  return createRenewalNoticeCronHandler(() => {
    const container = resolveContainer();
    return {
      cronSecret: container.env.CRON_SECRET,
      logger: container.logger,
      createRateLimiter: container.createRateLimiter,
      run: () =>
        sendDueRenewalNotices(
          {
            subscriptionLimit: SEND_RENEWAL_NOTICES_DEFAULT_SUBSCRIPTION_LIMIT,
            dispatchLimit: SEND_RENEWAL_NOTICES_DEFAULT_DISPATCH_LIMIT,
          },
          {
            now: container.now,
            monotonicNow: () => performance.now(),
            logger: container.logger,
            alerts: container.createOperationalAlerts(),
            alertDrillCycles: operationalAlertDrillCycles({ db: container.db }),
            annualPlan: {
              planName: PRICING_DATA.annual.name,
              amountCents: PRICING_DATA.annual.amountCents,
              currency: PRICING_DATA.annual.currency,
              frequency: PRICING_DATA.annual.frequency,
              disclosureVersion: ANNUAL_RENEWAL_NOTICE_VERSION,
              cancellationMethod: CANCELLATION_METHOD,
            },
            monthlyPlan: {
              planName: PRICING_DATA.monthly.name,
              amountCents: PRICING_DATA.monthly.amountCents,
              currency: PRICING_DATA.monthly.currency,
              frequency: PRICING_DATA.monthly.frequency,
              disclosureVersion: MONTHLY_ANNIVERSARY_NOTICE_VERSION,
              cancellationMethod: CANCELLATION_METHOD,
            },
            sendDueRenewalNotices:
              container.createSendDueRenewalNoticesUseCase(),
            pruneExpiredTrialPaymentMethodSetups: (input) =>
              container
                .createTrialPaymentMethodSetupOperationRepository()
                .pruneExpired(input),
            renewalQueries: {
              listDue: (input) =>
                listAnnualSubscriptionsDue(input, {
                  db: container.db,
                  annualPriceId:
                    container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
                }),
              listPastNoticeDeadline: (input) =>
                listAnnualRenewalsPastNoticeDeadline(input, {
                  db: container.db,
                  annualPriceId:
                    container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
                }),
              listActiveMonthly: (input) =>
                listActiveMonthlySubscriptions(input, {
                  db: container.db,
                  monthlyPriceId:
                    container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
                }),
              listAnniversaryReminders: (input) =>
                listAnniversaryReminders(input, { db: container.db }),
            },
          },
        ),
    };
  });
}

const handleCronRequest = createSendRenewalNoticesCronHandler();

export async function GET(req: Request) {
  return handleCronRequest(req);
}

export async function POST(req: Request) {
  return handleCronRequest(req);
}
