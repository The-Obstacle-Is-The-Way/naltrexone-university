# BUG-353: The Production Seed Can Publish the Placeholder Questions

**Status:** Open — owner runs the read-only production check, due 2026-10-25, and decides the E2E reset's route
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

`pnpm db:seed:prod` and `pnpm db:seed:all` seed each target by spawning `scripts/internal/run-managed-db-seed.ts` with a copy of the operator's whole environment. Before this fix, `runSeed` read `SEED_INCLUDE_PLACEHOLDERS` from that environment. So if the operator's shell had `SEED_INCLUDE_PLACEHOLDERS=true` exported, the production seed loaded the committed placeholder questions and skipped the step that archives them. Every placeholder is `status: published`, so synthetic, clinical-looking questions would go live for learners.

There is a second route to the same harm. The E2E reset republishes two placeholders on whatever database the run uses, and that run can be pointed at any host.

The root cause of the first route is a hidden input: a switch meant for test databases, read from the ambient environment by code that also serves production. The fix removes that input. The second route needs a way to recognize production, which is the owner's decision.

## Evidence

- **The child seed inherits everything.** `seedDatabase` in `scripts/seed-environment-runtime.ts` builds the child's environment from `...process.env` and removes only `DB_TARGET_ACK`.
- **The seed read the flag itself.** `runSeed` in `scripts/seed.ts` set `includePlaceholders` from `process.env.SEED_INCLUDE_PLACEHOLDERS === 'true'`. When it was true:
  - `readSeedQuestionFiles(true)` read `content/questions/placeholder/`;
  - `archivePlaceholderQuestions` was skipped.
- **Nothing guarded in between.** `run-managed-db-seed.ts` handed the URL to `runSeed` unchanged. `seed-environment-targets.ts` checks only the targets and `DB_TARGET_ACK`.
- **The placeholders are published, and can be republished.**
  - All 10 files in `content/questions/placeholder/` are `status: published`.
  - An archived placeholder is exempt from the seed's refusal to reactivate archived questions (`scripts/seed/question-syncer.ts:217-221`).
- **The flag was in common use.** `AGENTS.md`, the integration and content guides and the content READMEs set it for local and CI seeding, though inline rather than exported.
- **The second route.**
  - The E2E reset sets `status = 'published'` on placeholder-01 and placeholder-02 in whatever database the run uses (`tests/e2e/helpers/reset-e2e-user-state.ts:206-216`).
  - `ALLOW_NON_LOCAL_DATABASE_URL=true` lets that run reach any host, production included (`scripts/e2e-local-orchestrator.ts:137-143`).
  - The documented deploy-target check (`docs/guides/testing/e2e-tests.md`) points it at the Development environment's database. Nothing stops a production URL.
- **Found by** the scripts audit (DEBT-532). BUG-351, about the seed's stale input, does not cover it.

## Impact

- **Trigger, first route:** the variable exported in the operator's shell, or set by a parent process, when `db:seed:prod` runs. A bare `DATABASE_URL=<production> DB_TARGET_ACK=… pnpm db:seed` read the same variable.
- **Trigger, second route:** a deploy-target E2E run given a production URL.
- **Likelihood:** low for both. Nothing shows either has happened.
- **Not checked:** whether production holds a published placeholder. A read-only query for the ten slugs in `scripts/seed/placeholder-archiver.ts` would show it.
- **Effect:** synthetic questions published in the live bank, and learners' answers to them scored. They stay until a later seed without placeholders archives them, which every such seed does while no release is active.
- `db:seed:all` took the first route for the non-production targets too, where the harm is smaller.

## Options

1. **Remove `SEED_INCLUDE_PLACEHOLDERS` from the child's environment in `seedDatabase`.** One line, but a bare `pnpm db:seed` against a remote target still read the exported variable.
2. **Make the choice explicit.** `runSeed(databaseUrl, { includePlaceholders })`, and `db:seed` and the managed seed take `--include-placeholders`. The test lanes pass it; the environment seeds never do.
3. **Build the child's environment from an allowlist.** This closes any future ambient variable too, at the risk of leaving out one the child needs.
4. **Refuse placeholders, and the E2E passthrough, for the production database.** A remote-target refusal would break the documented deploy-target check, which needs placeholder-01 and placeholder-02 (`E2E_RESET:PLACEHOLDER_FIXTURES_MISSING`). So the refusal must recognize production specifically, which nothing in the repository does today.
5. **Let each database say what it is.** Rails records the environment that last migrated a database in `ar_internal_metadata`, and its destructive tasks refuse a database marked production. Here, the Vercel build's managed migrate knows `VERCEL_ENV`, so it could stamp the database, and the E2E reset and the seed's placeholder path could refuse a database stamped production. This is how option 4 would recognize production.

## Resolution (decided)

- **First route: option 2, with a refusal of the retired variable.**
  - `runSeed` takes `{ includePlaceholders }` and reads no environment.
  - `scripts/seed/seed-options.ts` parses the command line for `db:seed` and the managed seed. Only `--include-placeholders` is accepted.
  - A set `SEED_INCLUDE_PLACEHOLDERS`, whatever its value, is refused before any database work. So a stale export now stops the production seed with a message, rather than being silently ignored or obeyed. That makes option 1 unnecessary.
  - The environment seeds spawn the managed seed with no arguments, and a test pins that.
  - CI, the hosted Checkout smoke and the local E2E plan pass the flag. `AGENTS.md` and the guides use it.
- **Option 3 is not taken.** DEBT-532 proposes moving the production seed into an owner-approved GitHub Actions job, whose environment is declared rather than inherited from a shell. That removes the ambient environment for every variable, not just this one.
- **Second route: the owner's call.** Either options 4 and 5, or accept the risk with the deploy-target procedure warning against a production URL.

## Verification

- [x] `scripts/internal/run-managed-db-seed.test.ts` and `scripts/db-seed.test.ts` failed first, then pass: an inherited `SEED_INCLUDE_PLACEHOLDERS=true` is refused before seeding, and the placeholders are included only with `--include-placeholders`.
- [x] `scripts/seed-environment-runtime.test.ts` failed first, then passes: an environment seed spawns the managed seed without `--include-placeholders`.
- [ ] CI's seed step and the local E2E plan pass the flag, and their runs pass.
- [ ] The hosted Checkout smoke's next scheduled run passes its seed step with the flag.
- [ ] The owner closes the second route, or accepts it, with the reason recorded here.
- [ ] A read-only query shows no published placeholder slug in production. This needs the owner, or a session with read access.

## Related

- DEBT-532: the scripts audit that found this, and the proposal to run the production seed in CI.
- BUG-351: the production seed's input freshness.
- BUG-315: placeholder archival by exact slug.
- DEBT-483: the bootstrap; once a release is active, the seed refuses production.
