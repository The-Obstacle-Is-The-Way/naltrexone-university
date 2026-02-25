import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTE_PATTERNS } from '@/lib/public-routes';

describe('PUBLIC_ROUTE_PATTERNS', () => {
  it('does not include the Stripe checkout success callback route', () => {
    expect(PUBLIC_ROUTE_PATTERNS).not.toContain('/checkout/success(.*)');
  });

  it('explicitly keeps checkout success protected in middleware matching', () => {
    const hasCheckoutSuccessMatcher = PUBLIC_ROUTE_PATTERNS.some(
      (pattern) => pattern === '/checkout/success(.*)',
    );

    expect(hasCheckoutSuccessMatcher).toBe(false);
  });

  it('includes the cron reconcile route so cron auth is enforced at route level', () => {
    expect(PUBLIC_ROUTE_PATTERNS).toContain(
      '/api/cron/reconcile-stripe-subscriptions(.*)',
    );
  });
});
