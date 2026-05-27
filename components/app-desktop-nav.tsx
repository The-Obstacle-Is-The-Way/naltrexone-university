'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  APP_NAV_ITEMS,
  getActiveAppNavItemHref,
} from '@/components/app-nav-items';

export function AppDesktopNav() {
  const activeHref = getActiveAppNavItemHref(usePathname());

  return (
    <nav
      aria-label="App navigation"
      className="hidden items-center gap-4 text-sm md:flex"
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
                ? 'rounded-md whitespace-nowrap text-foreground font-medium ring-focus'
                : 'rounded-md whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground ring-focus'
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
