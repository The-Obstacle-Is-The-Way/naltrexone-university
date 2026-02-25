import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTE_PATTERNS } from '@/lib/public-routes';

describe('PUBLIC_ROUTE_PATTERNS', () => {
  it('does not include any checkout success pattern (DEBT-249 regression guard)', () => {
    expect(
      PUBLIC_ROUTE_PATTERNS.some((pattern) =>
        pattern.startsWith('/checkout/success'),
      ),
    ).toBe(false);
  });

  it('includes the cron reconcile route so cron auth is enforced at route level', () => {
    expect(PUBLIC_ROUTE_PATTERNS).toContain(
      '/api/cron/reconcile-stripe-subscriptions(.*)',
    );
  });
});
