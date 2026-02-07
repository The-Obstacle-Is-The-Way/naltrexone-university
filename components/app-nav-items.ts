import { ROUTES } from '@/lib/routes';

export type AppNavItem = {
  href: string;
  label: string;
};

export const APP_NAV_ITEMS = [
  { href: ROUTES.APP_DASHBOARD, label: 'Dashboard' },
  { href: ROUTES.APP_PRACTICE, label: 'Practice' },
  { href: ROUTES.APP_REVIEW, label: 'Review' },
  { href: ROUTES.APP_BOOKMARKS, label: 'Bookmarks' },
  { href: ROUTES.APP_BILLING, label: 'Billing' },
] as const satisfies readonly AppNavItem[];
