import { ApplicationError } from '@/src/application/errors';

// Request routes have 30 seconds; leave five seconds for persistence and response.
export const STRIPE_CALLER_BUDGET_MS = 25_000;
// The budgeted transport's one retry waits this long first.
export const STRIPE_RETRY_BACKOFF_MS = 500;
// BUG-368: an abort or backoff timer can fire up to about 2.5 ms before
// performance.now() reaches its time, leaving a sliver that no request can use
// and that would arm a doomed one. A remainder below this counts as spent; it
// is far below any real Stripe round trip.
export const STRIPE_MIN_REQUEST_MS = 10;

export class StripeCallBudget {
  private readonly deadline: number;
  private deadlineLimits = 0;

  constructor(
    durationMs = STRIPE_CALLER_BUDGET_MS,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.deadline = now() + durationMs;
  }

  /**
   * The time a request can still use. An attempt's abort timer runs on a
   * whole-millisecond clock, so it can fire a fraction of a millisecond before
   * the deadline; that fraction counts as none, not as a doomed request.
   */
  remainingMs(): number {
    const remaining = this.deadline - this.now();
    return remaining < STRIPE_MIN_REQUEST_MS ? 0 : remaining;
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
    // The retry after the backoff needs a usable remainder of its own.
    if (this.remainingMs() <= delayMs + STRIPE_MIN_REQUEST_MS) return false;
    beforeWait?.();
    if (this.remainingMs() <= delayMs + STRIPE_MIN_REQUEST_MS) return false;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return this.remainingMs() > 0;
  }
}
