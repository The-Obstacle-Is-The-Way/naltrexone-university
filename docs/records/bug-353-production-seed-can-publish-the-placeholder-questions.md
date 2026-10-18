# BUG-353: The Production Seed Can Publish the Placeholder Questions When the Shell Sets Their Flag

**Status:** Open — stop the environment seeds from passing the placeholder flag to their child seed, red first
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

`pnpm db:seed:prod` and `pnpm db:seed:all` seed each target by spawning `scripts/internal/run-managed-db-seed.ts` with a copy of the operator's whole environment. `runSeed` reads `SEED_INCLUDE_PLACEHOLDERS` from that environment. So if the operator's shell has `SEED_INCLUDE_PLACEHOLDERS=true` exported, the production seed loads the committed placeholder questions and skips the step that archives them. Every placeholder is `status: published`, so synthetic, clinical-looking questions go live for learners.

There is a second route to the same harm. The E2E reset republishes two placeholders on whatever database the run uses, and that run can be pointed at any host.

## Evidence

- **The child seed inherits everything.** `seedDatabase` builds the child's environment from `...process.env` and removes only `DB_TARGET_ACK` (`scripts/seed-environment-runtime.ts:122-133`).
- **The seed reads the flag itself.** `runSeed` sets `includePlaceholders` from `process.env.SEED_INCLUDE_PLACEHOLDERS === 'true'` (`scripts/seed.ts:14`). When the flag is true:
  - `readSeedQuestionFiles(true)` reads `content/questions/placeholder/`;
  - `archivePlaceholderQuestions` is skipped (`:24-27`).
- **Nothing guards in between.** `run-managed-db-seed.ts` hands the URL to `runSeed` unchanged. `seed-environment-targets.ts` checks only the targets and `DB_TARGET_ACK`.
- **The placeholders are published, and can be republished.**
  - All 10 files in `content/questions/placeholder/` are `status: published`.
  - An archived placeholder is exempt from the seed's refusal to reactivate archived questions (`scripts/seed/question-syncer.ts:217-221`).
- **The flag is in common use.** The guides set it for local and CI seeding, though inline rather than exported:
  - `docs/architecture/content-pipeline.md:83`;
  - `docs/guides/testing/integration-tests.md:53` and `:85`;
  - the integration database command in `AGENTS.md`.
- **The second route.**
  - The E2E reset sets `status = 'published'` on placeholder-01 and placeholder-02 in whatever database the run uses (`tests/e2e/helpers/reset-e2e-user-state.ts:206-216`).
  - `ALLOW_NON_LOCAL_DATABASE_URL=true` lets that run reach any host, production included (`scripts/e2e-local-orchestrator.ts:135-141`).
  - The documented deploy-target check (`docs/guides/testing/e2e-tests.md`) points it at the database in `.env.local`, which is the Development environment's. Nothing stops a production URL.
- **Not covered elsewhere.** The scripts audit found this (DEBT-532). BUG-351, about the seed's stale input, does not cover it.

## Impact

- **Trigger, first route:** the variable is exported in the operator's shell, or set by a parent process, when `db:seed:prod` runs. A bare `DATABASE_URL=<production> DB_TARGET_ACK=… pnpm db:seed` reads the same variable.
- **Trigger, second route:** a deploy-target E2E run given a production URL.
- **Likelihood:** low for both. Nothing shows either has happened.
- **Not checked:** whether production holds a published placeholder. A read-only query for the ten placeholder slugs would show it.
- **Effect:** synthetic questions published in the live bank, and learners' answers to them scored. They stay until a later seed without the flag archives them. While no release is active, every seed without the flag archives them.
- `db:seed:all` takes the first route for the non-production targets, where the harm is smaller.

## Options

1. **Remove `SEED_INCLUDE_PLACEHOLDERS` from the child's environment in `seedDatabase`.** One line. It leaves a bare `pnpm db:seed` against a remote target reading the exported variable.
2. **Make the choice explicit.**
   - `runSeed(databaseUrl, { includePlaceholders })`.
   - `run-managed-db-seed.ts` and `db-seed.ts` take an `--include-placeholders` flag. CI, the hosted Checkout smoke, the local E2E plan and the deploy-target procedure pass it; the environment seeds never do.
   - This removes the ambient read. It touches:
     - `ci.yml`, `stripe-hosted-checkout-smoke.yml`, `e2e-local-orchestrator.ts` and its test;
     - the message in `scripts/seed/file-reader.ts` and the reset's remedy text;
     - `AGENTS.md`, `content/questions/README.md`, the drafts' schema notes and the guides that set the variable.
3. **Build the child's environment from an allowlist.** This closes any future ambient variable too, at the risk of leaving out one the child needs.
4. **Refuse placeholders, and the E2E passthrough, for the production database.** A remote-target refusal would break the documented deploy-target check, which needs placeholder-01 and placeholder-02 (`E2E_RESET:PLACEHOLDER_FIXTURES_MISSING`). So this refusal must recognize production specifically, which nothing in the repository does today.

## Resolution (proposed)

- **Option 2 for the first route,** with option 1 as an immediate guard if option 2 waits. Red first: a test of `seedDatabase` that sets the variable in the parent, and fails while it reaches the child.
- **The second route is the owner's call.** Either option 4, with a way to recognize production, or accept the risk with the deploy-target procedure warning against a production URL.

## Verification

- [ ] A test fails while a parent `SEED_INCLUDE_PLACEHOLDERS=true` reaches the production seed's child, and passes after the fix.
- [ ] CI, the hosted Checkout smoke, the local E2E plan and the deploy-target check still get the placeholders they need.
- [ ] The second route closed, or accepted by the owner, with the reason recorded here.
- [ ] A read-only check shows no published placeholder slug in production. This needs the owner, or a session with read access.

## Related

- DEBT-532: the scripts audit that found this, including the two remote-database rules.
- BUG-351: the production seed's input freshness.
- BUG-315: placeholder archival by exact slug.
- DEBT-483: the bootstrap; once a release is active, the seed refuses production.
