# BUG-285: Stripe Webhook `markFailed` Runs on the Already-Aborted Transaction — Failure State Never Persists and the Top-Level Error Is Replaced

**Status:** Resolved
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; Cycle B1 re-audit confirmed the failure-domain defect and narrowed its production reachability/logging claims)
**Component:** Stripe webhook / event ledger
**Resolution State:** Implemented on branch `fix/bug-285-286-stripe-failure-domain-lock-order` in [PR #626](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/626), "Fix BUG-285/286: durable Stripe webhook failure state + canonical subscription-writer lock order" (pending review, merge, and production proof). Phase A moves failure persistence to a fresh transaction, preserves the original processing error, and adds unit plus real-Postgres aborted-transaction regressions.

---

## Resolution (2026-07-11)

Fixed in PR #626 (squash `8e011843` to dev), promoted via PR #631 (main `c12d608b`); production deploy succeeded and `https://addictionboards.com/` returned HTTP/2 200. Exactly this doc's Option 1: the controller captures the mapped processing error and rethrows so the failing transaction rolls back; failure state is persisted in a fresh transaction (claim + lock + successful-event guard + `markFailed`) mirroring the Clerk pattern; the captured processing error is preferred over the driver's rejection and remains the external error; the `{ ok: false }` return-from-aborted-transaction pattern was removed. Pinned by the real-Postgres statement-abort regression in `tests/integration/stripe-webhook-failure-boundary.integration.test.ts`.


## Summary

`processStripeWebhook`'s catch block calls [`stripeEvents.markFailed`](../../../src/adapters/controllers/stripe-webhook-controller.ts#L148) on the **same** database transaction that just failed. The container binds all three webhook repos (`stripeEvents`, `subscriptions`, `stripeCustomers`) to one shared postgres-js `db.transaction` at [`lib/container/controllers.ts#L24-L31`](../../../lib/container/controllers.ts#L24-L31). When a direct statement inside that transaction raises a raw Postgres error — concretely, a `23505` unique violation on `stripe_customers_stripe_customer_id_uq` from [`DrizzleStripeCustomerRepository.insert`](../../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L33-L46) after the subscription write has persisted — Postgres aborts the outer transaction even though the repo converts the error to `ApplicationError` `CONFLICT`. The subsequent `markFailed` UPDATE then dies with `25P02` ("current transaction is aborted"), the whole transaction (including the `stripe_events` claim row) rolls back, and the thrown top-level error is the failed `markFailed` query rather than the mapped `CONFLICT`.

The original error is obscured, not guaranteed absent from logs: `toErrorData(error)` is passed as the failed UPDATE's query parameter, and Drizzle includes query parameters in `DrizzleQueryError.message`. [DEBT-386](../debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md#L142-L161) recorded both the original `ApplicationError` and the secondary `25P02` in Vercel logs. The durable failure-row defect remains: neither error is committed to `stripe_events`.

[BUG-183](./bug-183-stripe-webhook-failure-state-rolled-back.md)'s fix — returning `{ ok: false }` instead of throwing, so the transaction callback commits after `markFailed` — assumed the transaction was still commit-able; it does not cover this class of pg-level abort. [DEBT-386](../debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md#L161) observed the secondary `25P02` in real Vercel logs and explicitly scoped it out as "cleanup noise after the primary conflict, not the root cause" — recorded, never filed as its own issue until now.

## Reachability

The concrete customer-uniqueness trigger requires all of the following: a Stripe subscription event normalizes to an existing local user `B`; [`subscriptions.upsert`](../../../src/adapters/controllers/stripe-webhook-controller.ts#L125-L134) returns `persisted: true`; and the event's `externalCustomerId` is already mapped to a different local user `A`. This is narrower than merely receiving mismatched subscription metadata. In the common case where the same external subscription ID is already stored for `A`, the nested subscription upsert fails first at its own unique constraint/savepoint, leaving the outer transaction healthy enough to persist the event failure.

DEBT-386 empirically observed the `stripeCustomers.insert` conflict followed by `25P02` in dev-preview under the controller ordering that existed then. Its cross-environment E2E source is now guarded by explicit `e2e_owner` mismatch handling, and the controller now performs `subscriptions.upsert` before `stripeCustomers.insert`. The previously claimed deleted/recreated-user and BUG-245 duplicate-subscription paths do not by themselves establish today's three-part precondition. Current production reachability therefore requires pre-existing cross-table ownership drift that survives the subscription write (for example, operator-edited Stripe metadata plus compatible local subscription state), or another raw Postgres failure on a direct outer-transaction statement such as the separately filed deadlock path in BUG-286. No normal first-party production writer was proven in this audit to create the required cross-table drift.

## Reproduction

Exact interleaving (all inside the single shared transaction opened at [`controllers.ts#L24-L31`](../../../lib/container/controllers.ts#L24-L31)):

1. A `customer.subscription.updated` event arrives for local user `B`; its external customer is mapped to `A`, and its subscription data is such that `subscriptions.upsert` can persist for `B` rather than failing an earlier FK/unique/write-policy check.
2. [`subscriptions.upsert`](../../../src/adapters/controllers/stripe-webhook-controller.ts#L126-L134) persists — safely, because [`drizzle-subscription-repository.ts#L80`](../../../src/adapters/repositories/drizzle-subscription-repository.ts#L80) opens a nested `this.db.transaction` (a savepoint when `this.db` is the outer tx), so the outer transaction stays healthy.
3. [`stripeCustomers.insert`](../../../src/adapters/controllers/stripe-webhook-controller.ts#L137-L141) issues `INSERT .. ON CONFLICT (user_id)` **directly on the outer tx** ([`drizzle-stripe-customer-repository.ts#L33-L46`](../../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L33-L46) — the conflict target at [L36-L37](../../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L36) is `user_id` only). Postgres raises `23505` on the *other* unique index, [`stripe_customers_stripe_customer_id_uq`](../../../db/schema.ts#L166-L168), aborting the outer transaction at the pg level.
4. The repo catch converts the `23505` to `ApplicationError` `CONFLICT` ([`drizzle-stripe-customer-repository.ts#L69-L74`](../../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L69-L74)) and throws — but the pg session is already in the aborted state.
5. The controller catch calls [`stripeEvents.markFailed`](../../../src/adapters/controllers/stripe-webhook-controller.ts#L148); `markFailed` is a plain UPDATE on the bound tx with no savepoint or repository-level catch ([`drizzle-stripe-event-repository.ts#L71-L76`](../../../src/adapters/repositories/drizzle-stripe-event-repository.ts#L71-L76)). Postgres rejects it with `25P02`, which Drizzle wraps as a `DrizzleQueryError`.
6. The transaction callback rejects with the `25P02` error; drizzle rolls back everything, including the `stripe_events` claim row.
7. The handler logs `'Stripe webhook failed'` with the `markFailed` `DrizzleQueryError`/`25P02` as the top-level error ([`handler.ts#L97`](../../../app/api/stripe/webhook/handler.ts#L97)) and returns 500. Depending on logger serialization, the failed query parameters can still expose the serialized original error; DEBT-386's captured logs showed both.

**Expected:** the failure is durably recorded on the `stripe_events` row (the live spec requires `error = <string>` and `processed_at = null` on failure at [`master_spec.md#L770-L779`](../../specs/master_spec.md#L770-L779)), and the logged error is the root-cause `CONFLICT`.

**Actual:** zero persisted failure record, the `CONFLICT` is no longer the top-level thrown error, and Stripe redelivers in live mode for up to three days, each attempt repeating while the underlying state remains unchanged.

## Root Cause

`markFailed` shares the transaction whose failure it is recording. That is only safe when the failure left the transaction commit-able (e.g. an `ApplicationError` thrown before any pg statement errored). Two facts break it here:

- [`lib/db.ts#L2`](../../../lib/db.ts#L2) uses `drizzle-orm/postgres-js`: a raw statement error puts the *session's* transaction into the aborted state regardless of what the JS layer throws afterward.
- The subscription repo is protected by an incidental savepoint ([`drizzle-subscription-repository.ts#L80`](../../../src/adapters/repositories/drizzle-subscription-repository.ts#L80)), but the stripe-customer repo is not — an undocumented contract at the [`controllers.ts#L24`](../../../lib/container/controllers.ts#L24) seam.

The clerk webhook controller already implements the correct pattern: `persistFailure` opens a **fresh** `deps.transaction` after the failed one ([`clerk-webhook-controller.ts#L177-L194`](../../../src/adapters/controllers/clerk-webhook-controller.ts#L177-L194)). That pattern is absent at the Stripe seam.

Fake-backed tests cannot detect this: fakes never enter an aborted-transaction state. The existing regression test passes a *rollback* harness, not an *abort* harness ([`stripe-webhook-controller.test.ts#L618`](../../../src/adapters/controllers/stripe-webhook-controller.test.ts#L618)).

## Impact

- The [spec-required durable failed-event state](../../specs/master_spec.md#L770-L779) does not record this attempt. A first failure leaves no event row; if an older failed row already existed, the abort preserves that stale row rather than the current attempt's error.
- The 500 log promotes the secondary `25P02`/failed `markFailed` query over the actual processing error. The original can survive in serialized query parameters (as DEBT-386 observed), but diagnostics are indirect and driver-format-dependent rather than a stable top-level error contract.
- [Stripe documents](https://docs.stripe.com/webhooks#automatic-retries) automatic live-mode retries for up to three days; each attempt repeats the abort cycle while the underlying drift remains.

**Severity rationale (P3, not P2):** the failure is fail-closed — the rollback is total, so there is no data corruption or partial write. The concrete customer-conflict precondition is narrow, its historical E2E creator is now guarded, and no normal first-party production writer was proven to create today's required cross-table drift. But the failure-domain defect is live for any direct statement that aborts the shared transaction: the durable-failed-event-state requirement is violated and diagnostics demote the processing error beneath a cleanup failure. Kind = bug (not debt) because reachable Postgres aborts make the promised failure state impossible, not merely at risk.

## Proposed Fix

**Option 1 (RECOMMENDED) — mirror the clerk-webhook failure boundary.** Capture the mapped processing error, then rethrow it from the processing callback so the first transaction rolls back. Catch the `deps.transaction` rejection outside that boundary; postgres-js may surface the raw statement error instead of the callback's mapped error after an abort, so prefer the captured processing error when one exists. Next, run a `persistFailure` helper in a **fresh** `deps.transaction` (claim + lock + successful-event guard + `markFailed`, as in [`clerk-webhook-controller.ts#L177-L194`](../../../src/adapters/controllers/clerk-webhook-controller.ts#L177-L194)), log any persistence failure without replacing the original processing error, then throw that original error. Do not rely on returning `{ ok: false }` from an already-aborted transaction: postgres-js checks its recorded statement error before commit and rejects the transaction even when the callback resolves.

**Option 2 — savepoint-wrap the pg-error-prone statement.** Run `stripeCustomers.insert` inside a nested `this.db.transaction` (savepoint), as the subscription repo already does, and add a contract comment at the [`controllers.ts#L24`](../../../lib/container/controllers.ts#L24) seam documenting that any repo write inside this shared tx must savepoint-wrap statements that can raise raw pg errors — otherwise the `markFailed` recovery path is dead. Narrower fix; leaves the undocumented-contract trap for future repos.

**Option 3 (insufficient alone) — preserve diagnostics outside the failed transaction.** Capture the original processing error, catch the outer transaction rejection, and log/rethrow the captured error without attempting fresh persistence. Merely catching `markFailed` and returning `{ ok: false }` inside the aborted callback is not enough: postgres-js still rejects before commit because it recorded the original statement failure. This option restores a stable external error but still leaves the failure ledger stale or absent.

Pair any option with a real-Postgres tx-bound integration regression that causes a statement-level abort and proves the failure row persists in the fresh transaction while the original processing error remains the external error. A focused unit harness may additionally model `25P02`, but it is not a substitute for the driver/MVCC proof; the existing rollback harness cannot express an aborted transaction.

## Related

- [BUG-183](./bug-183-stripe-webhook-failure-state-rolled-back.md) (archived) — fixed the structural throw-inside-callback rollback; its fix (commit-path `markFailed` + return `{ ok: false }`) is precisely what leaves this residual gap for pg-aborted transactions. Not a duplicate.
- [DEBT-386](../debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md) (archived) — empirically observed this exact secondary `25P02` in Vercel logs but explicitly ruled it outside its scope ("cleanup noise… not the root cause") without filing follow-up.
- [BUG-245](./bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) (archived) — audited and rejected as a direct creator of this bug's cross-user customer-mapping precondition; it created duplicate subscriptions for one user/customer, not ownership of one customer by two local users.
- No other active item duplicates this failure-persistence defect. [BUG-286](./bug-286-webhook-vs-reconcile-lock-order-deadlock.md) references BUG-285 because a webhook chosen as the deadlock victim at a direct outer-transaction statement can enter this cleanup failure; it tracks the lock inversion, not the missing durable failure record. Unrelated to the DEBT-437 ACCEPT ruling.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
