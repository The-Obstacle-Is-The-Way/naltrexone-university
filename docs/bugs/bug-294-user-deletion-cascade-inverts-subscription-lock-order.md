# BUG-294: The User-Deletion `ON DELETE CASCADE` Is a Fourth Subscription Writer Hard-Wired to the Inverse Lock Order (40P01)

**Status:** Open
**Severity:** P3
**Date:** 2026-07-11
**Confirmed:** 2026-07-11 (wave-1 close adversarial regression review; **reproduced on real Postgres** — two concurrent sessions following the exact code sequences produced `40P01`)
**Component:** Clerk webhook / account deletion / Stripe billing

---

## Summary

The BUG-286 fix (PR #626) established the canonical subscription-writer lock order — advisory(user) → `stripe_subscriptions` → `stripe_customers` — for the three explicit coordinators (Stripe webhook, checkout-success eager sync, reconcile Phase 4). But there is a fourth writer nobody enumerated: the Clerk `user.deleted` flow's `userRepository.deleteByClerkId` ([clerk-webhook-controller.ts#L386](../../src/adapters/controllers/clerk-webhook-controller.ts#L386), plus the tombstone-race delete at [#L342](../../src/adapters/controllers/clerk-webhook-controller.ts#L342)) issues `DELETE FROM users`, whose `ON DELETE CASCADE` fires in FK-creation order — `stripe_customers` **before** `stripe_subscriptions` ([0000_jazzy_vermin.sql#L111-L112](../../db/migrations/0000_jazzy_vermin.sql#L111); confirmed empirically via the RI trigger ordering) — while holding **no advisory lock**. That is exactly the inverse of the canonical order, and the cascade's order cannot be changed in application code.

A concurrent subscription writer for the same user (webhook, checkout-success, or reconcile) takes the advisory lock, locks `stripe_subscriptions`, then requests the `stripe_customers` row the cascade already holds — an AB-BA cycle. Reproduced on the per-clone real-Postgres test DB: the webhook-shaped session aborted with `deadlock detected ... while inserting index tuple in relation "stripe_customers"` (`40P01`) while the deletion committed.

## Reachability

A Clerk `user.deleted` transaction must interleave with an in-flight subscription webhook, checkout-success sync, or reconcile Phase 4 for the same user who still holds a `stripe_subscriptions` row. The window is the milliseconds between the two paths' lock acquisitions, but the trigger is realistic: account deletion concurrent with a renewal/cancellation event or the daily reconcile run. Note the deletion path's only advisory lock (`deletedClerkUsers.lock`, `hashtextextended(clerkUserId, 0)`) uses a different hash function and identifier space than the subscription writers' `hashtext(<local userId UUID>)`, so the two never serialize — the DEBT-454 hashtext divergence made concrete.

## Reproduction

1. Session A (deletion path, per [clerk-webhook-controller.ts#L377-L386](../../src/adapters/controllers/clerk-webhook-controller.ts#L377)): `SELECT users ... FOR UPDATE` → `DELETE FROM users` — the cascade acquires `stripe_customers` row locks, then reaches for `stripe_subscriptions`.
2. Session B (subscription writer, per [stripe-webhook-controller.ts#L166-L181](../../src/adapters/controllers/stripe-webhook-controller.ts#L166) → [drizzle-subscription-repository.ts#L82-L89](../../src/adapters/repositories/drizzle-subscription-repository.ts#L82)): `pg_advisory_xact_lock(hashtext(userId))` → `SELECT stripe_subscriptions FOR UPDATE` → `INSERT stripe_customers ON CONFLICT (user_id) DO UPDATE`, which blocks on A's row lock while B holds the subscription row A's cascade needs.
3. PostgreSQL's deadlock detector aborts one victim with `40P01`.

Expected: all writers touching both tables for one user serialize on one canonical order.

Actual: AB-BA deadlock. Neither side retries `40P01` in-process — the Stripe webhook persists failure state and rethrows (500; Stripe redelivers), and the Clerk webhook has no `40001`/`40P01` handling (500; Svix redelivers) — so the failure is transient and self-healing via provider redelivery, at the cost of one incident-shaped 500 plus a durable failed-event row per occurrence.

## Root Cause

- The cascade is an implicit multi-table writer whose lock order is fixed by FK creation order, not by code, and the canonical-order contract comments added by PR #626 do not (and cannot) govern it.
- Cross-batch nuance from the review: the webhook already used subscriptions-before-customers pre-wave, so the webhook-vs-cascade pair **pre-existed** BUG-286's fix; but PR #626 flipped reconcile Phase 4 from customers-first (previously cascade-aligned) to subscriptions-first, **newly creating** the reconcile-vs-cascade AB-BA pair. Net: the wave fixed three-writer inversion and left/created the fourth.

## Impact

Transient `40P01` on the payment path or the deletion path whenever account deletion races a subscription write for the same user; self-healing via Stripe/Svix redelivery (the retried webhook succeeds once the deletion has committed — the subscription upsert then hits the missing-user FK path, which is BUG-288's separate concern). No data loss or corruption; one alert-worthy 500 and triage noise per occurrence. P3: same grade and rationale as the resolved BUG-286 — indefinitely reproducible in the payment path, narrow per-occurrence window, no persistent wrong state.

## Proposed Fix

1. **(Recommended)** Make the deletion flow a conforming writer: inside the `user.deleted` transaction, after resolving the local user row and **before** `DELETE FROM users`, acquire the same per-user advisory lock the subscription writers use — `pg_advisory_xact_lock(hashtext(<local users.id>))`. The deletion then serializes with every explicit subscription writer, and the cascade's internal row-lock order becomes irrelevant because no conforming writer can be mid-flight for that user. The deletion flow already loads the user row, so the local id is available. Update the canonical-order contract comments to name the deletion path as the fourth writer.
2. Recreate the two FKs in canonical-lock order via migration (drop/re-add so the `stripe_subscriptions` cascade fires before `stripe_customers`). Rejected as primary: `ALTER TABLE` locks on hot tables, and it leaves the deletion path unserialized against advisory-lock writers — the inversion would merely rotate.
3. Mitigation only: treat `40P01` as retryable in both webhook controllers. Reduces noise, leaves the ordering defect — same rejection rationale as BUG-286's option 3.

Coordinate with BUG-288 (its fix modifies the same `user.deleted` flow); implementing both in one batch avoids touching the deletion transaction twice.

## Related

- [BUG-286 (archived, resolved PR #626)](../_archive/bugs/bug-286-webhook-vs-reconcile-lock-order-deadlock.md) — established the canonical order for the three explicit writers; this is the residual fourth-writer inversion, partially created by that fix's reconcile reorder. Not a duplicate: BUG-286's doc scoped the cascade writer out of its refuted-leg analysis entirely.
- [BUG-288](./bug-288-checkout-completes-after-account-deletion-orphan-billing.md) — same `user.deleted` flow; fix batches should be coordinated.
- [DEBT-454](../debt/debt-454-undocumented-seam-contracts-and-mechanism-forks.md) — documents the `hashtext` vs `hashtextextended` divergence that prevents the deletion path's existing advisory lock from serializing with subscription writers.
- Found during the 2026-07-11 wave-1 close adversarial regression review (6 lenses over the combined fix diff, refute-biased verification); the deadlock was reproduced against real Postgres during verification.
