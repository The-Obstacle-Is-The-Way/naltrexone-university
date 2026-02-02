import { redirect } from 'next/navigation';
import { createPortalSession } from '@/src/adapters/controllers/billing-controller';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { SubscriptionRepository } from '@/src/application/ports/repositories';
import type { Subscription } from '@/src/domain/entities';
import { ManageBillingButton } from './billing-client';

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
export function BillingContent({
  subscription,
}: {
  subscription: Subscription | null;
}) {
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

        {subscription && (
          <form>
            <ManageBillingButton />
          </form>
        )}
      </div>
    </div>
  );
}

export default async function BillingPage() {
  const { subscription } = await loadBillingData();

  async function manageBilling() {
    'use server';
    const result = await createPortalSession({});
    if (!result.ok) {
      redirect('/app/billing');
    }
    redirect(result.data.url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your subscription and billing details.
        </p>
      </div>

      {subscription ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                Subscription
              </div>
              <div className="text-sm text-muted-foreground">
                {subscription.plan} · {subscription.status}
              </div>
            </div>

            <form action={manageBilling}>
              <ManageBillingButton />
            </form>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                Subscription
              </div>
              <div className="text-sm text-muted-foreground">
                No subscription found.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
