# BUG-246: Deleted-Account Stripe Cancellation Has No Drain Beyond Svix Retries — Cascade-Deleted Local Rows Make the Leak Invisible

**Status:** Open
**Priority:** P2 (tail-risk: Stripe keeps charging a customer whose account no longer exists; rare trigger, but no monitoring and no recovery path)
**Date:** 2026-06-11
**Family:** Billing / Clerk account deletion / money-moves-wrong tail risk
**Related:** [BUG-244](./bug-244-reconciliation-cron-never-scheduled.md) (no scheduled job exists to drain the queue), [DEBT-304](../_archive/debt/debt-304-clerk-user-deleted-cancel-idempotency.md) (made the cancel idempotent — did not add a drain), [BUG-023](../_archive/bugs/bug-023-missing-clerk-user-deletion-webhook.md) (original deletion-webhook gap), [BUG-208](../_archive/bugs/bug-208-clerk-webhook-deletion-not-transactional.md) / [BUG-209](../_archive/bugs/bug-209-clerk-webhook-lacks-idempotency.md) (deletion races / replay)

---

## Description

When a Clerk `user.deleted` webhook fires, the controller deletes the local user, schedules a Stripe cancellation in `pending_stripe_cancellations`, and then — **post-commit, in the same request** — cancels all of the customer's Stripe subscriptions. If that post-commit cancellation fails (Stripe outage, 5xx streak), the only retry mechanism is Svix re-delivering that one `user.deleted` event, which is bounded by the provider retry horizon. **No cron or scheduled job ever drains `pending_stripe_cancellations` afterward** (the table is read/written only by this one controller), and the would-be safety net — the reconciliation job — is itself never scheduled (BUG-244).

Worse, the local user row (and its cascade-linked `stripe_subscriptions` row) is already deleted by the time the cancellation is attempted, so even a *scheduled* reconciliation job would not see the orphaned live Stripe subscription — it iterates local `stripe_subscriptions` rows, and there is none. The leak is therefore both un-retried past the Svix window and invisible to every existing reconciliation surface.

## Steps to Reproduce

1. A user with an active subscription deletes their Clerk account.
2. Stripe (or the network) is unavailable for longer than the Svix retry horizon at the moment the post-commit cancel runs.
3. After Svix exhausts retries, observe: the `pending_stripe_cancellations` row remains; the Stripe subscription is still active and still billing; the local user + subscription rows are gone; nothing will ever retry the cancel.

## Root Cause

1. `src/adapters/controllers/clerk-webhook-controller.ts:344-348` — inside the transaction, the cancellation is scheduled in `pending_stripe_cancellations` (keyed by `eventId`).
2. `clerk-webhook-controller.ts:360-376` — **post-commit**, `cancelStripeCustomerSubscriptions(stripeCustomerId)` runs; on success it deletes the pending row and marks the event processed. On failure it calls `persistFailure` and rethrows → route returns 500 → Svix retries (bounded).
3. The pending row is the **only** durable record of the obligation, and `rg` confirms `findByEventId` / `schedule` / `deleteByEventId` are referenced **only** in this controller (`src/adapters/repositories/drizzle-pending-stripe-cancellation-repository.ts`) — no cron, job, or startup task drains it.
4. `db/schema.ts:161-162, 182-183` — `users` and `stripe_subscriptions` both `onDelete: 'cascade'` from the user; deleting the user in step 2 (`clerk-webhook-controller.ts:334`) removes the local subscription row, so `reconcileStripeSubscriptions` (which iterates `stripe_subscriptions`, `route.ts:175-190`) can never re-discover the orphaned Stripe subscription — and per BUG-244 it never runs anyway.
5. `pending_stripe_cancellations.eventId` is itself `onDelete: 'cascade'` from `clerk_events` (`db/schema.ts:262-267`); if the clerk event is ever pruned the pending row vanishes with it, erasing the last trace of the obligation.

## Impact

- Stripe continues charging a customer whose account no longer exists — a payment with no corresponding user and no in-product way to stop it (the account is gone, so the user cannot self-serve cancel).
- The unprocessed `pending_stripe_cancellations` row has **no alerting**, so the leak is silent until a chargeback/complaint.
- Probability is low (requires account deletion to coincide with a Stripe outage past the Svix window), hence P2 not P0 — but the consequence is real money moving wrong indefinitely with no recovery path.

## Expected Fix (options)

1. **Drain the queue on a schedule (preferred).** Add a scheduled job (or fold into the reconciliation cron once BUG-244 wires one) that reads `pending_stripe_cancellations` older than N minutes, calls `cancelStripeCustomerSubscriptions` for each, and deletes the row on success. This closes both the past-Svix-window gap and the invisibility (the pending row carries the `stripeCustomerId` directly, so it does not depend on the deleted local subscription row).
2. **Alert on stale rows.** Emit a metric/log when any `pending_stripe_cancellations` row exceeds an age threshold, so an outage-window leak is caught operationally even before the drain runs.
3. Reconsider the `clerk_events` → `pending_stripe_cancellations` cascade so pruning a processed clerk event cannot orphan an outstanding cancellation (or ensure pending rows are always drained before their clerk event is eligible for pruning).

## Verification

- [ ] Test: a `user.deleted` whose post-commit cancel throws leaves a `pending_stripe_cancellations` row; a subsequent drain-job run cancels the Stripe subscription and deletes the row.
- [ ] Test: the drain is idempotent against an already-canceled subscription (reuses `isAlreadyCanceledError`, as the inline path already does).
- [ ] Manual: simulate Stripe 5xx during deletion, confirm the row persists and is later drained.
- [ ] Alerting fires for a row older than the threshold.

## Surfaces Confirmed

- The **happy path and same-request retry** are correct: idempotent cancel (DEBT-304), tombstone + advisory-lock deletion races (BUG-208/209), pending row written transactionally before the post-commit attempt.
- The gap is strictly the absence of any drain **after** Svix retries are exhausted, compounded by the cascade-deleted local row hiding the orphan from reconciliation.
- `cancelStripeCustomerSubscriptions` itself (list `status:'all'`, skip already-canceled, idempotency-keyed cancel) is correct and reusable as-is by the proposed drain job.
