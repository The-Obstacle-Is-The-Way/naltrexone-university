/**
 * Shared rate limit configuration used at route/controller boundaries.
 *
 * Rationale:
 * - Centralize operational limits (avoid scattered magic numbers).
 * - Keep limits consistent across entry points.
 * - Make it easy to tune in one place.
 */

export const ONE_MINUTE_MS = 60_000;

export const STRIPE_WEBHOOK_RATE_LIMIT = {
  limit: 1000,
  windowMs: ONE_MINUTE_MS,
} as const;

export const CLERK_WEBHOOK_RATE_LIMIT = {
  limit: 100,
  windowMs: ONE_MINUTE_MS,
} as const;

export const CHECKOUT_SESSION_RATE_LIMIT = {
  limit: 10,
  windowMs: ONE_MINUTE_MS,
} as const;

export const SUBMIT_ANSWER_RATE_LIMIT = {
  limit: 120,
  windowMs: ONE_MINUTE_MS,
} as const;

export const START_PRACTICE_SESSION_RATE_LIMIT = {
  limit: 20,
  windowMs: ONE_MINUTE_MS,
} as const;

export const BOOKMARK_MUTATION_RATE_LIMIT = {
  limit: 60,
  windowMs: ONE_MINUTE_MS,
} as const;
