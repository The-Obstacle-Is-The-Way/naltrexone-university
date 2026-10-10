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

// BUG-323: requests that make Clerk's SDK call Clerk's Backend API, whose
// limit every signed-in page shares. A real person sends very few, so the
// per-address limit leaves a shared hospital address untouched. A refresh is
// also limited per session, since Clerk refreshes only a genuine one. The
// site-wide cap bounds the total whatever the number of addresses, at about a
// sixth of Clerk's production limit (1,000 per 10 seconds): high enough that
// tripping it takes many addresses, low enough to keep most of the allowance
// for signed-in pages.
export const CLERK_BACKEND_CALL_RATE_LIMIT = {
  limit: 30,
  windowMs: ONE_MINUTE_MS,
} as const;

export const CLERK_BACKEND_CALL_SESSION_RATE_LIMIT = {
  limit: 6,
  windowMs: ONE_MINUTE_MS,
} as const;

export const CLERK_BACKEND_CALL_SITE_RATE_LIMIT = {
  limit: 1000,
  windowMs: ONE_MINUTE_MS,
} as const;

// DEBT-503 item 3: Clerk's middleware refreshes and resolves handshakes
// itself, and some of those calls fail for ordinary reasons, such as a session
// that ended elsewhere or a reused handshake nonce. Past this many in a
// minute, across the site, Clerk is refusing or failing them: far above what a
// pre-launch site's ended sessions produce, and far below the hundreds a
// spent allowance fails. Item 4's measurements retune it.
export const CLERK_BACKEND_CALL_FAILURE_ALERT_THRESHOLD = {
  limit: 10,
  windowMs: ONE_MINUTE_MS,
} as const;

// DEBT-503 item 5: a session token whose signature fails is a forgery, or,
// when CLERK_JWT_KEY is not Clerk's signing key, every signed-in request. A
// visitor signed out that way signs in again and fails again, so even one
// active visitor passes this; forgeries alone rarely do.
export const CLERK_SESSION_TOKEN_REJECTED_ALERT_THRESHOLD = {
  limit: 3,
  windowMs: ONE_MINUTE_MS,
} as const;

// BUG-325: each checkout-success visit costs a Clerk user lookup and a Stripe
// call. A buyer lands there once or twice, so ten a minute per signed-in user
// leaves real visits untouched.
export const CHECKOUT_SUCCESS_RATE_LIMIT = {
  limit: 10,
  windowMs: ONE_MINUTE_MS,
} as const;

export const CLERK_WEBHOOK_RATE_LIMIT = {
  limit: 100,
  windowMs: ONE_MINUTE_MS,
} as const;

// DEBT-414 F07: Resend's delivery reports, one per sent email and outcome.
export const RESEND_WEBHOOK_RATE_LIMIT = {
  limit: 100,
  windowMs: ONE_MINUTE_MS,
} as const;

export const CHECKOUT_SESSION_RATE_LIMIT = {
  limit: 10,
  windowMs: ONE_MINUTE_MS,
} as const;

export const PORTAL_SESSION_RATE_LIMIT = {
  limit: 20,
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

export const PRACTICE_SESSION_MUTATION_RATE_LIMIT = {
  limit: 60,
  windowMs: ONE_MINUTE_MS,
} as const;

export const EXAM_DRAFT_SAVE_RATE_LIMIT = {
  limit: 120,
  windowMs: ONE_MINUTE_MS,
} as const;

export const BOOKMARK_MUTATION_RATE_LIMIT = {
  limit: 60,
  windowMs: ONE_MINUTE_MS,
} as const;

export const QUESTION_RATING_RATE_LIMIT = {
  limit: 60,
  windowMs: ONE_MINUTE_MS,
} as const;

export const QUESTION_REPORT_RATE_LIMIT = {
  limit: 10,
  windowMs: ONE_MINUTE_MS,
} as const;

export const HEALTH_CHECK_RATE_LIMIT = {
  limit: 600,
  windowMs: ONE_MINUTE_MS,
} as const;

export const CRON_RECONCILE_STRIPE_SUBSCRIPTIONS_RATE_LIMIT = {
  limit: 5,
  windowMs: ONE_MINUTE_MS,
} as const;

export const CRON_SEND_RENEWAL_NOTICES_RATE_LIMIT = {
  limit: 5,
  windowMs: ONE_MINUTE_MS,
} as const;
