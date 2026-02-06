import { ManageBillingButton } from '@/app/(app)/app/billing/billing-client';
import { manageBillingAction } from '@/app/(app)/app/billing/manage-billing-actions';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { SubscriptionRepository } from '@/src/application/ports/repositories';
import type { Subscription } from '@/src/domain/entities';

const billingDateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatBillingDate(date: Date): string {
  return billingDateFormatter.format(date);
}

export type BillingPageDeps = {
  authGateway: AuthGateway;
  subscriptionRepository: SubscriptionRepository;
};

async function getDeps(deps?: BillingPageDeps): Promise<BillingPageDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  const container = createContainer();

  return {
    authGateway: container.createAuthGateway(),
    subscriptionRepository: container.createSubscriptionRepository(),
  };
}

export async function loadBillingData(
  deps?: BillingPageDeps,
): Promise<{ userId: string; subscription: Subscription | null }> {
  const d = await getDeps(deps);
  const user = await d.authGateway.requireUser();
  const subscription = await d.subscriptionRepository.findByUserId(user.id);
  return { userId: user.id, subscription };
}

/** Extracted for testing (Server Components can't be directly tested) */
export type BillingContentProps =
  | {
      subscription: Subscription;
      manageBillingAction: (formData: FormData) => Promise<void>;
    }
  | { subscription: null; manageBillingAction?: never };

export function BillingContent(props: BillingContentProps) {
  const subscription = props.subscription;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">
            Subscription
          </div>
          {subscription ? (
            <div className="text-sm text-muted-foreground">
              {subscription.plan} · {subscription.status}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No subscription found.
            </div>
          )}
        </div>

        {subscription ? (
          <form action={props.manageBillingAction}>
            <ManageBillingButton />
          </form>
        ) : null}
      </div>

      {subscription?.cancelAtPeriodEnd ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
          <div className="font-medium">Cancellation scheduled</div>
          <div className="mt-1">
            Your subscription will cancel on{' '}
            <span className="font-medium">
              {formatBillingDate(subscription.currentPeriodEnd)}
            </span>
            . You&apos;ll keep access until then.
          </div>
        </div>
      ) : null}
    </div>
  );
}

type BillingPageErrorCode = 'portal_failed';

type BillingBanner = { tone: 'error'; message: string };

function parseBillingErrorCode(
  error: string | string[] | undefined,
): BillingPageErrorCode | undefined {
  const value = Array.isArray(error) ? error[0] : error;
  if (value === 'portal_failed') return value;
  return undefined;
}

function getBillingBanner(
  code: BillingPageErrorCode | undefined,
): BillingBanner | null {
  if (!code) return null;
  switch (code) {
    case 'portal_failed':
      return {
        tone: 'error',
        message: "Couldn't open the billing portal. Please try again.",
      };
  }

  return null;
}

export type BillingPageViewProps = BillingContentProps & {
  banner?: BillingBanner | null;
};

export function BillingPageView(props: BillingPageViewProps) {
  const { banner, ...contentProps } = props;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your subscription and billing details.
        </p>
      </div>

      {banner ? (
        <div
          className="rounded-2xl border border-border bg-card p-4 text-sm text-destructive shadow-sm"
          role="alert"
        >
          {banner.message}
        </div>
      ) : null}

      <BillingContent {...contentProps} />
    </div>
  );
}

export type BillingPageProps = {
  deps?: BillingPageDeps;
  searchParams?: Promise<{ error?: string | string[] }>;
};

export default async function BillingPage(props?: BillingPageProps) {
  const { subscription } = await loadBillingData(props?.deps);
  const resolvedSearchParams = await props?.searchParams;
  const banner = getBillingBanner(
    parseBillingErrorCode(resolvedSearchParams?.error),
  );

  if (!subscription) {
    return <BillingPageView subscription={null} banner={banner} />;
  }

  return (
    <BillingPageView
      subscription={subscription}
      manageBillingAction={manageBillingAction}
      banner={banner}
    />
  );
}
