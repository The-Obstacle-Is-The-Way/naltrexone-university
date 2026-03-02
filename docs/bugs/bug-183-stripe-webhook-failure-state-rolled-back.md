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
2. On error, code does `await stripeEvents.markFailed(...)` then `throw error` at [stripe-webhook-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/controllers/stripe-webhook-controller.ts:104).
3. Controller wiring uses real DB transaction in [lib/container/controllers.ts](/Users/ray/Desktop/github/naltrexone-university-1/lib/container/controllers.ts:24), so rethrow rolls back transaction.
4. Spec explicitly requires persisted failure state (`error` set, `processed_at` null) at [master_spec.md](/Users/ray/Desktop/github/naltrexone-university-1/docs/specs/master_spec.md:734), but rollback prevents that durability.

---

## Fix

Not fixed yet.

Proposed fix direction:
1. Keep claim/lock/work in transaction, but persist `markFailed` in a separate post-rollback transaction boundary.
2. Add a regression test that uses rollback semantics (not a non-transactional fake wrapper) to verify failed state durability.

---

## Verification

How was the fix verified?

- [ ] Unit test added
- [ ] Integration test added
- [x] Manual verification

