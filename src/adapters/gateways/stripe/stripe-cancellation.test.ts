import { describe, expect, it } from 'vitest';
import { stripeSubscriptionEndsByPeriodEnd } from './stripe-cancellation';

const periodEnd = 1_790_000_000;

describe('stripeSubscriptionEndsByPeriodEnd', () => {
  it('is true when Stripe sets cancel_at_period_end', () => {
    expect(
      stripeSubscriptionEndsByPeriodEnd({
        cancel_at_period_end: true,
        cancel_at: null,
        current_period_end: periodEnd,
      }),
    ).toBe(true);
  });

  it('is false when no cancellation is scheduled', () => {
    expect(
      stripeSubscriptionEndsByPeriodEnd({
        cancel_at_period_end: false,
        cancel_at: null,
        current_period_end: periodEnd,
      }),
    ).toBe(false);
  });

  it('treats an absent cancel_at as none scheduled', () => {
    expect(
      stripeSubscriptionEndsByPeriodEnd({
        cancel_at_period_end: false,
        current_period_end: periodEnd,
      }),
    ).toBe(false);
  });

  // DEBT-414 F04: the Billing portal schedules a cancellation by setting
  // cancel_at to the period end and leaves cancel_at_period_end false.
  it('is true when cancel_at is the period end, as the Billing portal sets it', () => {
    expect(
      stripeSubscriptionEndsByPeriodEnd({
        cancel_at_period_end: false,
        cancel_at: periodEnd,
        current_period_end: periodEnd,
      }),
    ).toBe(true);
  });

  it('is true when cancel_at falls before the period end', () => {
    expect(
      stripeSubscriptionEndsByPeriodEnd({
        cancel_at_period_end: false,
        cancel_at: periodEnd - 1,
        current_period_end: periodEnd,
      }),
    ).toBe(true);
  });

  it('is false when cancel_at falls after the period end, so it renews first', () => {
    expect(
      stripeSubscriptionEndsByPeriodEnd({
        cancel_at_period_end: false,
        cancel_at: periodEnd + 1,
        current_period_end: periodEnd,
      }),
    ).toBe(false);
  });
});
