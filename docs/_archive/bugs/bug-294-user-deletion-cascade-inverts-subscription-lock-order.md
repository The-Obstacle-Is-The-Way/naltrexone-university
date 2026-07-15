# BUG-294: The User-Deletion `ON DELETE CASCADE` Is a Fourth Subscription Writer Hard-Wired to the Inverse Lock Order (40P01)

**Status:** Resolved
**Severity:** P3
**Date:** 2026-07-11
**Confirmed:** 2026-07-11 (wave-1 close adversarial regression review; **reproduced on real Postgres** — two concurrent sessions following the exact code sequences produced `40P01`)
**Component:** Clerk webhook / account deletion / Stripe billing

---

## Resolution (2026-07-13)

Fixed in [PR #634](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/634) (squash `21fee665` to dev), promoted via PR #638 (main `438b84d8`, main/dev trees byte-identical); production deploy succeeded and `https://addictionboards.com/` returned HTTP/2 200. The deletion flow is now a conforming subscription writer (Proposed Fix §1): both `user.deleted` DELETE sites resolve the local user id with a **non-locking** read, acquire `pg_advisory_xact_lock(hashtext(<local users.id>))` before any users-row lock, and only then lock and delete — so the cascade's FK-order row locks can never interleave with a conforming writer for the same user, and the canonical-order contract comments now name the deletion path as the fourth writer. The pre-merge review's first-insert discovery (advisory-after-row-lock forming a new AB-BA pair against FK `FOR KEY SHARE` acquirers) is pinned red-first on real Postgres: the first-insert counterparty queues `waiting-on-advisory` and loses to the committed deletion at the missing-user FK (`23503`), never via `40P01`. Accepted residue (documented in the Implementation Notes below): the `user.updated` tombstone-race delete site still orders row-lock-then-advisory — a cycle there requires a double resurrection plus a redelivered `user.deleted` in the same instant, is non-corrupting, and stays provider-redelivered and observable via the preserved `cause`. The post-deletion redelivered-write FK residue referenced in Reproduction/Impact was fixed and production-verified as [BUG-296](./bug-296-post-deletion-subscription-webhooks-fail-users-fk.md).

**Process note:** PR #634 was merged while GitHub's formal review decision remained CHANGES_REQUESTED (conversational acceptance, zero unresolved threads, and green checks on the final test-only head `f5bc99ab`, but no exact-head APPROVED review object) — a merge-gate letter violation recorded here and in BUG-288's Resolution; subsequent wave-2 PRs restored exact-final-head approval.

## Summary

The BUG-286 fix (PR #626) established the canonical subscription-writer lock order — advisory(user) → `stripe_subscriptions` → `stripe_customers` — for the three explicit coordinators (Stripe webhook, checkout-success eager sync, reconcile Phase 4). But there is a fourth writer nobody enumerated: the Clerk `user.deleted` flow's `userRepository.deleteByClerkId` ([clerk-webhook-controller.ts#L386](../../../src/adapters/controllers/clerk-webhook-controller.ts#L386), plus the tombstone-race delete at [#L342](../../../src/adapters/controllers/clerk-webhook-controller.ts#L342)) issues `DELETE FROM users`, whose `ON DELETE CASCADE` fires in FK-creation order — `stripe_customers` **before** `stripe_subscriptions` ([0000_jazzy_vermin.sql#L111-L112](../../../db/migrations/0000_jazzy_vermin.sql#L111); confirmed empirically via the RI trigger ordering) — while holding **no advisory lock**. That is exactly the inverse of the canonical order, and the cascade's order cannot be changed in application code.

A concurrent subscription writer for the same user (webhook, checkout-success, or reconcile) takes the advisory lock, locks `stripe_subscriptions`, then requests the `stripe_customers` row the cascade already holds — an AB-BA cycle. Reproduced on the per-clone real-Postgres test DB: the webhook-shaped session aborted with `deadlock detected ... while inserting index tuple in relation "stripe_customers"` (`40P01`) while the deletion committed.

## Reachability

A Clerk `user.deleted` transaction must interleave with an in-flight subscription webhook, checkout-success sync, or reconcile Phase 4 for the same user who still holds a `stripe_subscriptions` row. The window is the milliseconds between the two paths' lock acquisitions, but the trigger is realistic: account deletion concurrent with a renewal/cancellation event or the daily reconcile run. Note the deletion path's only advisory lock (`deletedClerkUsers.lock`, `hashtextextended(clerkUserId, 0)`) uses a different hash function and identifier space than the subscription writers' `hashtext(<local userId UUID>)`, so the two never serialize — the DEBT-454 hashtext divergence made concrete.

## Reproduction

1. Session A (deletion path, per [clerk-webhook-controller.ts#L377-L386](../../../src/adapters/controllers/clerk-webhook-controller.ts#L377)): `SELECT users ... FOR UPDATE` → `DELETE FROM users` — the cascade acquires `stripe_customers` row locks, then reaches for `stripe_subscriptions`.
2. Session B (subscription writer, per [stripe-webhook-controller.ts#L166-L181](../../../src/adapters/controllers/stripe-webhook-controller.ts#L166) → [drizzle-subscription-repository.ts#L82-L89](../../../src/adapters/repositories/drizzle-subscription-repository.ts#L82)): `pg_advisory_xact_lock(hashtext(userId))` → `SELECT stripe_subscriptions FOR UPDATE` → `INSERT stripe_customers ON CONFLICT (user_id) DO UPDATE`, which blocks on A's row lock while B holds the subscription row A's cascade needs.
3. PostgreSQL's deadlock detector aborts one victim with `40P01`.

Expected: all writers touching both tables for one user serialize on one canonical order.

Actual: AB-BA deadlock. Neither side retries `40P01` in-process — the Stripe webhook persists failure state and rethrows (500; Stripe redelivers), and the Clerk webhook has no `40001`/`40P01` handling (500; Svix redelivers) — so the deadlock victim is eligible for provider redelivery, at the cost of one incident-shaped 500 plus a durable failed-event row per occurrence. Redelivery does not necessarily restore subscription state: if the deletion committed, the redelivered subscription write fails the missing-user FK — the separate BUG-288 residue.

## Root Cause

- The cascade is an implicit multi-table writer whose lock order is fixed by FK creation order, not by code, and the canonical-order contract comments added by PR #626 do not (and cannot) govern it.
- Cross-batch nuance from the review: the webhook already used subscriptions-before-customers pre-wave, so the webhook-vs-cascade pair **pre-existed** BUG-286's fix; but PR #626 flipped reconcile Phase 4 from customers-first (previously cascade-aligned) to subscriptions-first, **newly creating** the reconcile-vs-cascade AB-BA pair. Net: the wave fixed three-writer inversion and left/created the fourth.

## Impact

A `40P01` abort on the payment path or the deletion path whenever account deletion races a subscription write for the same user. The deadlock itself is transient: the victim is redelivered by Stripe/Svix, and the redelivery either succeeds (the deletion lost the race) or fails the missing-user FK because the deletion committed — the separate BUG-288 residue, not a restored subscription. No data loss or corruption; one alert-worthy 500 and triage noise per occurrence. P3: same grade and rationale as the resolved BUG-286 — indefinitely reproducible in the payment path, narrow per-occurrence window, no persistent wrong state.

## Proposed Fix

1. **(Recommended)** Make the deletion flow a conforming writer: inside the `user.deleted` transaction, after resolving the local user row and **before** `DELETE FROM users`, acquire the same per-user advisory lock the subscription writers use — `pg_advisory_xact_lock(hashtext(<local users.id>))`. The deletion then serializes with every explicit subscription writer, and the cascade's internal row-lock order becomes irrelevant because no conforming writer can be mid-flight for that user. The deletion flow already loads the user row, so the local id is available. Update the canonical-order contract comments to name the deletion path as the fourth writer.
2. Recreate the two FKs in canonical-lock order via migration (drop/re-add so the `stripe_subscriptions` cascade fires before `stripe_customers`). Rejected as primary: `ALTER TABLE` locks on hot tables, and it leaves the deletion path unserialized against advisory-lock writers — the inversion would merely rotate.
3. Mitigation only: treat `40P01` as retryable in both webhook controllers. Reduces noise, leaves the ordering defect — same rejection rationale as BUG-286's option 3.

Coordinate with BUG-288 (its fix modifies the same `user.deleted` flow); implementing both in one batch avoids touching the deletion transaction twice.

## Implementation Notes (fix branch)

**2026-07-11:** Phase A is implemented on branch `fix/bug-288-294-deletion-lifecycle` in [PR #634](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/634), **“Fix BUG-288/294: deletion-owned Stripe customer lifecycle + conforming deletion lock order.”** The deletion path now takes the canonical per-user subscription-writer advisory lock before both user DELETE sites, and the real-Postgres lock-order suite covers webhook-shaped and reconcile-shaped counterparties. Merged and production-verified 2026-07-13 — see the Resolution section above.

**2026-07-12 (pre-merge adversarial review):** the initial implementation acquired the advisory lock only after `lockByClerkId`'s `SELECT ... FOR UPDATE` on the users row. Because conforming writers hold the advisory while their INSERTs take FK `FOR KEY SHARE` locks on that same users row, the two lock classes formed a *new* AB-BA pair for first-insert counterparties (a user's first `stripe_subscriptions`/`stripe_customers` row racing deletion) — reproduced red on real Postgres: the counterparty queued `waiting-on-row-lock` inside its INSERT instead of at the advisory. Fixed in the same PR by resolving the local id with a non-locking read and acquiring the advisory **before** any users-row lock; the customer-mapping read also moved under the advisory, closing a TOCTOU where a concurrent mapping repoint (cus_A → cus_B) could make the deletion schedule cleanup for the stale customer. New regression: the first-insert scenario in the lock-order suite pins the counterparty `waiting-on-advisory` and losing to the committed deletion at the missing-user FK (`23503`), never via `40P01`. Accepted narrow residue: the `user.updated` tombstone-race delete site still orders row-lock-then-advisory inside the upsert transaction; a cycle there requires a double resurrection plus a redelivered `user.deleted` in the same instant, is non-corrupting, and is provider-redelivered — `deleteByClerkId` now preserves the driver error as `cause` so any such `40P01` stays observable.

## Related

- [BUG-286 (archived, resolved PR #626)](./bug-286-webhook-vs-reconcile-lock-order-deadlock.md) — established the canonical order for the three explicit writers; this is the residual fourth-writer inversion, partially created by that fix's reconcile reorder. Not a duplicate: BUG-286's doc scoped the cascade writer out of its refuted-leg analysis entirely.
- [BUG-288](./bug-288-checkout-completes-after-account-deletion-orphan-billing.md) — same `user.deleted` flow; fix batches should be coordinated.
- [DEBT-454](../../debt/debt-454-undocumented-seam-contracts-and-mechanism-forks.md) — documents the `hashtext` vs `hashtextextended` divergence that prevents the deletion path's existing advisory lock from serializing with subscription writers.
- Found during the 2026-07-11 wave-1 close adversarial regression review (6 lenses over the combined fix diff, refute-biased verification); the deadlock was reproduced against real Postgres during verification.
