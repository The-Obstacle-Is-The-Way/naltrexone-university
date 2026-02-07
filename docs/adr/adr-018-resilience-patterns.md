# ADR-018: Resilience Patterns (Retry and Backoff)

**Status:** Accepted
**Date:** 2026-02-07
**Decision Makers:** Engineering
**Depends On:** ADR-001 (Clean Architecture Layers), ADR-005 (Payment Boundary), ADR-006 (Error Handling Strategy)

---

## Context

The application depends on external services that can experience transient failures:

- **Stripe API** — Rate limits (429), server errors (5xx), network timeouts.
- **Neon Postgres** — Connection resets on serverless cold starts, brief unavailability during maintenance.
- **Clerk API** — Session validation failures during brief outages.

A single transient failure should not cascade into a user-visible error when a simple retry would succeed. However, retries must be bounded and intelligent:

- Unbounded retries can amplify load on a struggling service.
- Retrying non-transient errors (4xx client errors, validation failures) wastes resources.
- Retrying too quickly (no backoff) can trigger rate limiters or worsen congestion.

---

## Decision

### 1. Generic Retry Utility

Defined in `src/adapters/shared/retry.ts`. A general-purpose `retry<T>()` function with:

```typescript
retry(fn, {
  maxAttempts: 3,
  initialDelayMs: 100,
  factor: 2,            // exponential backoff multiplier
  maxDelayMs: 1000,     // cap on delay between retries
  shouldRetry: (error) => boolean,  // predicate
  onRetry: (info) => void,         // observability hook
})
```

**Backoff schedule example** (default Stripe config):
```text
Attempt 1: execute immediately
Attempt 2: wait 100ms, execute
Attempt 3: wait 200ms, execute (100 × 2)
```

The `maxDelayMs` cap prevents exponential growth from producing unreasonable delays.

### 2. Transient Error Detection

The `isTransientExternalError()` function classifies errors as retryable:

| Category | Detection | Examples |
|----------|-----------|---------|
| Network errors | `error.code` matches known codes | `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, `ENOTFOUND`, `ECONNREFUSED`, `EHOSTUNREACH`, `EPIPE` |
| Rate limiting | `statusCode === 429` | Stripe rate limit response |
| Server errors | `statusCode >= 500 && < 600` | Stripe 500/502/503 |

All other errors (400 Bad Request, 401 Unauthorized, 404 Not Found, application-level errors) are **not retried** — they represent permanent failures that retrying cannot fix.

### 3. Stripe-Specific Wrapper

Defined in `src/adapters/gateways/stripe/stripe-retry.ts`. Wraps any Stripe API call with:

```typescript
callStripeWithRetry({
  operation: 'subscriptions.retrieve',
  fn: () => stripe.subscriptions.retrieve(id),
  logger,
})
```

- Uses `isTransientExternalError` as the retry predicate.
- Logs each retry attempt at `warn` level with structured context (operation, attempt, delay, error details).
- Default config: 3 attempts, 100ms initial delay, 2x factor, 1s max delay.

### 4. Observability

Every retry is logged with:
- `operation` — Which API call is being retried.
- `attempt` / `maxAttempts` — Progress through retry budget.
- `delayMs` — How long until the next attempt.
- `error` — Structured error context (name, message, code, statusCode).

This enables monitoring for degraded external services without requiring separate health checks.

### 5. Scope and Boundaries

Retry is applied **only at the adapter boundary** — where our code talks to external services:

```text
Domain      → No retry (pure functions, no I/O)
Application → No retry (orchestration only)
Adapters    → Retry wraps external API calls (Stripe, potentially Clerk)
Framework   → No retry (delegates to adapters)
```

Internal errors (database constraint violations, validation errors, domain errors) are **never retried**. Only external, transient failures qualify.

---

## Consequences

### Positive

- **Transparent recovery** — Transient Stripe failures resolve without user-visible errors.
- **Bounded** — Max 3 attempts with exponential backoff prevents retry storms.
- **Observable** — Every retry is logged with full context for debugging.
- **Selective** — Only transient errors are retried; permanent failures fail fast.
- **Composable** — `retry()` is generic; any adapter can use it with a custom `shouldRetry` predicate.
- **Testable** — Injected `sleep` function allows deterministic testing without real delays.

### Negative

- **Latency increase** — Retried operations take longer (up to ~300ms extra for 3 attempts with backoff).
- **Not a substitute for circuit breaking** — If Stripe is down for minutes, retries still fail after 3 attempts.

### Mitigations

- 1-second max delay bounds worst-case latency.
- 3 attempts is enough for transient blips but fast enough to fail for sustained outages.
- Circuit breaking can be added later if needed (wrap `callStripeWithRetry` with a circuit breaker).
- Webhook retries from Stripe provide a separate, longer-horizon retry mechanism for webhook processing.

---

## Compliance

- `src/adapters/shared/retry.test.ts` covers exponential backoff, max delay clamping, non-retryable errors, exhausted attempts, and injected sleep.
- `isTransientExternalError` has dedicated tests for all error code categories.
- `callStripeWithRetry` is tested via Stripe gateway tests.

---

## References

- `src/adapters/shared/retry.ts` — Generic retry utility and `isTransientExternalError`
- `src/adapters/gateways/stripe/stripe-retry.ts` — Stripe-specific retry wrapper
- ADR-005 (Payment Boundary) — Stripe isolation at adapter layer
- ADR-006 (Error Handling Strategy) — Error classification and propagation
- ADR-008 (Logging & Observability) — Structured logging for retry events
