import { describe, expect, it, vi } from 'vitest';
import { StripeCallBudget } from './stripe-call-budget';

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
