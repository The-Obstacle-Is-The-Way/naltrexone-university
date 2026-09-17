import Link from 'next/link';
import { PlanConsentDialog } from '@/app/pricing/plan-consent-dialog';
import { AuthAwareCta } from '@/app/pricing/pricing-auth-cta';
import type { PricingBanner } from '@/app/pricing/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PRICING_DATA } from '@/lib/pricing-data';
import {
  type PricingBillingRecoveryReason,
  type PricingPlan,
  ROUTES,
  toPricingRoute,
  toSignUpRedirectRoute,
} from '@/lib/routes';

export type PricingViewProps = {
  isAuthenticated?: boolean;
  isEntitled: boolean;
  banner: PricingBanner | null;
  selectedPlan?: PricingPlan | null;
  /** Render trial CTAs for trial-eligible visitors (no subscription row, not entitled). */
  showTrialCtas?: boolean;
  manageBillingAction?: (formData: FormData) => Promise<void>;
  manageBillingReason?: PricingBillingRecoveryReason;
  subscribeMonthlyAction: (formData: FormData) => Promise<void>;
  subscribeAnnualAction: (formData: FormData) => Promise<void>;
};

function getPlanSignUpHref(plan: PricingPlan): string {
  return toSignUpRedirectRoute(toPricingRoute({ plan }));
}

function getManageBillingSignUpHref(
  reason: PricingBillingRecoveryReason = 'manage_billing',
): string {
  return toSignUpRedirectRoute(toPricingRoute({ reason }));
}

export function PricingView({
  isAuthenticated = true,
  isEntitled,
  banner,
  selectedPlan = null,
  showTrialCtas = false,
  manageBillingAction,
  manageBillingReason = 'manage_billing',
  subscribeMonthlyAction,
  subscribeAnnualAction,
}: PricingViewProps) {
  const isMonthlySelected = selectedPlan === 'monthly';
  const isAnnualSelected = selectedPlan === 'annual';

  return (
    <div data-testid="pricing-root" className="bg-background py-16">
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
                <AuthAwareCta
                  isAuthenticated={isAuthenticated}
                  formAction={manageBillingAction}
                  signUpHref={getManageBillingSignUpHref(manageBillingReason)}
                  buttonProps={{
                    variant: 'outline',
                    size: 'sm',
                    className: 'rounded-full',
                  }}
                >
                  Manage billing
                </AuthAwareCta>
              ) : null}
              <Link
                href={ROUTES.PRICING}
                className="ml-4 rounded-md text-muted-foreground transition-colors hover:text-foreground ring-focus"
                aria-label="Dismiss"
              >
                ×
              </Link>
            </div>
          </div>
        ) : null}

        {isEntitled ? (
          <Card className="mx-auto mt-16 max-w-2xl p-8 text-center">
            <div className="text-lg font-semibold text-foreground">
              You&apos;re already subscribed
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Go to your dashboard or manage billing in Stripe.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button asChild className="rounded-full">
                <Link href={ROUTES.APP_DASHBOARD}>Go to dashboard</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href={ROUTES.APP_BILLING}>Manage billing</Link>
              </Button>
            </div>
          </Card>
        ) : !isEntitled && manageBillingAction ? (
          <Card className="mx-auto mt-16 max-w-2xl p-8 text-center">
            <div className="text-lg font-semibold text-foreground">
              Subscription needs attention
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage billing in Stripe to restore access.
            </p>
            <div className="mt-6">
              <AuthAwareCta
                isAuthenticated={isAuthenticated}
                formAction={manageBillingAction}
                signUpHref={getManageBillingSignUpHref(manageBillingReason)}
                buttonProps={{ className: 'rounded-full' }}
              >
                Manage billing
              </AuthAwareCta>
            </div>
          </Card>
        ) : (
          <section
            className="mx-auto mt-16 max-w-3xl"
            aria-labelledby="pricing-plans-heading"
          >
            <h2 id="pricing-plans-heading" className="sr-only">
              Plans
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <Card
                aria-current={isMonthlySelected ? 'true' : undefined}
                className={
                  isMonthlySelected ? 'border-2 border-primary p-8' : 'p-8'
                }
              >
                <h3 className="font-heading font-semibold text-foreground">
                  {PRICING_DATA.monthly.name}
                </h3>
                {isMonthlySelected ? (
                  <p className="mt-2 text-sm font-medium text-primary">
                    Selected plan
                  </p>
                ) : null}
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
                {isAuthenticated ? (
                  <PlanConsentDialog
                    key={`monthly:${selectedPlan ?? 'none'}`}
                    plan="monthly"
                    hasTrial={showTrialCtas}
                    initiallyOpen={isMonthlySelected}
                    subscribeAction={subscribeMonthlyAction}
                  />
                ) : (
                  <Button
                    asChild
                    className="mt-8 h-auto w-full rounded-full py-3 text-base"
                  >
                    <Link href={getPlanSignUpHref('monthly')}>
                      {showTrialCtas
                        ? PRICING_DATA.monthly.trialCta
                        : 'Subscribe Monthly'}
                    </Link>
                  </Button>
                )}
              </Card>
              <Card
                aria-current={isAnnualSelected ? 'true' : undefined}
                className="border-2 border-primary p-8"
              >
                <h3 className="font-heading font-semibold text-foreground">
                  {PRICING_DATA.annual.name}
                </h3>
                {isAnnualSelected ? (
                  <p className="mt-2 text-sm font-medium text-primary">
                    Selected plan
                  </p>
                ) : null}
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
                {isAuthenticated ? (
                  <PlanConsentDialog
                    key={`annual:${selectedPlan ?? 'none'}`}
                    plan="annual"
                    hasTrial={showTrialCtas}
                    initiallyOpen={isAnnualSelected}
                    subscribeAction={subscribeAnnualAction}
                  />
                ) : (
                  <Button
                    asChild
                    className="mt-8 h-auto w-full rounded-full py-3 text-base"
                  >
                    <Link href={getPlanSignUpHref('annual')}>
                      {showTrialCtas
                        ? PRICING_DATA.annual.trialCta
                        : 'Subscribe Annual'}
                    </Link>
                  </Button>
                )}
              </Card>
            </div>
            {isAuthenticated && showTrialCtas ? (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                7-day free trial on either plan. No payment method needed.
                Cancel anytime.
              </p>
            ) : null}
            {isAuthenticated ? (
              <noscript>
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Enable JavaScript to review subscription terms and continue.
                  For help, contact support@addictionboards.com.
                </p>
              </noscript>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}
