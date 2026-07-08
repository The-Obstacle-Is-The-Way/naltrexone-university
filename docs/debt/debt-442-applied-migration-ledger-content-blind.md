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

### Measurement Gate — 2026-07-08

Hash algorithm proof:

- Drizzle ORM `readMigrationFiles()` reads each
  `db/migrations/<tag>.sql` file as UTF-8 text and records
  `crypto.createHash("sha256").update(query).digest("hex")` for that full SQL
  text before splitting statements on `--> statement-breakpoint`.
- The Postgres migrator inserts that value into
  `drizzle.__drizzle_migrations.hash` beside `created_at = entries[].when`.
- Empirical proof against a freshly reset resolver-scoped local Docker Postgres
  (`127.0.0.1:63363` during measurement): after explicit
  `DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate`, every one of the 29
  ledger rows matched `sha256(readFileSync("db/migrations/<tag>.sql", "utf8"))`.

Current preflight seam and run-mode proof:

- `tests/e2e/helpers/credential-health-check.ts` wires
  `verifyMigrationLedger(sql)` between database connectivity and the
  idempotency-schema check on the same single Postgres connection.
- `verifyMigrationLedger` currently queries only `created_at`, compares it with
  `_journal.json` `entries[].when`, and therefore detects missing migrations
  but not content drift.
- Normal local `pnpm test:e2e` is hermetic: `scripts/run-local-e2e.ts` delegates
  to `scripts/e2e-local-orchestrator.ts`, which starts the resolver-scoped
  Docker Postgres, runs `pnpm db:migrate`, seeds, then runs Playwright.
  Content drift should therefore be trivial there because the same checkout
  just applied the migration files.
- CI similarly migrates its throwaway Postgres before E2E. The high-value path
  is any persistent target (`E2E_USE_EXISTING_DATABASE=true DATABASE_URL=...`
  locally, or another deploy-target health check) where the database ledger can
  predate the current checkout.

Read-only ledger/hash measurement against current repo files:

| Environment | Host / target | Ledger rows | Missing journal rows | Ledger-only rows | Content mismatches |
|-------------|---------------|-------------|----------------------|------------------|--------------------|
| Local test DB | `127.0.0.1:63363` | 29 | none | none | none |
| Development Neon | `ep-still-frog-ahx7bp6y-pooler.c-3.us-east-1.aws.neon.tech` | 29 | none | none | `0027_early_wallow` (`created_at = 1783355955875`), expected prefix `983c3458e8aadd6a`, applied prefix `15124dc7eab8b5ab` |
| Production Neon | `ep-withered-cell-ah14ik13-pooler.c-3.us-east-1.aws.neon.tech` | 29 | none | none | none |

The single Development mismatch is explained by the known incident: Development
applied an early `0027_early_wallow.sql`; `0028_repair_attempts_selected_choice_index.sql`
then repaired the missing supporting index. No unexplained mismatch was found.

### Implementation Design

1. Reuse the existing `verifyMigrationLedger(sql)` preflight as the single
   schema-drift seam. Do not add a second checker.
2. Read the local migration SQL files named by `db/migrations/meta/_journal.json`
   and compute the same full-file UTF-8 SHA-256 hash Drizzle records in
   `drizzle.__drizzle_migrations.hash`.
3. Query `created_at` and `hash` from `drizzle.__drizzle_migrations` on the same
   single connection already used by the preflight.
4. Preserve missing-row behavior: if a journal entry is absent from the ledger,
   keep failing with `E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATIONS`.
5. Treat ledger-only rows as drift too. A database whose ledger contains
   migrations unknown to the current checkout is ahead of this codebase; the
   preflight should fail rather than silently validate an unreviewed schema.
6. Add a distinct content-drift failure marker:
   `E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATION_CONTENT`. Its message must name the
   offending migration tag(s) and expected/applied hash prefixes only, with no
   `DATABASE_URL`, hostnames, passwords, provider ids, or full Drizzle hashes.
7. Allowlist only measured legacy content drift. The allowlist is checked into
   the repo as tag + applied-hash-prefix/full-hash + reason + repair migration,
   initially only Development's early `0027_early_wallow` hash repaired by
   `0028_repair_attempts_selected_choice_index`. Silent skips are forbidden:
   any allowlisted entry must still have a matching tag and matching known
   applied hash.
8. Add red-first unit coverage for matching hashes, missing rows, ledger-only
   rows, non-allowlisted content mismatch, allowlisted legacy mismatch, and
   secret-free formatting.

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
- 2026-07-08 measurement proof: local fresh Docker and Production match all 29
  local migration file hashes; Development has exactly the known
  `0027_early_wallow` content mismatch and no missing or ledger-only rows.

## Related

- `0028_repair_attempts_selected_choice_index.sql` — the immediate idempotent
  repair for the 0027 dev drift.
- Archived [DEBT-391](../_archive/debt/debt-391-local-e2e-schema-drift-preflight.md)
  — the existing ledger-presence preflight to extend.
- Archived [DEBT-440](../_archive/debt/debt-440-attempts-selected-choice-composite-fk.md)
  — the schema-hardening item whose amended migration exposed this gap.
