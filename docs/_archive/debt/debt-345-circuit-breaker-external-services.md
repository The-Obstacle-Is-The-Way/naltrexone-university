# DEBT-345: Circuit Breaker for External Services (Stripe First)

**Priority:** P3
**Created:** 2026-04-02
**Status:** Resolved (2026-04-03)
**Source:** Performance investigation prompted by production codebase comparison
**Related:** [ADR-018 Resilience Patterns](../adr/adr-018-resilience-patterns.md), [src/adapters/shared/retry.ts](../../src/adapters/shared/retry.ts), [src/adapters/gateways/stripe/stripe-retry.ts](../../src/adapters/gateways/stripe/stripe-retry.ts), [SPEC-017 Rate Limiting](../specs/spec-017-rate-limiting.md)

---

## Context

The codebase already has solid retry logic with exponential backoff (`src/adapters/shared/retry.ts`) and transient error detection (`isTransientExternalError`). Stripe API calls are generally wrapped with [`callStripeWithRetry`](../../src/adapters/gateways/stripe/stripe-retry.ts), and some auxiliary Stripe paths use direct `retry(...)` with the shared defaults. Clerk also uses the shared retry utility.

**What's missing:** a circuit breaker. Retries help with transient blips, but during a sustained outage every incoming request still keeps attempting upstream calls that are likely to fail.

---

## The Problem

### Current Behavior During Sustained Stripe Outage

```
Request 1: try Stripe -> timeout/fail -> retry -> timeout/fail -> retry -> timeout/fail
Request 2: same pattern
Request 3: same pattern
... every request repeats the full retry budget
```

With the current defaults in [`src/adapters/shared/retry-defaults.ts`](../../src/adapters/shared/retry-defaults.ts), the explicit backoff waits are only **100ms and 200ms**. The bigger cost is the repeated upstream timeout/latency itself. A breaker still matters because it stops re-attempting known-bad upstream calls during an outage window.

### Desired Behavior With Circuit Breaker

```
Request 1: try Stripe -> fail
Request 2: try Stripe -> fail
Request 3: try Stripe -> fail -> circuit opens
Request 4: circuit open -> fail fast
Request 5: circuit open -> fail fast
... reset window passes ...
Request N: half-open probe -> success -> circuit closes
```

### Impact

- **User experience:** checkout/portal flows fail faster once the breaker opens
- **Vercel function duration:** less wasted compute during outages
- **Cascading failure prevention:** fewer concurrent requests waiting on a sick upstream
- **Operational clarity:** outage behavior becomes intentional instead of "retry everywhere and hope"

---

## What Needs a Circuit Breaker

| Service | Risk if Down | Current Protection | Circuit Breaker Value |
|---------|-------------|-------------------|----------------------|
| **Stripe API** | Checkout/portal flows fail; webhook normalization may need live subscription fetches | Retry 3x + exponential backoff | HIGH |
| **Clerk API** | Auth lookup fails | Retry 3x + exponential backoff | MEDIUM |
| **Neon Postgres** | Core app unavailable | Connection reuse + database availability | LOW |

### Recommendation: Start with Stripe Only

Clerk auth failures are already routed through auth handling paths, and database outages are catastrophic regardless. Stripe is the best first target because it is user-facing, external, and already isolated behind adapter-level wrappers.

---

## Proposed Implementation

### Option A: Simple In-Memory Circuit Breaker (Recommended First Pass)

```typescript
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly options: {
      failureThreshold: number;
      resetTimeoutMs: number;
    },
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
        this.state = 'half-open';
      } else {
        throw new ApplicationError(
          'STRIPE_ERROR',
          'Stripe temporarily unavailable',
        );
      }
    }

    try {
      const result = await fn();
      this.failures = 0;
      this.state = 'closed';
      return result;
    } catch (error) {
      this.failures += 1;
      this.lastFailureTime = Date.now();
      if (this.failures >= this.options.failureThreshold) {
        this.state = 'open';
      }
      throw error;
    }
  }
}
```

**Pros:** zero dependencies, fits the adapters boundary, easy to test.

**Cons:** per-process state. On Vercel, each warm instance will track its own failures. That is acceptable for a first pass because this is a resilience/performance optimization, not a correctness mechanism.

### Option B: Shared State via External Store

Use shared breaker state only if later production behavior shows per-instance breakers are too fragmented.

**Not recommended now.**

---

## Integration Point

Wrap the shared Stripe retry entry points rather than sprinkling breaker logic across controllers:

```typescript
const stripeCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
});

export function callStripeWithRetry<T>(...) {
  return stripeCircuitBreaker.execute(() =>
    retry(fn, {
      ...DEFAULT_RETRY_OPTIONS,
      shouldRetry: isTransientExternalError,
      onRetry: ...
    }),
  );
}
```

Also apply the same wrapper to auxiliary direct-retry Stripe paths such as [`src/adapters/gateways/stripe-subscription-canceler.ts`](../../src/adapters/gateways/stripe-subscription-canceler.ts), so reconciliation/cancellation jobs do not bypass the breaker.

---

## Graceful Degradation

| Path | Current Behavior | With Circuit Breaker |
|------|-----------------|---------------------|
| Checkout session | Repeats Stripe call until retry budget is exhausted | Fast failure once circuit is open |
| Portal session | Same | Fast failure once circuit is open |
| Webhook subscription fetch | Repeats outbound Stripe call during outage | Fail fast and let Stripe retry delivery later |

User-facing checkout/portal flows already surface Stripe failures through existing error handling. Webhook handling may keep using `500` for retryable failures, or it can grow an explicit breaker-specific `503` mapping later.

## Testing Strategy

- Unit test the `CircuitBreaker` class with controlled time
- Integration: verify `callStripeWithRetry` opens the circuit after N failures
- Verify circuit resets after the timeout period
- Verify half-open state allows one probe request

## Scope

- Stripe API calls first
- In-memory per-process state
- Minimal controller error handling changes only if webhook responses need a distinct breaker status
- Adapters layer first; no domain/application changes

## Estimated Effort

~4-6 hours including implementation, tests, and integration with the existing retry wrapper.
