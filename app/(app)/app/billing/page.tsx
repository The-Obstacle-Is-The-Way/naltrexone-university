import { redirect } from 'next/navigation';
import { ManageBillingButton } from '@/app/(app)/app/billing/billing-client';
import { createPortalSession } from '@/src/adapters/controllers/billing-controller';
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
  | { subscription: Subscription; manageBillingAction: () => Promise<void> }
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

export type BillingPageViewProps = BillingContentProps;

export function BillingPageView(props: BillingPageViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your subscription and billing details.
        </p>
      </div>

      {props.subscription ? (
        <BillingContent
          subscription={props.subscription}
          manageBillingAction={props.manageBillingAction}
        />
      ) : (
        <BillingContent subscription={null} />
      )}
    </div>
  );
}

export type BillingPageProps = {
  deps?: BillingPageDeps;
};

export default async function BillingPage(props?: BillingPageProps) {
  const { subscription } = await loadBillingData(props?.deps);

  if (!subscription) {
    return <BillingPageView subscription={null} />;
  }

  async function manageBilling() {
    'use server';
    const result = await createPortalSession({});
    if (!result.ok) {
      redirect('/app/billing');
    }
    redirect(result.data.url);
  }

  return (
    <BillingPageView
      subscription={subscription}
      manageBillingAction={manageBilling}
    />
  );
}
