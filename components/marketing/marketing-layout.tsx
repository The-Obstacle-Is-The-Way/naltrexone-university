import Link from 'next/link';
import { type ReactNode, Suspense } from 'react';
import { AuthNav } from '@/components/auth-nav';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/routes';

export type MarketingLayoutProps = {
  authNavSlot?: ReactNode;
  featuresHref: string;
  children: ReactNode;
};

const marketingNavLinkClass =
  'rounded-md text-muted-foreground transition-colors hover:text-foreground ring-focus';

async function DeferredAuthNav() {
  return <AuthNav />;
}

async function MarketingHeaderPrimaryNav({
  featuresHref,
}: {
  featuresHref: string;
}) {
  'use cache';

  const brandLinkClass =
    'rounded-md text-base font-bold font-heading whitespace-nowrap text-foreground transition-colors hover:text-foreground/80 ring-focus';

  return (
    <div className="flex items-center gap-6">
      <Link href={ROUTES.HOME} className={brandLinkClass}>
        Addiction Boards
      </Link>
      <nav
        aria-label="Marketing navigation (desktop)"
        className="hidden items-center gap-4 text-sm sm:flex"
      >
        <Link href={featuresHref} className={marketingNavLinkClass}>
          Features
        </Link>
        <Link href={ROUTES.PRICING} className={marketingNavLinkClass}>
          Pricing
        </Link>
      </nav>
    </div>
  );
}

async function MarketingHeaderMobileNav({
  featuresHref,
}: {
  featuresHref: string;
}) {
  'use cache';

  return (
    <nav
      aria-label="Marketing navigation (mobile)"
      className="mt-3 flex items-center gap-4 text-sm sm:hidden"
    >
      <Link href={featuresHref} className={marketingNavLinkClass}>
        Features
      </Link>
      <Link href={ROUTES.PRICING} className={marketingNavLinkClass}>
        Pricing
      </Link>
    </nav>
  );
}

async function MarketingFooter({ featuresHref }: { featuresHref: string }) {
  'use cache';

  // Current-time reads must stay inside a cached fragment for static prerenders.
  const currentYear = new Date().toISOString().slice(0, 4);

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-y-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-baseline md:gap-x-8">
          <p className="text-base font-bold font-heading text-foreground md:col-start-1 md:row-start-1">
            Addiction Boards
          </p>
          <p className="text-sm text-muted-foreground md:col-start-1 md:row-start-2">
            Board exam preparation for addiction psychiatry and addiction
            medicine.
          </p>
          <nav
            aria-label="Footer product navigation"
            className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground md:col-start-2 md:row-start-1 md:mt-0 md:justify-end"
          >
            <Link href={featuresHref} className={marketingNavLinkClass}>
              Features
            </Link>
            <Link href={ROUTES.PRICING} className={marketingNavLinkClass}>
              Pricing
            </Link>
            <Link href={ROUTES.SIGN_IN} className={marketingNavLinkClass}>
              Sign in
            </Link>
            <Link href={ROUTES.SIGN_UP} className={marketingNavLinkClass}>
              Sign up
            </Link>
          </nav>
          <nav
            aria-label="Footer legal navigation"
            className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground md:col-start-2 md:row-start-2 md:justify-end"
          >
            <Link href={ROUTES.PRIVACY} className={marketingNavLinkClass}>
              Privacy Policy
            </Link>
            <Link href={ROUTES.TERMS} className={marketingNavLinkClass}>
              Terms of Service
            </Link>
          </nav>
        </div>
        <div className="mt-8 border-t border-border pt-8 text-sm text-muted-foreground">
          <p>&copy; {currentYear} Addiction Boards</p>
        </div>
      </div>
    </footer>
  );
}

export function MarketingAuthNavFallback() {
  return (
    <div className="flex items-center">
      <Button asChild className="rounded-full">
        <Link href={ROUTES.SIGN_IN}>Sign in</Link>
      </Button>
    </div>
  );
}

export async function MarketingLayout({
  authNavSlot,
  featuresHref,
  children,
}: MarketingLayoutProps) {
  const [primaryNav, mobileNav, footer] = await Promise.all([
    MarketingHeaderPrimaryNav({ featuresHref }),
    MarketingHeaderMobileNav({ featuresHref }),
    MarketingFooter({ featuresHref }),
  ]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            {primaryNav}
            <div className="flex items-center gap-2">
              {/* DEBT-421: ThemeToggle unmounted while light mode is disabled. */}
              <Suspense fallback={<MarketingAuthNavFallback />}>
                {authNavSlot ?? <DeferredAuthNav />}
              </Suspense>
            </div>
          </div>

          {mobileNav}
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {children}
      </main>

      {footer}
    </div>
  );
}
