import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createCheckoutSession } from '@/src/adapters/controllers/billing-controller';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';

type CheckEntitlementUseCase = {
  execute: (input: CheckEntitlementInput) => Promise<CheckEntitlementOutput>;
};

export type PricingPageDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
};

async function getDeps(deps?: PricingPageDeps): Promise<PricingPageDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  const container = createContainer();

  return {
    authGateway: container.createAuthGateway(),
    checkEntitlementUseCase: container.createCheckEntitlementUseCase(),
  };
}

export async function loadPricingData(
  deps?: PricingPageDeps,
): Promise<{ isEntitled: boolean }> {
  const d = await getDeps(deps);
  const user = await d.authGateway.getCurrentUser();
  if (!user) return { isEntitled: false };

  const entitlement = await d.checkEntitlementUseCase.execute({
    userId: user.id,
  });

  return { isEntitled: entitlement.isEntitled };
}

export type PricingBanner = {
  tone: 'error' | 'info';
  message: string;
};

export type PricingViewProps = {
  isEntitled: boolean;
  banner: PricingBanner | null;
  subscribeMonthlyAction: () => Promise<void>;
  subscribeAnnualAction: () => Promise<void>;
};

export function PricingView({
  isEntitled,
  banner,
  subscribeMonthlyAction,
  subscribeAnnualAction,
}: PricingViewProps) {
  return (
    <div className="min-h-screen bg-muted py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Choose the plan that works for you.
          </p>
        </div>

        {banner ? (
          <div
            className={[
              'mx-auto mt-8 max-w-2xl rounded-2xl border bg-card p-4 text-sm shadow-sm',
              banner.tone === 'error'
                ? 'border-red-200 text-red-700 dark:border-red-900/50 dark:text-red-200'
                : 'border-border text-muted-foreground',
            ].join(' ')}
            role="alert"
          >
            {banner.message}
          </div>
        ) : null}

        {isEntitled ? (
          <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="text-lg font-semibold text-foreground">
              You&apos;re already subscribed
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Go to your dashboard or manage billing in Stripe.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/app/dashboard"
                className="inline-flex items-center justify-center rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                Go to Dashboard
              </Link>
              <Link
                href="/app/billing"
                className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Manage Billing
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-16 grid gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
              <h3 className="text-lg font-semibold text-foreground">
                Pro Monthly
              </h3>
              <p className="mt-4 text-4xl font-bold text-foreground">
                $29
                <span className="text-lg font-normal text-muted-foreground">
                  /mo
                </span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                <li>Access to all questions</li>
                <li>Detailed explanations</li>
                <li>Progress tracking</li>
              </ul>
              <form action={subscribeMonthlyAction}>
                <button
                  type="submit"
                  className="mt-8 block w-full rounded-full bg-orange-600 py-3 text-center text-sm font-medium text-white hover:bg-orange-700"
                >
                  Subscribe Monthly
                </button>
              </form>
            </div>
            <div className="rounded-2xl border-2 border-orange-500 bg-card p-8 shadow-sm">
              <h3 className="text-lg font-semibold text-foreground">
                Pro Annual
              </h3>
              <p className="mt-4 text-4xl font-bold text-foreground">
                $199
                <span className="text-lg font-normal text-muted-foreground">
                  /yr
                </span>
              </p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Save $149 per year
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                <li>Everything in Pro Monthly</li>
                <li>Best value</li>
              </ul>
              <form action={subscribeAnnualAction}>
                <button
                  type="submit"
                  className="mt-8 block w-full rounded-full bg-orange-600 py-3 text-center text-sm font-medium text-white hover:bg-orange-700"
                >
                  Subscribe Annual
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

type PricingSearchParams = {
  checkout?: string;
  reason?: string;
};

export function getPricingBanner(
  searchParams: PricingSearchParams,
): PricingBanner | null {
  if (searchParams.checkout === 'error') {
    return {
      tone: 'error',
      message: 'Checkout failed. Please try again.',
    };
  }

  if (searchParams.checkout === 'cancel') {
    return {
      tone: 'info',
      message: 'Checkout canceled.',
    };
  }

  if (searchParams.reason === 'subscription_required') {
    return {
      tone: 'info',
      message: 'Subscription required to access the app.',
    };
  }

  return null;
}

type RedirectFn = (url: string) => never;

export function createSubscribeAction(input: {
  plan: 'monthly' | 'annual';
  createCheckoutSessionFn: typeof createCheckoutSession;
  redirectFn: RedirectFn;
}): () => Promise<void> {
  return async function subscribe() {
    'use server';
    const result = await input.createCheckoutSessionFn({ plan: input.plan });
    if (result.ok) {
      input.redirectFn(result.data.url);
    }

    if (result.error.code === 'UNAUTHENTICATED') {
      input.redirectFn('/sign-up');
    }

    input.redirectFn('/pricing?checkout=error');
  };
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: PricingSearchParams;
}) {
  const { isEntitled } = await loadPricingData();
  const banner = getPricingBanner(searchParams);

  const subscribeMonthly = createSubscribeAction({
    plan: 'monthly',
    createCheckoutSessionFn: createCheckoutSession,
    redirectFn: redirect,
  });

  const subscribeAnnual = createSubscribeAction({
    plan: 'annual',
    createCheckoutSessionFn: createCheckoutSession,
    redirectFn: redirect,
  });

  return (
    <PricingView
      isEntitled={isEntitled}
      banner={banner}
      subscribeMonthlyAction={subscribeMonthly}
      subscribeAnnualAction={subscribeAnnual}
    />
  );
}
