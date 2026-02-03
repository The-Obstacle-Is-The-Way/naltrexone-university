# DEBT-078: No Idempotency Keys on State-Changing Actions

**Status:** Resolved
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

See the working implementation (canonical source of truth):

- `src/adapters/shared/with-idempotency.ts`
- `src/application/ports/repositories.ts` (`IdempotencyKeyRepository`)
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts`
- `db/schema.ts` (`idempotency_keys`)

### Option 2: Stripe's built-in idempotency

```typescript
// For Stripe operations only
// IMPORTANT: the idempotency key must be stable for the same logical action.
// Do NOT use Date.now() or random values here.
const idempotencyKey = '<uuid-from-client>'; // stable across retries
const session = await stripe.checkout.sessions.create(
  { ...params },
  { idempotencyKey: `checkout:${userId}:${idempotencyKey}` }
);
```

See "Client-Side Coordination" below for how clients generate and pass stable keys.

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

**Key lifetime:** This pattern creates a per-form-instance key (prevents double-clicks during a single render). If you need per-logical-operation idempotency (same key after refresh/navigation), persist the key in URL params, sessionStorage, or server-side state.

---

## Resolution

We implemented **database-backed idempotency keys** (no vendor-specific dependency) and applied them to high-risk state changes:

- Database: `db/schema.ts` + migration adds `idempotency_keys` (composite PK: `user_id + action + key`) with TTL via `expires_at`.
- Port + adapter:
  - `src/application/ports/repositories.ts`: `IdempotencyKeyRepository`
  - `src/adapters/repositories/drizzle-idempotency-key-repository.ts`: Drizzle/Postgres implementation
  - `src/adapters/shared/with-idempotency.ts`: claim/execute/store + in-progress polling behavior
- Controllers now accept optional `idempotencyKey` and reuse results on retry:
  - `src/adapters/controllers/billing-controller.ts` (`billing:createCheckoutSession`)
  - `src/adapters/controllers/question-controller.ts` (`question:submitAnswer`)
  - `src/adapters/controllers/practice-controller.ts` (`practice:startPracticeSession`)
- Client coordination:
  - Pricing subscribe forms include a stable hidden `idempotencyKey` per render.
  - Question + practice pages generate a UUID per-question (and per session-start attempt) and pass it through to controllers.

## Verification

- [x] Checkout session creation is idempotent per user/key/action
- [x] Answer submission is idempotent per user/key/action (prevents duplicate attempts)
- [x] Practice session creation is idempotent per user/key/action (prevents duplicate sessions)
- [x] Keys are TTL-bound (default 24h) and tested

## Related

- BUG-047: Multiple subscriptions created per user
- Stripe Idempotent Requests: https://stripe.com/docs/api/idempotent_requests
- AWS Best Practices: Idempotency in Serverless
