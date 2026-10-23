import type { Metadata } from 'next';
import { ManageBillingButton } from '@/app/(app)/app/billing/billing-client';
import { manageBillingAction } from '@/app/(app)/app/billing/manage-billing-actions';
import { awaitRequestBoundary } from '@/app/(app)/app/request-boundary';
import { ErrorCard } from '@/components/error-card';
import { IdempotencyKeyField } from '@/components/idempotency-key-field';
import { Card } from '@/components/ui/card';
import { PRICING_DATA } from '@/lib/pricing-data';
import { normalizeSearchParam } from '@/lib/search-params';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { SubscriptionRepository } from '@/src/application/ports/repositories';
import type { CheckTrialSavedCardUseCase } from '@/src/application/ports/use-cases';
import { formatRenewalNoticeCutoff } from '@/src/application/shared/renewal-notice-email-format';
import type { Subscription } from '@/src/domain/entities';
import { classifyTrialEnding, type TrialEnding } from '@/src/domain/services';
import type { SubscriptionStatus } from '@/src/domain/value-objects';

export const maxDuration = 30;

export const metadata: Metadata = {
  title: 'Billing - Addiction Boards',
};

// BUG-308: learner-facing names for the domain's subscription statuses.
const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  paymentProcessing: 'Payment processing',
  paymentFailed: 'Payment failed',
  inTrial: 'Free trial',
  active: 'Active',
  canceled: 'Canceled',
  unpaid: 'Unpaid',
  paused: 'Paused',
  pastDue: 'Payment past due',
};

export type BillingPageDeps = {
  authGateway: AuthGateway;
  subscriptionRepository: SubscriptionRepository;
  checkTrialSavedCardUseCase: CheckTrialSavedCardUseCase;
};

async function getDeps(deps?: BillingPageDeps): Promise<BillingPageDeps> {
  if (deps) return deps;

  const { createRequestContainer } = await import('@/lib/container');
  const container = createRequestContainer();

  return {
    authGateway: container.createAuthGateway(),
    subscriptionRepository: container.createSubscriptionRepository(),
    checkTrialSavedCardUseCase: container.createCheckTrialSavedCardUseCase(),
  };
}

export async function loadBillingData(deps?: BillingPageDeps): Promise<{
  userId: string;
  subscription: Subscription | null;
  trialCardSaved: boolean;
}> {
  const d = await getDeps(deps);
  const user = await d.authGateway.requireUser();
  const subscription = await d.subscriptionRepository.findByUserId(user.id);
  const trialCardSaved =
    subscription?.status === 'inTrial'
      ? (await d.checkTrialSavedCardUseCase.execute({ userId: user.id }))
          .cardSaved
      : false;
  return { userId: user.id, subscription, trialCardSaved };
}

/** Extracted for testing (Server Components can't be directly tested) */
export type BillingContentProps =
  | {
      subscription: Subscription;
      manageBillingAction: (formData: FormData) => Promise<void>;
      trialCardSaved?: boolean;
    }
  | {
      subscription: null;
      manageBillingAction?: never;
      trialCardSaved?: never;
    };

function trialRenewalCopy(
  subscription: Subscription,
  ending: TrialEnding,
  cardSaved: boolean,
): string {
  const pricing = PRICING_DATA[subscription.plan];
  switch (ending) {
    // BUG-364: the trial ends as scheduled; while it lasts it still blocks
    // Checkout, so the way back is undoing the cancellation or support.
    // Without a card, undoing it alone still ends the trial.
    case 'cancellationScheduled':
      return cardSaved
        ? 'Your trial ends without a charge. To keep access after it, undo the cancellation in Stripe, or email support@addictionboards.com.'
        : 'Your trial ends without a charge. To keep access after it, undo the cancellation in Stripe and then add a card, or email support@addictionboards.com.';
    case 'renewsOnSavedCard':
      return `Renews at ${pricing.price} per ${pricing.frequency} on your saved card when your trial ends, until you cancel.`;
    case 'needsCard':
      return 'No card on file. Your trial ends without a charge unless you add a card from the trial banner.';
  }
}

function TrialRenewalLine({
  subscription,
  cardSaved,
}: {
  subscription: Subscription;
  cardSaved: boolean;
}) {
  const ending = classifyTrialEnding({
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    cardSaved,
  });
  return (
    <div className="text-sm text-muted-foreground">
      {trialRenewalCopy(subscription, ending, cardSaved)}
    </div>
  );
}

export function BillingContent(props: BillingContentProps) {
  const subscription = props.subscription;

  return (
    <Card className="gap-0 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">
            Subscription
          </div>
          {subscription ? (
            <>
              <div className="text-sm text-muted-foreground">
                {PRICING_DATA[subscription.plan].name} ·{' '}
                {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
              </div>
              {subscription.status === 'inTrial' ? (
                <TrialRenewalLine
                  subscription={subscription}
                  cardSaved={props.trialCardSaved ?? false}
                />
              ) : null}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              No subscription found.
            </div>
          )}
        </div>

        {subscription ? (
          <form action={props.manageBillingAction}>
            <IdempotencyKeyField />
            <ManageBillingButton />
          </form>
        ) : null}
      </div>

      {subscription?.cancelAtPeriodEnd ? (
        <div className="mt-4 rounded-xl border border-warning bg-warning/15 p-4 text-sm text-warning-foreground">
          <div className="font-medium">Cancellation scheduled</div>
          <div className="mt-1">
            Your subscription will cancel on{' '}
            <span className="font-medium">
              {formatRenewalNoticeCutoff(subscription.currentPeriodEnd)}
            </span>
            . You&apos;ll keep access until then.
          </div>
        </div>
      ) : null}
    </Card>
  );
}

type BillingPageErrorCode = 'portal_failed' | 'trial_payment_method_failed';

type BillingBanner = { tone: 'error'; message: string };

// BUG-308: the add-card flow returns here with its outcome.
function getTrialPaymentMethodNotice(
  outcome: string | string[] | undefined,
  trialCardSaved: boolean,
  trialCancellationScheduled: boolean,
): string | null {
  switch (normalizeSearchParam(outcome)) {
    case 'success':
      if (trialCardSaved) return 'Your card is saved.';
      // BUG-364: completion after the cancellation keeps no card.
      return trialCancellationScheduled
        ? "Your trial's cancellation is scheduled, so the card was not saved."
        : 'Stripe is confirming your card. Refresh this page in a moment.';
    case 'cancel':
      return 'No card was added. Your trial continues.';
    default:
      return null;
  }
}

function parseBillingErrorCode(
  error: string | string[] | undefined,
): BillingPageErrorCode | undefined {
  const value = normalizeSearchParam(error);
  if (value === 'portal_failed' || value === 'trial_payment_method_failed') {
    return value;
  }
  return undefined;
}

function getBillingBanner(
  code: BillingPageErrorCode | undefined,
  trialCancellationScheduled: boolean,
): BillingBanner | null {
  if (!code) return null;
  switch (code) {
    case 'portal_failed':
      return {
        tone: 'error',
        message: "Couldn't open the billing portal. Please try again.",
      };
    // DEBT-414 F03b: the add-card action returns here when it cannot start,
    // including when the terms changed after they were displayed, which is
    // refused before Stripe is contacted, so the message names no cause.
    case 'trial_payment_method_failed':
      // BUG-364: the add-card action refuses a trial whose cancellation is
      // scheduled, and the trial banner then offers no terms to review.
      return {
        tone: 'error',
        message: trialCancellationScheduled
          ? "We couldn't add your card because your trial's cancellation is scheduled."
          : "We couldn't start adding your card. Review the current terms from the trial banner and try again.",
      };
  }

  return null;
}

export type BillingPageViewProps = BillingContentProps & {
  banner?: BillingBanner | null;
  notice?: string | null;
};

export function BillingPageView(props: BillingPageViewProps) {
  const { banner, notice, ...contentProps } = props;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          Billing
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Manage your subscription and billing details.
        </p>
      </div>

      {banner ? <ErrorCard>{banner.message}</ErrorCard> : null}
      {notice ? (
        <Card role="status" className="gap-0 rounded-2xl p-4 text-sm shadow-sm">
          {notice}
        </Card>
      ) : null}

      <BillingContent {...contentProps} />
    </div>
  );
}

export type BillingPageProps = {
  deps?: BillingPageDeps;
  searchParams?: Promise<{
    error?: string | string[];
    trial_payment_method?: string | string[];
  }>;
};

export default async function BillingPage(props?: BillingPageProps) {
  const requestBoundary = awaitRequestBoundary();
  const billingDataPromise = loadBillingData(props?.deps);
  const searchParamsPromise = Promise.resolve(props?.searchParams);

  await requestBoundary;

  const [{ subscription, trialCardSaved }, resolvedSearchParams] =
    await Promise.all([billingDataPromise, searchParamsPromise]);
  const trialCancellationScheduled =
    subscription?.status === 'inTrial' && subscription.cancelAtPeriodEnd;
  const banner = getBillingBanner(
    parseBillingErrorCode(resolvedSearchParams?.error),
    trialCancellationScheduled,
  );

  if (!subscription) {
    return <BillingPageView subscription={null} banner={banner} />;
  }

  return (
    <BillingPageView
      subscription={subscription}
      manageBillingAction={manageBillingAction}
      trialCardSaved={trialCardSaved}
      banner={banner}
      notice={getTrialPaymentMethodNotice(
        resolvedSearchParams?.trial_payment_method,
        trialCardSaved,
        trialCancellationScheduled,
      )}
    />
  );
}
