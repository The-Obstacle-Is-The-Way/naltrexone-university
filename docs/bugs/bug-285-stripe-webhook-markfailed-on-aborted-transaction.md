# BUG-285: Stripe Webhook `markFailed` Runs on the Already-Aborted Transaction — Failure State Never Persists and the Root Cause Is Masked

**Status:** Active
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** Stripe webhook / event ledger

---

## Summary

`processStripeWebhook`'s catch block calls [`stripeEvents.markFailed`](../../src/adapters/controllers/stripe-webhook-controller.ts#L148) on the **same** database transaction that just failed. The container binds all three webhook repos (`stripeEvents`, `subscriptions`, `stripeCustomers`) to one shared postgres-js `db.transaction` at [`lib/container/controllers.ts#L24-L31`](../../lib/container/controllers.ts#L24-L31). When a statement inside that transaction raises a raw Postgres error — concretely, a `23505` unique violation on `stripe_customers_stripe_customer_id_uq` from [`DrizzleStripeCustomerRepository.insert`](../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L33-L46) — Postgres aborts the outer transaction even though the repo converts the error to `ApplicationError` `CONFLICT`. The subsequent `markFailed` UPDATE then dies with `25P02` ("current transaction is aborted"), that error replaces the original `CONFLICT`, the whole transaction (including the `stripe_events` claim row) rolls back, and the route handler logs only the `25P02`.

[BUG-183](../_archive/bugs/bug-183-stripe-webhook-failure-state-rolled-back.md)'s fix — returning `{ ok: false }` instead of throwing, so the transaction callback commits after `markFailed` — assumed the transaction was still commit-able; it does not cover this class of pg-level abort. [DEBT-386](../_archive/debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md#L161) observed the secondary `25P02` in real Vercel logs and explicitly scoped it out as "cleanup noise after the primary conflict, not the root cause" — recorded, never filed as its own issue until now.

## Reachability

Triggered by any Stripe `customer.subscription.updated` event whose `metadata.user_id` maps to a user **different** from the one currently holding that `externalCustomerId` in `stripe_customers` (cross-user customer drift). Real-world paths into that state: a user deleted and re-created with a new `users.id` while stale subscription metadata remains in Stripe; operator action in the Stripe dashboard; or the duplicate-customer world [BUG-245](../_archive/bugs/bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) described. This exact interleaving was empirically observed in dev-preview Vercel logs during DEBT-386. In E2E/dev-preview the trigger is now mostly pre-empted by the `isE2EOwnerMismatchEvent` skip shipped with the DEBT-386 fix, which narrows but does not eliminate production reachability.

## Reproduction

Exact interleaving (all inside the single shared transaction opened at [`controllers.ts#L24-L31`](../../lib/container/controllers.ts#L24-L31)):

1. A `customer.subscription.updated` event arrives whose `user_id` differs from the user currently mapped to its `externalCustomerId`.
2. [`subscriptions.upsert`](../../src/adapters/controllers/stripe-webhook-controller.ts#L126-L134) persists — safely, because [`drizzle-subscription-repository.ts#L80`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L80) opens a nested `this.db.transaction` (a savepoint when `this.db` is the outer tx), so the outer transaction stays healthy.
3. [`stripeCustomers.insert`](../../src/adapters/controllers/stripe-webhook-controller.ts#L137-L141) issues `INSERT .. ON CONFLICT (user_id)` **directly on the outer tx** ([`drizzle-stripe-customer-repository.ts#L33-L46`](../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L33-L46) — the conflict target at [L36-L37](../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L36) is `user_id` only). Postgres raises `23505` on the *other* unique index, [`stripe_customers_stripe_customer_id_uq`](../../db/schema.ts#L166-L168), aborting the outer transaction at the pg level.
4. The repo catch converts the `23505` to `ApplicationError` `CONFLICT` ([`drizzle-stripe-customer-repository.ts#L69-L74`](../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L69-L74)) and throws — but the pg session is already in the aborted state.
5. The controller catch calls [`stripeEvents.markFailed`](../../src/adapters/controllers/stripe-webhook-controller.ts#L148); `markFailed` is a plain UPDATE on the bound tx with no savepoint and no error wrapping ([`drizzle-stripe-event-repository.ts#L71-L76`](../../src/adapters/repositories/drizzle-stripe-event-repository.ts#L71-L76)). Postgres rejects it with `25P02`.
6. The transaction callback rejects with the `25P02` error; drizzle rolls back everything, including the `stripe_events` claim row.
7. The handler logs only `'Stripe webhook failed'` with the `25P02` ([`handler.ts#L97`](../../app/api/stripe/webhook/handler.ts#L97)) and returns 500.

**Expected:** the failure is durably recorded on the `stripe_events` row (the durable failed-event-state requirement BUG-183 was meant to satisfy), and the logged error is the root-cause `CONFLICT`.

**Actual:** zero persisted failure record, the `CONFLICT` root cause is absent from the thrown error, and Stripe redelivers for ~3 days, each attempt repeating identically.

## Root Cause

`markFailed` shares the transaction whose failure it is recording. That is only safe when the failure left the transaction commit-able (e.g. an `ApplicationError` thrown before any pg statement errored). Two facts break it here:

- [`lib/db.ts#L2`](../../lib/db.ts#L2) uses `drizzle-orm/postgres-js`: a raw statement error puts the *session's* transaction into the aborted state regardless of what the JS layer throws afterward.
- The subscription repo is protected by an incidental savepoint ([`drizzle-subscription-repository.ts#L80`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L80)), but the stripe-customer repo is not — an undocumented contract at the [`controllers.ts#L24`](../../lib/container/controllers.ts#L24) seam.

The clerk webhook controller already implements the correct pattern: `persistFailure` opens a **fresh** `deps.transaction` after the failed one ([`clerk-webhook-controller.ts#L177-L194`](../../src/adapters/controllers/clerk-webhook-controller.ts#L177-L194)). That pattern is absent at the Stripe seam.

Fake-backed tests cannot detect this: fakes never enter an aborted-transaction state. The existing regression test passes a *rollback* harness, not an *abort* harness ([`stripe-webhook-controller.test.ts#L618`](../../src/adapters/controllers/stripe-webhook-controller.test.ts#L618)).

## Impact

- The spec-required durable failed-event state (master_spec.md, cited by BUG-183) never persists for this reachable error class — every redelivery starts from a blank ledger.
- The 500 log shows only the secondary `25P02`, masking the actual `CONFLICT` root cause and sending any operator investigating the failure down the wrong path (exactly what happened in DEBT-386 until deeper log archaeology).
- Stripe redelivers for ~3 days; each attempt repeats the identical abort cycle.

**Severity rationale (P3, not P2):** the failure is fail-closed — the rollback is total, so there is no data corruption or partial write. Preconditions are narrow (cross-user customer-mapping drift). But the wrongness is real and reachable today: a durable-state requirement is violated and diagnostics are actively misleading. Kind = bug (not debt) because the durable-failed-event-state requirement is violated for a reachable error class, not merely at risk.

## Proposed Fix

**Option 1 (RECOMMENDED) — mirror the clerk-webhook pattern.** In the controller catch, do **not** call `markFailed` inside the failing transaction; return `{ ok: false, error }`. After `deps.transaction` resolves/rolls back, run a `persistFailure` helper that opens a **fresh** `deps.transaction` (claim + lock + `markFailed`, exactly like [`clerk-webhook-controller.ts#L177-L194`](../../src/adapters/controllers/clerk-webhook-controller.ts#L177-L194)), wrapped in try/catch that logs persist errors without replacing the original error, then rethrow the original. This makes failure state durable for **all** error classes, including aborted-tx ones.

**Option 2 — savepoint-wrap the pg-error-prone statement.** Run `stripeCustomers.insert` inside a nested `this.db.transaction` (savepoint), as the subscription repo already does, and add a contract comment at the [`controllers.ts#L24`](../../lib/container/controllers.ts#L24) seam documenting that any repo write inside this shared tx must savepoint-wrap statements that can raise raw pg errors — otherwise the `markFailed` recovery path is dead. Narrower fix; leaves the undocumented-contract trap for future repos.

**Option 3 (insufficient alone) — try/catch around `markFailed`** at [`stripe-webhook-controller.ts#L148`](../../src/adapters/controllers/stripe-webhook-controller.ts#L148) that logs the persist failure and still returns `{ ok: false, error: originalError }`. This unmasks the root cause in logs but the failure ledger still never persists.

Pair any option with a regression test whose transaction harness simulates aborted-tx semantics — all statements after the first failure reject with a `25P02`-like error — since the existing rollback harness cannot express this.

## Related

- [BUG-183](../_archive/bugs/bug-183-stripe-webhook-failure-state-rolled-back.md) (archived) — fixed the structural throw-inside-callback rollback; its fix (commit-path `markFailed` + return `{ ok: false }`) is precisely what leaves this residual gap for pg-aborted transactions. Not a duplicate.
- [DEBT-386](../_archive/debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md) (archived) — empirically observed this exact secondary `25P02` in Vercel logs but explicitly ruled it outside its scope ("cleanup noise… not the root cause") without filing follow-up.
- [BUG-245](../_archive/bugs/bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) (archived) — one source of the duplicate-customer world that can produce the cross-user mapping drift precondition.
- No active debt/bug register entry matches (grep for `markFailed`/`25P02`/aborted hits only the two archived rows above). Unrelated to the DEBT-437 ACCEPT ruling.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
