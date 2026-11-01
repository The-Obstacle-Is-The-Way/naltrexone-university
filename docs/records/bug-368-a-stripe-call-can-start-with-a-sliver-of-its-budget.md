# BUG-368: A Stripe Call Can Start With Only a Sliver of Its Caller's Budget Left

**Status:** Verifying — two weeks of CI after the merge without the call-budget refusal test failing; due 2026-11-07
**Priority:** P3
**Date:** 2026-10-24

---

## Summary

`StripeCallBudget` counted any remainder above zero as usable. But the abort and backoff timers that end an attempt run on a whole-millisecond clock, and they can fire a little *before* `performance.now()` reaches the deadline. The next call, or the retry after a backoff, then saw a sliver of the budget and sent a request with a 1–3-ms timeout instead of being refused. The fix counts a remainder below `STRIPE_MIN_REQUEST_MS` (10 ms) as spent.

## Evidence

- **The failure.** CI run 40050863210 (#1598, 2026-10-24 01:45Z), attempt 1, job 120742997908. `tests/integration/stripe-call-budget.integration.test.ts:210`, "shares the deadline across sequential calls and refuses a third without contacting the server": the third call rejected with `StripeConnectionError` "Request aborted due to timeout being reached" instead of `{ code: 'STRIPE_ERROR' }`. The re-run passed.
  - The message is the SDK's own, and it names the SDK's 10,000-ms setting, not the timeout the transport armed. The transport's refusal raises the same error, so the log cannot tell a doomed request from a refusal.
  - The refusal path is unlikely, though. Between `requireRemainingMs()` and the transport's check, a second agent measured 0.008 ms at p50 and 0.034 ms at p99. So the third call most likely passed both checks with a sliver and sent a doomed request.
- **How often.** It is the only failure of this test in the CI logs held since the test landed (`f392f370`, 2026-10-19), and every local integration run on 2026-10-23 passed it.
- **The code path.**
  - The transport sets each attempt's fetch timeout to `Math.ceil(Math.min(attemptLimitMs, remaining))` (`lib/stripe-budget-http-client.ts`). Stripe's fetch client arms `setTimeout` with it and aborts with `ETIMEDOUT`, which the SDK turns into `StripeConnectionError`.
  - The budget refused only `remaining <= 0`, in `requireRemainingMs()` and in the transport's check before each attempt.
  - The 500-ms retry backoff runs on the same kind of timer, so a call with slightly more than 500 ms left could also reach its retry with a sliver.
- **The skew, measured** by the second agent's script that copies the budget's arithmetic. Timers armed with `Math.ceil(remaining)` fired early:
  - macOS, Node 24.21.0: up to 0.896 ms early. The next call saw a positive remainder 19 times in 3,000, the largest 0.78 ms.
  - Linux, Node 24.22.1 in Docker: up to 1.756 ms and 2.362 ms early in two runs. The next call saw up to 2.327 ms.

## Impact

- **CI.** A required check failed and cost a re-run.
- **The write that might land.** A 1-ms request reaches the server on a warm connection. The second agent sent 200 POSTs with an `Idempotency-Key` through Stripe's 1-ms abort pattern: on reused connections, 200 of 200 reached the server with their full body; on fresh ones, 158 of 200. Stripe's client uses the process-wide `fetch` pool, so in production a doomed request can carry a write that Stripe performs while its response is lost. `customers.create` uses a fixed idempotency key, so a retry recovers it.
- **What the person sees.** A refusal reaches the user as `STRIPE_ERROR`. A raw `StripeConnectionError` falls through to `INTERNAL_ERROR`, "Internal error".
- **The retry path.** A real 5xx was thrown away after a 500-ms backoff that left no usable time, and replaced by a made-up timeout.
- **The circuit breaker.** It already ignores the doomed attempt, since the deadline cut it short. When the circuit is half-open, the attempt holds the single trial slot for its millisecond.

## Options

1. **A minimum usable remainder.** Below `STRIPE_MIN_REQUEST_MS`, the budget counts as spent: `remainingMs()` returns 0, and a backoff or retry decision needs room for the backoff plus that minimum. This removes the doomed request, whatever the timer skew.
2. **Arm the abort timer a millisecond past the deadline.** Rejected: the measured skew reaches 2.4 ms, and it would not cover the backoff path.
3. **Let the test accept either error.** Rejected: it would hide the doomed request this test exists to rule out.

## Resolution (decided)

Option 1, with `STRIPE_MIN_REQUEST_MS = 10`. That is about four times the worst skew measured, far below any real Stripe round trip, and ten times below the smallest budget the integration suite uses.
- `StripeCallBudget.remainingMs()` returns 0 below the minimum. `requireRemainingMs()`, the transport's check before each attempt and the check after a backoff all read it.
- `waitBeforeRetry()` starts a backoff only if the backoff and the minimum both fit.
- The transport retries a retryable response only if the backoff and the minimum both fit; otherwise it returns Stripe's own response.
- Tests, each red before the change:
  - in `src/adapters/gateways/stripe/stripe-call-budget.test.ts`, a remainder below the minimum reads as 0 and is refused, the minimum itself is kept, and a backoff that would leave less than the minimum is not started;
  - in `lib/stripe-budget-http-client.test.ts`, an attempt with less than the minimum left sends no request, and a 503 with too little room for its retry is returned as Stripe's own error after one request.

## Verification

- [x] The new unit and transport tests fail before the change and pass after it (2026-10-24).
- [ ] Two weeks of CI after the merge without the call-budget refusal test failing; due 2026-11-07.

## Related

- DEBT-527: the caller budget this record bounds (closed 2026-10-23).
