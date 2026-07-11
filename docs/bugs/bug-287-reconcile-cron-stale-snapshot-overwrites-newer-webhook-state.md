# BUG-287: Reconcile Cron Can Revert a Newer Webhook-Applied Subscription State to Its Stale Phase-1 Snapshot (No Recency Fence)

**Status:** Open
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (Cycle B2 independently re-derived the stale-write interleavings and replaced the non-causal timestamp fix)
**Component:** Billing / reconcile cron

---

## Resolution State

- Implementation branch: `fix/bug-287-subscription-version-fence`.
- Pull request: **Fix BUG-287: optimistic observation-version fence for subscription writes** (URL pending completion of the required local gate).
- The implementation uses the decided monotonic observation-version CAS and bounded whole-operation retries across reconcile, webhook, and checkout-success writers. It does not add or consult local request timestamps, Stripe event `created`, or a Stripe-state timestamp.
- Status remains **Open** until the merged change has post-deploy production proof.

## Summary

[`shouldPersistSubscriptionWrite`](../../src/domain/services/subscription-write-guard.ts#L38-L42) unconditionally persists any write whose `subscriptionIdentity` matches the stored row, and [`stripe_subscriptions`](../../db/schema.ts#L173-L194) stores no Stripe-side version or state timestamp — [`updatedAt` is set to the database write time](../../src/adapters/repositories/drizzle-subscription-repository.ts#L84), not the time the state was observed at Stripe. The daily production reconcile cron ([`vercel.json`](../../vercel.json#L6-L7): `dryRun=false&scope=all`, `0 8 * * *` UTC) snapshots each subscription in [Phase 1](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L91-L102) but writes it only in [Phase 4](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L232-L246), after a `subscriptions.list` round-trip plus sequential per-blocking-subscription retrieves under retry/backoff — and when the customer has no blocking subscriptions, [the canonical value remains the stale Phase-1 snapshot](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L136). [Vercel invokes configured cron jobs against the production deployment](https://vercel.com/docs/cron-jobs#how-cron-jobs-work).

A subscription state change committed by a webhook inside that Phase-1-to-Phase-4 window is silently overwritten by the stale snapshot. The advisory lock + `FOR UPDATE` in the [repository transaction](../../src/adapters/repositories/drizzle-subscription-repository.ts#L80-L109) serialize writes by *arrival* order, not causality — the guard is consulted inside the locked transaction, so this is purely a causality/fencing gap, not a lost-lock race.

## Reachability

- Scheduled production path: Vercel invokes the `vercel.json` cron once daily with `dryRun=false&scope=all`. The all-pages orchestrator advances through local `stripe_subscriptions` rows but can stop at its 100-page or 40-second budget ([`reconcile-all-stripe-subscription-pages.ts#L95-L147`](../../src/adapters/jobs/reconcile-all-stripe-subscription-pages.ts#L95-L147)); the defect applies to each row it reaches. The authenticated route can also be invoked manually; "production" describes the scheduler, not an environment guard in the route.
- The per-row race window is that row's *own* Phase-1-to-Phase-4 span — one `subscriptions.list` round-trip minimum for typical single-subscription customers, stretching to seconds under `callStripeWithRetry` backoff or multi-subscription customers. Processing 500 rows does not compound any single row's window.
- The user's subscription state must change *at Stripe* inside that window, and the resulting webhook must commit before the cron's Phase 4. For immediate entitlement re-grant, the newer state must be non-entitled (`canceled`, `unpaid`, `paused`, `incomplete`, or `incomplete_expired`); this app intentionally still entitles `past_due`. Stripe's Customer Portal [supports both immediate and period-end cancellation modes](https://docs.stripe.com/api/customer_portal/configurations/object#portal_configuration_object-features-subscription_cancel-mode), but the live Dashboard mode is not encoded in this repository. An at-period-end cancel keeps status `active` and changes `cancelAtPeriodEnd`, so that variant produces stale UI/state rather than immediate entitlement re-grant.
- A second variant exists between two concurrent webhook deliveries: the processor's re-fetch ([`stripe-webhook-processor.ts#L45`](../../src/adapters/gateways/stripe/stripe-webhook-processor.ts#L45), [`#L137`](../../src/adapters/gateways/stripe/stripe-webhook-processor.ts#L137)) precedes the locked transaction, so two in-flight deliveries can commit in the reverse of retrieve order. Its duration is scheduling-dependent, not provably millisecond-bounded.

## Reproduction

Exact interleaving (single-subscription customer):

1. Cron Phase 1 retrieves the subscription: `status=active`, `currentPeriodEnd` in the future ([reconcile-stripe-subscriptions.ts#L91-L102](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L91-L102)).
2. Inside the window before Phase 4 (during the `subscriptions.list` call at [#L120-L129](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L120-L129)), the subscription is immediately canceled at Stripe or transitions to a non-entitled state such as `unpaid`. A transition only to `past_due` changes stored billing status but does not revoke this app's entitlement.
3. The `customer.subscription.deleted`/`updated` webhook re-fetches the new state ([stripe-webhook-processor.ts#L137](../../src/adapters/gateways/stripe/stripe-webhook-processor.ts#L137)) and commits it via `subscriptions.upsert` ([drizzle-subscription-repository.ts#L72-L109](../../src/adapters/repositories/drizzle-subscription-repository.ts#L72-L109)).
4. With no blocking subscriptions, `canonical` stays the stale Phase-1 snapshot ([#L136](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L136)); Phase 4 upserts it ([#L238-L245](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L238-L245)). The guard sees matching `subscriptionIdentity` and returns `true` with no recency comparison ([subscription-write-guard.ts#L38-L42](../../src/domain/services/subscription-write-guard.ts#L38-L42)).

Expected: the row keeps the newer webhook-committed state (canceled/unpaid).

Actual: the row reverts to `active` with a future `currentPeriodEnd`, and the user regains entitlement until another webhook or a successful reconciliation corrects it. The mirror direction also holds: if the webhook applied a renewal (new `currentPeriodEnd`), the cron can write back the just-expired period end and wrongly revoke entitlement. The daily schedule makes the nominal repair interval about a day, but it is not a 24-hour upper bound: [Vercel does not retry failed cron invocations](https://vercel.com/docs/cron-jobs/manage-cron-jobs#cron-job-error-handling), and this route can also report per-row failures without throwing the whole invocation.

## Root Cause

Same-identity writes have no recency fence:

- [`subscription-write-guard.ts#L38-L42`](../../src/domain/services/subscription-write-guard.ts#L38-L42) — `if (input.stored.subscriptionIdentity === input.incoming.subscriptionIdentity) { return true; }` accepts every same-subscription write regardless of which Stripe state is newer. `SubscriptionWriteCandidate` ([#L7-L11](../../src/domain/services/subscription-write-guard.ts#L7-L11)) carries no source timestamp to compare.
- [`db/schema.ts#L173-L194`](../../db/schema.ts#L173-L194) — the table has no Stripe-side version/timestamp column; [`updatedAt = this.now()`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L84) records write time only.
- [`reconcile-stripe-subscriptions.ts`](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L91-L246) — the retrieve-to-write span (Phase 1 at L91 to Phase 4 at L238) is the interleaving window; the guard call inside the locked transaction ([drizzle-subscription-repository.ts#L92](../../src/adapters/repositories/drizzle-subscription-repository.ts#L92)) cannot detect that its input snapshot is older than the stored row's source state.

[BUG-242](../_archive/bugs/bug-242-stale-subscription-webhook-overwrites-active-row.md)'s fix deliberately covered only the cross-subscription identity gap; its archive states "The re-fetch design correctly handles all single-subscription out-of-order arrivals; this bug is strictly the cross-subscription identity gap" — true for sequential out-of-order webhook deliveries (each re-fetches current state before writing), but not for this retrieve-to-write interleaving, where the re-fetch itself is what goes stale.

## Impact

- Entitlement re-grant: a canceled/unpaid user reads as `active` with a future period end until a later webhook or successful reconciliation repairs the row.
- Entitlement revocation: a just-renewed user can be reverted to the expired period end and locked out of paid content over the same interval.
- Lesser variant: wrong `cancelAtPeriodEnd` flag / UI state from an in-window portal cancel.

Severity rationale (P3, not P2): the preconditions are narrow — the Stripe-side state change and its webhook commit must both land inside one row's Phase-1-to-Phase-4 network-I/O window during the once-daily cron. The anomaly is silent and normally converges on a later event or successful daily run, but that repair is not time-bounded when a cron invocation or row fails. No Stripe-side state is destroyed. It is not P4 because the failure mode is a real entitlement inversion in production billing state, in both directions.

## Proposed Fix

1. **RECOMMENDED — add an optimistic observation fence.** Add a monotonic database `version` to `stripe_subscriptions`. Each Stripe-refresh operation must read the local version **before** its Stripe retrieve, then pass that expected version into `upsert`; inside the existing advisory-locked transaction, update only when the stored version still matches and increment it on success. A mismatch retries the entire local-read → Stripe-retrieve → write operation. For a first-seen external subscription where user identity is discovered only by retrieving Stripe, treat the first pass as discovery when a user row already exists, then capture that user's version and re-retrieve before writing. This closes both the cron and concurrent-webhook interleavings without holding a database transaction open across network I/O.
2. Do **not** synthesize a causal fence from local request time or Stripe event `created`. Request issue/response times can be reordered by network latency, while an event's creation time predates the handler's current-state re-fetch and is not the version of the returned Subscription object. Such a timestamp can reject a newer observation or accept an older one.
3. Cheaper mitigation — re-retrieve the chosen canonical subscription immediately before Phase 4. This shrinks the cron window but does not fence it and does not fix concurrent webhook retrieves.
4. Accept + document as a retry-backed but unbounded anomaly, given the narrow window and daily convergence opportunity, recording the ruling in the register (precedent: [DEBT-408](../_archive/debt/debt-408-clerk-ui-solana-react-native-subtree.md) and the DEBT-437 ACCEPT rulings).

## Related

- [BUG-242](../_archive/bugs/bug-242-stale-subscription-webhook-overwrites-active-row.md) — fixed the cross-subscription identity gap in the same guard; explicitly scoped its same-subscription ruling to sequential out-of-order arrivals under the re-fetch design, so this finding is not a regression of that fix.
- [DEBT-437](../_archive/debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) — ACCEPT-ruling precedent cited by remediation option 4; verified as a different seam, not reducible to that ruling.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
