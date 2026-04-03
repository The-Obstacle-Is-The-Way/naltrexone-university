import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { PRICING_DATA } from '@/lib/pricing-data';
import { ROUTES } from '@/lib/routes';

type PricingPlanSkeletonCardProps = {
  plan: (typeof PRICING_DATA)['monthly'] | (typeof PRICING_DATA)['annual'];
  featured?: boolean;
};

function PricingPlanSkeletonCard({
  plan,
  featured = false,
}: PricingPlanSkeletonCardProps) {
  return (
    <Card className={featured ? 'border-2 border-primary p-8' : 'p-8'}>
      <h3 className="font-heading font-semibold text-foreground">
        {plan.name}
      </h3>
      <p className="mt-4 font-display text-4xl font-bold text-foreground">
        {plan.price}
        <span className="text-lg font-normal text-muted-foreground">
          {plan.period}
        </span>
      </p>
      {'savings' in plan ? (
        <p className="text-sm text-success">{plan.savings}</p>
      ) : null}
      <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <div
        aria-hidden="true"
        className="mt-8 h-10 w-full animate-pulse rounded-full bg-muted"
      />
    </Card>
  );
}

export async function PricingViewSkeleton() {
  'use cache';

  return (
    <div
      data-testid="pricing-loading-root"
      aria-busy="true"
      aria-live="polite"
      className="bg-background py-16"
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

        <section className="mt-16" aria-labelledby="pricing-plans-heading">
          <h2
            id="pricing-plans-heading"
            className="text-center font-heading text-xl font-semibold tracking-tight text-foreground"
          >
            Plans
          </h2>
          <p className="sr-only">Loading pricing actions</p>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <PricingPlanSkeletonCard plan={PRICING_DATA.monthly} />
            <PricingPlanSkeletonCard plan={PRICING_DATA.annual} featured />
          </div>
        </section>

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
