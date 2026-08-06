import { describe, expect, it } from 'vitest';
import { toConsumerReference } from './consumer-reference';

describe('toConsumerReference', () => {
  it('returns a stable lowercase SHA-256 reference without exposing the Stripe customer id', () => {
    const reference = toConsumerReference('cus_renewal_123');

    expect(reference).toBe(
      'd4d8bd4d28988a305c96bfe8a34f8566ab79814fedd65a2310668347b03db392',
    );
    expect(reference).not.toContain('cus_renewal_123');
  });
});
