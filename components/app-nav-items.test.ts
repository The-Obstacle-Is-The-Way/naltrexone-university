import { describe, expect, it } from 'vitest';
import { APP_NAV_ITEMS } from '@/components/app-nav-items';
import { ROUTES } from '@/lib/routes';

describe('components/app-nav-items', () => {
  it('defines app navigation items with the expected route order', () => {
    expect(APP_NAV_ITEMS).toHaveLength(6);
    expect(APP_NAV_ITEMS.map((item) => item.href)).toEqual([
      ROUTES.APP_DASHBOARD,
      ROUTES.APP_PRACTICE,
      ROUTES.APP_PRACTICE_QUICK,
      ROUTES.APP_REVIEW,
      ROUTES.APP_BOOKMARKS,
      ROUTES.APP_BILLING,
    ]);
    for (const item of APP_NAV_ITEMS) {
      expect(typeof item.label).toBe('string');
      expect(item.label.length).toBeGreaterThan(0);
    }
  });
});
