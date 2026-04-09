# BUG-205: Reconciliation Prefers Stale Local Subscription Over Canonical Stripe State

**Status:** Resolved
**Priority:** P1
**Date:** 2026-03-10
**Resolved:** 2026-03-11 (PR #199, merged to main)
**Component:** Billing / Cron / Stripe Reconciliation

---

## Description

The Stripe reconciliation job claims to select the canonical blocking subscription by `currentPeriodEnd` with a deterministic tie-break, but the implementation short-circuits whenever the local row's `stripeSubscriptionId` is still in Stripe's blocking set. In that case, the job always keeps the stale local subscription and cancels every other blocking subscription for the customer, even when another Stripe subscription has a later billing period end.

Observed behavior:
- If local state points at any blocking subscription for the customer, that subscription is always treated as canonical.
- With `dryRun=false`, all other blocking subscriptions are canceled, including longer-lived subscriptions that Stripe state would otherwise rank ahead.

Expected behavior:
- Reconciliation should choose the canonical subscription from the full blocking set using the documented period-end sort and deterministic tie-break, regardless of which subscription happened to be stored locally.

## Impact

- The cron job can cancel the wrong paid Stripe subscription for a customer with duplicate blocking subscriptions.
- Local billing state can be rewritten to a stale subscription even when Stripe has a better canonical candidate.
- This can shorten entitlement windows, preserve the wrong plan, or cancel the subscription that should have remained active.
- Because this is an automated reconciliation path, the blast radius is broader than a single interactive request once duplicate subscription state exists.

## Steps to Reproduce

1. Create a customer with multiple blocking Stripe subscriptions, for example:
   - local DB row points to `sub_keep` with `currentPeriodEnd = 1700000000`
   - Stripe also has `sub_dup_1` with `currentPeriodEnd = 1700000100`
   - Stripe also has `sub_dup_2` with `currentPeriodEnd = 1700000200`
2. Run the reconciliation job with `dryRun=false`.
3. Observe that the job keeps `sub_keep` solely because it is the current local row.
4. Observe that it cancels `sub_dup_1` and `sub_dup_2`, even though both have later period ends and should have won the canonical selection.

## Root Cause

Tracer-bullet path at filing time (pre-fix):
1. The reconciliation job built `canonicalById` for all blocking subscriptions.
2. Its Phase 3 comment said canonical selection should use period-end sort plus deterministic tie-break.
3. The actual selection short-circuited to `row.stripeSubscriptionId` whenever that id was present in `blockingSubscriptionIds`.
4. The sort by `currentPeriodEnd` only ran when the local row was not itself blocking.
5. Duplicate cancellation was then driven off that biased `keptSubscriptionId`.
6. At filing time, the test suite explicitly documented this wrong behavior as expected and asserted cancellation of the newer subscriptions.

## Recommended Fix

- Remove the `blockingSubscriptionIds.includes(row.stripeSubscriptionId) ? row.stripeSubscriptionId : ...` short-circuit.
- Always derive the canonical subscription from the full normalized blocking set using the documented sort:
  - highest `currentPeriodEnd`
  - deterministic subscription-id tie-break
- Add regression coverage for the destructive case where the local row is blocking but does not have the latest period end.
- Re-run reconciliation in dry-run mode against any real duplicate-subscription customers before enabling destructive cancellation.

## Verification

- [x] Code-level tracer-bullet verified on 2026-03-10.
- [x] At filing time, the existing tests encoded the buggy behavior instead of guarding against it.
- [x] BUG-205 fix verified on branch: Phase 3 now always sorts the full blocking set, and regression tests cover the destructive local-blocker case, the lexicographic tie-break, and persist-before-cancel sequencing.
- [x] Full branch verification passed on 2026-03-11: `pnpm typecheck`, `pnpm lint`, `pnpm test --run`, `pnpm test:browser`, `pnpm build`, `pnpm test:integration`.
- [ ] Manual dry-run against a real duplicate-subscription customer set.

## Related

- [docs/_archive/bugs/bug-120-reconciliation-missing-authoritative-conflict-strategy.md](./bug-120-reconciliation-missing-authoritative-conflict-strategy.md) fixed a separate reconciliation correctness gap in the same job.
- [docs/_archive/debt/debt-155-stripe-legacy-duplicate-subscriptions-reconciliation.md](../debt/debt-155-stripe-legacy-duplicate-subscriptions-reconciliation.md) documents the duplicate-subscription cleanup effort this job is supposed to perform safely.
