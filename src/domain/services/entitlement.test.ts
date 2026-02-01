import { describe, expect, it } from 'vitest';
import { createSubscription } from '../test-helpers';
import { isEntitled } from './entitlement';

describe('isEntitled', () => {
  const now = new Date('2026-01-31T12:00:00Z');

  it('returns true for active with future period end', () => {
    const sub = createSubscription({
      status: 'active',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    });
    expect(isEntitled(sub, now)).toBe(true);
  });

  it('returns true for trialing with future period end', () => {
    const sub = createSubscription({
      status: 'trialing',
      currentPeriodEnd: new Date('2026-02-15T00:00:00Z'),
    });
    expect(isEntitled(sub, now)).toBe(true);
  });

  it('returns false for active with expired period', () => {
    const sub = createSubscription({
      status: 'active',
      currentPeriodEnd: new Date('2026-01-15T00:00:00Z'),
    });
    expect(isEntitled(sub, now)).toBe(false);
  });

  it('returns false for canceled status', () => {
    const sub = createSubscription({
      status: 'canceled',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    });
    expect(isEntitled(sub, now)).toBe(false);
  });

  it('returns false for null subscription', () => {
    expect(isEntitled(null, now)).toBe(false);
  });
});
