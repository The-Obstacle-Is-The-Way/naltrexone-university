# DEBT-427: Migration 0021 enforces FKs before backfill runs; 0022/0023 silently null inconsistent rows with no audit trail

**Status:** Resolved
**Priority:** P3
**Date:** 2026-06-30

---

## Description

`0021_flaky_domino.sql` adds FK constraints (including `ON DELETE RESTRICT` choice FKs) immediately after `CREATE TABLE`, before its own backfill `INSERT` runs (lines 21-24 vs. 28-102). drizzle's migrator wraps all pending migration files (0021+0022+0023) in a single transaction, so if any legacy session references a since-deleted question/choice, the backfill INSERT throws and the entire migration set rolls back with a generic FK-violation error rather than a clear diagnostic — and the cleanup logic 0022/0023 add for other invariants never gets a chance to run.

Separately, `0022_confused_mandrill.sql` and `0023_soft_blue_marvel.sql`'s cleanup `UPDATE` statements silently null out `latest_selected_choice_id` / `draft_selected_choice_id` / `latest_is_correct` / `latest_answered_at` for any row that would violate the new constraints, with no row-count logging or assertion anywhere in the PR.

## Impact

This was a "fails loud" risk for the migration-apply step (blocks deployment with an unclear error) rather than silent corruption. **Post-deploy update (2026-07-02):** PR #537's migrations did apply successfully to both deployed Neon branches before serving, and read-only proof found zero duplicate or dangling `questionIds` for object-shaped sessions in Development and Production. The one remaining Development shape anomaly was a double-encoded `params_json` string row tracked under [DEBT-428](./debt-428-question-ids-narrowed-unverified-against-legacy-data.md), not an FK-ordering failure. The silent-null cleanup (0022/0023, and now also `0024_needy_jimmy_woo.sql`'s own backfill-before-constraint UPDATEs — see [BUG-265, resolved](../bugs/bug-265-practice-session-question-states-checks-weaker-than-schema.md)) still has no recoverable row-count logging after the fact.

**Additional scenario (2026-06-30, second review pass):** a legacy row with duplicate `questionIds` entries (which the pre-existing, unrelated-to-this-PR Zod uniqueness refine would already reject on subsequent app-level reads) would also interact badly with `0021`'s backfill `INSERT ... ON CONFLICT (practice_session_id, question_id) DO NOTHING` — the second occurrence of a duplicate question ID silently no-ops instead of erroring, backfilling fewer state rows than `questionIds.length`. That produces the same `rows.length < params.questionIds.length` "missing normalized question state" `INTERNAL_ERROR` symptom as other legacy-data gaps in this doc, just via a different root cause (duplicate IDs, not dangling references). See [DEBT-428](./debt-428-question-ids-narrowed-unverified-against-legacy-data.md) for the read-side validation this pairs with.

**Additional scenario (2026-07-01, systematic migration audit):** the backfill's `LEFT JOIN LATERAL` that matches each `questionIds` entry against the legacy `params_json.questionStates` array (`0021_flaky_domino.sql:90-101`) has no `ORDER BY` before its `LIMIT 1`. If a legacy row's `questionStates` array ever contains two entries for the same `questionId` (the same latent duplicate-data risk this doc already tracks for `questionIds`), which one gets backfilled is arbitrary and plan-dependent rather than deterministic — not a crash, but a silent "which stale answer wins" nondeterminism on top of the already-tracked duplicate-handling gaps in this doc.

## Resolution

Converted to durable authoring guidance in [Migration Authoring](../../dev/migration-authoring.md):

- [Pre-Flight Data Proof](../../dev/migration-authoring.md#pre-flight-data-proof) requires read-only counts for dangling references, duplicate keys, malformed data shapes, and intended cleanup rows before tightening constraints.
- [Operation Ordering](../../dev/migration-authoring.md#operation-ordering) records the rule that backfills and cleanups run before the constraints they satisfy, and explicitly cites `0021_flaky_domino.sql` as the cautionary ordering.
- [Cleanup Audit Trail](../../dev/migration-authoring.md#cleanup-audit-trail) requires `GET DIAGNOSTICS` / `RAISE NOTICE` row-count capture for future cleanup migrations and cites `0026_track_a_tail_sweep.sql` as the local exemplar.

The old 0022/0023/0024 row counts cannot be recovered from the ledger after the fact; preserving this item as active would not create new executable work. The durable rule now lives where future migration authors will read it.

## Verification

Current post-deploy proof recorded 2026-07-02:

| Target | Object-shaped sessions with duplicate `questionIds` | Object-shaped sessions with dangling `questionIds` |
|---|---:|---:|
| Development (`ep-still-frog`) | 0 | 0 |
| Production (`ep-withered-cell`) | 0 | 0 |

The remaining verification gap is process-level: future cleanup UPDATEs should report affected-row counts at migration time, because the 0022/0023/0024 counts cannot be recovered after the fact from the ledger alone.

**Process update (2026-07-03):** migration `0026_track_a_tail_sweep.sql` establishes the requested pattern for future cleanup migrations: it uses a marked cleanup block, captures affected-row counts with `GET DIAGNOSTICS`, and emits `RAISE NOTICE` lines for both the DEBT-428 string-row normalization and the DEBT-434 stale `questionStates` strip.

**Closeout proof (2026-07-04):** [Migration Authoring](../../dev/migration-authoring.md) now carries the pre-flight proof, operation-ordering, and cleanup audit-trail rules. DEBT-428 and DEBT-434 also record post-deploy zero-count proof through `0026_track_a_tail_sweep`, so the remaining substance here is process guidance, not an active cleanup task.

## Related

- PR #537, [DEBT-425](./debt-425-legacy-compatibility-tolerances-audit.md)
- `db/migrations/0021_flaky_domino.sql:21-24`
- `db/migrations/0022_confused_mandrill.sql`
- `db/migrations/0023_soft_blue_marvel.sql`
