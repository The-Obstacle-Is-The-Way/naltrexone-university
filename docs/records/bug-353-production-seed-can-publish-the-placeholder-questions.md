# BUG-353: The Production Seed Can Publish the Placeholder Questions

**Status:** Open — closes as Resolved in this pull request: the explicit seed flag shipped (#1583, #1590), and production had no published placeholder on 2026-11-11
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

`pnpm db:seed:prod` and `pnpm db:seed:all` spawn the managed seed with a copy of the operator's whole environment. Before the fix, `runSeed` read `SEED_INCLUDE_PLACEHOLDERS` from that environment. So if the operator's shell had `SEED_INCLUDE_PLACEHOLDERS=true` exported, the production seed, while no content release was active, loaded the ten committed placeholder questions and skipped the step that archives them. Every placeholder is `status: published`, so synthetic, clinical-looking questions could become available for new practice.

The root cause was a hidden input: a switch meant for test databases, read from the ambient environment by code that also serves production. The fix removes that input. BUG-360 owns the separate deploy-target E2E reset.

## Evidence

- **The child seed inherits everything.** `seedDatabase` in `scripts/seed-environment-runtime.ts:124-140` builds the child's environment from `...process.env` and removes only `DB_TARGET_ACK`.
- **The seed read the flag itself.** Before the fix, `runSeed` in `scripts/seed.ts` set `includePlaceholders` from `process.env.SEED_INCLUDE_PLACEHOLDERS === 'true'`. When it was true, the seed read `content/questions/placeholder/` and skipped `archivePlaceholderQuestions`.
- **The placeholders are published, and can be republished.** All 10 files in `content/questions/placeholder/` are `status: published`. An archived synthetic placeholder is exempt from the archived-status refusal (`scripts/seed/question-syncer.ts:217-225`); a recorded withdrawal still refuses it (`:226-231`).
- **Found by** the scripts directory audit (#1560).

## Impact

- **Trigger:** the variable exported in the operator's shell, or set by a parent process, when `db:seed:prod`, or an acknowledged human `db:seed`, ran against production with no active release.
- **Effect:** synthetic questions published in the live bank, and learners' answers to them scored.
- **Occurrence:** none was published in production on 2026-11-11 (see Verification). Whether one was published earlier was not checked.

## Options

1. Remove the variable from the child's environment in `seedDatabase`. A bare `pnpm db:seed` against a remote target would still read it.
2. Make the choice explicit: `runSeed(databaseUrl, { includePlaceholders })`, with `--include-placeholders` on the command line.
3. Build the child's environment from an allowlist. It needs a tested runtime environment contract, and still cannot fence future meanings of allowlisted variables.

## Resolution (decided)

Option 2, shipped in #1559 (released in promotion #1583, `ea8773fd`) and #1584 (promotion #1590, `4c84405e`).
- `runSeed` takes `{ includePlaceholders }` and reads no environment. `parseSeedOptions` (`scripts/seed/seed-options.ts`) accepts only `--include-placeholders`, and refuses a set `SEED_INCLUDE_PLACEHOLDERS` before any database work, so a stale export stops the seed with a message. That makes option 1 unnecessary.
- The managed seed and the human `db:seed` refuse `--include-placeholders` for any non-local target, the human seed before it asks for `DB_TARGET_ACK`.
- The environment seeds spawn the managed seed with no arguments. CI, the hosted Checkout smoke and the local E2E plan pass the flag.

## Verification

- [x] `scripts/seed/seed-options.test.ts`, `scripts/database/managed/run-managed-db-seed.test.ts` and `scripts/database/db-seed.test.ts` pass (rerun 2026-11-15): a set variable is refused before seeding, both entries refuse placeholders for a remote target (the human one before its acknowledgment check), and placeholders are included only with `--include-placeholders`.
- [x] `scripts/seed-environment-runtime.test.ts` passes: an environment seed spawns the managed seed without the flag. `tests/ci-workflow.test.ts` passes: both seed steps pass the flag, and no workflow sets the old variable.
- [x] The first scheduled hosted Checkout smoke after promotion #1590 (run 39796835565, 2026-10-22) passed its seed step.
- [x] No placeholder is published in production. On 2026-11-11 the owner's read-only live-key comparison (BUG-351), against content commit `3281add20756c91648ca036a7fedc74c3d35e543`, found 948 published questions and 0 missing from that commit. That commit's `questions/` tree has no placeholder QID (`git grep`, 2026-11-15). Which placeholders exist unpublished was not established; only BUG-360's reset needed that.
- The SCHEMA.md copy is not part of this fix: the owner copies the 2026-10-18 corrections in `content/drafts/questions/SCHEMA.md` into the content repository's `questions/SCHEMA.md`. On 2026-11-15 that repository's `main` still showed `SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed`, which the seed now refuses loudly. The owner asked that day to be reminded after the session; a Waiting row in the records index carries it, so the weekly review sees it.

## Related

- BUG-351: the production seed's input freshness, and the 2026-11-11 live-key comparison.
- BUG-315: placeholder archival by exact slug.
- BUG-360: the deploy-target E2E reset.
- DEBT-483: once a release is active, the seeds refuse production.

Corrected 2026-10-18: separate the E2E reset, qualify active-release and target preconditions, and bound the environment-isolation rationale.

Corrected 2026-10-20: update seed entry and test paths after DEBT-532’s moves, and replace the superseded production-job proposal with its operator-command decision.

Corrected 2026-10-21: retain #1584’s human-seed remote-placeholder refusal and its verification at the moved test paths.

Corrected 2026-11-15: the census is met by the owner's 2026-11-11 live-key comparison, so the lapsed 2026-11-08 check is done, and the record closes as Resolved. #1559 shipped in promotion #1583, not #1590. The SCHEMA.md copy, still undone, is the owner's, carried by a Waiting row (corrected 2026-11-16: a reminder kept outside the repository had nothing to surface it). Name the fix PRs, correct the syncer lines, and drop the finished build history, which is in git at 34d9aea0.
