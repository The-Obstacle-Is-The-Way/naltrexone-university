import { BarChart3, Bookmark, BookOpen, Zap } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { AuthNav } from '@/components/auth-nav';
import { GetStartedCta } from '@/components/get-started-cta';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MetallicCtaButton } from '@/components/ui/metallic-cta-button';
import { PRICING_DATA } from '@/lib/pricing-data';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';

export type MarketingHomeShellProps = {
  authNav: ReactNode;
  primaryCta: ReactNode;
};

const impactStats = [
  { value: '500+', label: 'Board-Style Questions' },
  { value: '2', label: 'Study Modes' },
  { value: 'Instant', label: 'Explanations' },
  { value: '100%', label: 'Mobile Responsive' },
];

const features = [
  {
    icon: BookOpen,
    title: 'High-Yield Explanations',
    description:
      'Learn the "why" behind every answer with detailed rationales and references.',
    wide: true,
  },
  {
    icon: Zap,
    title: 'Tutor + Exam Modes',
    description:
      'Tutor shows feedback immediately. Exam mode simulates real test conditions.',
    wide: false,
  },
  {
    icon: Bookmark,
    title: 'Smart Bookmarking',
    description:
      'Flag questions for review. Build a personalized study list from your weak areas.',
    wide: false,
  },
  {
    icon: BarChart3,
    title: 'Progress Dashboard',
    description:
      'Track accuracy, streaks, and trends. See where you need to focus.',
    wide: true,
  },
];

export function MarketingHomeShell({
  authNav,
  primaryCta,
}: MarketingHomeShellProps) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              href={ROUTES.HOME}
              className="rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Addiction Boards
            </Link>
            <nav
              aria-label="Marketing navigation"
              className="hidden items-center gap-4 text-sm sm:flex"
            >
              <Link
                href="#features"
                className="rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Features
              </Link>
              <Link
                href={ROUTES.PRICING}
                className="rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Pricing
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">{authNav}</div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {/* Hero */}
        <section className="py-20 lg:py-32">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <p className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Board prep, built for outcomes
            </p>
            <h1 className="mt-6 font-display text-5xl font-bold tracking-tight md:text-7xl">
              <span className="block text-foreground">Master Your</span>
              <span className="bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
                Board Exams.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground leading-relaxed md:text-xl">
              High-yield questions with detailed explanations for Addiction
              Psychiatry and Addiction Medicine. Practice with confidence and
              track your progress.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              {primaryCta}
              <Button
                asChild
                variant="outline"
                className="h-auto rounded-full border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-muted"
              >
                <Link href={ROUTES.PRICING}>View pricing</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Impact stats */}
        <section className="border-t border-border py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {impactStats.map((stat) => {
                const testIdSlug = stat.label
                  .replace(/[^a-z0-9]+/gi, '-')
                  .toLowerCase();
                const testId = `impact-stat-${testIdSlug}`;
                return (
                  <Card
                    key={stat.label}
                    className="text-center animate-fade-in-up"
                    data-testid={testId}
                  >
                    <div
                      data-testid={`${testId}-value`}
                      className="font-display text-3xl font-bold text-foreground md:text-4xl"
                    >
                      {stat.value}
                    </div>
                    <div
                      data-testid={`${testId}-label`}
                      className="mt-2 text-sm text-muted-foreground"
                    >
                      {stat.label}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
                Everything you need to prep efficiently
              </h2>
              <p className="mt-3 text-muted-foreground">
                Clean workflows, zero fluff. Stay in the question loop and learn
                from every attempt.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card
                    key={feature.title}
                    className={cn(
                      'transition-colors hover:bg-muted',
                      feature.wide && 'md:col-span-2',
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className="h-6 w-6 text-muted-foreground"
                    />
                    <h3 className="mt-4 font-heading font-semibold">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="border-t border-border py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
                Simple pricing
              </h2>
              <p className="mt-3 text-muted-foreground">
                One subscription unlocks the full question bank and all study
                modes.
              </p>
            </div>

            <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
              <Card className="p-8">
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
                <Button
                  asChild
                  variant="secondary"
                  className="mt-8 h-auto w-full rounded-full py-3 text-sm font-medium"
                >
                  <Link href={ROUTES.PRICING}>Get Started</Link>
                </Button>
              </Card>

              <Card className="border-2 border-primary p-8">
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
                <Button
                  asChild
                  className="mt-8 h-auto w-full rounded-full bg-foreground py-3 text-sm font-medium text-background hover:bg-foreground/90"
                >
                  <Link href={ROUTES.PRICING}>Get Started</Link>
                </Button>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
              Ready to start studying?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Join physicians and psychiatrists preparing for addiction boards.
              Full access, cancel anytime.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <MetallicCtaButton href={ROUTES.PRICING}>
                Get Started
              </MetallicCtaButton>
              <Link
                href={ROUTES.SIGN_IN}
                className="rounded-full border border-border bg-card px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="grid gap-8 md:grid-cols-3">
              <div>
                <p className="font-semibold text-foreground">
                  Addiction Boards
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Board exam preparation for addiction medicine professionals.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Product</p>
                <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                  <Link
                    href="#features"
                    className="transition-colors hover:text-foreground"
                  >
                    Features
                  </Link>
                  <Link
                    href={ROUTES.PRICING}
                    className="transition-colors hover:text-foreground"
                  >
                    Pricing
                  </Link>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Account</p>
                <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                  <Link
                    href={ROUTES.SIGN_IN}
                    className="transition-colors hover:text-foreground"
                  >
                    Sign in
                  </Link>
                  <Link
                    href={ROUTES.SIGN_UP}
                    className="transition-colors hover:text-foreground"
                  >
                    Sign up
                  </Link>
                </div>
              </div>
            </div>
            <div className="mt-8 border-t border-border pt-8 text-sm text-muted-foreground">
              <p>&copy; Addiction Boards</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export async function renderMarketingHome(input?: {
  authNavFn?: () => Promise<ReactNode>;
  getStartedCtaFn?: () => Promise<ReactNode>;
}): Promise<ReactElement> {
  const authNavFn = input?.authNavFn ?? (() => AuthNav());
  const getStartedCtaFn = input?.getStartedCtaFn ?? (() => GetStartedCta({}));

  const [authNav, primaryCta] = await Promise.all([
    authNavFn(),
    getStartedCtaFn(),
  ]);

  return <MarketingHomeShell authNav={authNav} primaryCta={primaryCta} />;
}
