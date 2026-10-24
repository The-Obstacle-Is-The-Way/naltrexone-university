import { describe, expect, it, vi } from 'vitest';
import { STRIPE_MIN_REQUEST_MS, StripeCallBudget } from './stripe-call-budget';

describe('StripeCallBudget', () => {
  it('uses one monotonic deadline across calls', () => {
    let now = 10;
    const budget = new StripeCallBudget(100, () => now);
    expect(budget.remainingMs()).toBe(100);
    now = 90;
    expect(budget.remainingMs()).toBe(20);
    now = 110;
    expect(() => budget.requireRemainingMs()).toThrow(
      'Stripe caller deadline exhausted',
    );
  });

  // BUG-368: a timer can fire a fraction of a millisecond before the
  // deadline, leaving a remainder no request can use.
  it('counts a remainder too short for any Stripe request as spent', () => {
    let now = 0;
    const budget = new StripeCallBudget(1_000, () => now);
    now = 1_000 - STRIPE_MIN_REQUEST_MS + 0.5;
    expect(budget.remainingMs()).toBe(0);
    expect(() => budget.requireRemainingMs()).toThrow(
      'Stripe caller deadline exhausted',
    );
  });

  it('keeps a remainder of exactly the minimum usable', () => {
    let now = 0;
    const budget = new StripeCallBudget(1_000, () => now);
    now = 1_000 - STRIPE_MIN_REQUEST_MS;
    expect(budget.remainingMs()).toBe(STRIPE_MIN_REQUEST_MS);
  });

  it('starts no backoff that would leave less than a usable remainder', async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const budget = new StripeCallBudget(1_000, () => now);
      now = 1_000 - (500 + STRIPE_MIN_REQUEST_MS) + 0.5;
      const waited = budget.waitBeforeRetry(500);
      expect(vi.getTimerCount()).toBe(0);
      expect(await waited).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts no backoff after exhaustion or when it cannot fit', async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const budget = new StripeCallBudget(100, () => now);
      expect(await budget.waitBeforeRetry(500)).toBe(false);
      now = 100;
      expect(await budget.waitBeforeRetry(1)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses the next attempt if scheduling consumed the remaining budget', async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const budget = new StripeCallBudget(1_000, () => now);
      const ready = budget.waitBeforeRetry(500);
      now = 1_001;
      await vi.advanceTimersByTimeAsync(500);
      expect(await ready).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
