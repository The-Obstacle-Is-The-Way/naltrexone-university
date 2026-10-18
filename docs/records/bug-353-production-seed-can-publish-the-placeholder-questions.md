# BUG-353: The Production Seed Can Publish the Placeholder Questions

**Status:** Blocked — owner checks production for placeholder rows, due 2026-10-25, and decides the E2E reset's route
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

`pnpm db:seed:prod` and `pnpm db:seed:all` seed each target by spawning `scripts/internal/run-managed-db-seed.ts` with a copy of the operator's whole environment. Before the fix, `runSeed` read `SEED_INCLUDE_PLACEHOLDERS` from that environment. So if the operator's shell had `SEED_INCLUDE_PLACEHOLDERS=true` exported, the production seed loaded the committed placeholder questions and skipped the step that archives them. Every placeholder is `status: published`, so synthetic, clinical-looking questions would go live for learners.

The root cause is a hidden input: a switch meant for test databases, read from the ambient environment by code that also serves production. The fix removes that input.

There is a second route to the same harm, which the fix does not close. If production already holds placeholder-01 and placeholder-02, in any status, an E2E run pointed at production republishes them.

## Evidence

- **The child seed inherits everything.** `seedDatabase` in `scripts/seed-environment-runtime.ts` builds the child's environment from `...process.env` and removes only `DB_TARGET_ACK`.
- **The seed read the flag itself.** `runSeed` in `scripts/seed.ts` set `includePlaceholders` from `process.env.SEED_INCLUDE_PLACEHOLDERS === 'true'`. When it was true:
  - `readSeedQuestionFiles(true)` read `content/questions/placeholder/`;
  - `archivePlaceholderQuestions` was skipped.
- **Nothing guarded the variable in between.** `run-managed-db-seed.ts` handed the URL to `runSeed` unchanged. `seed-environment-targets.ts` refuses a caller-supplied `DATABASE_URL`, checks `DB_TARGET_ACK`, and refuses a non-production target that matches production, but never looked at the variable.
- **The placeholders are published, and can be republished.**
  - All 10 files in `content/questions/placeholder/` are `status: published`.
  - An archived placeholder is exempt from the seed's refusal to reactivate archived questions (`scripts/seed/question-syncer.ts:217-221`).
- **The flag was in common use.** `AGENTS.md`, the integration and content guides and the content READMEs set it for local and CI seeding, though inline rather than exported.
- **The managed seed has no acknowledgement.** It authorizes any URL without `DB_TARGET_ACK` (`scripts/internal/database-target-managed.ts`). So the command line the promotion guide prints for CI's seed step, run in a shell whose `DATABASE_URL` pointed at production, would also have published the placeholders.
- **The second route.**
  - The E2E reset counts placeholder-01 and placeholder-02 in whatever database the run uses. If either is missing, it stops with `E2E_RESET:PLACEHOLDER_FIXTURES_MISSING` and writes nothing. If both exist, in any status, it sets them to `published` (`tests/e2e/helpers/reset-e2e-user-state.ts:186-216`).
  - `ALLOW_NON_LOCAL_DATABASE_URL=true` lets that run reach any host (`scripts/e2e-local-orchestrator.ts:137-143`).
  - The documented deploy-target check (`docs/guides/testing/e2e-tests.md`) points it at the `DATABASE_URL` in `.env.local`. Nothing stops a production URL.
- **Found by** the scripts audit (DEBT-532). BUG-351, about the seed's stale input, does not cover it.

## Impact

- **Trigger, first route:** the variable exported in the operator's shell, or set by a parent process, when `db:seed:prod` ran. A bare `DATABASE_URL=<production> DB_TARGET_ACK=… pnpm db:seed` read the same variable.
- **Trigger, second route:** a deploy-target E2E run given a production URL, when production already holds the two placeholder rows from an earlier seed that included them.
- **Likelihood:** low for both. Nothing shows either has happened.
- **Not checked:** which of the ten slugs in `scripts/seed/placeholder-archiver.ts` exist in production, and in what status. Existence decides whether the second route is open; a published row would mean the harm already happened.
- **Effect:** synthetic questions published in the live bank, and learners' answers to them scored. They stay until a later seed without placeholders archives them, which every such seed does while no release is active.
- `db:seed:all` took the first route for the non-production targets too, where the harm is smaller.

## Options

1. **Remove `SEED_INCLUDE_PLACEHOLDERS` from the child's environment in `seedDatabase`.** One line, but a bare `pnpm db:seed` against a remote target still read the exported variable.
2. **Make the choice explicit.** `runSeed(databaseUrl, { includePlaceholders })`, and `db:seed` and the managed seed take `--include-placeholders`. The test lanes pass it; the environment seeds never do.
3. **Build the child's environment from an allowlist.** This would close any future ambient variable too. But the `pnpm` and `tsx` child needs `PATH`, `HOME` and pnpm's own variables, so an allowlist risks breaking the seed for little gain once option 2 refuses this variable.
4. **Refuse placeholders, and the E2E passthrough, for the production database.** A refusal of every remote target would break the documented deploy-target check, which needs placeholder-01 and placeholder-02 on the Development database. The refusal must recognize production specifically. `db:seed:all` already does: it pulls Vercel Production's `DATABASE_URL` and refuses a non-production target with the same host and database (`scripts/seed-environment-targets.ts:43-56`). The deploy-target E2E mode could do the same and fail closed when it cannot pull.
5. **Let each database say what it is.** Rails records the environment that last migrated a database in `ar_internal_metadata`, and its destructive tasks refuse a database marked production. Here, the Vercel build's managed migrate knows `VERCEL_ENV`, so it could stamp the database, and the E2E reset could refuse a production stamp. The stamp must be sticky, so that a manual migrate without `VERCEL_ENV` cannot remove it. A Neon branch copied from production also copies the stamp, which fails safe.

## Resolution (decided)

- **First route: option 2, with two refusals.**
  - `runSeed` takes `{ includePlaceholders }` and reads no environment.
  - `scripts/seed/seed-options.ts` parses the command line for `db:seed` and the managed seed. Only `--include-placeholders` is accepted, after pnpm's `--` separator if one is given.
  - A set `SEED_INCLUDE_PLACEHOLDERS`, whatever its value, is refused before any database work. So a stale export now stops the production seed's child with a message, rather than being obeyed or silently ignored. That makes option 1 unnecessary.
  - The managed seed refuses `--include-placeholders` for any target that is not on the loopback interface. Every caller that passes the flag seeds a loopback database, and this path takes no acknowledgement. The human `db:seed` still accepts the flag for an acknowledged remote target.
  - The environment seeds spawn the managed seed with no arguments, and a test pins that.
  - CI, the hosted Checkout smoke and the local E2E plan pass the flag, and a workflow test keeps the old variable out of every workflow.
  - The two remedy messages that suggested the flag now limit it to local test databases.
- **Option 3 is not taken,** for the reason given under it.
- **Second route: the owner's call.** Options 4 and 5, or accept the risk. The deploy-target procedure now warns against a production URL either way.

## Verification

- [x] `scripts/internal/run-managed-db-seed.test.ts` and `scripts/db-seed.test.ts` failed first, then pass: an inherited `SEED_INCLUDE_PLACEHOLDERS=true` is refused before seeding, a remote target is refused the placeholders, and they are included only with `--include-placeholders`.
- [x] `scripts/seed-environment-runtime.test.ts` failed first, then passes: an environment seed spawns the managed seed without `--include-placeholders`.
- [x] `tests/ci-workflow.test.ts` failed against the old workflows, then passes: both seed steps pass the flag, and no workflow sets the old variable.
- [ ] The fixing pull request's CI and local E2E runs pass with the flag.
- [ ] The hosted Checkout smoke's first scheduled run after promotion passes its seed step. The schedule runs from `main`.
- [ ] A read-only query shows which of the ten placeholder slugs exist in production, and that none is published. This needs the owner, or a session with read access.
- [ ] The owner closes the second route, or accepts it, with the reason recorded here.

## Related

- DEBT-532: the scripts audit that found this, and its proposal to run the production seed in an owner-approved CI job.
- BUG-351: the production seed's input freshness. Its evidence cites `pnpm db:seed:prod -- --plan`, which stopped with a usage error under pnpm 11 until the fixing pull request.
- BUG-315: placeholder archival by exact slug.
- DEBT-483: the bootstrap; once a release is active, the seed refuses production.
