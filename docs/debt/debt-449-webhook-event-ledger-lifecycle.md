# DEBT-449: Webhook Event-Ledger Lifecycle — Partial/Asymmetric Retention and Cron Completion-Bookkeeping Gap

**Status:** Open
**Priority:** P3
**Date:** 2026-07-09

---

## Description

The two provider-event ledgers have different, only partly explicit lifecycle policies. Successfully processed `stripe_events` rows are eligible for batch-100 pruning after a 90-day cutoff, but failed/unprocessed Stripe rows are intentionally excluded; `clerk_events` has no prune path for either state. The Stripe controller also duplicates the shared prune batch size. Separately, the scheduled deleted-account cancellation drain completes Stripe work and deletes its queue row without reconciling the originating failed `clerk_events` row. These are lifecycle and operations-ledger gaps, not current webhook correctness failures.

### 1. Retention is partial and asymmetric; all `clerk_events` and failed Stripe rows lack a repo-owned terminal policy (P3)

[`stripe-webhook-controller.ts`](../../src/adapters/controllers/stripe-webhook-controller.ts#L38) defines `STRIPE_EVENTS_RETENTION_MS = 90 * DAY_MS` and a local `STRIPE_EVENTS_PRUNE_LIMIT = 100`. After a successful delivery it best-effort calls `pruneProcessedBefore(cutoff, 100)` ([lines 158–169](../../src/adapters/controllers/stripe-webhook-controller.ts#L158)). The repository predicate is narrower than “the table is retained for 90 days”: it deletes only rows whose `processed_at` is non-null and older than the cutoff ([`drizzle-stripe-event-repository.ts:83-118`](../../src/adapters/repositories/drizzle-stripe-event-repository.ts#L83)). Failed/unprocessed rows have `processed_at = null` ([lines 71–76](../../src/adapters/repositories/drizzle-stripe-event-repository.ts#L71)) and are never eligible. That matches archived [BUG-027](../_archive/bugs/bug-027-stripe-events-unbounded-growth.md), whose shipped scope was explicitly “successfully-processed rows” while retaining failed/unprocessed rows for debugging; it does **not** establish a 90-day cap on all `stripe_events`.

The local batch literal is a real DRY gap because [`prune-constants.ts`](../../src/adapters/shared/prune-constants.ts#L1) already exports `PRUNE_BATCH_LIMIT = 100`. The similarly valued `PRUNE_RETENTION_DAYS = 90` in [`drizzle-rate-limiter.ts`](../../src/adapters/gateways/drizzle-rate-limiter.ts#L14), however, governs `rate_limits`, not provider-event outcomes. Equal numbers do not make those two retention decisions one shared “90-day policy”; changing one need not imply changing the other. Rate-limit prune ownership and coverage remain [DEBT-444](./debt-444-hot-path-prune-contention-and-coverage.md) scope.

`clerk_events` has no equivalent prune contract: [`ClerkEventRepository`](../../src/application/ports/clerk-event-repository.ts) exposes claim/peek/lock/markProcessed/markFailed only, [`DrizzleClerkEventRepository`](../../src/adapters/repositories/drizzle-clerk-event-repository.ts) contains no delete method, and no production call site deletes from the table. Only `user.updated` and `user.deleted` deliveries are claimed; other event types return before the claim at [`clerk-webhook-controller.ts:213-228`](../../src/adapters/controllers/clerk-webhook-controller.ts#L213). Thus every handled Clerk row remains regardless of state. A Stripe row remains while failed/unprocessed; a later successful redelivery can mark it processed and make it eligible for eventual pruning. The repository proves absence of a cleanup owner for unresolved Stripe outcomes and all Clerk outcomes, not current row counts, storage cost, or a compliance requirement; those runtime facts are unverifiable from git.

Any future Clerk prune must account for the FK from `pending_stripe_cancellations.event_id` to `clerk_events.id` with `ON DELETE CASCADE` ([`db/schema.ts:258-264`](../../db/schema.ts#L258); migration [`0016_odd_gressill.sql:7`](../../db/migrations/0016_odd_gressill.sql#L7)). The exact Stripe predicate is **not** itself the previously claimed trap: pending cancellations belong to unprocessed Clerk events, while a true mirror of `pruneProcessedBefore` selects only `processed_at IS NOT NULL`. The dangerous variant is a created-at/age prune, a failed-event prune, or any future invariant drift that selects an event while its pending child still exists. Archived [BUG-246](../_archive/bugs/bug-246-deleted-account-stripe-cancellation-no-drain.md) records the operational rule precisely: the drain cadence must remain shorter than any future Clerk prune horizon, and failed drain rows are retained.

### 2. A successful cron drain can leave completed work recorded as failed; a failed drain is retained and retried (P4)

The inline `user.deleted` post-commit path cancels Stripe externally and then, in one repository transaction, deletes the pending row and calls `clerkEvents.markProcessed` ([`clerk-webhook-controller.ts:361-373`](../../src/adapters/controllers/clerk-webhook-controller.ts#L361)). The scheduled drain has no `ClerkEventRepository` or transaction finisher in its deps ([`drain-pending-stripe-cancellations.ts:12-18`](../../src/adapters/jobs/drain-pending-stripe-cancellations.ts#L12)); after a successful or already-satisfied Stripe cancellation, it only calls `pendingStripeCancellations.deleteByEventId` ([lines 74–90](../../src/adapters/jobs/drain-pending-stripe-cancellations.ts#L74)).

The concrete residue is narrower than originally filed. If the webhook's post-commit Stripe call fails, `persistFailure` leaves the Clerk event at `processed_at = null` with an error and the pending row remains. If a later daily drain succeeds, it deletes that pending row but does not clear the Clerk error or set `processed_at`; absent another webhook delivery, the ledger can retain that stale failed state indefinitely even though the external cancellation completed. A later automatic redelivery or manual replay can heal it: with no pending row and no surviving local user/customer, the controller reaches [`markProcessed` at lines 338–342](../../src/adapters/controllers/clerk-webhook-controller.ts#L338). Therefore “permanently stranded” was an overclaim.

A drain cancellation failure is also **not** stranded. The per-row catch records/logs the failure without deleting the pending row ([`drain-pending-stripe-cancellations.ts:91-98`](../../src/adapters/jobs/drain-pending-stripe-cancellations.ts#L91)); the existing unit test explicitly asserts that row remains ([`drain-pending-stripe-cancellations.test.ts:46-83`](../../src/adapters/jobs/drain-pending-stripe-cancellations.test.ts#L46)). Because it stays older than the 15-minute cutoff, the next daily run lists and retries it. The cron converts any per-row failure into a failed run/HTTP 500 while still processing the batch ([`route.ts:252-298`](../../app/api/cron/reconcile-stripe-subscriptions/route.ts#L252)).

No failed-webhook audit UI or automated `processed_at IS NULL AND error IS NOT NULL` report exists in this repository. That predicate is a plausible ad hoc operator query, not a shipped “audit view.” The proven impact is stale stored bookkeeping and future retention ambiguity; current operator queries and alerting outside git are unverifiable from the repository.

## Impact

No current user-facing or billing error is established. Part 1 leaves handled Clerk rows and failed/unprocessed Stripe rows without a bounded repository lifecycle; the actual live cardinality, storage/backup cost, and any provider-side retention requirement are unverified. Its P3 driver is the combination of indefinite growth and a money-path FK that makes an indiscriminate future Clerk prune unsafe. Part 2 is P4 operations hygiene: successful cron recovery may remain labeled failed until a later delivery/replay, but the Stripe cancellation is complete and failed drain work remains durably queued for the next run.

## Proposed Resolution

**Part 1:**

- **Option A (recommended):** make each table/state policy explicit rather than inventing one cross-table “90-day” constant. Reuse `PRUNE_BATCH_LIMIT` in the Stripe controller. Keep a named processed-Stripe retention constant; decide separately whether processed Clerk events need a retention horizon. If they do, add a `pruneProcessedBefore`-style Clerk port/repository method whose predicate requires `processed_at IS NOT NULL` **and** `NOT EXISTS` an outstanding `pending_stripe_cancellations` child. If cleanup moves to the daily maintenance route, run the cancellation drain before that prune. Keep failed/unprocessed event rows until an explicit recovery/archive decision preserves dedup semantics; do not silently age-delete unresolved outcomes.
- **Option B (minimal):** document the accepted asymmetry near the constants/controller inventory: processed Stripe events are eligible after 90 days; failed/unprocessed Stripe rows and every Clerk row are retained; pending cancellation children prohibit indiscriminate Clerk age pruning. Add monitoring/alert thresholds if indefinite failed-row retention is intentional.
- **Option C:** archive terminal event records outside the hot ledgers while retaining a compact provider-event-id tombstone. This bounds primary-table width without making an old redelivery look unclaimed, but is a larger schema/operations design.

**Part 2:**

- **Option 1 (recommended):** extract one completion seam used by both inline and scheduled finishers. Keep the external Stripe call outside the database transaction; after success (including “already canceled”), transactionally delete the pending row and call `clerkEvents.markProcessed(eventId)`. If that bookkeeping transaction fails, rollback leaves the pending row for the idempotent next drain attempt.
- **Option 2 (smaller):** add a transaction callback/`ClerkEventRepository` dependency to `DrainPendingStripeCancellationsDeps` and perform the same two writes in its success branch, without extracting the inline helper. Preserve the current per-row failure behavior: a real Stripe failure logs and retains the row.
- **Option 3 (document-only):** accept that cron completion may leave stale Clerk status and rely on later provider replay. This is behaviorally safe but leaves lifecycle policy state-dependent, so it is not preferred.

## Verification

**Part 1:**

- A source check proves `STRIPE_EVENTS_PRUNE_LIMIT` is gone and both event policies are named independently from `rate_limits`; it must not require the unrelated numeric `90` to appear only once across `src/adapters/`.
- If Clerk pruning ships, extend `drizzle-clerk-event-repository.test.ts` and a real-Postgres integration suite to prove: an old processed row without a pending child is eligible; an old event with a pending child is preserved; failed/unprocessed rows follow the explicitly chosen policy; the batch limit is honored.
- Preserve the archived BUG-027 contract that unresolved Stripe outcomes are not deleted merely because they are old.

**Part 2:**

- Extend `drain-pending-stripe-cancellations.test.ts` using `FakePendingStripeCancellationRepository` and `FakeClerkEventRepository`: a successful drain deletes the pending row, sets `processedAt`, and clears the stale error; a Stripe failure retains the row; a later successful run drains that same retained row.
- Extend `tests/integration/stripe-repositories.integration.test.ts` to prove the pending-row delete and Clerk-event transition commit together and roll back together.
- Keep the inline webhook post-commit tests green against the same completion seam if Option 1 ships.

## Related

- [BUG-027 (archived)](../_archive/bugs/bug-027-stripe-events-unbounded-growth.md) — prunes only old successfully processed Stripe events and explicitly retains failed/unprocessed rows; it did not cap the whole table.
- [BUG-246 (archived)](../_archive/bugs/bug-246-deleted-account-stripe-cancellation-no-drain.md) — added the daily retry owner, specified retain-on-failure/delete-on-success, and recorded the Clerk-event cascade/prune-horizon constraint.
- Active siblings: [DEBT-443](./debt-443-idempotency-cache-durability-and-evolution.md) owns idempotency outcome evolution; [DEBT-444](./debt-444-hot-path-prune-contention-and-coverage.md) owns `idempotency_keys`/`rate_limits` prune contention and direct real-Postgres coverage. Neither supplies a provider-event retention policy.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register); independently source-audited 2026-07-10.
