import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { IdempotencyKeyField } from '@/app/pricing/pricing-client';
import type { PricingBanner } from '@/app/pricing/types';
import { Button } from '@/components/ui/button';
import { PRICING_DATA } from '@/lib/pricing-data';
import { ROUTES } from '@/lib/routes';

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
    <Button type="submit" className="mt-8 w-full rounded-full">
      {children}
    </Button>
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
    <div
      data-testid="pricing-root"
      className="min-h-screen bg-background py-16"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="text-center">
          <h1 className="text-4xl font-bold font-heading tracking-tight text-foreground">
            Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Choose the plan that works for you.
          </p>
        </header>

        {banner ? (
          <div
            className={[
              'mx-auto mt-8 max-w-2xl rounded-2xl border bg-card p-4 text-sm shadow-sm flex items-center justify-between',
              banner.tone === 'error'
                ? 'border-destructive text-destructive'
                : 'border-border text-muted-foreground',
            ].join(' ')}
            role="alert"
          >
            <span>{banner.message}</span>
            <div className="ml-4 flex items-center gap-3">
              {manageBillingAction ? (
                <form action={manageBillingAction}>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                  >
                    Manage Billing
                  </Button>
                </form>
              ) : null}
              <Link
                href={ROUTES.PRICING}
                className="ml-4 rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
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
              <Button asChild className="rounded-full">
                <Link href={ROUTES.APP_DASHBOARD}>Go to Dashboard</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href={ROUTES.APP_BILLING}>Manage Billing</Link>
              </Button>
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
                <Button type="submit" className="rounded-full">
                  Manage Billing
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <section className="mt-16" aria-labelledby="pricing-plans-heading">
            <h2
              id="pricing-plans-heading"
              className="text-center font-heading text-xl font-semibold tracking-tight text-foreground"
            >
              Plans
            </h2>
            <div className="mt-6 grid gap-8 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
                <h3 className="font-heading font-semibold text-foreground">
                  {PRICING_DATA.monthly.name}
                </h3>
                <p className="mt-4 font-display text-4xl font-bold text-foreground">
                  {PRICING_DATA.monthly.price}
                  <span className="text-lg font-normal text-muted-foreground">
                    {PRICING_DATA.monthly.period}
                  </span>
                </p>
                <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                  {PRICING_DATA.monthly.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
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
                <h3 className="font-heading font-semibold text-foreground">
                  {PRICING_DATA.annual.name}
                </h3>
                <p className="mt-4 font-display text-4xl font-bold text-foreground">
                  {PRICING_DATA.annual.price}
                  <span className="text-lg font-normal text-muted-foreground">
                    {PRICING_DATA.annual.period}
                  </span>
                </p>
                <p className="text-sm text-success">
                  {PRICING_DATA.annual.savings}
                </p>
                <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                  {PRICING_DATA.annual.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
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
          </section>
        )}

        <div className="mt-8 text-center">
          <Link
            href={ROUTES.HOME}
            className="rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
