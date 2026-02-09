import { ROUTES } from '@/lib/routes';

export type AppNavItem = {
  href: string;
  label: string;
};

export const APP_NAV_ITEMS = [
  { href: ROUTES.APP_DASHBOARD, label: 'Dashboard' },
  { href: ROUTES.APP_PRACTICE, label: 'Practice' },
  { href: ROUTES.APP_PRACTICE_QUICK, label: 'Quick Practice' },
  { href: ROUTES.APP_REVIEW, label: 'Review' },
  { href: ROUTES.APP_BOOKMARKS, label: 'Bookmarks' },
  { href: ROUTES.APP_BILLING, label: 'Billing' },
] as const satisfies readonly AppNavItem[];

function normalizePathname(pathname: string | null): string | null {
  if (!pathname) return null;
  return pathname.split(/[?#]/)[0] ?? null;
}

export function getActiveAppNavItemHref(
  pathname: string | null,
): string | null {
  const normalizedPathname = normalizePathname(pathname);
  if (!normalizedPathname) return null;

  let bestMatchHref: string | null = null;

  for (const item of APP_NAV_ITEMS) {
    const matches =
      normalizedPathname === item.href ||
      normalizedPathname.startsWith(`${item.href}/`);

    if (!matches) continue;

    if (!bestMatchHref || item.href.length > bestMatchHref.length) {
      bestMatchHref = item.href;
    }
  }

  return bestMatchHref;
}
