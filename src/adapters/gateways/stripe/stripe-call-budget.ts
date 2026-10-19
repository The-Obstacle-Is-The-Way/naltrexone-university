import { ApplicationError } from '@/src/application/errors';

// Request routes have 30 seconds; leave five seconds for persistence and response.
export const STRIPE_CALLER_BUDGET_MS = 25_000;

export class StripeCallBudget {
  private readonly deadline: number;

  constructor(
    durationMs = STRIPE_CALLER_BUDGET_MS,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.deadline = now() + durationMs;
  }

  remainingMs(): number {
    return Math.max(0, this.deadline - this.now());
  }

  requireRemainingMs(): number {
    const remaining = this.remainingMs();
    if (remaining <= 0) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe caller deadline exhausted',
      );
    }
    return remaining;
  }

  async waitBeforeRetry(
    delayMs: number,
    beforeWait?: () => void,
  ): Promise<boolean> {
    if (this.remainingMs() <= delayMs) return false;
    beforeWait?.();
    if (this.remainingMs() <= delayMs) return false;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return this.remainingMs() > 0;
  }
}
