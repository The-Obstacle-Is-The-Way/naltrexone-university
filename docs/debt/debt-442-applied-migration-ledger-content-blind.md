# DEBT-442: Applied Migrations Are Mutable and Ledger Verification Is Content-Blind

**Status:** Open
**Priority:** P2
**Date:** 2026-07-06

---

## Description

The repo now has a concrete migration-drift incident that the existing schema
drift guard cannot detect. During the schema-hardening tail sweep, the Neon dev
branch applied an early `0027_early_wallow.sql` through a Preview deploy before
the child-side `attempts_selected_choice_question_idx` index was added to the
same checked-in migration file. Production later applied the final file and is
complete. Dev's Drizzle ledger recorded migration `0027` as applied, so a
ledger-presence check sees no missing migration even though the applied database
shape differs from the file currently in git.

The current DEBT-391 preflight is useful but content-blind:

- [`verifyMigrationLedger`](../../tests/e2e/helpers/credential-health-check.ts)
  reads `db/migrations/meta/_journal.json` and compares journal
  `entries[].when` against `drizzle.__drizzle_migrations.created_at`.
- Drizzle's applied ledger also stores a `hash`, but the preflight does not
  compare that stored hash to the local migration file content.

That means "all migration timestamps exist" can still be false comfort when a
previously-applied migration file was amended after one environment had already
run it. The immediate drift is repaired by
`0028_repair_attempts_selected_choice_index.sql`; this debt is the systemic
guardrail so the same class fails loudly next time.

## Impact

Medium operational risk. This does not imply current production drift, and the
known 0027 dev drift is repaired by a new idempotent migration. The risk is that
future applied-after-amend drift remains invisible to automated verification
until an application path depends on the missing object or constraint.

## Resolution

Extend the DEBT-391 migration-ledger verification to compare applied migration
content, not just migration presence.

Proposed shape:

1. Reuse the existing `verifyMigrationLedger(sql)` preflight as the single
   schema-drift seam.
2. Read the local migration SQL files named by `db/migrations/meta/_journal.json`.
3. Compute the same hash representation Drizzle records in
   `drizzle.__drizzle_migrations.hash`.
4. Query `created_at` and `hash` from `drizzle.__drizzle_migrations`.
5. Fail with a secret-free schema-drift error when a journal entry is missing
   **or** when the stored hash for an applied entry does not match the local
   file content.
6. Add unit tests for matching hashes, missing rows, hash mismatch, and
   secret-free formatting.
7. Consider promoting the same comparison into a CI/deploy preflight so Preview
   and Production fail before serving a code/schema mismatch.

The guard must preserve DEBT-391's existing public-safety boundary: never print
`DATABASE_URL`, hostnames, passwords, provider ids, or raw Drizzle hashes in
failure output.

## Verification

- Current source proof: `verifyMigrationLedger` compares journal
  `entries[].when` to applied `created_at` only; it does not read or compare
  `drizzle.__drizzle_migrations.hash`.
- Incident proof: `0028_repair_attempts_selected_choice_index.sql` exists only
  because dev recorded the early 0027 as applied before the checked-in 0027 file
  was amended with `attempts_selected_choice_question_idx`.

## Related

- `0028_repair_attempts_selected_choice_index.sql` — the immediate idempotent
  repair for the 0027 dev drift.
- Archived [DEBT-391](../_archive/debt/debt-391-local-e2e-schema-drift-preflight.md)
  — the existing ledger-presence preflight to extend.
- Archived [DEBT-440](../_archive/debt/debt-440-attempts-selected-choice-composite-fk.md)
  — the schema-hardening item whose amended migration exposed this gap.
