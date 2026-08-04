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
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-bold font-heading text-foreground">
              Addiction Boards
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Board exam preparation for addiction medicine professionals.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground md:justify-end">
            <Link href={featuresHref} className={marketingNavLinkClass}>
              Features
            </Link>
            <Link href={ROUTES.PRICING} className={marketingNavLinkClass}>
              Pricing
            </Link>
            <Link href={ROUTES.PRIVACY} className={marketingNavLinkClass}>
              Privacy Policy
            </Link>
            <Link href={ROUTES.TERMS} className={marketingNavLinkClass}>
              Terms of Service
            </Link>
            <Link href={ROUTES.SIGN_IN} className={marketingNavLinkClass}>
              Sign in
            </Link>
            <Link href={ROUTES.SIGN_UP} className={marketingNavLinkClass}>
              Sign up
            </Link>
          </div>
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
