'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAV_ITEMS } from '@/components/app-nav-items';

const focusVisibleRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function normalizePathname(pathname: string | null): string | null {
  if (!pathname) return null;
  return pathname.split(/[?#]/)[0] ?? null;
}

function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppDesktopNav() {
  const pathname = normalizePathname(usePathname());

  return (
    <nav
      aria-label="App navigation"
      className="hidden items-center gap-4 text-sm sm:flex"
    >
      {APP_NAV_ITEMS.map((item) => {
        const isActive = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? `rounded-md text-foreground font-medium ${focusVisibleRing}`
                : `rounded-md text-muted-foreground hover:text-foreground ${focusVisibleRing}`
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
