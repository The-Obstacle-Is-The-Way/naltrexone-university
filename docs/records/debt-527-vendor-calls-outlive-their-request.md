# DEBT-527: Vendor Calls on Request Paths Have No Time Budget, So a Hung Call Outlives Its Request

**Status:** Verifying — promotion to main; due 2026-10-21
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

At baseline `134b0578`, each layer that called Stripe or Clerk decided its own timeout and retries, and none knew the request's time limit. The shared client now has a per-attempt limit, and interactive and webhook Stripe callers share the deadline described under Resolution. The Clerk observation below remains outside this Stripe resolution.

- **Stripe's SDK defaults applied.** The client set neither `timeout` nor `maxNetworkRetries`, so the SDK kept an 80-second socket-idle timeout and two network retries. That timeout is not a total elapsed-time limit. Our wrapper adds up to three attempts around that, and the circuit breaker counts outages with its own classifier. Repeated retryable 5xx responses can produce nine HTTP requests, reproduced through the real SDK and production retry helper on loopback. The success page skips the wrapper, so its retries never reach the breaker.
- **The request paths cannot wait that long.** The interactive and webhook paths inspected here configure 30-second `maxDuration` values. A stall past that limit can time out before the adapter reports failure or updates the breaker; faster failures can still open it. Hosted termination behavior was not exercised.
- **Clerk has no caller-budget deadline.** `isTransientClerkError` covers transient statuses, network errors and SDK-wrapped transport failures. These lookups have no application deadline or breaker; underlying runtime network timeouts are separate.

DEBT-501 item 1 narrowed the reconcile cron's subscription requests (a 5-second timeout and one network retry). The same function's customer deletes kept the SDK's defaults until step 1; they now get the shared per-try limit, still not bound to the remaining cleanup time, which DEBT-501 item 1's Budget bullet owns. This record owns interactive and webhook deadlines. DEBT-501 retains the reconcile cron's overall budget, customer-cleanup bounds and recovery coverage; the cron is also an HTTP request path.

## Evidence

These receipts describe baseline `134b0578`, before the shared transport limit.

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
  - `app/api/webhooks/clerk/route.ts:9`, which wires Stripe customer deletion at :58 (`clerk-webhook-controller.ts:465`)

  Server actions run under the limit of the page that posts them.

**Clerk:**
- `src/adapters/gateways/clerk-auth-gateway.ts:129-132` and `clerk-user-provisioner.ts:132-137` retry on `isTransientClerkError`, without a caller-budget deadline or breaker.
- DEBT-503 item 2 owns the proposed retry/allowance budget, and with it a caller deadline for these retries; it waits for its trigger.

**Timeout helpers:** three timer-race implementations (`lib/with-timeout.ts:11-16`, `src/adapters/gateways/cooldown-operational-alerts.ts:26-37`, `resend-transactional-email-gateway.ts:82-95`). They differ in error and provider-outcome semantics, and none cancels the losing work. Preserve Resend's ambiguous-result behavior if sharing mechanics. An adapter cannot import the outer `lib` helper. ADR-018 does not specify composition with SDK retries or a total deadline.

**The SDK's two clients time out differently:**
- The default Node client uses `req.setTimeout` (`cjs/net/NodeHttpClient.js:47-49`), an idle limit. A loopback server sending data every 10 ms completed after 164 ms under a 40 ms timeout.
- The fetch client, `Stripe.createFetchHttpClient()`, arms an `AbortController` timer that stays armed through the body (`cjs/net/FetchHttpClient.js:77-118`). The same trickle was aborted at 43 ms.
- `timeout` and `maxNetworkRetries` can also be set per request (`esm/lib.d.ts:128-132`).

**History:**
- DEBT-079.
- BUG-313: Clerk retries missed dropped connections.
- DEBT-501 item 1 (reconcile's subscription requests) and item 6 (the breaker counts only outages, for every call).
- BUG-320 and BUG-332: provisioning retries.
- DEBT-524 (closed): first noted the success page's breaker bypass.

## Impact

A slow vendor request can outlive its configured caller budget, leaving checkout, billing or access reconciliation unresolved. A timed-out mutation may have succeeded remotely before its response was lost. Stripe retries webhook delivery for a finite period, not until success; [its documented live-mode window is up to three days](https://docs.stripe.com/webhooks#automatic-retries). DEBT-501 owns the remaining recovery coverage.

P3: a resilience liability, with no measured production timeout or data loss.

## Options

1. **One absolute deadline across the request's vendor work.** *Recommended end state.* Establish a monotonic deadline at the request boundary, reserve response/error-mapping time and pass the remaining budget through injected gateway dependencies. One adapter policy accounts for SDK attempts, wrapper attempts, backoff and sequential calls. It stops new work on expiry and cancels in-flight transport work where supported. The fetch client aborts on wall-clock time, but its per-request `timeout` is reused on each SDK attempt. The caller deadline must also control retry scheduling and cancellation; a timer race in our code is not cancellation.
   - Preserve idempotency keys and existing recovery for unknown mutation outcomes. Keep DEBT-501's outage classifier separate from retry eligibility.
   - The success page uses the shared Stripe adapter/wrapper and breaker. Vendor SDKs stay outside application/domain; the budget contract belongs to the caller, with outward wiring.
   - Apply the same production constructors and deadline rules in tests; no production-only timeout switch. Amend ADR-018 to state the total deadline and retry composition.
2. **A shared per-attempt limit first.** *Recommended first step.* Give the shared client the fetch client, with an explicit ten-second attempt limit and one SDK retry. The caller deadline must still bound the combined retries. It bounds each attempt, not retries or sequential calls, so option 1 still follows. DEBT-501 item 1 already bounds the cron's subscription requests per request (`app/api/cron/reconcile-stripe-subscriptions/route.ts:20-23`).

The SDK's 409/`stripe-should-retry` handling and its exceptional single closed-connection retry even at zero configured network retries must be included when selecting the combined retry policy. Do not add a second retry layer without accounting for those attempts.

## Resolution

Options 2 and 1 are built: one caller deadline controls attempts, backoff and sequential calls. Budgeted calls have one retry owner, and the SDK fetch transport cancels in-flight work when the deadline expires. A 25-second monotonic budget is created once per request and passed through gateway dependencies. Each attempt gets the smaller of ten seconds and the remaining budget. One transport retry may follow a 500-ms backoff only when that delay fits. The SDK and outer wrapper add no retries on this path. The request client refuses per-call SDK retry overrides before provider work, and no per-call timeout can raise the attempt limit. The fetch transport aborts silence and trickling bodies; retryable bodies are canceled before backoff. The success page uses the same client, budget, wrapper and breaker. A refused call after exhaustion starts no provider work and does not count a new outage. The unbudgeted shared client retains its ten-second attempt limit and one SDK retry. DEBT-528 is not a prerequisite. Keep cron budgets and durable recovery with DEBT-501, Clerk request allowance with DEBT-503, and consume those owners' policies here.

Passing the remaining time once as the SDK request timeout would not enforce a total budget. `RequestSender.js:416-423` reuses that value on every attempt, and `:413-415` schedules its own backoff. A loopback call with a 100-ms request timeout and one SDK retry took 711 ms. The total budget must own retries as well as transport cancellation.

The first step is built in `lib/stripe-client.ts`, with `getStripe` using the same factory tested on loopback: a ten-second fetch timeout and one SDK retry. One retry retains the SDK's 409 and retry-header recovery. A pre-header timeout can use two tries and 500 ms of backoff, 20.5 seconds, inside the 30-second request limit; this is not a caller-wide deadline.

Why ten seconds: a try cut off while Stripe is still processing a write fails even if Stripe completes it, and its same-key retry meets a 409 while the first is in flight, so a short limit turns a slow but working checkout into an error. The limit is a backstop against hangs, so it sits well above Stripe's normal latency. Before the caller budget tightens any limit, measure Stripe's latency per operation from the server's traces. Per-request overrides remain authoritative on unbudgeted callers, including the reconcile cron. ADR-018 records the transport and retry composition.

The per-attempt loopback suite proves transport cancellation, six rather than nine requests for repeated retryable 500s, caller overrides, and preserved write keys. Six cases fail against the original constructor configuration. The singleton wiring test also fails against that configuration. The same tests pass with the shared transport limits.

The per-attempt limit alone does not bound combined retries; only a pre-header timeout can use both SDK attempts; a response-body timeout ends after one. Repeated 5xx responses can reach six requests through the unbudgeted wrapper, while 409 reaches two. `stripe-client-timeout.integration.test.ts` proves both distinctions.

The caller-budget suite proves silence, trickling bodies, retries, connection closure, sequential calls, and cancellation observed by the loopback server. A lost write response remains an unknown outcome; a later request keeps the same key and recovers the accepted write. The shared fake/provider contract's first case already proves that a repeat with the unchanged key returns the accepted Session. No commercial rule changes.

## Verification

- [x] The shared client's per-attempt limit holds through the real SDK on a loopback server, for stalled, trickling and 5xx responses.
- [x] A call Stripe answers in four seconds completes under the production limit (`stripe-client-timeout.integration.test.ts`).
- [x] Real SDK calls against a loopback server respect the total budget for silence, trickling bodies, retries, connection closure and sequential calls.
- [x] Exhaustion prevents new attempts/backoff; in-flight cancellation is proved rather than inferred from a returned timeout.
- [x] A provider write whose response is lost remains an unknown outcome, preserving its key and recovery behavior.
- [x] ADR-018 records the combined deadline/retry rules; the success page uses the shared wrapper and breaker.

- [ ] Promote the fix to main.

## Related

- DEBT-501: item 1 did this for reconcile's subscription requests.
- DEBT-503: item 2, Clerk's allowance.
- DEBT-528: the request entry points.
