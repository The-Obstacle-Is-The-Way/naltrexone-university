# DEBT-345: Circuit Breaker for External Services (Stripe, Clerk)

**Priority:** P3
**Created:** 2026-04-02
**Source:** Performance investigation prompted by production codebase comparison
**Related:** [src/adapters/shared/retry.ts](../../src/adapters/shared/retry.ts), [src/adapters/gateways/stripe/stripe-retry.ts](../../src/adapters/gateways/stripe/stripe-retry.ts), [SPEC-017 Rate Limiting](../specs/spec-017-rate-limiting.md)

---

## Context

The codebase has solid retry logic with exponential backoff (`src/adapters/shared/retry.ts`) and transient error detection (`isTransientExternalError`). Stripe and Clerk API calls are wrapped with `callStripeWithRetry()` and direct `retry()` respectively. Rate limiting is comprehensive (per-endpoint, database-backed).

**What's missing:** a circuit breaker. Retries help with transient blips, but during a sustained outage (Stripe down for 5 minutes), every incoming request still:

1. Attempts the Stripe API call
2. Waits for timeout
3. Retries 2 more times with backoff (up to ~700ms total delay)
4. Finally fails

Multiply by concurrent users and every request is burning time on a service that's known to be down.

---

## The Problem

### Current Behavior During Sustained Stripe Outage

```
Request 1: try Stripe → timeout → retry → timeout → retry → timeout → fail (3 attempts, ~1.8s wasted)
Request 2: try Stripe → timeout → retry → timeout → retry → timeout → fail (same)
Request 3: try Stripe → timeout → retry → timeout → retry → timeout → fail (same)
... (every request repeats this)
```

### Desired Behavior With Circuit Breaker

```
Request 1: try Stripe → fail                          (circuit CLOSED, normal retry)
Request 2: try Stripe → fail                          (2 consecutive failures)
Request 3: try Stripe → fail                          (3 failures → circuit OPENS)
Request 4: circuit OPEN → fail immediately (0ms)      (no Stripe call attempted)
Request 5: circuit OPEN → fail immediately             
... (60 seconds pass)
Request N: circuit HALF-OPEN → try Stripe → success   (circuit CLOSES)
```

### Impact

- **User experience:** Requests fail faster (immediately vs. ~1.8s of retries)
- **Vercel function duration:** Fewer wasted compute seconds during outages
- **Cascading failure prevention:** Database connection pool isn't exhausted by slow external calls
- **Billing accuracy:** Stripe outage doesn't cause Vercel function invocation cost spikes

---

## What Needs a Circuit Breaker

| Service | Risk if Down | Current Protection | Circuit Breaker Value |
|---------|-------------|-------------------|----------------------|
| **Stripe API** | Checkout/portal sessions fail; webhook retries queue | Retry 3x + exponential backoff | HIGH — user-facing checkout path |
| **Clerk API** | Auth fails; `requireUser()` throws | Retry 3x + exponential backoff | MEDIUM — auth failure already handled gracefully |
| **Neon Postgres** | Everything fails | Connection pooling + singleton | LOW — Postgres outage is catastrophic regardless; circuit breaker adds little value |

### Recommendation: Start with Stripe Only

Clerk auth failures are already handled gracefully (redirect to sign-in). Database outages are catastrophic and a circuit breaker doesn't meaningfully help. Stripe is the sweet spot: user-facing, external, and the app can degrade gracefully without it (show "billing temporarily unavailable" instead of hanging).

---

## Proposed Implementation

### Option A: Simple In-Memory Circuit Breaker (Recommended)

```typescript
// src/adapters/shared/circuit-breaker.ts
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly options: {
      failureThreshold: number;  // e.g., 5
      resetTimeoutMs: number;    // e.g., 60_000 (1 minute)
    }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
        this.state = 'half-open';
      } else {
        throw new ApplicationError('STRIPE_ERROR', 'Service temporarily unavailable');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.options.failureThreshold) {
      this.state = 'open';
    }
  }
}
```

**Pros:** Zero dependencies, testable with fakes, fits clean architecture (adapters layer).
**Cons:** Per-process state — on Vercel serverless, each function instance has its own breaker. This is acceptable because Vercel instances are short-lived and the breaker is a performance optimization, not a correctness mechanism.

### Option B: Shared State via Vercel KV (Overkill for Now)

Store circuit state in Vercel KV so all function instances share the same breaker. Only needed if:
- Multiple Vercel regions are active
- Function instances are very short-lived and never accumulate local failure counts

**Not recommended at current scale.**

---

## Integration Point

The circuit breaker wraps the existing retry logic:

```typescript
// src/adapters/gateways/stripe/stripe-retry.ts
const stripeCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
});

export async function callStripeWithRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  options?: Partial<SharedRetryOptions>,
  logger?: Logger,
): Promise<T> {
  return stripeCircuitBreaker.execute(() =>
    retry(fn, {
      ...DEFAULT_RETRY_OPTIONS,
      ...options,
      shouldRetry: isTransientExternalError,
      onRetry: (attempt, error) => { /* existing logging */ },
    })
  );
}
```

---

## Graceful Degradation

When the circuit is open, the app should degrade gracefully:

| Path | Current Behavior | With Circuit Breaker |
|------|-----------------|---------------------|
| Checkout session | Hangs ~1.8s then error | Immediate error: "Billing temporarily unavailable, try again shortly" |
| Portal session | Hangs ~1.8s then error | Immediate error with same message |
| Webhook processing | Retries waste time | Immediate 503 → Stripe retries later (built-in) |

The existing `ApplicationError('STRIPE_ERROR', ...)` code and controller error mapping already handle this — no UI changes needed.

---

## Testing Strategy

- Unit test the `CircuitBreaker` class with `FakeClock` for time control
- Integration: verify `callStripeWithRetry` opens the circuit after N failures
- Verify circuit resets after timeout period
- Verify half-open state allows a single probe request

## Scope

- Stripe API calls only (Clerk and DB not in scope)
- In-memory per-process state (no shared storage)
- No UI changes (existing error handling covers it)
- Adapters layer only (no domain/application changes)

## Estimated Effort

~4-6 hours including implementation, tests, and integration with existing retry wrapper.
