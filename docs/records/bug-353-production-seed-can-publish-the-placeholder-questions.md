# BUG-353: The Production Seed Can Publish the Placeholder Questions

**Status:** Blocked — owner checks production fixtures, due 2026-10-25; promotion and scheduled smoke remain
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

`pnpm db:seed:prod` and `pnpm db:seed:all` seed each target by spawning `scripts/internal/run-managed-db-seed.ts` with a copy of the operator's whole environment. Before the fix, `runSeed` read `SEED_INCLUDE_PLACEHOLDERS` from that environment. So if the operator's shell had `SEED_INCLUDE_PLACEHOLDERS=true` exported, the production seed, while no content release was active, loaded the committed placeholder questions and skipped the step that archives them. Every placeholder is `status: published`, so, when the run succeeds and no recorded withdrawal prevents republishing, synthetic, clinical-looking questions become available for new practice.

The root cause is a hidden input: a switch meant for test databases, read from the ambient environment by code that also serves production. The fix removes that input.

BUG-360 separately owns the deploy-target E2E reset, which has a different trigger and needs a different fix. This record owns the seed input and the production fixture census.

Corrected 2026-10-18: separate the E2E reset, qualify active-release and target preconditions, and bound the environment-isolation rationale.

## Evidence

- **The child seed inherits everything.** `seedDatabase` in `scripts/seed-environment-runtime.ts` builds the child's environment from `...process.env` and removes only `DB_TARGET_ACK`.
- **The seed read the flag itself.** `runSeed` in `scripts/seed.ts` set `includePlaceholders` from `process.env.SEED_INCLUDE_PLACEHOLDERS === 'true'`. When it was true:
  - `readSeedQuestionFiles(true)` read `content/questions/placeholder/`;
  - `archivePlaceholderQuestions` was skipped.
- **Nothing guarded the variable in between.** `run-managed-db-seed.ts` handed the URL to `runSeed` unchanged. `seed-environment-targets.ts` checks `DB_TARGET_ACK` for both runners, rejects a caller-supplied `DATABASE_URL` only for the production runner, and refuses a non-production target with the same host, port and database as production. Neither runner looked at the placeholder variable.
- **The placeholders are published, and can be republished.**
  - All 10 files in `content/questions/placeholder/` are `status: published`.
  - An archived synthetic placeholder source is exempt from the archived-status refusal (`scripts/seed/question-syncer.ts:217-221`; classification in `scripts/seed/question-parser.ts:95`). A recorded withdrawal still refuses republishing (`question-syncer.ts:226-231`).
- **The flag was in common use.** `AGENTS.md`, the integration and content guides and the content READMEs set it for local and CI seeding, though inline rather than exported.
- **The managed seed has no acknowledgment.** It authorizes any URL without `DB_TARGET_ACK` (`scripts/internal/database-target-managed.ts`). So the command line the promotion guide prints for CI's seed step, run in a shell whose `DATABASE_URL` pointed at production, could also have published eligible placeholders before this fix, provided no active release or withdrawal refused the run.
- **Found by** the scripts directory audit (#1560). BUG-351, about the seed's stale input, does not cover it.

## Impact

- **Trigger:** the variable exported in the operator's shell, or set by a parent process, when `db:seed:prod` ran. A bare human seed with an explicit production target and its acknowledgment read the same variable. Both paths refuse mutation once a content release is active.
- **Occurrence is unmeasured.** No production query was performed in this audit.
- **Not checked:** which of the ten slugs in `scripts/seed/placeholder-archiver.ts` exist in production, and in what status. BUG-360's reset republishes two of them only if both exist; its setup writes need neither. A published row proves stored publication, not that a learner saw it or which path published it.
- **Effect:** synthetic questions published in the live bank, and learners' answers to them scored. A successful later seed without placeholders archives them while no release is active; without an authored input bundle that seed fails before archival. Once a release is active, remediation uses release/withdrawal commands rather than direct seeding.
- `db:seed:all` had the same input hazard for the non-production targets too, where the harm is smaller.

## Options

1. **Remove `SEED_INCLUDE_PLACEHOLDERS` from the child's environment in `seedDatabase`.** One line, but a bare `pnpm db:seed` against a remote target still read the exported variable.
2. **Make the choice explicit.** `runSeed(databaseUrl, { includePlaceholders })`, and `db:seed` and the managed seed take `--include-placeholders`. The test lanes pass it; the environment seeds never do.
3. **Build the child's environment from an allowlist.** This reduces inherited inputs but requires an explicit, tested runtime environment contract. It cannot guarantee isolation from future meanings of allowlisted variables. Option 2 closes the demonstrated placeholder input without changing the child's other environment requirements.

## Resolution (decided)

- **Option 2, with two refusals, implemented on this branch.**
  - `runSeed` takes `{ includePlaceholders }` and reads no environment.
  - `scripts/seed/seed-options.ts` parses the command line for `db:seed` and the managed seed. Only `--include-placeholders` is accepted, passed directly; a forwarded `--` separator is refused, as in the other strict operator parsers (#1567).
  - A set `SEED_INCLUDE_PLACEHOLDERS`, whatever its value, is refused before any database work. So a stale export now stops the production seed's child with a message, rather than being obeyed or silently ignored. That makes option 1 unnecessary.
  - The managed seed refuses `--include-placeholders` for any target that is not on the loopback interface. Every caller that passes the flag seeds a loopback database, and this path takes no acknowledgment. The human `db:seed` still accepts the flag for an acknowledged remote target.
  - The environment seeds spawn the managed seed with no arguments, and a test pins that.
  - CI, the hosted Checkout smoke and the local E2E plan pass the flag, and a workflow test keeps the old variable out of every workflow.
  - The two remedy messages that suggested the flag now limit it to local test databases.
- **Option 3 is not taken,** for the reason given under it.
- BUG-360 retains the owner's separate E2E target decision; moving the seed into CI alone would not solve either environment-contract or target-identity questions.

## Verification

The implementation reported red-first runs; their historical execution order
was not independently reconstructed. This audit reran the current tests.

- [x] Current-branch tests in `scripts/internal/run-managed-db-seed.test.ts` and `scripts/db-seed.test.ts` pass: an inherited `SEED_INCLUDE_PLACEHOLDERS=true` is refused before seeding, the managed entry point refuses placeholders for a remote target, and they are included only with `--include-placeholders`.
- [x] Current-branch `scripts/seed-environment-runtime.test.ts` passes: an environment seed spawns the managed seed without `--include-placeholders`.
- [x] Current-branch `tests/ci-workflow.test.ts` passes: both seed steps pass the flag, and no workflow sets the old variable.
- [ ] The fixing pull request's CI and local E2E runs pass with the flag.
- [ ] The hosted Checkout smoke's first scheduled run after promotion passes its seed step. The schedule runs from `main`.
- [ ] A read-only query shows which of the ten placeholder slugs exist in production, and that none is published. This needs the owner, or a session with read access.

## Related

- #1560: the scripts directory audit that found this. Its debt record proposes running the production seed in an owner-approved CI job.
- BUG-351: the production seed's input freshness. Its plan check, `pnpm db:seed:prod --plan`, parses under pnpm 11 since #1567.
- BUG-315: placeholder archival by exact slug.
- BUG-360: the separate deploy-target E2E reset and owner decision.
- DEBT-483: the bootstrap; once a release is active, the seed refuses production.
