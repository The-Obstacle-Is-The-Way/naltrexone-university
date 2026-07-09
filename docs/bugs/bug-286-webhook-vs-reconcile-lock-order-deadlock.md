# BUG-286: Inverted Lock-Acquisition Order Between the Stripe Webhook and Reconcile-Cron Phase 4 Enables an AB-BA Deadlock (40P01)

**Status:** Active
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** Stripe webhook / reconcile cron

---

## Summary

The two production transactions that write both `stripe_customers` and `stripe_subscriptions` for the same user acquire the same two locks in opposite orders. The webhook transaction ([`stripe-webhook-controller.ts#L126-L142`](../../src/adapters/controllers/stripe-webhook-controller.ts#L126)) takes the per-user advisory lock first — `subscriptions.upsert` executes `pg_advisory_xact_lock(hashtext(userId))` at [`drizzle-subscription-repository.ts#L82`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L82), held to top-level commit because the repository is constructed on the outer tx handle — then takes the `stripe_customers(userId)` row lock via `INSERT .. ON CONFLICT DO UPDATE` ([`drizzle-stripe-customer-repository.ts#L33-L46`](../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L33)). Reconcile Phase 4 ([`reconcile-stripe-subscriptions.ts#L232-L246`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L232)) inverts this: `stripeCustomers.insert` row lock first, then the `subscriptions.upsert` advisory lock.

A webhook for user U overlapping the cron's Phase 4 transaction for U forms a hold-and-wait cycle; Postgres's deadlock detector kills one victim with `40P01` after `deadlock_timeout` (~1s). No lock-ordering guard, comment, or test exists. The failure is self-healing — Stripe retries the webhook and the next cron run retries the row — so this is a recurring low-probability operational-incident signature rather than data loss.

## Reachability

Both paths run in production: the webhook is Stripe-driven (renewals, portal actions, `subscription.updated`/`deleted` events), and the reconcile cron ([`app/api/cron/reconcile-stripe-subscriptions/route.ts#L213-L219`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L213)) opens a Phase 4 transaction per reconciled user. The precondition is independent webhook traffic for user U landing inside U's own millisecond-wide Phase 4 window. One narrowing correction verified during the sweep: the cron's Phase 5 cancels for user U fire only after U's Phase 4 has committed, so the run's *own* delayed `subscription.deleted` webhooks cannot collide with the same user's Phase 4 in the same run — the trigger must be organic or retried webhook traffic. Real but narrow.

## Reproduction

Exact interleaving for a shared user U:

1. Cron Phase 4 opens its transaction and acquires the `stripe_customers(U)` row lock via `INSERT .. ON CONFLICT DO UPDATE` ([`reconcile-stripe-subscriptions.ts#L233`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L233) → [`drizzle-stripe-customer-repository.ts#L33`](../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L33)).
2. Concurrently, a Stripe webhook for U opens its transaction ([`lib/container/controllers.ts#L24-L31`](../../lib/container/controllers.ts#L24)) and its `subscriptions.upsert` acquires `pg_advisory_xact_lock(hashtext(U))` ([`stripe-webhook-controller.ts#L126`](../../src/adapters/controllers/stripe-webhook-controller.ts#L126) → [`drizzle-subscription-repository.ts#L82`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L82)) before the cron reaches its own upsert.
3. The webhook reaches `stripeCustomers.insert` ([`stripe-webhook-controller.ts#L137`](../../src/adapters/controllers/stripe-webhook-controller.ts#L137)) and blocks on the cron's row lock — while still holding the advisory lock.
4. The cron reaches `subscriptions.upsert` ([`reconcile-stripe-subscriptions.ts#L238`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L238)) and blocks on the webhook's advisory lock.

Expected: both writers serialize on a consistent lock order; one waits briefly, both commit.

Actual: AB-BA cycle → after `deadlock_timeout` Postgres aborts one victim with `40P01`. If the cron is the victim, the per-row catch records the row as failed and the run reports `failed > 0`. If the webhook is the victim, the `40P01` aborts its outer transaction, the in-transaction `stripeEvents.markFailed` at [`stripe-webhook-controller.ts#L148`](../../src/adapters/controllers/stripe-webhook-controller.ts#L148) then hits `25P02` (transaction aborted), and the route returns 500 until Stripe's retry succeeds. (That `25P02` masking via in-tx `markFailed` is filed separately as [BUG-285](./bug-285-stripe-webhook-markfailed-on-aborted-transaction.md), referenced here but not double-counted.)

## Root Cause

Classic AB-BA lock ordering inversion between two writers that were built independently:

- Webhook order: advisory(U) → `stripe_customers(U)` row lock. `subscriptions.upsert` runs first at [`stripe-webhook-controller.ts#L126`](../../src/adapters/controllers/stripe-webhook-controller.ts#L126), and `stripeCustomers.insert` follows at [L137](../../src/adapters/controllers/stripe-webhook-controller.ts#L137), gated on `write.persisted`.
- Reconcile Phase 4 order: `stripe_customers(U)` row lock → advisory(U). [`reconcile-stripe-subscriptions.ts#L232-L246`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L232) writes the customer mapping first, then the subscription.
- Both lock acquisitions participate in one top-level transaction each: the repositories are constructed with the outer tx handle ([`controllers.ts#L24-L31`](../../lib/container/controllers.ts#L24), [`route.ts#L213-L219`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L213)), so the `db.transaction` inside `DrizzleSubscriptionRepository.upsert` ([`drizzle-subscription-repository.ts#L80`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L80)) is a savepoint, and the xact-scoped advisory lock persists until top-level commit.
- Refuted leg, for completeness: [`create-checkout-session.ts#L77`](../../src/application/use-cases/create-checkout-session.ts#L77) is the only other production `stripeCustomers.insert`, and it is a standalone autocommit write holding no second lock — it cannot participate in this deadlock.

## Impact

No data loss or corruption — Postgres aborts one victim cleanly, Stripe retries the webhook (or the next cron run retries the row), and the eventual state converges. The cost is operational noise: intermittent webhook 500s (with the misleading `25P02` secondary error) and reconcile runs reporting spurious per-row failures, each looking like an independent incident. Severity is P3 rather than P2 because the collision window is the millisecond-scale Phase 4 transaction per user per cron run, both sides self-heal, and no user-facing entitlement state is left wrong; it is not P4 because the signature will recur indefinitely, fires in the payment path, and produces alert-worthy 500s that cost real triage time each occurrence.

## Proposed Fix

1. **(Recommended)** Make reconcile Phase 4 acquire the per-user advisory lock first: execute `select pg_advisory_xact_lock(hashtext(userId))` as the first statement of the Phase 4 transaction at [`reconcile-stripe-subscriptions.ts#L232`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L232). Merely reordering to `subscriptions.upsert` before `stripeCustomers.insert` would also fix the order, but reconcile must write the customer mapping unconditionally while the webhook gates it on `write.persisted` — an explicit lock-first statement is semantically cleaner. Result: both transactions share the global order advisory(user) → `stripe_customers` row → `stripe_subscriptions` row.
2. Additionally, document the canonical Stripe-write lock order (advisory user lock before any `stripe_customers`/`stripe_subscriptions` write within a shared transaction) in the repository/controller comments so future write paths do not reintroduce the inversion.
3. **(Mitigation only — rejected as the primary fix)** Treat `40P01` as retryable in both the webhook controller and the reconcile per-row callback, mirroring the `RETRYABLE_PRACTICE_SESSION_STATE_WRITE_CODES` pattern at [`lib/container/use-cases.ts#L47`](../../lib/container/use-cases.ts#L47). This reduces incident noise but leaves the ordering defect in place.

## Related

- [BUG-278](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) and [BUG-280](../_archive/bugs/bug-280-double-finalize-race-maps-to-reasonless-conflict.md) — prior deadlock/race register entries; both are practice-session domain, not this Stripe lock pair.
- [DEBT-437](../_archive/debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) and [DEBT-438](../_archive/debt/debt-438-conflict-reason-client-coverage-gaps.md) — practice-session locking briefs; no existing debt/bug doc covers the webhook-vs-reconcile lock pair.
- [DEBT-426](../_archive/debt/debt-426-session-wide-lock-defeats-row-concurrency.md) — the practice-session advisory-lock design this repo's `pg_advisory_xact_lock` conventions descend from.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
