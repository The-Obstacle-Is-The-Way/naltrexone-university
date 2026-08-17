import { createContainer } from '@/lib/container';
import { CANCELLATION_METHOD, PRICING_DATA } from '@/lib/pricing-data';
import {
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
            annualPlan: {
              planName: PRICING_DATA.annual.name,
              amountCents: PRICING_DATA.annual.amountCents,
              currency: PRICING_DATA.annual.currency,
              frequency: PRICING_DATA.annual.frequency,
              disclosureVersion: PRICING_DATA.annual.disclosureVersion,
              cancellationMethod: CANCELLATION_METHOD,
            },
            sendDueRenewalNotices:
              container.createSendDueRenewalNoticesUseCase(),
            pruneExpiredTrialPaymentMethodSetups: (input) =>
              container
                .createTrialPaymentMethodSetupOperationRepository()
                .pruneExpired(input),
            listAnnualSubscriptionsDue: (input) =>
              listAnnualSubscriptionsDue(input, {
                db: container.db,
                annualPriceId: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
              }),
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
