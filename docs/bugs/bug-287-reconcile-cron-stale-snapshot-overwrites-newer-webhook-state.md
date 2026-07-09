# BUG-287: Reconcile Cron Can Revert a Newer Webhook-Applied Subscription State to Its Stale Phase-1 Snapshot (No Recency Fence)

**Status:** Active
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** Billing / reconcile cron

---

## Summary

[`shouldPersistSubscriptionWrite`](../../src/domain/services/subscription-write-guard.ts#L38-L42) unconditionally persists any write whose `subscriptionIdentity` matches the stored row, and [`stripe_subscriptions`](../../db/schema.ts#L173-L194) stores no Stripe-side version or state timestamp — [`updatedAt` is set to the write time](../../src/adapters/repositories/drizzle-subscription-repository.ts#L84), not the time the state was observed at Stripe. The daily production reconcile cron ([`vercel.json`](../../vercel.json#L6-L7): `dryRun=false&scope=all`, 08:00 UTC) snapshots each subscription in [Phase 1](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L91-L102) but writes it only in [Phase 4](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L232-L246), after a `subscriptions.list` round-trip plus sequential per-blocking-subscription retrieves under retry/backoff — and when the customer has no blocking subscriptions, [the canonical value remains the stale Phase-1 snapshot](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L136).

A subscription state change committed by a webhook inside that Phase-1-to-Phase-4 window is silently overwritten by the stale snapshot. The advisory lock + `FOR UPDATE` in the [repository transaction](../../src/adapters/repositories/drizzle-subscription-repository.ts#L80-L109) serialize writes by *arrival* order, not causality — the guard is consulted inside the locked transaction, so this is purely a causality/fencing gap, not a lost-lock race.

## Reachability

- Production only path: the cron runs live once daily via `vercel.json` with `dryRun=false&scope=all`, iterating every stored `stripe_subscriptions` row.
- The per-row race window is that row's *own* Phase-1-to-Phase-4 span — one `subscriptions.list` round-trip minimum for typical single-subscription customers, stretching to seconds under `callStripeWithRetry` backoff or multi-subscription customers. Processing 500 rows does not compound any single row's window.
- The user's subscription state must change *at Stripe* inside that window, and the resulting webhook must commit before the cron's Phase 4. For the entitlement-re-grant arc specifically, the in-window change must be an immediate deletion or a payment-failure status transition — billing-portal cancels default to cancel-at-period-end (status stays `active`, only `cancelAtPeriodEnd` flips), so that variant produces wrong `cancelAtPeriodEnd`/UI state, not immediate entitlement re-grant.
- A narrower millisecond-scale variant of the same gap exists between two concurrent webhook deliveries: the processor's re-fetch ([`stripe-webhook-processor.ts#L45`](../../src/adapters/gateways/stripe/stripe-webhook-processor.ts#L45), [`#L137`](../../src/adapters/gateways/stripe/stripe-webhook-processor.ts#L137)) precedes the locked transaction, so two in-flight deliveries can commit in the reverse of retrieve order.

## Reproduction

Exact interleaving (single-subscription customer):

1. Cron Phase 1 retrieves the subscription: `status=active`, `currentPeriodEnd` in the future ([reconcile-stripe-subscriptions.ts#L91-L102](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L91-L102)).
2. Inside the window before Phase 4 (during the `subscriptions.list` call at [#L120-L129](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L120-L129)), the subscription is immediately canceled at Stripe (dashboard cancel, payment-failure-triggered deletion) or transitions to `unpaid`/`past_due`.
3. The `customer.subscription.deleted`/`updated` webhook re-fetches the new state ([stripe-webhook-processor.ts#L137](../../src/adapters/gateways/stripe/stripe-webhook-processor.ts#L137)) and commits it via `subscriptions.upsert` ([drizzle-subscription-repository.ts#L72-L109](../../src/adapters/repositories/drizzle-subscription-repository.ts#L72-L109)).
4. With no blocking subscriptions, `canonical` stays the stale Phase-1 snapshot ([#L136](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L136)); Phase 4 upserts it ([#L238-L245](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L238-L245)). The guard sees matching `subscriptionIdentity` and returns `true` with no recency comparison ([subscription-write-guard.ts#L38-L42](../../src/domain/services/subscription-write-guard.ts#L38-L42)).

Expected: the row keeps the newer webhook-committed state (canceled/unpaid).

Actual: the row reverts to `active` with a future `currentPeriodEnd`, and the user regains entitlement until the next daily cron run (up to 24h). The mirror direction also holds: if the webhook applied a renewal (new `currentPeriodEnd`), the cron writes back the just-expired period end and wrongly revokes entitlement for up to 24h.

## Root Cause

Same-identity writes have no recency fence:

- [`subscription-write-guard.ts#L38-L42`](../../src/domain/services/subscription-write-guard.ts#L38-L42) — `if (input.stored.subscriptionIdentity === input.incoming.subscriptionIdentity) { return true; }` accepts every same-subscription write regardless of which Stripe state is newer. `SubscriptionWriteCandidate` ([#L7-L11](../../src/domain/services/subscription-write-guard.ts#L7-L11)) carries no source timestamp to compare.
- [`db/schema.ts#L173-L194`](../../db/schema.ts#L173-L194) — the table has no Stripe-side version/timestamp column; [`updatedAt = this.now()`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L84) records write time only.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L91-L246) — the retrieve-to-write span (Phase 1 at L91 to Phase 4 at L238) is the interleaving window; the guard call inside the locked transaction ([drizzle-subscription-repository.ts#L92](../../src/adapters/repositories/drizzle-subscription-repository.ts#L92)) cannot detect that its input snapshot is older than the stored row's source state.

[BUG-242](../_archive/bugs/bug-242-stale-subscription-webhook-overwrites-active-row.md)'s fix deliberately covered only the cross-subscription identity gap; its archive states "The re-fetch design correctly handles all single-subscription out-of-order arrivals; this bug is strictly the cross-subscription identity gap" — true for sequential out-of-order webhook deliveries (each re-fetches current state before writing), but not for this retrieve-to-write interleaving, where the re-fetch itself is what goes stale.

## Impact

- Entitlement re-grant: a canceled/unpaid user reads as `active` with a future period end for up to 24h, until the next cron run self-heals the row.
- Entitlement revocation: a just-renewed user can be reverted to the expired period end and locked out of paid content for up to 24h.
- Lesser variant: wrong `cancelAtPeriodEnd` flag / UI state from an in-window portal cancel.

Severity rationale (P3, not P2): the preconditions are narrow — the Stripe-side state change must land inside a seconds-wide window of a once-daily cron, and the webhook must also commit inside that window. The anomaly is silent but strictly self-healing at the next cron run (≤24h), and no data is destroyed — the row converges to correct state. It is not P4 because the failure mode is a real entitlement inversion in production billing state, in both directions.

## Proposed Fix

1. **RECOMMENDED — add a source-version fence.** Persist a `source_state_at` timestamptz on `stripe_subscriptions` (webhook writes use the Stripe event `created`; cron and checkout-success writes use the moment their `subscriptions.retrieve` was issued). Extend `SubscriptionWriteCandidate` and `shouldPersistSubscriptionWrite` to reject same-identity writes whose `source_state_at` is older than the stored row's, and thread the value through `upsert`. This is the fencing token the guard currently lacks and closes both the cron variant and the concurrent-webhook millisecond variant.
2. Cheaper mitigation — in the reconcile cron, re-retrieve the chosen canonical subscription immediately before the Phase 4 transaction. This shrinks the window from list-plus-N-retrieves to one round-trip but is not a fence; the millisecond variant survives.
3. Accept + document as a self-healing ≤24h anomaly, given the tiny window and the daily cron's convergence, recording the ruling in the register (precedent: [DEBT-408](../_archive/debt/debt-408-clerk-ui-solana-react-native-subtree.md) and the DEBT-437 ACCEPT rulings).

## Related

- [BUG-242](../_archive/bugs/bug-242-stale-subscription-webhook-overwrites-active-row.md) — fixed the cross-subscription identity gap in the same guard; explicitly scoped its same-subscription ruling to sequential out-of-order arrivals under the re-fetch design, so this finding is not a regression of that fix.
- [DEBT-437](../_archive/debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) — ACCEPT-ruling precedent cited by remediation option 3; verified as a different seam, not reducible to that ruling.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
