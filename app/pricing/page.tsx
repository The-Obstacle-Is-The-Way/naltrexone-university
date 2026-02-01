import Link from 'next/link';

export default function PricingPage() {
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
            <Link
              href="/sign-up"
              className="mt-8 block w-full rounded-full bg-orange-600 py-3 text-center text-sm font-medium text-white hover:bg-orange-700"
            >
              Get Started
            </Link>
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
            <Link
              href="/sign-up"
              className="mt-8 block w-full rounded-full bg-orange-600 py-3 text-center text-sm font-medium text-white hover:bg-orange-700"
            >
              Get Started
            </Link>
          </div>
        </div>
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
