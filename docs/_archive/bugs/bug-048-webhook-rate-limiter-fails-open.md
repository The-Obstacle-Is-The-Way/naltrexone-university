# BUG-048: Webhook Rate Limiter Failures Fail Open

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-03

---

## Description

Both webhook route handlers attempted to rate limit requests, but if the rate
limiter threw (DB outage, unexpected exception), the handler **logged and
continued processing**.

This meant webhook processing could run **without rate limiting** during partial
outages—exactly when defensive controls matter most.

Affected endpoints:
- `POST /api/stripe/webhook`
- `POST /api/webhooks/clerk`

---

## Steps to Reproduce

1. Force `RateLimiter.limit()` to throw (e.g., DB connection failure).
2. Send a valid webhook request.
3. Observe: handler proceeds to verify/process the webhook instead of rejecting.

Regression tests added:
- `app/api/stripe/webhook/route.test.ts` → `returns 503 when rate limiter throws`
- `app/api/webhooks/clerk/route.test.ts` → `returns 503 when rate limiter throws`

---

## Root Cause

In both handlers, the rate limiter call was wrapped in a `try/catch`, but the
`catch` block only logged the error and did not stop execution:

- `app/api/stripe/webhook/handler.ts`
- `app/api/webhooks/clerk/handler.ts`

---

## Fix

Fail closed when rate limiting cannot be enforced:

- On rate limiter exception, log the error and return `503` with a generic
  response `{ error: 'Rate limiter unavailable' }`.
- Do not proceed to signature verification or processing when the limiter fails.

---

## Verification

- [x] Unit test added (Stripe webhook route)
- [x] Unit test added (Clerk webhook route)
- [x] `pnpm test --run`

---

## Related

- `src/adapters/shared/rate-limits.ts` (centralized limits)

