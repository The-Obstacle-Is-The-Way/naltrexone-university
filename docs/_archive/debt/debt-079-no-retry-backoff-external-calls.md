# DEBT-079: No Retry/Backoff Logic for External API Calls

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02

---

## Description

External API calls to Stripe and Clerk have no retry logic. A transient network error results in immediate failure to the user, even though retrying would likely succeed.

## Current State

```typescript
// stripe-payment-gateway.ts:202
const session = await this.deps.stripe.checkout.sessions.create({...});
// If network blip occurs → exception → user sees error
```

```typescript
// clerk-auth-gateway.ts
const user = await clerkClient.users.getUser(clerkUserId);
// If Clerk is slow → timeout → user sees error
```

## Impact

- **User frustration** — "Checkout failed" when Stripe had a 100ms blip
- **Lost revenue** — User abandons checkout instead of retrying
- **False alerts** — Monitoring sees errors that would self-heal

## What Best Practice Looks Like

```typescript
import { retry } from '@lifeomic/attempt';

async function createCheckoutSession(input: CheckoutSessionInput) {
  return retry(
    () => this.deps.stripe.checkout.sessions.create({...}),
    {
      maxAttempts: 3,
      delay: 100,
      factor: 2,  // Exponential: 100ms, 200ms, 400ms
      handleError: (error, context) => {
        if (!isTransientError(error)) {
          context.abort();  // Don't retry 401 Unauthorized
        }
      },
    }
  );
}

function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    // Network errors, timeouts, 5xx
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code)
      || (error.status >= 500 && error.status < 600);
  }
  return false;
}
```

## Where to Apply

| Call | Retry? | Notes |
|------|--------|-------|
| `stripe.checkout.sessions.create` | Yes | Transient network errors |
| `stripe.subscriptions.cancel` | Yes | Critical user action |
| `stripe.webhooks.constructEvent` | No | Signature check, no network |
| `clerkClient.users.getUser` | Yes | Read operation |
| Database queries | Maybe | Only for serialization conflicts |

## Circuit Breaker (Advanced)

For repeated failures, stop trying entirely:

```typescript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
});

await circuitBreaker.execute(() => stripe.checkout.sessions.create({...}));
// After 5 failures in 30s, circuit opens and fast-fails
```

## Libraries

- `@lifeomic/attempt` — Simple retry with backoff
- `cockatiel` — Full resilience (retry, circuit breaker, timeout, bulkhead)
- `p-retry` — Promise-based retry

## Resolution

We implemented a small internal retry helper and applied it at the integration boundaries (where transient vendor failures occur):

- Retry helper:
  - `src/adapters/shared/retry.ts` + `src/adapters/shared/retry.test.ts`
  - Exponential backoff (`maxAttempts=3`, `100ms`, factor `2`)
  - Retries only transient errors (network codes + 5xx)
- Stripe:
  - `src/adapters/gateways/stripe-payment-gateway.ts` wraps Stripe SDK calls with retry
  - Uses Stripe idempotency keys for write calls when an `idempotencyKey` is available
- Clerk:
  - `src/adapters/gateways/clerk-auth-gateway.ts` retries transient failures from `getClerkUser()`
- Checkout success:
  - `app/(marketing)/checkout/success/page.tsx` retries Stripe retrieval calls for session/subscription
- Clerk webhook cleanup:
  - `app/api/webhooks/clerk/route.ts` retries Stripe subscription list/cancel (cancel uses idempotency keys)

## Verification

- [x] External API calls have retry wrappers (Stripe + Clerk)
- [x] Transient errors retry; non-transient errors fail fast
- [x] Retry attempts are logged where a logger is available
- [x] Total backoff stays within user patience (~<1s of delays across 3 attempts)

## Related

- Netflix Hystrix pattern
- AWS SDK built-in retry behavior
- Stripe recommends retry with exponential backoff
