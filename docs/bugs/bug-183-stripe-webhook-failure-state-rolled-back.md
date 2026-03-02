# BUG-183: Stripe Webhook Failure State Is Rolled Back

**Status:** Open
**Priority:** P2
**Date:** 2026-03-02

---

## Description

`processStripeWebhook` marks event failure inside the same DB transaction and then rethrows. In production transaction semantics, that rollback removes both the original claim and the `markFailed` update, so failed events are not persisted with error state.

Observed behavior:
- On processing failure, `stripe_events` can end up with no durable failed record (`processed_at=null`, `error=<...>` is lost).

Expected behavior:
- Failed webhook attempts should persist failure state for idempotency and diagnostics.

---

## Steps to Reproduce

1. Trigger a Stripe webhook event where subscription upsert fails after claim/lock.
2. `processStripeWebhook` catches, calls `markFailed`, and rethrows.
3. Outer transaction rolls back, removing the failure update.

Executable verification performed on 2026-03-02:
1. Repro harness executed `processStripeWebhook` with a rollback-capable transaction wrapper and forced `subscriptions.upsert` to throw.
2. After rejection, stored event state was `null` (claim + failure mark were both rolled back).

---

## Root Cause

Tracer-bullet path:
1. Main webhook work runs inside transaction at [stripe-webhook-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/controllers/stripe-webhook-controller.ts:65).
2. On error, catch block calls `markFailed` at [stripe-webhook-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/controllers/stripe-webhook-controller.ts:105) then rethrows at [stripe-webhook-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/controllers/stripe-webhook-controller.ts:106).
3. The rethrown error causes the transaction callback to reject. Controller wiring at [lib/container/controllers.ts](/Users/ray/Desktop/github/naltrexone-university-1/lib/container/controllers.ts:24) uses `primitives.db.transaction(...)` (Drizzle), which rolls back the entire transaction on rejection — undoing both `claim` and `markFailed`.
4. Spec explicitly requires persisted failure state (`error` set, `processed_at` null) at [master_spec.md](/Users/ray/Desktop/github/naltrexone-university-1/docs/specs/master_spec.md:734), but rollback prevents that durability.

---

## Fix (TDD)

Not fixed yet.

### Red — write the failing test first

The existing unit tests use `FakeStripeEventRepository` which is non-transactional (writes persist regardless of throw). The failing test must use rollback-capable semantics:

```typescript
it('persists failure state even when processing throws', async () => {
  // Arrange: a transaction wrapper that actually rolls back on rejection
  //   (e.g., track writes in a staging area, discard on throw)
  // Inject subscriptions.upsert that throws after claim succeeds
  // Act: await processStripeWebhook(deps, input)  — expect rejection
  // Assert: stripeEvents still has the event with error set and processed_at null
});
```

This test must FAIL before the fix — confirming that markFailed is rolled back.

### Green — minimum code to pass

Restructure `processStripeWebhook` so failure is persisted **inside a committed transaction**, then rethrow **after** commit:

```typescript
const txResult = await deps.transaction(
  async ({ stripeEvents, subscriptions, stripeCustomers }) => {
    // claim, lock, process
    try {
      // existing processing logic
      await stripeEvents.markProcessed(event.eventId);
      return { ok: true as const };
    } catch (error) {
      await stripeEvents.markFailed(event.eventId, toErrorData(error));
      return { ok: false as const, error };
    }
  },
);

if (!txResult.ok) {
  throw txResult.error;
}
```

Why this shape is required:

- If you move `markFailed` to an outer catch while leaving `claim` inside the failed transaction, the rollback can remove the claimed row first; the outer `markFailed` then hits `NOT_FOUND`.
- Returning `{ ok: false, error }` from inside the transaction callback avoids rollback, so both `claim` and `markFailed` persist durably.
- Throwing after the transaction preserves the route's 500 behavior.

Alternative valid approach (more invasive): claim outside the processing transaction, then mark failed in a second transaction on error.

### Refactor

Extract a small internal result type/helper for transaction outcome:

```typescript
type StripeWebhookTxResult =
  | { ok: true }
  | { ok: false; error: unknown };

function rethrowIfFailed(result: StripeWebhookTxResult): void {
  if (!result.ok) throw result.error;
}
```

This removes nested control flow while keeping rollback behavior explicit.

---

## Verification

- [ ] Unit test added (Red phase test above — requires rollback-capable test harness)
- [ ] Manual verification post-fix
