# BUG-283: Clerk Webhook Email-Reclaim Fallback Is Dead Inside the Webhook Transaction (25P02 → Deterministic 500s)

**Status:** Resolved
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing; Cycle B1 re-audit confirmed the defect and corrected the event/recovery details)
**Component:** Clerk webhook / user provisioning

---

## Resolution (2026-07-11)

Fixed in PR #628 (squash `45bf6232` to dev), promoted via PR #630 (main `6b9fab48`); production deploy succeeded and `https://addictionboards.com/` returned HTTP/2 200. The upsert INSERT is now wrapped in a nested transaction (SAVEPOINT when tx-bound, BEGIN when raw), so a `users_email_uq` failure no longer aborts the caller's transaction and classification happens on a live outer transaction — behavior is identical for the raw-db sign-in and tx-bound webhook callers. Shipped together with BUG-284 per the coordination constraint (never alone). Pinned by tx-bound real-Postgres regressions in `tests/integration/user-repository.integration.test.ts` (outer transaction stays usable after the caught conflict on both write paths).


## Summary

[`DrizzleUserRepository.upsertByClerkId`](../../../src/adapters/repositories/drizzle-user-repository.ts#L71-L135) recovers from a `users_email_uq` violation by catching the failed `INSERT ... ON CONFLICT (clerk_user_id)` and issuing a fallback `UPDATE` on the same `this.db` handle. That two-statement recovery — the BUG-147 fix — works when `this.db` is the autocommit connection. The Clerk webhook route ([`route.ts#L41-L48`](../../../app/api/webhooks/clerk/route.ts#L41)) instead binds the repository to `container.db.transaction(tx)`. The direct INSERT is not enclosed in a nested Drizzle transaction/savepoint; [`lib/db.ts#L2`](../../../lib/db.ts#L2) establishes that this stack uses the postgres-js driver. Once the INSERT raises `23505` on `users_email_uq`, Postgres aborts the outer transaction server-side; the fallback UPDATE then fails with `25P02 in_failed_sql_transaction`, which [`mapDbError`](../../../src/adapters/repositories/drizzle-user-repository.ts#L35-L46) converts (the code is not `23505`) to `ApplicationError('INTERNAL_ERROR')`, and the handler returns HTTP 500 ([`handler.ts#L135-L138`](../../../app/api/webhooks/clerk/handler.ts#L135)).

The exact scenario BUG-147 was fixed for — the same email arriving under a new Clerk user ID — is therefore still a deterministic webhook failure on the webhook path. It only self-heals when the affected user signs in, because `ClerkAuthGateway` is wired with the raw autocommit db ([`gateways.ts#L25`](../../../lib/container/gateways.ts#L25)), where the second statement succeeds.

## Reachability

Production trigger: a `users` row exists as `{ clerk_user_id: A, email: E }` and Clerk emits `user.updated` for a different user ID `B` with primary email `E` — for example, an account recreated for the same email. `user.created` cannot trigger this path: [`processClerkWebhook`](../../../src/adapters/controllers/clerk-webhook-controller.ts#L209-L215) explicitly ignores every event except `user.updated` and `user.deleted`. Per the archived BUG-147 doc, the same-email/new-Clerk-ID condition occurred twice in 15 days, so the precondition is narrow but not hypothetical. The failure is deterministic on each failed delivery; [Clerk documents](https://clerk.com/docs/guides/development/webhooks/overview#how-clerk-handles-delivery-issues) that Svix retries non-successful webhook deliveries on its configured schedule.

## Reproduction

1. Seed `users` with `{ clerk_user_id: A, email: E }`.
2. Clerk delivers `user.updated` for user ID `B` with primary email `E`. `processClerkWebhook` opens `container.db.transaction` and claims/locks the `clerk_events` row ([`route.ts#L41-L48`](../../../app/api/webhooks/clerk/route.ts#L41)).
3. The controller calls `userRepository.upsertByClerkId(B, E, ...)` ([`clerk-webhook-controller.ts#L285`](../../../src/adapters/controllers/clerk-webhook-controller.ts#L285)).
4. The INSERT ([`drizzle-user-repository.ts#L80-L95`](../../../src/adapters/repositories/drizzle-user-repository.ts#L80)) does not hit its `clerk_user_id` conflict target and raises 23505 on `users_email_uq` — **aborting the outer transaction** (postgres-js, no savepoint).
5. The catch block's fallback UPDATE ([`drizzle-user-repository.ts#L111-L118`](../../../src/adapters/repositories/drizzle-user-repository.ts#L111)) executes on the same aborted transaction and fails with `25P02`.
6. [`mapDbError`](../../../src/adapters/repositories/drizzle-user-repository.ts#L128-L130) maps it to `INTERNAL_ERROR`; the processing transaction rolls back, including its original event claim.
7. The outer catch then calls [`persistFailure`](../../../src/adapters/controllers/clerk-webhook-controller.ts#L352-L354), which opens a fresh transaction, re-claims/locks the event, and durably stores the `INTERNAL_ERROR` failure ([`clerk-webhook-controller.ts#L177-L194`](../../../src/adapters/controllers/clerk-webhook-controller.ts#L177-L194)). The original error is rethrown and the route returns 500 ([`handler.ts#L135-L138`](../../../app/api/webhooks/clerk/handler.ts#L135)).
8. Svix retries deliver the identical payload into the identical processing failure until the retry schedule exhausts; each attempt refreshes the durable failed-event state rather than leaving the ledger blank.

Expected: the fallback UPDATE migrates the row's `clerk_user_id` from `A` to `B` (the BUG-147 behavior), and the webhook returns 200.

Actual: deterministic 500 on every delivery; the `clerk_user_id` migration never happens via webhook, while the fresh failure-persistence transaction records the failed attempt.

## Root Cause

- The BUG-147 recovery is a **two-statement** pattern: failed INSERT, then fallback UPDATE, both on `this.db` ([`drizzle-user-repository.ts#L79-L134`](../../../src/adapters/repositories/drizzle-user-repository.ts#L79)). On an autocommit connection each statement is its own transaction, so the second statement runs fine after the first fails.
- The webhook composition root binds every repository — including `createUserRepository(tx)` — to one shared transaction ([`route.ts#L41-L52`](../../../app/api/webhooks/clerk/route.ts#L41)). Under postgres-js there is no savepoint around the INSERT, so the 23505 aborts the whole transaction and every subsequent statement gets `25P02` until rollback.
- `25P02` is not a unique violation, so [`mapDbError`](../../../src/adapters/repositories/drizzle-user-repository.ts#L35-L46) falls through to `INTERNAL_ERROR`.
- The tx-bound path was never covered: BUG-147's integration regression constructs the repo on the raw db ([`user-repository.integration.test.ts#L164-L178`](../../../tests/integration/user-repository.integration.test.ts#L164)), which is exactly why this went unnoticed. The archived [DEBT-386](../debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md) investigation even logged a secondary `25P02` transaction-aborted error in a webhook context, corroborating the abort semantics in this stack.
- Same postgres-js abort-semantics trap class as archived [DEBT-441](../debt/debt-441-updater-dead-stale-retry-paths-under-rr.md), in a different file — DEBT-441's resolution (a documentation comment in the practice-session question-state updater) does not touch `drizzle-user-repository.ts`.

## Impact

The Clerk→app user-identity migration path is dead on the webhook: the affected `users` row keeps the stale `clerk_user_id` until the user happens to sign in (the `ClerkAuthGateway` path runs the same method on the raw autocommit db, where the recovery works) or an operator repairs the row. Until then the stale row also carries the BUG-147-documented cascade exposure: a later `user.deleted` for stale ID `A` can cancel subscriptions attached to that row. Operationally, the webhook 500s through the Svix retry schedule and generates repeated error noise; the processing claim rolls back, but the controller's fresh transaction correctly preserves a durable failure record on each attempt.

Severity rationale: P3 rather than P2 because the trigger precondition is narrow (an email observed under a new Clerk user ID while the old `users` row still exists) and a healing path exists (sign-in via the raw-db-bound auth gateway). Not P4 because the webhook observably 500s to retry exhaustion and the stale-row window carries the subscription-cascade exposure.

## Proposed Fix

1. **(Recommended, coordinated with BUG-284)** First replace the unconditional email-to-identity reassignment with BUG-284's fail-closed/positively-proven identity contract. Then make the remaining permitted recovery savepoint-safe: wrap the INSERT attempt in `await this.db.transaction(async (inner) => ...)` inside `upsertByClerkId`. drizzle/postgres-js issues a top-level `BEGIN` when `this.db` is the raw db and a `SAVEPOINT` when `this.db` is already a transaction, so a `users_email_uq` failure rolls back only to the savepoint and the caller can classify the conflict on a live outer transaction. Do **not** ship the savepoint around the current fallback by itself; that would make BUG-284's unsafe reassignment reachable from `user.updated`.
2. Avoid the failed statement entirely: pre-read the conflicting rows or use a single-statement design, but keep identity ownership outside the persistence adapter and account for races. A pre-SELECT alone is not sufficient without a constraint-safe race path.
3. **(Mandatory either way)** Add a tx-bound integration regression that runs the email-conflict scenario inside `db.transaction(async (tx) => new DrizzleUserRepository(tx)...)`, plus semantic cases proving a different human is never merged and an actor-already-has-a-row conflict is typed. The existing BUG-147 integration test exercises only the raw-db path ([`user-repository.integration.test.ts#L167-L170`](../../../tests/integration/user-repository.integration.test.ts#L167)).

## Implementation Notes (fix branch)

**Implemented 2026-07-10 on `fix/bug-283-284-user-upsert-identity`; merged and production-verified 2026-07-11 — see the Resolution section above.** The failure analysis above describes the branch point, `origin/dev` at `64204014`.

- [`DrizzleUserRepository.upsertByClerkId`](../../../src/adapters/repositories/drizzle-user-repository.ts#L74-L135) now runs the insert attempt inside `this.db.transaction`. With the installed postgres-js Drizzle driver this is `BEGIN` on the raw DB and `SAVEPOINT` on an existing transaction, so the outer webhook transaction remains usable after `users_email_uq` is caught.
- The tx-bound real-Postgres regression in [`user-repository.integration.test.ts`](../../../tests/integration/user-repository.integration.test.ts#L228-L271) catches the typed conflict and then successfully reads both unchanged rows through the same outer transaction; this is the direct proof that the former `25P02` path is closed.
- [`processClerkWebhook`](../../../src/adapters/controllers/clerk-webhook-controller.ts#L254-L468) now commits its local conflict-detection transaction before the Clerk owner lookup and retry loop. A fresh transaction reclaims the event row, rechecks the incoming identity's deletion tombstone, and applies the already-resolved identity change only if both guards still permit it; no Clerk API call or retry backoff runs while a database transaction is open.
- `processClerkWebhook` still invokes `persistFailure` through a separate `deps.transaction` after processing failure. Its regression now explicitly pins two transaction invocations (processing plus fresh failure persistence); the implementation was not rewritten as part of this fix.

## Related

- [BUG-284](./bug-284-user-upsert-email-reclaim-cross-identity-takeover.md) — the semantic sibling on the same fallback: when the recovery UPDATE *does* run, it treats email as identity. Fixing this bug's mechanics makes BUG-284's reassignment reachable on the webhook path too, so the two should be weighed together.
- [BUG-147](./bug-147-user-upsert-unhandled-email-uniqueness-conflict.md) (Resolved, archived) — introduced the email-reclaim fallback and explicitly listed the webhook controller as a covered call site; its verification only exercised the autocommit path. This finding is an incompleteness of that fix, not a re-report of it.
- [DEBT-386](../debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md) (Resolved, archived) — its dev-preview Vercel logs show the same secondary `25P02` transaction-aborted signature in a webhook transaction.
- [DEBT-441](../debt/debt-441-updater-dead-stale-retry-paths-under-rr.md) (Resolved, archived) — ruled on the same postgres-js/drizzle abort-semantics trap class, but only for the practice-session question-state updater.
- The [DEBT-437](../debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) ACCEPT ruling (tutor-submit vs end write skew) is unrelated.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
