# DEBT-527: Vendor Calls on Request Paths Have No Time Budget, So a Hung Call Outlives Its Request

**Status:** Open — enforce one elapsed-time budget across vendor attempts, backoff and sequential calls; prove cancellation and ambiguous-write recovery through the production SDK path
**Priority:** P3
**Date:** 2026-10-17

---

Corrected 2026-10-17: proved the SDK timeout is idle-based, replaced the stopgap with a total-deadline design, and removed the no-loss guarantee.

## Summary

Each layer that calls Stripe or Clerk decides its own timeout and retries, and none of them knows the request's time limit.

- **Stripe's SDK defaults apply.** The client sets neither `timeout` nor `maxNetworkRetries`, so the SDK retains an 80-second socket-idle timeout and two network retries. That timeout is not a total elapsed-time limit. Our wrapper adds up to three attempts around that, and the circuit breaker counts outages with its own classifier. Repeated retryable 5xx responses can produce nine HTTP requests, reproduced through the real SDK and production retry helper on loopback. The success page skips the wrapper, so its retries never reach the breaker.
- **The request paths cannot wait that long.** The interactive and webhook paths inspected here configure 30-second `maxDuration` values. A stall past that limit can time out before the adapter reports failure or updates the breaker; faster failures can still open it. Hosted termination behavior was not exercised in this review.
- **Clerk has no caller-budget deadline.** `isTransientClerkError` covers transient statuses, network errors and SDK-wrapped transport failures. These lookups have no application deadline or breaker; underlying runtime network timeouts are separate.

DEBT-501 item 1 narrowed the reconcile cron's subscription requests (a 5-second timeout and one network retry). The same function's customer deletes keep the SDK's defaults; DEBT-501 item 1's Budget bullet owns their bound. This record owns interactive and webhook deadlines. DEBT-501 retains the reconcile cron's overall budget, customer-cleanup bounds and recovery coverage; the cron is also an HTTP request path.

## Evidence

**Stripe:**
- `lib/stripe.ts`: `new Stripe(key, { apiVersion, typescript })`, with no timeout or retries.
- SDK 23.0.0's defaults: `node_modules/stripe/cjs/stripe.core.js:102` (`DEFAULT_TIMEOUT = 80000`) and `cjs/platform/PlatformFunctions.js:52-53` (2 network retries).
- Our wrapper: `src/adapters/gateways/stripe/stripe-retry.ts:38-64` wraps calls in `retry` with `DEFAULT_RETRY_OPTIONS` and `isTransientExternalError`. It sits inside a breaker that counts `isStripeOutage` (`:12-20`), which DEBT-501 item 6 narrowed to outages for every call.
- The success page calls the SDK through the generic `retry`, not `callStripeWithRetry` (`app/(marketing)/checkout/success/checkout-success-sync.tsx:205-215,251-258`), so its failures never count toward the breaker. DEBT-524 noted this and closed without placing it; this record owns it.
- `maxDuration = 30` on these inspected interactive/webhook paths:
  - `app/pricing/page.tsx:32`
  - `app/(app)/app/billing/page.tsx:16`
  - `app/(app)/app/layout.tsx:27`
  - `app/(marketing)/checkout/success/page.tsx:22`
  - `app/api/stripe/webhook/route.ts:6`
  - `app/api/webhooks/clerk/route.ts:9`, which wires Stripe customer deletion at :56 (`clerk-webhook-controller.ts:465`)

  Server actions run under the limit of the page that posts them.

**Clerk:**
- `src/adapters/gateways/clerk-auth-gateway.ts:129-132` and `clerk-user-provisioner.ts:132-137` retry on `isTransientClerkError`, without a caller-budget deadline or breaker.
- DEBT-503 item 2 owns the proposed retry/allowance budget; that pending proposal does not impose a deadline.

**Timeout helpers:** three timer-race implementations (`lib/with-timeout.ts:11-16`, `src/adapters/gateways/cooldown-operational-alerts.ts:26-37`, `resend-transactional-email-gateway.ts:82-95`). They differ in error and provider-outcome semantics, and none cancels the losing work. Preserve Resend's ambiguous-result behavior if sharing mechanics. An adapter cannot import the outer `lib` helper. ADR-018 does not specify composition with SDK retries or a total deadline.

**Timeout counterexample:** Stripe 23.0.0 uses `req.setTimeout` (`cjs/net/NodeHttpClient.js:47-49`). A loopback server sending data every 10 ms completed successfully after 164 ms with an SDK timeout of 40 ms. Lowering that setting alone cannot enforce the promised request budget.

**History:**
- DEBT-079.
- BUG-313: Clerk retries missed dropped connections.
- DEBT-501 item 1 (reconcile's subscription requests) and item 6 (the breaker counts only outages, for every call).
- BUG-320 and BUG-332: provisioning retries.
- DEBT-524 (closed): first noted the success page's breaker bypass.

## Impact

A slow vendor request can outlive its configured caller budget, leaving checkout, billing or access reconciliation unresolved. A timed-out mutation may have succeeded remotely before its response was lost. Stripe retries webhook delivery for a finite period, not until success; [its documented live-mode window is up to three days](https://docs.stripe.com/webhooks#automatic-retries). DEBT-501 owns the remaining recovery coverage.

P3 for an established resilience liability without a measured production timeout or data-loss incident. The earlier guarantee that no event or data is at risk was unsupported.

## Options

1. **One absolute deadline across the request's vendor work.** *Recommended.* Establish a monotonic deadline at the request boundary, reserve response/error-mapping time and pass the remaining budget through injected gateway dependencies. One adapter policy accounts for SDK attempts, wrapper attempts, backoff and sequential calls. It stops new work on expiry and cancels in-flight transport work where supported. If the installed SDK cannot cancel, implement and contract-test that transport seam; a timer race is not cancellation.
   - Preserve idempotency keys and existing recovery for unknown mutation outcomes. Keep DEBT-501's outage classifier separate from retry eligibility.
   - The success page uses the shared Stripe adapter/wrapper and breaker. Vendor SDKs stay outside application/domain; the budget contract belongs to the caller, with outward wiring.
   - Apply the same production constructors and deadline rules in tests; no production-only timeout switch. Amend ADR-018 to state the total deadline and retry composition.
2. **A global SDK idle timeout alone.** It limits silence, but the trickling-response probe disproves an elapsed-time guarantee. Retries and sequential operations also accumulate. This may be one setting inside option 1, not a sufficient fix or separate “quick win.”

The SDK's 409/`stripe-should-retry` handling and its exceptional single closed-connection retry even at zero configured network retries must be included when selecting the combined retry policy. Do not add a second retry layer without accounting for those attempts.

## Resolution (proposed)

Option 1 now, red first on the production path. DEBT-528's helper extraction is not a prerequisite. Keep cron budgets and durable recovery with DEBT-501, Clerk request allowance with DEBT-503, and consume those owners' policies here.

## Verification

- [ ] Real SDK calls against a loopback server respect the total budget for silence, trickling bodies, retries, connection closure and sequential calls.
- [ ] Exhaustion prevents new attempts/backoff; in-flight cancellation is proved rather than inferred from a returned timeout.
- [ ] A provider write whose response is lost remains an unknown outcome, preserving its key and recovery behavior.
- [ ] ADR-018 records the combined deadline/retry rules; the success page uses the shared wrapper and breaker.

## Related

- DEBT-501: item 1 did this for reconcile's subscription requests.
- DEBT-503: item 2, Clerk's allowance.
- DEBT-528: the request entry points.
