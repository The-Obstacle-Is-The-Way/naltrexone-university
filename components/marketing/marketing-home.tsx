import Link from 'next/link';
import { AuthNav } from '@/components/auth-nav';
import { GetStartedCta } from '@/components/get-started-cta';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type MarketingHomeShellProps = {
  authNav: React.ReactNode;
  primaryCta: React.ReactNode;
};

export function MarketingHomeShell({
  authNav,
  primaryCta,
}: MarketingHomeShellProps) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.15),transparent_55%)]"
          />
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8 lg:py-28">
            <div className="lg:col-span-7">
              <p className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                Board prep, built for outcomes
              </p>
              <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
                Addiction Boards Question Bank
              </h1>
              <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
                High-yield questions with detailed explanations for Addiction
                Psychiatry and Addiction Medicine. Practice with confidence and
                track your progress.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                {primaryCta}
                <Button asChild variant="outline">
                  <Link href="/pricing">View pricing</Link>
                </Button>
              </div>

              <dl className="mt-10 grid max-w-xl grid-cols-2 gap-6 text-sm text-muted-foreground sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card px-4 py-3">
                  <dt className="font-medium text-foreground">Tutor + Exam</dt>
                  <dd className="mt-1">Study modes</dd>
                </div>
                <div className="rounded-lg border border-border bg-card px-4 py-3">
                  <dt className="font-medium text-foreground">Bookmarks</dt>
                  <dd className="mt-1">Review misses</dd>
                </div>
                <div className="rounded-lg border border-border bg-card px-4 py-3">
                  <dt className="font-medium text-foreground">Analytics</dt>
                  <dd className="mt-1">Track progress</dd>
                </div>
              </dl>
            </div>

            <div className="lg:col-span-5">
              <Card className="relative overflow-hidden border-border bg-card">
                <div className="p-6">
                  <h2 className="text-sm font-semibold">What you get</h2>
                  <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <li>Board-style multiple-choice questions</li>
                    <li>Detailed rationales and references</li>
                    <li>Filter by difficulty and tags</li>
                    <li>Save and revisit missed questions</li>
                  </ul>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-border bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Everything you need to prep efficiently
              </h2>
              <p className="mt-3 text-muted-foreground">
                Clean workflows, zero fluff. Stay in the question loop and learn
                from every attempt.
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <Card className="border-border bg-card">
                <div className="p-6">
                  <h3 className="font-semibold">High-yield explanations</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Learn the “why”, not just the answer.
                  </p>
                </div>
              </Card>
              <Card className="border-border bg-card">
                <div className="p-6">
                  <h3 className="font-semibold">Smart review</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Bookmark, revisit, and reinforce weak areas.
                  </p>
                </div>
              </Card>
              <Card className="border-border bg-card">
                <div className="p-6">
                  <h3 className="font-semibold">Progress tracking</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    See trends and focus where it matters most.
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Simple pricing
                </h2>
                <p className="mt-3 text-muted-foreground">
                  One subscription unlocks the full question bank and all study
                  modes.
                </p>
              </div>
              <div className="lg:col-span-5">
                <Card className="border-border bg-card">
                  <div className="p-6">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <p className="text-sm font-medium">Monthly</p>
                        <p className="mt-1 text-3xl font-bold">$29</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">Annual</p>
                        <p className="mt-1 text-3xl font-bold">$199</p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">
                      Cancel anytime. No hidden fees.
                    </p>
                    <div className="mt-6">
                      <Button asChild className="w-full">
                        <Link href="/pricing">Compare plans</Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-border bg-muted/30">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 text-sm text-muted-foreground sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <p className="font-medium text-foreground">Addiction Boards</p>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/pricing"
                  className="rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Pricing
                </Link>
                <Link
                  href="/sign-in"
                  className="rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Sign up
                </Link>
              </div>
            </div>
            <p>© Addiction Boards</p>
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
