import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTE_PATTERNS } from '@/lib/public-routes';
import { ROUTES } from '@/lib/routes';

describe('PUBLIC_ROUTE_PATTERNS', () => {
  it('does not include any checkout success pattern (DEBT-249 regression guard)', () => {
    expect(
      PUBLIC_ROUTE_PATTERNS.some((pattern) =>
        pattern.startsWith(ROUTES.CHECKOUT_SUCCESS),
      ),
    ).toBe(false);
  });

  it('includes the cron reconcile route so cron auth is enforced at route level', () => {
    expect(PUBLIC_ROUTE_PATTERNS).toContain(
      '/api/cron/reconcile-stripe-subscriptions(.*)',
    );
  });

  it('derives both signed-out legal-page patterns from shared routes', () => {
    expect(PUBLIC_ROUTE_PATTERNS).toContain(`${ROUTES.PRIVACY}(.*)`);
    expect(PUBLIC_ROUTE_PATTERNS).toContain(`${ROUTES.TERMS}(.*)`);
  });
});
