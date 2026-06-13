# BUG-246: Deleted-Account Stripe Cancellation Has No Drain Beyond Svix Retries — Cascade-Deleted Local Rows Make the Leak Invisible

**Status:** ✅ Resolved
**Resolution State:** Implemented in PR #420 (squash `fac21601`) as a drain folded into the scheduled billing-maintenance cron, and activated to live mode (`dryRun=false`) in PR #422 (squash `6679cfe2`), both merged 2026-06-12. The same daily production cron (deploy `dpl_GFqkgVoarFVqXbWbsq17Kh6MwtxK` READY) now drains stale `pending_stripe_cancellations` rows from their stored `stripeCustomerId` (independent of the cascade-deleted local subscription row). Owner-graded; full gate green + CodeRabbit approved on the exact head. Archived to `docs/_archive/bugs/`. The `clerk_events → pending_stripe_cancellations` cascade is left unchanged as a tracked operational note (the drain cadence must stay shorter than any future `clerk_events` prune horizon).
**Priority:** P2 (tail-risk: Stripe keeps charging a customer whose account no longer exists; rare trigger, but no monitoring and no recovery path)
**Date:** 2026-06-11
**Family:** Billing / Clerk account deletion / money-moves-wrong tail risk
**Related:** [BUG-244](./bug-244-reconciliation-cron-never-scheduled.md) (same scheduled billing-maintenance run now drives the queue drain), [DEBT-304](../debt/debt-304-clerk-user-deleted-cancel-idempotency.md) (made the cancel idempotent — did not add a drain), [BUG-023](./bug-023-missing-clerk-user-deletion-webhook.md) (original deletion-webhook gap), [BUG-208](./bug-208-clerk-webhook-deletion-not-transactional.md) / [BUG-209](./bug-209-clerk-webhook-lacks-idempotency.md) (deletion races / replay)

---

## Description

When a Clerk `user.deleted` webhook fires, the controller deletes the local user, schedules a Stripe cancellation in `pending_stripe_cancellations`, and then — **post-commit, in the same request** — cancels all of the customer's Stripe subscriptions. If that post-commit cancellation fails (Stripe outage, 5xx streak), the only retry mechanism was Svix re-delivering that one `user.deleted` event, which is bounded by the provider retry horizon. Before this fix, **no cron or scheduled job ever drained `pending_stripe_cancellations` afterward** (the table was read/written only by this one controller), and the would-be safety net — the reconciliation job — was itself never scheduled (BUG-244).

Worse, the local user row (and its cascade-linked `stripe_subscriptions` row) is already deleted by the time the cancellation is attempted, so even a *scheduled* reconciliation job would not see the orphaned live Stripe subscription — it iterates local `stripe_subscriptions` rows, and there is none. The implementation fixes this by folding a pending-cancellation drain into the scheduled billing-maintenance run; the drain works directly from the pending row's `stripeCustomerId`, not from deleted local subscription state.

## Original Steps to Reproduce (pre-fix)

1. A user with an active subscription deletes their Clerk account.
2. Stripe (or the network) is unavailable for longer than the Svix retry horizon at the moment the post-commit cancel runs.
3. After Svix exhausts retries on the base commit before this fix, observe: the `pending_stripe_cancellations` row remains; the Stripe subscription is still active and still billing; the local user + subscription rows are gone; nothing will ever retry the cancel.

## Root Cause (pre-fix)

1. `src/adapters/controllers/clerk-webhook-controller.ts:344-348` — inside the transaction, the cancellation is scheduled in `pending_stripe_cancellations` (keyed by `eventId`).
2. `clerk-webhook-controller.ts:360-376` — **post-commit**, `cancelStripeCustomerSubscriptions(stripeCustomerId)` runs; on success it deletes the pending row and marks the event processed. On failure it calls `persistFailure` and rethrows → route returns 500 → Svix retries (bounded).
3. The pending row was the **only** durable record of the obligation, and pre-fix `rg` confirmed `findByEventId` / `schedule` / `deleteByEventId` were referenced **only** in this controller (`src/adapters/repositories/drizzle-pending-stripe-cancellation-repository.ts`) — no cron, job, or startup task drained it.
4. `db/schema.ts:181-183` — `stripe_subscriptions.userId` is `onDelete: 'cascade'` from `users.id` (as is `stripe_customers.userId`, `:160-162`); deleting the user in step 2 (`clerk-webhook-controller.ts:334`) removes the local subscription row, so `reconcileStripeSubscriptions` (which iterates `stripe_subscriptions`, `app/api/cron/reconcile-stripe-subscriptions/route.ts:190-205`) can never re-discover the orphaned Stripe subscription. BUG-244 now schedules reconciliation, but this BUG-246 drain still must work from `pending_stripe_cancellations.stripeCustomerId`.
5. `pending_stripe_cancellations.eventId` is itself `onDelete: 'cascade'` from `clerk_events` (`db/schema.ts:266-268`); if the clerk event is ever pruned the pending row vanishes with it, erasing the last trace of the obligation.

## Impact

- Stripe continues charging a customer whose account no longer exists — a payment with no corresponding user and no in-product way to stop it (the account is gone, so the user cannot self-serve cancel).
- Pre-fix, the unprocessed `pending_stripe_cancellations` row had **no alerting**, so the leak was silent until a chargeback/complaint. The implemented drain now logs stale-row counts before retrying.
- Probability is low (requires account deletion to coincide with a Stripe outage past the Svix window), hence P2 not P0 — but the consequence is real money moving wrong indefinitely with no recovery path.

## Implemented Resolution

The chosen path folds the queue drain into the same scheduled billing-maintenance run as BUG-244:

1. `src/application/ports/pending-stripe-cancellation-repository.ts`, `src/adapters/repositories/drizzle-pending-stripe-cancellation-repository.ts`, and `src/application/test-helpers/fakes/fake-pending-stripe-cancellation-repository.ts` add a shared `listStale(olderThan)` contract. No schema migration is needed; `pending_stripe_cancellations` already has `eventId`, `stripeCustomerId`, and indexed `createdAt`.
2. `src/adapters/jobs/drain-pending-stripe-cancellations.ts` lists stale rows older than 15 minutes, logs a warning with count/age, and in `dryRun=false` calls the existing `cancelStripeCustomerSubscriptions` path using the row's `stripeCustomerId`.
3. The drain deletes the pending row on success, treats `isAlreadyCanceledError` as success, and keeps the row with an error log on real cancellation failure.
4. The cron route calls the drain after reconciliation in the same authenticated `GET`/`POST` run. `dryRun=true` reports stale rows without canceling or deleting; `dryRun=false` performs the cancellation and deletion.
5. The `clerk_events -> pending_stripe_cancellations` cascade remains unchanged in this PR. The mitigation is operational: the scheduled drain cadence must remain shorter than any future `clerk_events` prune horizon. A schema change is rejected as out of scope for this BUG-244/246 fix.

Rejected alternative: a separate drain cron was rejected because it would create a second scheduler to observe, secure, and operate; folding the drain into reconciliation gives one billing-maintenance invocation and reuses the existing cron auth path.

## Original Fix Options (superseded)

1. **Drain the queue on a schedule (preferred).** Add a scheduled job (or fold into the reconciliation cron once BUG-244 wires one) that reads `pending_stripe_cancellations` older than N minutes, calls `cancelStripeCustomerSubscriptions` for each, and deletes the row on success. This closes both the past-Svix-window gap and the invisibility (the pending row carries the `stripeCustomerId` directly, so it does not depend on the deleted local subscription row).
2. **Alert on stale rows.** Emit a metric/log when any `pending_stripe_cancellations` row exceeds an age threshold, so an outage-window leak is caught operationally even before the drain runs.
3. Reconsider the `clerk_events` → `pending_stripe_cancellations` cascade so pruning a processed clerk event cannot orphan an outstanding cancellation (or ensure pending rows are always drained before their clerk event is eligible for pruning).

## Verification

- [x] Test: a `user.deleted` whose post-commit cancel throws leaves a `pending_stripe_cancellations` row; a subsequent drain-job run cancels the Stripe customer subscriptions and deletes the row.
- [x] Test: the drain is idempotent against an already-canceled subscription (reuses `isAlreadyCanceledError`, as the inline path already does).
- [x] Test: fresh rows newer than the stale threshold are not drained.
- [x] Test: real Drizzle `listStale(olderThan)` returns only stale pending rows, and the drain removes stale rows while leaving fresh rows.
- [ ] Manual: simulate Stripe 5xx during deletion, confirm the row persists and is later drained.
- [x] Alerting/logging fires for rows older than the threshold.

## Surfaces Confirmed

- The **happy path and same-request retry** are correct: idempotent cancel (DEBT-304), tombstone + advisory-lock deletion races (BUG-208/209), pending row written transactionally before the post-commit attempt.
- The fixed gap was strictly the absence of any drain **after** Svix retries are exhausted, compounded by the cascade-deleted local row hiding the orphan from reconciliation.
- `cancelStripeCustomerSubscriptions` itself (list `status:'all'`, skip already-canceled, idempotency-keyed cancel) is correct and reused as-is by the implemented drain job.
