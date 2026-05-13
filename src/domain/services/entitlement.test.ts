import { describe, expect, it } from 'vitest';
import type { Subscription } from '../entities';
import { createSubscription } from '../test-helpers';
import { determineNonEntitledReason, isEntitled } from './entitlement';

describe('isEntitled', () => {
  const now = new Date('2026-01-31T12:00:00Z');

  it('requires now parameter to be explicit', () => {
    // @ts-expect-error isEntitled should require a now parameter for purity.
    const oneArg: (subscription: Subscription | null) => boolean = isEntitled;
    expect(oneArg).toBeTypeOf('function');
  });

  it('returns true for active with future period end', () => {
    const sub = createSubscription({
      status: 'active',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    });
    expect(isEntitled(sub, now)).toBe(true);
  });

  it('returns true for inTrial with future period end', () => {
    const sub = createSubscription({
      status: 'inTrial',
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

  it('returns false when currentPeriodEnd is exactly now', () => {
    const sub = createSubscription({
      status: 'active',
      currentPeriodEnd: now,
    });
    expect(isEntitled(sub, now)).toBe(false);
  });

  it('returns true for pastDue with future period end', () => {
    const sub = createSubscription({
      status: 'pastDue',
      currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    });
    expect(isEntitled(sub, now)).toBe(true);
  });

  it('returns false for pastDue with expired period', () => {
    const sub = createSubscription({
      status: 'pastDue',
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

describe('determineNonEntitledReason', () => {
  it('returns subscription_required when current period is not active', () => {
    expect(determineNonEntitledReason('active', false)).toBe(
      'subscription_required',
    );
  });

  it('returns subscription_canceled when canceled with future period', () => {
    expect(determineNonEntitledReason('canceled', true)).toBe(
      'subscription_canceled',
    );
  });

  it('returns subscription_required when canceled with ended period', () => {
    expect(determineNonEntitledReason('canceled', false)).toBe(
      'subscription_required',
    );
  });

  it('returns payment_processing for paymentProcessing with active period', () => {
    expect(determineNonEntitledReason('paymentProcessing', true)).toBe(
      'payment_processing',
    );
  });

  it('returns subscription_required for paymentFailed with active period', () => {
    expect(determineNonEntitledReason('paymentFailed', true)).toBe(
      'subscription_required',
    );
  });

  it('keeps manage_billing for unpaid with future period', () => {
    expect(determineNonEntitledReason('unpaid', true)).toBe('manage_billing');
  });

  it('keeps manage_billing for paused with future period', () => {
    expect(determineNonEntitledReason('paused', true)).toBe('manage_billing');
  });
});
