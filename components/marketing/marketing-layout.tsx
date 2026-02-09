import Link from 'next/link';
import type { ReactNode } from 'react';
import { ROUTES } from '@/lib/routes';

export type MarketingLayoutProps = {
  authNav: ReactNode;
  featuresHref: string;
  children: ReactNode;
};

export function MarketingLayout({
  authNav,
  featuresHref,
  children,
}: MarketingLayoutProps) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              href={ROUTES.HOME}
              className="rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              Addiction Boards
            </Link>
            <nav
              aria-label="Marketing navigation"
              className="hidden items-center gap-4 text-sm sm:flex"
            >
              {/* TODO: add a mobile menu so Features/Pricing are reachable on small screens. */}
              <Link
                href={featuresHref}
                className="rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                Features
              </Link>
              <Link
                href={ROUTES.PRICING}
                className="rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                Pricing
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">{authNav}</div>
        </div>
      </header>

      {children}

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <p className="font-semibold text-foreground">Addiction Boards</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Board exam preparation for addiction medicine professionals.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Product</p>
              <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                <Link
                  href={featuresHref}
                  className="rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  Features
                </Link>
                <Link
                  href={ROUTES.PRICING}
                  className="rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
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
                  className="rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  Sign in
                </Link>
                <Link
                  href={ROUTES.SIGN_UP}
                  className="rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
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
    </div>
  );
}
