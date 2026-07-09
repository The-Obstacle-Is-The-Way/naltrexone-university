# BUG-288: Checkout Completed After Clerk Account Deletion Creates an Orphaned Stripe Subscription That Bills Indefinitely

**Status:** Active
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** Billing / account deletion

---

## Summary

The Clerk `user.deleted` flow ([`clerk-webhook-controller.ts#L325-L373`](../../src/adapters/controllers/clerk-webhook-controller.ts#L325-L373)) deletes the local user (cascading `stripe_customers`/`stripe_subscriptions`), tombstones the Clerk id, runs a point-in-time `stripe.subscriptions.list({ status: 'all' })` cancel loop ([`stripe-subscription-canceler.ts#L36-L40`](../../src/adapters/gateways/stripe-subscription-canceler.ts#L36-L40)), then deletes the `pending_stripe_cancellations` row. It never expires open Checkout Sessions and never deletes the Stripe customer. A Checkout Session opened before deletion (completable for up to 24h by Stripe default) can therefore still complete afterward, creating a **new** active Stripe subscription carrying `subscription_data.metadata.user_id` = the now-deleted local UUID ([`stripe-checkout-sessions.ts#L678-L682`](../../src/adapters/gateways/stripe/stripe-checkout-sessions.ts#L678-L682)).

The resulting `checkout.session.completed` webhook resolves that userId from metadata ([`stripe-subscription-normalizer.ts#L32`](../../src/adapters/gateways/stripe/stripe-subscription-normalizer.ts#L32)) and calls `subscriptions.upsert` ([`stripe-webhook-controller.ts#L126`](../../src/adapters/controllers/stripe-webhook-controller.ts#L126)). The INSERT violates the `stripe_subscriptions.user_id → users.id` FK ([`db/schema.ts#L177-L179`](../../db/schema.ts#L177-L179)); FK violation 23503 is not a unique violation, so the repository wraps it as `INTERNAL_ERROR` ([`drizzle-subscription-repository.ts#L135-L148`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L135-L148)), the controller marks the event failed ([`stripe-webhook-controller.ts#L148`](../../src/adapters/controllers/stripe-webhook-controller.ts#L148)), and the route 500s ([`app/api/stripe/webhook/handler.ts#L97-L101`](../../app/api/stripe/webhook/handler.ts#L97-L101)) until Stripe exhausts retries (~3 days). Nothing then cancels the subscription — the deleted user's card is charged every cycle until a human notices.

## Reachability

Any subscribed-or-new user who opens Stripe Checkout, deletes their Clerk account while the session is still open, and then completes payment within the session's lifetime (~24h by Stripe default; the session may also be completed by anyone holding the checkout URL). The window is narrow and requires an unusual user sequence, but every step is a production-reachable, unauthenticated-past-checkout action; the codebase's own `checkout.sessions.expire` calls ([`stripe-checkout-sessions.ts#L253`](../../src/adapters/gateways/stripe/stripe-checkout-sessions.ts#L253), [`#L606`](../../src/adapters/gateways/stripe/stripe-checkout-sessions.ts#L606)) confirm open sessions persist unless explicitly expired.

## Reproduction

1. User opens Stripe Checkout — a session is created with `customer: cus_X` and `subscription_data.metadata.user_id: <local UUID>` ([`stripe-checkout-sessions.ts#L669-L683`](../../src/adapters/gateways/stripe/stripe-checkout-sessions.ts#L669-L683)).
2. User deletes their Clerk account. `user.deleted` processing succeeds: the local user row cascade-deletes `stripe_customers`/`stripe_subscriptions`, the Clerk id is tombstoned, `cancelStripeCustomerSubscriptions(cus_X)` cancels the point-in-time subscription list, and the `pending_stripe_cancellations` row is deleted ([`clerk-webhook-controller.ts#L361-L373`](../../src/adapters/controllers/clerk-webhook-controller.ts#L361-L373)).
3. Within the session's lifetime, the user (or anyone with the checkout URL) completes payment. Stripe creates a new active subscription on `cus_X` and emits `checkout.session.completed`.
4. The webhook resolves userId from subscription metadata ([`stripe-subscription-normalizer.ts#L32`](../../src/adapters/gateways/stripe/stripe-subscription-normalizer.ts#L32)); `subscriptions.upsert` INSERTs with the deleted UUID; Postgres raises FK violation 23503; the repository throws `INTERNAL_ERROR` ([`drizzle-subscription-repository.ts#L143-L148`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L143-L148)); `stripeEvents.markFailed` records it ([`stripe-webhook-controller.ts#L148`](../../src/adapters/controllers/stripe-webhook-controller.ts#L148)); the route returns 500 and Stripe retries for ~3 days, then gives up.

Expected: the Stripe subscription is canceled (or the checkout is prevented from completing) because the account no longer exists.

Actual: the Stripe-side subscription stays active with no local record, and the deleted user's card is billed every cycle indefinitely.

## Root Cause

Two seams combine:

1. **The deletion flow's Stripe cleanup is point-in-time and one-shot.** [`cancelStripeCustomerSubscriptions`](../../src/adapters/gateways/stripe-subscription-canceler.ts#L31-L40) cancels only the subscriptions that exist at that instant, and the `pending_stripe_cancellations` row is drained on success ([`clerk-webhook-controller.ts#L366-L373`](../../src/adapters/controllers/clerk-webhook-controller.ts#L366-L373)), so the BUG-246 drain machinery cannot fire for a subscription created afterward. Open Checkout Sessions are never expired and the Stripe customer is never deleted, leaving the front door open.
2. **No recovery path sees the orphan.** The Stripe webhook write path never consults `deleted_clerk_users` tombstones (a grep of the controller and gateways found zero references), so the FK failure is treated as a generic internal error rather than a "user is gone — cancel the subscription" signal. The reconcile cron iterates only local `stripeSubscriptions.findMany` rows ([`reconcile-stripe-subscriptions/route.ts#L197-L198`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L197-L198)), so a Stripe-only subscription is invisible to it. The live Stripe Dashboard one-subscription-per-customer backstop (BUG-245) does not apply because the customer has zero subscriptions after the deletion-time cancel.

## Impact

Money moves wrong: a deleted user's card is charged every billing cycle with no local record and no automated remediation, until an operator notices the failing-webhook signal in the Stripe dashboard or the persisted `stripe_events` error row. **Severity rationale (P3, not P2):** the preconditions are narrow — checkout opened before deletion, completed after, inside a roughly 24h window — and partial observability exists (the `markFailed` error row plus route 500s surface in Stripe's failing-webhook dashboard and emails), so despite the money-moves-wrong consequence the trigger is rare and human-detectable.

## Proposed Fix

- **Option 1 (recommended — smallest closure of the race):** in the Stripe webhook write path, treat a subscription upsert that fails because the user row is absent (FK 23503 on `stripe_subscriptions.user_id`, or an explicit pre-check that the `users` row is gone / a `deleted_clerk_users` tombstone exists) as a signal to cancel the just-created Stripe subscription — schedule a `pending_stripe_cancellations` row keyed to the Stripe event with the event's `externalCustomerId` and mark the event processed. The existing BUG-246 drain in the billing-maintenance cron then cancels it idempotently with already-shipped machinery.
- **Option 2:** expire open Checkout Sessions during `user.deleted` processing — `stripe.checkout.sessions.list({ customer })` plus `sessions.expire`, both already wrapped in this codebase ([`stripe-checkout-sessions.ts#L253`](../../src/adapters/gateways/stripe/stripe-checkout-sessions.ts#L253), [`#L606`](../../src/adapters/gateways/stripe/stripe-checkout-sessions.ts#L606)) — before running the cancel loop. This closes the front door but still leaves a tiny complete-during-cancel window, so pair it with Option 1 or accept the residue.
- **Option 3 (broader, heavier):** extend the reconcile cron to also scan Stripe-side subscriptions per known customer (or via `stripe.subscriptions.list`) and flag/cancel any active subscription whose `metadata.user_id` has no local `users` row. Closes this and any future local-row-missing orphan class, at the cost of extra Stripe API volume.

Verification caveat carried from the finding: every code link was read and verified in a read-only audit (nothing executed); the one non-code premise — that a Stripe Checkout Session remains completable for up to 24h after creation and is not invalidated by canceling the customer's other subscriptions — is standard documented Stripe behavior, corroborated by the codebase's own explicit `sessions.expire` calls.

## Related

- [BUG-246](../_archive/bugs/bug-246-deleted-account-stripe-cancellation-no-drain.md) — fixed the drain for cancellations that FAILED at deletion time; it explicitly scoped its gap as "strictly the absence of any drain after Svix retries" and did not rule on subscriptions created after a successful deletion. Its drain cannot fire here because the pending row is deleted on success. Not a duplicate.
- [BUG-208](../_archive/bugs/bug-208-clerk-webhook-deletion-not-transactional.md) / [BUG-209](../_archive/bugs/bug-209-clerk-webhook-lacks-idempotency.md) — deletion transactionality/idempotency; unrelated to this post-deletion race.
- [DEBT-303](../_archive/debt/debt-303-reconciliation-cancel-idempotency.md) / [DEBT-304](../_archive/debt/debt-304-clerk-user-deleted-cancel-idempotency.md) — idempotent-cancel hardening of the machinery this bug would reuse; unrelated as causes.
- [DEBT-422](../_archive/debt/debt-422-reconciliation-cron-single-page-coverage.md) — reconcile-cron pagination; unrelated (the cron's blindness here is scope, not pagination).

Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
