import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTE_PATTERNS } from '@/lib/public-routes';

describe('PUBLIC_ROUTE_PATTERNS', () => {
  it('includes the Stripe checkout success callback route', () => {
    expect(PUBLIC_ROUTE_PATTERNS).toContain('/checkout/success(.*)');
  });
});
