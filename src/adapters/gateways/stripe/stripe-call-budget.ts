import { ApplicationError } from '@/src/application/errors';

// Request routes have 30 seconds; leave five seconds for persistence and response.
export const STRIPE_CALLER_BUDGET_MS = 25_000;
// The budgeted transport's one retry waits this long first.
export const STRIPE_RETRY_BACKOFF_MS = 500;

export class StripeCallBudget {
  private readonly deadline: number;
  private deadlineLimits = 0;

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

  /**
   * The transport records a call the deadline cut short: its first attempt
   * got less than the attempt limit, or the deadline refused an attempt or
   * the retry's backoff.
   */
  recordDeadlineLimit(): void {
    this.deadlineLimits += 1;
  }

  /**
   * Starts a call. The returned check says whether a failure of this call is
   * the caller's deadline, not the provider: the deadline cut it short and
   * left less than one retry backoff (DEBT-527 review).
   */
  startCall(): () => boolean {
    const limitsBefore = this.deadlineLimits;
    return () =>
      this.deadlineLimits > limitsBefore &&
      this.remainingMs() <= STRIPE_RETRY_BACKOFF_MS;
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
