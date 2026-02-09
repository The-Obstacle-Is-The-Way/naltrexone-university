import { describe, expect, it } from 'vitest';
import {
  APP_NAV_ITEMS,
  getActiveAppNavItemHref,
} from '@/components/app-nav-items';
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

describe('getActiveAppNavItemHref', () => {
  it('returns null for null pathname', () => {
    expect(getActiveAppNavItemHref(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getActiveAppNavItemHref('')).toBeNull();
  });

  it('returns exact match href', () => {
    expect(getActiveAppNavItemHref(ROUTES.APP_DASHBOARD)).toBe(
      ROUTES.APP_DASHBOARD,
    );
  });

  it('returns longest matching href for nested route', () => {
    expect(getActiveAppNavItemHref(ROUTES.APP_PRACTICE_QUICK)).toBe(
      ROUTES.APP_PRACTICE_QUICK,
    );
  });

  it('matches parent route for unknown child path', () => {
    expect(getActiveAppNavItemHref('/app/practice/some-session-id')).toBe(
      ROUTES.APP_PRACTICE,
    );
  });

  it('strips query string before matching', () => {
    expect(getActiveAppNavItemHref('/app/dashboard?tab=1')).toBe(
      ROUTES.APP_DASHBOARD,
    );
  });

  it('strips hash fragment before matching', () => {
    expect(getActiveAppNavItemHref('/app/dashboard#section')).toBe(
      ROUTES.APP_DASHBOARD,
    );
  });

  it('strips both query and hash before matching', () => {
    expect(getActiveAppNavItemHref('/app/review?page=2#top')).toBe(
      ROUTES.APP_REVIEW,
    );
  });

  it('returns null for unrecognized path', () => {
    expect(getActiveAppNavItemHref('/unknown')).toBeNull();
  });

  it('returns null for partial prefix that is not a path boundary', () => {
    // '/app/dashboardextra' should NOT match '/app/dashboard'
    expect(getActiveAppNavItemHref('/app/dashboardextra')).toBeNull();
  });
});
