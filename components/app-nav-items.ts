export type AppNavItem = {
  href: string;
  label: string;
};

export const APP_NAV_ITEMS = [
  { href: '/app/dashboard', label: 'Dashboard' },
  { href: '/app/practice', label: 'Practice' },
  { href: '/app/review', label: 'Review' },
  { href: '/app/bookmarks', label: 'Bookmarks' },
  { href: '/app/billing', label: 'Billing' },
] as const satisfies readonly AppNavItem[];
