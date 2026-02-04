import Link from 'next/link';
import type { ReactNode } from 'react';

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/app/dashboard', label: 'Dashboard' },
  { href: '/app/practice', label: 'Practice' },
  { href: '/app/review', label: 'Review' },
  { href: '/app/bookmarks', label: 'Bookmarks' },
  { href: '/app/billing', label: 'Billing' },
];

export type AppShellProps = {
  children: ReactNode;
  mobileNav?: ReactNode;
  authNav: ReactNode;
  activePath?: string;
};

export function AppShell({
  children,
  mobileNav,
  authNav,
  activePath,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-muted">
      <aside className="hidden w-64 flex-col border-r border-border bg-background sm:flex">
        <div className="px-6 py-5">
          <Link
            href="/app/dashboard"
            className="rounded-md text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Addiction Boards
          </Link>
        </div>
        <nav aria-label="App navigation" className="flex-1 px-3 pb-6">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const normalizedActivePath = activePath?.split('?')[0] ?? null;
              const isActive =
                normalizedActivePath !== null &&
                (normalizedActivePath === item.href ||
                  normalizedActivePath.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    isActive
                      ? 'block rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                      : 'block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative border-b border-border bg-background">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              {mobileNav}
              <Link
                href="/app/dashboard"
                className="rounded-md text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:hidden"
              >
                Addiction Boards
              </Link>
            </div>
            <div className="flex items-center gap-2">{authNav}</div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
