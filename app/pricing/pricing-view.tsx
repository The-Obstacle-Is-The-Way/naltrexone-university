import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { IdempotencyKeyField } from '@/app/pricing/pricing-client';
import type { PricingBanner } from '@/app/pricing/types';

export type PricingViewProps = {
  isEntitled: boolean;
  banner: PricingBanner | null;
  manageBillingAction?: (formData: FormData) => Promise<void>;
  subscribeMonthlyAction: (formData: FormData) => Promise<void>;
  subscribeAnnualAction: (formData: FormData) => Promise<void>;
  SubscribeButtonComponent?: ComponentType<{ children: ReactNode }>;
};

function DefaultButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="mt-8 block w-full rounded-full bg-primary py-3 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </button>
  );
}

export function PricingView({
  isEntitled,
  banner,
  manageBillingAction,
  subscribeMonthlyAction,
  subscribeAnnualAction,
  SubscribeButtonComponent = DefaultButton,
}: PricingViewProps) {
  return (
    <div className="min-h-screen bg-background py-16">
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
              'mx-auto mt-8 max-w-2xl rounded-2xl border bg-card p-4 text-sm shadow-sm flex items-center justify-between',
              banner.tone === 'error'
                ? 'border-red-200 text-red-700 dark:border-red-900/50 dark:text-red-200'
                : 'border-border text-muted-foreground',
            ].join(' ')}
            role="alert"
          >
            <span>{banner.message}</span>
            <div className="ml-4 flex items-center gap-3">
              {manageBillingAction ? (
                <form action={manageBillingAction}>
                  <button
                    type="submit"
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Manage Billing
                  </button>
                </form>
              ) : null}
              <Link
                href="/pricing"
                className="ml-4 rounded-md text-current hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Dismiss"
              >
                ×
              </Link>
            </div>
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
                className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Go to Dashboard
              </Link>
              <Link
                href="/app/billing"
                className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Manage Billing
              </Link>
            </div>
          </div>
        ) : !isEntitled && manageBillingAction ? (
          <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="text-lg font-semibold text-foreground">
              Subscription needs attention
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage billing in Stripe to restore access.
            </p>
            <div className="mt-6">
              <form action={manageBillingAction}>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Manage Billing
                </button>
              </form>
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
              <form
                action={subscribeMonthlyAction}
                aria-label="Subscribe monthly plan"
              >
                <IdempotencyKeyField />
                <SubscribeButtonComponent>
                  Subscribe Monthly
                </SubscribeButtonComponent>
              </form>
            </div>
            <div className="rounded-2xl border-2 border-primary bg-card p-8 shadow-sm">
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
              <form
                action={subscribeAnnualAction}
                aria-label="Subscribe annual plan"
              >
                <IdempotencyKeyField />
                <SubscribeButtonComponent>
                  Subscribe Annual
                </SubscribeButtonComponent>
              </form>
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
