# BUG-296: Post-Deletion Subscription Webhooks — Including Our Own `customers.del` Cancellations — Fail the Users FK as Generic `INTERNAL_ERROR` 500s Through the Provider Retry Window

**Status:** Open
**Severity:** P3
**Date:** 2026-07-14
**Confirmed:** 2026-07-14 (deferred residue disclosed in PR #634's pre-merge adversarial review and recorded in BUG-288's Resolution State as an archival condition; mechanics re-verified at source at the wave-2 close)
**Component:** Stripe webhook / event ledger / account deletion

---

## Resolution State

Implemented on branch `fix/bug-296-post-deletion-webhook-fk-ack` with BUG-288 Option 3's narrowly scoped defense-in-depth behavior. `DrizzleSubscriptionRepository.upsert` now inspects the database error cause chain and throws typed `SubscriptionUserMissingError` only when SQLSTATE `23503` and constraint `stripe_subscriptions_user_id_users_id_fk` both match. The webhook controller records that event as processed in a fresh transaction, skips the customer mapping write, and emits a structured warning containing the event id/type, Stripe customer id, local user id, and `user_missing` reason. All other foreign-key violations remain `INTERNAL_ERROR` failures.

TDD coverage was added before implementation at the repository boundary (deep cause-chain exact match plus wrong-constraint control), fake boundary (`FakeSubscriptionRepository.markUserMissing`), controller boundary (processed event, no customer write, structured warning), and real-Postgres HTTP boundary (deleted-user event returns 200 with a non-failed `stripe_events` row; a different `stripe_customers` user FK still returns 500 and records `INTERNAL_ERROR`). The existing deletion-vs-first-insert lock-order regression now also pins the acknowledged, non-resurrecting outcome after the deletion commits. The document remains **Status: Open** until wave-close archival with production proof.

## Summary

The BUG-288 fix (PR #634) made account deletion delete the Stripe Customer via [`stripe-customer-deleter.ts#L46-L49`](../../src/adapters/gateways/stripe-customer-deleter.ts#L46-L49) after the local deletion transaction commits. Stripe documents that [deleting a Customer immediately cancels its active subscriptions](https://docs.stripe.com/api/customers/delete), and each cancellation emits a `customer.subscription.deleted` webhook whose subscription object still carries the `metadata.user_id` our checkout stamped at creation. When that event arrives, the normalizer resolves the now-deleted local UUID ([`stripe-subscription-normalizer.ts#L32`](../../src/adapters/gateways/stripe/stripe-subscription-normalizer.ts#L32)), the controller's persist transaction calls `subscriptions.upsert` ([`stripe-webhook-controller.ts#L207`](../../src/adapters/controllers/stripe-webhook-controller.ts#L207)), and — because the cascade already removed the `stripe_subscriptions` row — the INSERT violates `stripe_subscriptions_user_id_users_id_fk` ([`db/schema.ts#L179`](../../db/schema.ts#L179), [`0000_jazzy_vermin.sql#L112`](../../db/migrations/0000_jazzy_vermin.sql#L112)).

`23503` is not a unique violation, so the repository wraps it as generic `ApplicationError('INTERNAL_ERROR')` ([`drizzle-subscription-repository.ts#L155-L168`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L155-L168) classifies only unique violations). The controller's `persistFailure` durably marks the event failed in a fresh transaction ([`stripe-webhook-controller.ts#L82-L112`](../../src/adapters/controllers/stripe-webhook-controller.ts#L82-L112)) and the route returns 500 ([`handler.ts#L97-L101`](../../app/api/stripe/webhook/handler.ts#L97-L101)). [Stripe retries failed live-mode deliveries for up to three days](https://docs.stripe.com/webhooks#automatic-retries); every retry reaches the same missing-user FK. Option 3 of BUG-288's Proposed Fix (repository-boundary classification of the missing-user FK) was deliberately deferred out of PR #634; both [BUG-288](../_archive/bugs/bug-288-checkout-completes-after-account-deletion-orphan-billing.md) and [BUG-294](../_archive/bugs/bug-294-user-deletion-cascade-inverts-subscription-lock-order.md) record this residue, and BUG-288's Resolution State made this filing an explicit condition of its archival.

## Reachability

Deterministic, not a race: every account deletion of a user holding an active Stripe subscription now triggers `customers.del`, whose cancellation events arrive after the local user row is gone (the Stripe I/O deliberately runs outside the deletion's database transaction). Subscriptions created outside our checkout carry no `metadata.user_id` and are skipped by the controller's `metadata_missing` warn path ([`stripe-webhook-controller.ts#L125-L135`](../../src/adapters/controllers/stripe-webhook-controller.ts#L125-L135)); ours always carry it, so they always proceed to the failing write. The same mechanism catches any in-flight or provider-redelivered subscription event that loses its race to the deletion — the redelivery arm BUG-294's Impact section describes.

## Reproduction

1. A user with an active subscription deletes their Clerk account. The `user.deleted` flow commits the local deletion (cascading `stripe_customers`/`stripe_subscriptions`), then deletes the Stripe Customer; Stripe cancels the subscription and emits `customer.subscription.deleted` carrying `metadata.user_id` = the deleted local UUID.
2. The webhook resolves the userId, claims the event, and calls `subscriptions.upsert`; with no stored row (cascade-deleted), the INSERT hits FK `23503`.
3. The repository wraps it as generic `INTERNAL_ERROR`; `persistFailure` marks the event failed; the route 500s.
4. Stripe retries for up to three days; each delivery repeats steps 2–3 identically.

Expected: an expected post-deletion terminal event for a nonexistent user is acknowledged (with a structured log) so the provider stops retrying, or at minimum fails with a typed, non-alarming classification.

Actual: a deterministic 500-per-delivery loop and a durable failed `stripe_events` row per event, indistinguishable in the ledger from a genuine processing outage.

## Root Cause

The repository boundary cannot distinguish "the user this write is for no longer exists" from any other database failure: [`drizzle-subscription-repository.ts#L155-L168`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L155-L168) classifies unique violations only, so the missing-user FK falls into the generic `INTERNAL_ERROR` wrap, which the webhook controller treats as retry-worthy failure. No layer consults deletion state: the write path never checks `deleted_clerk_users` tombstones (which are keyed by Clerk id, not the local UUID the event carries), and cleanup ownership already lives with the durable customer-deletion obligation — the retry loop remediates nothing.

## Impact

Operational noise with correct terminal state everywhere: Stripe-side the subscription is canceled, locally the rows are already gone, and no money moves. The cost is one durable failed `stripe_events` row per event plus repeated incident-shaped 500s for up to three days per deletion-with-subscription — alert fatigue that can mask a real webhook outage, and failed-event ledger growth (lifecycle owned by [DEBT-449](../debt/debt-449-webhook-event-ledger-lifecycle.md)). Severity P3, matching BUG-294's noise-class precedent: deterministic trigger, zero user-visible or billing impact, no data loss.

## Proposed Fix

1. **RECOMMENDED — classify the missing-user FK at the repository boundary, acknowledge at the controller (BUG-288 Option 3).** In `upsert`'s catch, detect SQLSTATE `23503` on constraint `stripe_subscriptions_user_id_users_id_fk` (via the `cause` chain, following the BUG-290 precedent of SQLSTATE-shaped classification) and surface a typed outcome (e.g. `persisted: false, reason: 'user_missing'` or a typed `ApplicationError` reason). The webhook controller then treats a subscription write for a nonexistent user as acknowledged success — mark the event processed, log a structured warn with event type and customer id — so provider retries stop. This is safe because the FK failure itself proves user absence at write time and cleanup ownership lies with the durable customer-cleanup obligation, which deletes the Stripe Customer (canceling any subscription that slipped through the window) with drain-backed retries; the event retry loop was never the remediation path.
2. **Alternative (weaker alone):** pre-check user existence in the controller before the persist transaction and short-circuit to acknowledged-skip. Costs a query per event and still needs the FK classification for the check-then-write race, so option 1 subsumes it.
3. **Mitigation only:** keep failing but map the classified FK to a typed, documented failure that ledger tooling can distinguish from outages. Stops the misclassification, not the 500 retry loop — same rejection rationale as BUG-294's option 3.

## Related

- [BUG-288 (archived)](../_archive/bugs/bug-288-checkout-completes-after-account-deletion-orphan-billing.md) — parent fix; its Option 3 is this doc's recommended fix, and its Resolution State's "explicitly deferred residue" clause is fulfilled by this filing.
- [BUG-294 (archived)](../_archive/bugs/bug-294-user-deletion-cascade-inverts-subscription-lock-order.md) — its deadlock victims' redeliveries land on this same FK path when the deletion commits first.
- [DEBT-449](../debt/debt-449-webhook-event-ledger-lifecycle.md) — owns failed-event ledger retention/lifecycle; this bug is a deterministic producer of failed rows until fixed.
- [DEBT-452](../debt/debt-452-db-failure-observability.md) — the generic-`INTERNAL_ERROR` observability seam this classification would improve.

Filed at the 2026-07-14 wave-2 close as the deferred BUG-288 residue (per that doc's archival condition), with mechanics re-verified at source in the deployed tree.
