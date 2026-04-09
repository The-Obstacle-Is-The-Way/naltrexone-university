# BUG-183: Stripe Webhook Failure State Is Rolled Back

**Status:** Resolved
**Priority:** P2
**Date:** 2026-03-02
**Resolved:** 2026-03-02 (PR #163)

---

## Description

`processStripeWebhook` previously marked an event failed inside the transaction callback and then threw from inside that same callback. Under real transaction semantics, callback rejection triggers rollback, which can undo both claim and `markFailed` writes.

Observed pre-fix behavior:
- On processing failure, failure state could be lost (`processedAt` stayed null and `error` did not persist) because the transaction rolled back.

Expected behavior:
- Failed webhook events must persist durable failure state for idempotency and diagnostics.

---

## Steps to Reproduce

1. Trigger a Stripe webhook where processing fails after claim/lock (for example, `subscriptions.upsert` throws).
2. Observe `processStripeWebhook` catches, calls `markFailed`, then rethrows from inside the transaction callback.
3. Transaction rolls back and removes the failure update.

Executable verification performed on 2026-03-02:
1. Rollback-aware harness forced `subscriptions.upsert` to throw.
2. Pre-fix result: event failure state was not durable after callback rejection.

---

## Root Cause

Tracer-bullet path:
1. Webhook processing runs inside a transaction callback at [stripe-webhook-controller.ts](../../../src/adapters/controllers/stripe-webhook-controller.ts#L67).
2. Transaction wiring uses Drizzle `db.transaction(...)` at [controllers.ts](../../../lib/container/controllers.ts#L24), which rolls back on callback rejection.
3. Pre-fix behavior rejected the callback after failure marking, so claim/mark updates were rolled back together.
4. Spec requires durable failed-event state (`error` persisted, `processedAt` null) at [master_spec.md](../../specs/master_spec.md#L734).

---

## Fix (TDD)

Fixed.

### Red — failing test added first

Added rollback-aware regression in [stripe-webhook-controller.test.ts](../../../src/adapters/controllers/stripe-webhook-controller.test.ts#L393):

- `it('persists failure state even when the transaction would rollback on throw', ...)`

This test uses a rollback-capable transaction harness and failed before the transaction result-shape fix.

### Green — minimum code change

Restructured transaction outcome handling in [stripe-webhook-controller.ts](../../../src/adapters/controllers/stripe-webhook-controller.ts#L30):

- Added `StripeWebhookTxResult = { ok: true } | { ok: false; error: unknown }`.
- Inside transaction callback, failures call `markFailed(...)` and `return { ok: false, error }` at [stripe-webhook-controller.ts](../../../src/adapters/controllers/stripe-webhook-controller.ts#L112).
- Outside transaction, controller rethrows if `!txResult.ok` at [stripe-webhook-controller.ts](../../../src/adapters/controllers/stripe-webhook-controller.ts#L118).

This ensures the transaction callback resolves (commit path) after `markFailed`, then preserves external 500 behavior by throwing after commit.

### Refactor

Hardened rollback harness ergonomics by using fake repository state APIs instead of internal map access:

- [fake-stripe-event-repository.ts](../../../src/application/test-helpers/fakes/fake-stripe-event-repository.ts)
- [fake-subscription-repository.ts](../../../src/application/test-helpers/fakes/fake-subscription-repository.ts)
- [fake-stripe-customer-repository.ts](../../../src/application/test-helpers/fakes/fake-stripe-customer-repository.ts)
- [fakes.test.ts](../../../src/application/test-helpers/fakes.test.ts)

---

## Verification

- [x] Rollback-aware regression test added and passing.
- [x] Existing failure-path test still passes with durable error state (`processedAt: null`, `error: string`).
- [x] Gate run: `pnpm typecheck && pnpm lint && pnpm test --run`.
