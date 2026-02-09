'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  APP_NAV_ITEMS,
  getActiveAppNavItemHref,
} from '@/components/app-nav-items';

const focusVisibleRing =
  'focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';

export function AppDesktopNav() {
  const activeHref = getActiveAppNavItemHref(usePathname());

  return (
    <nav
      aria-label="App navigation"
      className="hidden items-center gap-4 text-sm sm:flex"
    >
      {APP_NAV_ITEMS.map((item) => {
        const isActive = activeHref === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? `rounded-md text-foreground font-medium ${focusVisibleRing}`
                : `rounded-md text-muted-foreground transition-colors hover:text-foreground ${focusVisibleRing}`
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
