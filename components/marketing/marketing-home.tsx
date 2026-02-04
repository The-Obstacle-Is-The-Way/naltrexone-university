import { BarChart3, Bookmark, BookOpen, Zap } from 'lucide-react';
import Link from 'next/link';
import { AuthNav } from '@/components/auth-nav';
import { GetStartedCta } from '@/components/get-started-cta';
import { MetallicCtaButton } from '@/components/ui/metallic-cta-button';

export type MarketingHomeShellProps = {
  authNav: React.ReactNode;
  primaryCta: React.ReactNode;
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
              href="/"
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
                className="rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Features
              </Link>
              <Link
                href="/pricing"
                className="rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Pricing
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">{authNav}</div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="py-20 lg:py-32">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <p className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              Board prep, built for outcomes
            </p>
            <h1 className="mt-6 font-display text-5xl font-bold tracking-tight md:text-7xl">
              <span className="block text-zinc-100">Master Your</span>
              <span className="bg-gradient-to-r from-zinc-500 via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
                Board Exams.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-zinc-500 leading-relaxed md:text-xl">
              High-yield questions with detailed explanations for Addiction
              Psychiatry and Addiction Medicine. Practice with confidence and
              track your progress.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              {primaryCta}
              <Link
                href="/pricing"
                className="rounded-full border border-zinc-800 bg-zinc-900 px-6 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                View pricing
              </Link>
            </div>
          </div>
        </section>

        {/* Impact stats */}
        <section className="border-t border-border py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {impactStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 text-center animate-fade-in-up"
                >
                  <div className="font-display text-3xl font-bold text-foreground md:text-4xl">
                    {stat.value}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
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
                  <div
                    key={feature.title}
                    className={`rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 transition-all hover:border-zinc-700/50 hover:bg-zinc-900/80${feature.wide ? ' md:col-span-2' : ''}`}
                  >
                    <Icon
                      aria-hidden="true"
                      className="h-6 w-6 text-zinc-400"
                    />
                    <h3 className="mt-4 font-heading font-semibold">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
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
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
                <h3 className="font-heading font-semibold text-foreground">
                  Pro Monthly
                </h3>
                <p className="mt-4 font-display text-4xl font-bold text-foreground">
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
                <Link
                  href="/pricing"
                  className="mt-8 block w-full rounded-full border border-zinc-700 bg-zinc-800 py-3 text-center text-sm font-medium text-zinc-100 hover:bg-zinc-700 transition-colors"
                >
                  Get Started
                </Link>
              </div>

              <div className="rounded-2xl border-2 border-zinc-500 bg-zinc-900/50 p-8">
                <h3 className="font-heading font-semibold text-foreground">
                  Pro Annual
                </h3>
                <p className="mt-4 font-display text-4xl font-bold text-foreground">
                  $199
                  <span className="text-lg font-normal text-muted-foreground">
                    /yr
                  </span>
                </p>
                <p className="text-sm text-emerald-400">Save $149 per year</p>
                <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                  <li>Everything in Pro Monthly</li>
                  <li>Best value</li>
                </ul>
                <Link
                  href="/pricing"
                  className="mt-8 block w-full rounded-full bg-zinc-100 py-3 text-center text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
                >
                  Get Started
                </Link>
              </div>
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
              <MetallicCtaButton href="/pricing">Get Started</MetallicCtaButton>
              <Link
                href="/pricing"
                className="rounded-full border border-zinc-800 bg-zinc-900 px-6 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                View Pricing
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
                  <Link href="#features" className="hover:text-foreground">
                    Features
                  </Link>
                  <Link href="/pricing" className="hover:text-foreground">
                    Pricing
                  </Link>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Account</p>
                <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                  <Link href="/sign-in" className="hover:text-foreground">
                    Sign in
                  </Link>
                  <Link href="/sign-up" className="hover:text-foreground">
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
  authNavFn?: () => Promise<React.ReactNode>;
  getStartedCtaFn?: () => Promise<React.ReactNode>;
}): Promise<React.ReactElement> {
  const authNavFn = input?.authNavFn ?? (() => AuthNav());
  const getStartedCtaFn = input?.getStartedCtaFn ?? (() => GetStartedCta({}));

  const [authNav, primaryCta] = await Promise.all([
    authNavFn(),
    getStartedCtaFn(),
  ]);

  return <MarketingHomeShell authNav={authNav} primaryCta={primaryCta} />;
}
