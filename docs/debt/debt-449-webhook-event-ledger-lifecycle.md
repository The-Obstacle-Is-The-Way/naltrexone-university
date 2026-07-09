# DEBT-449: Webhook Event-Ledger Lifecycle — Scattered Retention Policy, Unbounded `clerk_events`, and Cron Drain Stranding Completed Deletions in Failed State

**Status:** Active
**Priority:** P3
**Date:** 2026-07-09

---

## Description

The provider-event ledgers (`stripe_events`, `clerk_events`) and their supporting tables have no single owner for lifecycle policy. Retention constants are scattered as unlinked literals across three files, `clerk_events` has no prune path at all (with a foreign-key cascade that makes the "obvious" future prune actively dangerous), and the cron drain that finishes deleted-account Stripe cancellations completes the work without marking the `clerk_events` row processed — permanently stranding the dedup ledger in a failed state for work that succeeded.

### 1. Retention policy scattered as unlinked literals; `clerk_events` grows unbounded, with a cascade trap on any future prune (P3)

[`prune-constants.ts`](../../src/adapters/shared/prune-constants.ts#L1) exists as the SSOT for batch size (`PRUNE_BATCH_LIMIT = 100`, imported by [`with-idempotency.ts:141`](../../src/adapters/shared/with-idempotency.ts#L141) and [`drizzle-rate-limiter.ts:12`](../../src/adapters/gateways/drizzle-rate-limiter.ts#L12)), yet [`stripe-webhook-controller.ts:39`](../../src/adapters/controllers/stripe-webhook-controller.ts#L39) re-declares its own `STRIPE_EVENTS_PRUNE_LIMIT = 100`, and the 90-day retention policy lives as two unlinked literals: `STRIPE_EVENTS_RETENTION_MS = 90 * DAY_MS` at [`stripe-webhook-controller.ts:38`](../../src/adapters/controllers/stripe-webhook-controller.ts#L38) vs `PRUNE_RETENTION_DAYS = 90` at [`drizzle-rate-limiter.ts:14`](../../src/adapters/gateways/drizzle-rate-limiter.ts#L14). If compliance or cost pressure ever requires shortening event retention, an operator edits one literal and silently misses the other — the "90-day policy" diverges per table with nothing linking them.

Meanwhile `clerk_events` has no prune path at all: [`ClerkEventRepository`](../../src/application/ports/clerk-event-repository.ts) exposes only claim/peek/lock/markProcessed/markFailed, no job or cron deletes rows, and [`vercel.json`](../../vercel.json#L4) has no prune cron. Every `user.updated`/`user.deleted` delivery inserts a permanent row ([`clerk-webhook-controller.ts:228`](../../src/adapters/controllers/clerk-webhook-controller.ts#L228) claims, nothing deletes; other event types early-return at [line 213](../../src/adapters/controllers/clerk-webhook-controller.ts#L213) before claiming, so growth is driven by user-object churn, not session activity). The table grows monotonically for the lifetime of the product while sibling `stripe_events` is capped at 90 days — an asymmetry unrecorded at the prune-inventory comment ([`stripe-webhook-controller.ts:158-160`](../../src/adapters/controllers/stripe-webhook-controller.ts#L158)). The verifier noted that comment is factually accurate about what it states; the debt is the missing prune path plus scattered constants, with the comment as the seam where the asymmetry goes unrecorded.

The cascade trap upgrades this from hygiene to P3: `pending_stripe_cancellations.event_id` references `clerk_events.id` `ON DELETE CASCADE` ([`db/schema.ts:262-264`](../../db/schema.ts#L262)). A future engineer who adds the "obvious" prune mirroring [`stripe-webhook-controller.ts:163-169`](../../src/adapters/controllers/stripe-webhook-controller.ts#L163) — without reading [BUG-246's archived note](../_archive/bugs/bug-246-deleted-account-stripe-cancellation-no-drain.md) that "the drain cadence must stay shorter than any future `clerk_events` prune horizon" — cascade-deletes undrained pending cancellations, leaving deleted users' subscriptions billing.

### 2. Cron drain finishes deleted-account cancellations without `markProcessed`, stranding the ledger row in failed state (P4)

The `user.deleted` completion step has two finishers with different scopes. The webhook post-commit path deletes the `pending_stripe_cancellations` row AND calls `clerkEvents.markProcessed` in one transaction ([`clerk-webhook-controller.ts:366-372`](../../src/adapters/controllers/clerk-webhook-controller.ts#L366)). The cron drain deletes only the pending row ([`drain-pending-stripe-cancellations.ts:89`](../../src/adapters/jobs/drain-pending-stripe-cancellations.ts#L89)) — its deps type ([lines 12-18](../../src/adapters/jobs/drain-pending-stripe-cancellations.ts#L12)) has no `ClerkEventRepository`, so it cannot mark the event processed.

Concrete scenario: a user with a live Stripe subscription deletes their Clerk account during a Stripe API outage. Tx1 schedules the pending cancellation and returns without `markProcessed` ([controller lines 345-349](../../src/adapters/controllers/clerk-webhook-controller.ts#L345)); every post-commit cancel attempt fails, `persistFailure` writes `markFailed` (processedAt stays null), and the route 5xxes so Svix retries. If the outage outlasts Svix's retry schedule, redeliveries stop. The next daily drain succeeds — Stripe subscriptions cancelled, pending row deleted — but the `clerk_events` row remains `processedAt=null` with the stale Stripe error string forever. An operator auditing failed webhook events (`processed_at IS NULL AND error IS NOT NULL`) sees this completed deletion listed as an unfinished failure indefinitely, and any future `clerk_events` prune policy keyed on processed state would misclassify it. Only a manual Clerk-dashboard replay heals it (replay finds no pending row, user already deleted, marks processed at [line 341](../../src/adapters/controllers/clerk-webhook-controller.ts#L341)). Tombstones and idempotent re-processing mean no user-facing behavior is wrong — this is audit/ops-ledger hygiene.

## Impact

Today: no user-facing breakage from either part. Part 1's cost is latent — retention tuning silently diverges per table, `clerk_events` accumulates without ceiling or documented decision, and the cascade makes the naive future fix dangerous rather than merely wrong (the P3 driver). Part 2 (P4) pollutes the failed-events audit view with completed work and would poison any processed-state-keyed prune added under Part 1 — the two parts compound: a prune that skips "failed" rows never reclaims the stranded ones; a prune that doesn't skip them needs the cascade guard.

## Proposed Resolution

**Part 1:**

- **Option A (recommended):** Centralize the policy — move the 90-day retention into `prune-constants.ts` alongside `PRUNE_BATCH_LIMIT` (e.g. `EVENT_RETENTION_MS`), import it at both `stripe-webhook-controller.ts` and `drizzle-rate-limiter.ts`, and delete the local `STRIPE_EVENTS_PRUNE_LIMIT` in favor of `PRUNE_BATCH_LIMIT`. Then add a `clerk_events` prune (port method + best-effort call mirroring the stripe path, or folded into the daily cron AFTER the BUG-246 drain step) that explicitly excludes rows with outstanding `pending_stripe_cancellations` children — encoding the cascade constraint in the prune query, not just in an archived bug doc.
- **Option B (minimal):** If unbounded `clerk_events` retention is an intentional audit-trail decision, record it — extend the `stripe-webhook-controller.ts:158` comment and/or `prune-constants.ts` to state the full inventory (stripe_events 90d, idempotency_keys TTL, rate_limits 90d, clerk_events: never, because of the `pending_stripe_cancellations` cascade) so the asymmetry is a documented contract rather than an omission.
- **Option C:** Consolidate all event-table pruning out of webhook hot paths into the existing daily cron, giving one file that owns the entire retention contract.

**Part 2:**

- **Option 1 (recommended):** Extract the webhook's post-commit finisher into a shared transactional helper (delete pending row + `clerkEvents.markProcessed` in one tx) and give the drain job a transaction/`ClerkEventRepository` dependency so both finishers run identical completion bookkeeping — one finisher, one scope.
- **Option 2 (smaller):** Add `ClerkEventRepository` to `DrainPendingStripeCancellationsDeps` and call `markProcessed(row.eventId)` alongside `deleteByEventId` inside the drain's per-row success path, wrapped in the cron container's transaction.
- **Option 3 (document-only):** Record the residue as an accepted ops note and rely on manual Clerk-dashboard replay — not recommended, since it leaves the failed-events audit view permanently polluted by default and any future `clerk_events` prune policy would misread these rows.

## Verification

**Part 1:**

- A grep proves `90` retention appears exactly once in `src/adapters/` (in `prune-constants.ts`) and `STRIPE_EVENTS_PRUNE_LIMIT` no longer exists.
- If a `clerk_events` prune ships: an integration test proving a prune-eligible `clerk_events` row with an outstanding `pending_stripe_cancellations` child is NOT deleted (the cascade guard), plus a test that old processed rows without children are.
- If Option B (documented asymmetry): the updated inventory comment/constants file names all four tables and the cascade rationale.

**Part 2:**

- A unit test on the drain job (fakes: `FakePendingStripeCancellationRepository` + `FakeClerkEventRepository`) proving a successful per-row drain both deletes the pending row and marks the `clerk_events` row processed, clearing the audit view.
- If the shared-finisher option ships: the webhook post-commit test and drain test exercise the same helper.

## Related

- [BUG-246 (archived)](../_archive/bugs/bug-246-deleted-account-stripe-cancellation-no-drain.md) — shipped the drain job and recorded the cascade/prune-horizon constraint as an operational note; both parts here are its residue (the constraint deserves code, and the drain it added is the incomplete second finisher).
- Active siblings from the same sweep: [DEBT-443](./debt-443-idempotency-cache-durability-and-evolution.md) (idempotency-cache lifecycle) and [DEBT-444](./debt-444-hot-path-prune-contention-and-coverage.md) (hot-path prune contention) — adjacent seams of the same event-table maintenance surface.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
