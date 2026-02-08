import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/lib/routes';
import { APP_NAV_ITEMS } from './app-nav-items';

describe('components/app-nav-items', () => {
  it('defines app navigation items in canonical order with route constants', () => {
    expect(APP_NAV_ITEMS).toEqual([
      { href: ROUTES.APP_DASHBOARD, label: 'Dashboard' },
      { href: ROUTES.APP_PRACTICE, label: 'Practice' },
      { href: ROUTES.APP_REVIEW, label: 'Review' },
      { href: ROUTES.APP_BOOKMARKS, label: 'Bookmarks' },
      { href: ROUTES.APP_BILLING, label: 'Billing' },
    ]);
  });
});
