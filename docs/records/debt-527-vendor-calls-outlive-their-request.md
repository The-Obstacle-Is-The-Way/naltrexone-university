# DEBT-527: Vendor Calls on Request Paths Have No Time Budget, So a Hung Call Outlives Its Request

**Status:** Open — give each vendor client a timeout and retry budget derived from its caller, and one classifier shared by retry and breaker
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Each layer that calls Stripe or Clerk decides its own timeout and retries, and none of them knows the request's time limit.

- **Stripe.** The SDK client sets neither `timeout` nor `maxNetworkRetries`, so Stripe's defaults apply: an 80-second timeout per try and two network retries. Our wrapper adds up to three attempts around that, and the circuit breaker counts outages with a third classifier. One 5xx can become nine HTTP requests.
- **The request paths.** They run under a 30-second `maxDuration`. A hung Stripe call is killed with its function long before the SDK's timeout raises. So on request paths a hang never reaches the breaker, and the user sees a platform timeout instead of our error.
- **Clerk.** `isTransientClerkError` retries 429s with no timeout and no breaker.
- **Timeout helpers.** Three separate copies of the same `Promise.race` exist, beside an `AbortSignal.timeout`.

DEBT-501 item 1 fixed this for the reconcile cron only (a 5-second timeout and one network retry). This record covers every other caller.

## Evidence

**Stripe:**
- `lib/stripe.ts`: `new Stripe(key, { apiVersion, typescript })`, with no timeout or retries.
- SDK 23.0.0's defaults: `node_modules/stripe/cjs/stripe.core.js:102` sets `DEFAULT_TIMEOUT = 80000`; `cjs/platform/PlatformFunctions.js:52-53` returns 2 default network retries.
- Our layers:
  - `src/adapters/gateways/stripe/stripe-retry.ts:38-64` wraps calls in `retry` with `DEFAULT_RETRY_OPTIONS` and `isTransientExternalError`, inside a breaker that counts `isStripeOutage` (`:12-20`).
  - The reconcile route alone narrows the client (`app/api/cron/reconcile-stripe-subscriptions/route.ts`, `limitStripeSubscriptionRequests`; DEBT-501 item 1).
- The limits on the request paths:
  - `maxDuration = 30`: `app/pricing/page.tsx:32`, `app/api/stripe/webhook/route.ts:6` and `app/(marketing)/checkout/success/page.tsx:22`.
  - The billing page and the server actions inherit the platform default.

**Clerk:**
- `src/adapters/gateways/clerk-auth-gateway.ts:129-132` and `clerk-user-provisioner.ts:132-137` retry on `isTransientClerkError`, with no timeout and no breaker.
- DEBT-503 item 2 names the missing retry budget.

**Timeout helpers:**
- Three copies of the same race: `lib/with-timeout.ts:11-16`, `src/adapters/gateways/cooldown-operational-alerts.ts:26-37` and `resend-transactional-email-gateway.ts:82-95`.
- `github-scheduled-workflows.ts` uses `AbortSignal.timeout`.
- They agree. ADR-018 is silent on the SDK's own retries and on timeouts.

**History:** DEBT-079; BUG-313 (Clerk retries missed dropped connections); DEBT-501 items 1 and 6 (timeout and breaker, cron only); BUG-320 and BUG-332 (provisioning retries); DEBT-524's note that the success page's retry bypasses the breaker.

## Impact

During a slow Stripe incident, pricing, checkout, the webhook and the success page each run to their function limit. The breaker never opens for them, and the logs show a platform timeout rather than our classified error. Stripe retries the webhook, so no event is lost. P3: degraded behavior in an incident, with no data at risk.

## Options

1. **A per-vendor client policy set at construction.**
   - Each caller passes its remaining budget. The client derives the per-try timeout and network retries from it, and our wrapper stops retrying when the budget is spent.
   - One classifier serves both retry and breaker.
   - One `withTimeout` helper replaces the three copies.
   - ADR-018 gains the rule.

   *Recommended.*
2. **Set a global Stripe timeout and `maxNetworkRetries: 0` in `lib/stripe.ts`.** This is cheap and fixes the worst case. It leaves callers with different budgets on one setting.

## Resolution (proposed)

Option 2 first, as a quick win: a real-SDK test, like DEBT-501 item 1's, proves the timeout reaches each request. Then option 1 when the request entry points are consolidated (DEBT-528).

## Verification

- [ ] A Stripe call on a 30-second path times out within its budget, through the real SDK.
- [ ] Retry and breaker share one classifier; there is one timeout helper.
- [ ] ADR-018 states the SDK retry and timeout policy.

## Related

- DEBT-501: item 1 did this for the reconcile cron.
- DEBT-503: item 2, Clerk's retry budget.
- DEBT-528: the request entry points.
