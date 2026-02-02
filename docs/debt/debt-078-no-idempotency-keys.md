# DEBT-078: No Idempotency Keys on State-Changing Actions

**Status:** Open
**Priority:** P1
**Date:** 2026-02-02

---

## Description

State-changing operations (create subscription, submit answer, create checkout) have no idempotency protection. Double-clicks, network retries, or race conditions can create duplicates.

**BUG-047 (multiple subscriptions per user) was a direct result of this gap.**

## Current State

```typescript
// billing-controller.ts
async function createCheckoutSession(d: BillingControllerDeps) {
  // No idempotency key
  // If user double-clicks, two requests race
  const stripeCustomerId = await getOrCreateStripeCustomerId(d, {...});
  // Both could pass the "no existing subscription" check
  const session = await d.paymentGateway.createCheckoutSession({...});
}
```

## What Idempotency Keys Do

1. **Client generates unique key** per logical operation
2. **Server checks** if key was seen before
3. **If seen** — return cached result, don't re-execute
4. **If new** — execute, store result with key

## Implementation Options

### Option 1: Database-backed (recommended)

```typescript
// idempotency-repository.ts
interface IdempotencyKey {
  key: string;
  userId: string;
  action: string;
  result: unknown;
  createdAt: Date;
  expiresAt: Date;
}

async function withIdempotency<T>(
  key: string,
  userId: string,
  action: string,
  fn: () => Promise<T>
): Promise<T> {
  const existing = await idempotencyRepo.find(key);
  if (existing) {
    return existing.result as T;
  }

  const result = await fn();
  await idempotencyRepo.save({ key, userId, action, result, expiresAt: addHours(24) });
  return result;
}
```

### Option 2: Stripe's built-in idempotency

```typescript
// For Stripe operations only
const session = await stripe.checkout.sessions.create(
  { ...params },
  { idempotencyKey: `checkout:${userId}:${Date.now()}` }
);
```

## Where to Apply

| Action | Risk Without Idempotency |
|--------|--------------------------|
| `createCheckoutSession` | Duplicate subscriptions |
| `submitAnswer` | Duplicate attempts recorded |
| `createPracticeSession` | Duplicate sessions |
| `addBookmark` | Already idempotent (upsert) ✓ |

## Client-Side Coordination

```typescript
// In React form
const [idempotencyKey] = useState(() => crypto.randomUUID());

async function handleSubmit() {
  await createCheckoutSession({ idempotencyKey });
}
```

## Verification

- [ ] All state-changing server actions accept idempotency key
- [ ] Duplicate requests return same result
- [ ] Keys expire after 24 hours
- [ ] Race condition test: fire 10 concurrent requests, assert 1 result

## Related

- BUG-047: Multiple subscriptions created per user
- Stripe Idempotent Requests: https://stripe.com/docs/api/idempotent_requests
- AWS Best Practices: Idempotency in Serverless
