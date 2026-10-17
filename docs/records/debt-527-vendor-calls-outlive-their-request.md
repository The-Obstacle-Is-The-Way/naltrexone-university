# DEBT-527: Vendor Calls on Request Paths Have No Time Budget, So a Hung Call Outlives Its Request

**Status:** Open — next, a Stripe client timeout that fits the 30-second request paths, proven through the real SDK; then a budget each caller passes
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Each layer that calls Stripe or Clerk decides its own timeout and retries, and none of them knows the request's time limit.

- **Stripe's SDK defaults apply.** The client sets neither `timeout` nor `maxNetworkRetries`, so each try may run 80 seconds, and the SDK retries twice. Our wrapper adds up to three attempts around that, and the circuit breaker counts outages with its own classifier. One 5xx can become nine HTTP requests.
- **The request paths cannot wait that long.** Every request path that calls Stripe runs under a 30-second `maxDuration`. A hung call is killed with its function long before the SDK's timeout raises, so on these paths a hang never reaches the breaker. The user sees a platform timeout instead of our error.
- **Clerk has no time bound.** `isTransientClerkError` retries 429s with no timeout and no breaker.

DEBT-501 item 1 narrowed the reconcile cron's subscription requests (a 5-second timeout and one network retry). The same function's customer deletes keep the SDK's defaults; DEBT-501 and DEBT-524's Finding 3 already record that. This record covers the request paths.

## Evidence

**Stripe:**
- `lib/stripe.ts`: `new Stripe(key, { apiVersion, typescript })`, with no timeout or retries.
- SDK 23.0.0's defaults: `node_modules/stripe/cjs/stripe.core.js:102` (`DEFAULT_TIMEOUT = 80000`) and `cjs/platform/PlatformFunctions.js:52-53` (2 network retries).
- Our wrapper: `src/adapters/gateways/stripe/stripe-retry.ts:38-64` wraps calls in `retry` with `DEFAULT_RETRY_OPTIONS` and `isTransientExternalError`. It sits inside a breaker that counts `isStripeOutage` (`:12-20`), which DEBT-501 item 6 narrowed to outages for every call.
- `maxDuration = 30` on every request path that calls Stripe:
  - `app/pricing/page.tsx:32`
  - `app/(app)/app/billing/page.tsx:16`
  - `app/(app)/app/layout.tsx:27`
  - `app/(marketing)/checkout/success/page.tsx:22`
  - `app/api/stripe/webhook/route.ts:6`

  Server actions run under the limit of the page that posts them.

**Clerk:**
- `src/adapters/gateways/clerk-auth-gateway.ts:129-132` and `clerk-user-provisioner.ts:132-137` retry on `isTransientClerkError`, with no timeout and no breaker.
- DEBT-503 item 2 counts those retries against Clerk's request allowance; nothing bounds their time.

**Timeout helpers:** three copies of the same `Promise.race` (`lib/with-timeout.ts:11-16`, `src/adapters/gateways/cooldown-operational-alerts.ts:26-37`, `resend-transactional-email-gateway.ts:82-95`). They agree. ADR-018 is silent on the SDK's own retries and on timeouts.

**History:**
- DEBT-079.
- BUG-313: Clerk retries missed dropped connections.
- DEBT-501 item 1 (reconcile's subscription requests) and item 6 (the breaker counts only outages, for every call).
- BUG-320 and BUG-332: provisioning retries.
- DEBT-524: notes that the success page's retry bypasses the breaker.

## Impact

During a slow Stripe incident, pricing, checkout, billing, the webhook and the success page each run to their 30-second limit. The breaker never opens for them, and the logs show a platform timeout rather than our classified error. Stripe retries the webhook, so no event is lost. P3: degraded behavior in an incident, with no data at risk.

## Options

1. **A per-vendor client policy set at construction.**
   - Each caller passes its remaining budget; the client derives the per-try timeout and network retries from it.
   - Our wrapper stops retrying when the budget is spent.
   - ADR-018 gains the rule.

   Design the retry classifiers together with the SDK's retry setting. The SDK retries 409s and `stripe-should-retry` responses that our wrapper does not, and it retries a closed connection once even at zero network retries. So making our wrapper retry connection errors would stack on the SDK's own retries. Item 6 kept the breaker's classifier separate deliberately.
2. **A global Stripe timeout in `lib/stripe.ts`** that fits a 30-second path, keeping the SDK's network retries. This is cheap and fixes the worst case, but it leaves callers with different budgets on one setting.

## Resolution (proposed)

Option 2 first, as a quick win, proven through the real SDK as DEBT-501 item 1 was. Then option 1 when the request entry points are consolidated (DEBT-528).

## Verification

- [ ] A Stripe call on a 30-second path times out within its budget, through the real SDK.
- [ ] ADR-018 states the SDK retry and timeout policy, and how it composes with our retries.

## Related

- DEBT-501: item 1 did this for reconcile's subscription requests.
- DEBT-503: item 2, Clerk's allowance.
- DEBT-528: the request entry points.
