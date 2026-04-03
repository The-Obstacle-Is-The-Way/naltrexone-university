import Link from 'next/link';
import { type ReactNode, Suspense } from 'react';
import { AuthNav } from '@/components/auth-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/routes';

export type MarketingLayoutProps = {
  authNavSlot?: ReactNode;
  featuresHref: string;
  children: ReactNode;
};

const marketingNavLinkClass =
  'rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';

async function DeferredAuthNav() {
  return AuthNav();
}

async function MarketingHeaderPrimaryNav({
  featuresHref,
}: {
  featuresHref: string;
}) {
  'use cache';

  const brandLinkClass =
    'rounded-md text-base font-bold font-heading whitespace-nowrap text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';

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

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="font-bold font-heading text-foreground">
              Addiction Boards
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Board exam preparation for addiction medicine professionals.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Product</p>
            <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href={featuresHref} className={marketingNavLinkClass}>
                Features
              </Link>
              <Link href={ROUTES.PRICING} className={marketingNavLinkClass}>
                Pricing
              </Link>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Account</p>
            <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href={ROUTES.SIGN_IN} className={marketingNavLinkClass}>
                Sign in
              </Link>
              <Link href={ROUTES.SIGN_UP} className={marketingNavLinkClass}>
                Sign up
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-8 border-t border-border pt-8 text-sm text-muted-foreground">
          <p>&copy; {new Date().toISOString().slice(0, 4)} Addiction Boards</p>
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
              <ThemeToggle />
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
