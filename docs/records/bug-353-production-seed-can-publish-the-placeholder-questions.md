# BUG-353: The Production Seed Can Publish the Placeholder Questions When the Shell Sets Their Flag

**Status:** Open — stop the environment seeds from passing the placeholder flag to their child seed, red first
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

`pnpm db:seed:prod` and `pnpm db:seed:all` seed each target by spawning `scripts/internal/run-managed-db-seed.ts` with a copy of the operator's whole environment. `runSeed` reads `SEED_INCLUDE_PLACEHOLDERS` from that environment. So if the operator's shell has `SEED_INCLUDE_PLACEHOLDERS=true` exported, the production seed loads the committed placeholder questions and skips the step that archives them. Every placeholder is `status: published`, so synthetic, clinical-looking questions go live for learners.

## Evidence

- **The child seed inherits everything.** `seedDatabase` builds the child's environment from `...process.env` and removes only `DB_TARGET_ACK` (`scripts/seed-environment-runtime.ts:122-133`).
- **The seed reads the flag itself.** `runSeed` sets `includePlaceholders` from `process.env.SEED_INCLUDE_PLACEHOLDERS === 'true'` (`scripts/seed.ts:14`). When the flag is true:
  - `readSeedQuestionFiles(true)` reads `content/questions/placeholder/`;
  - `archivePlaceholderQuestions` is skipped (`:24-27`).
- **Nothing guards in between.** `run-managed-db-seed.ts` hands the URL to `runSeed` unchanged. `seed-environment-targets.ts` checks only the targets and `DB_TARGET_ACK`.
- **The placeholders are published.** All 10 files in `content/questions/placeholder/` are `status: "published"`.
- **The flag is in common use.** The guides set it for local and CI seeding, though inline rather than exported:
  - `docs/architecture/content-pipeline.md:83`;
  - `docs/guides/testing/integration-tests.md:49`;
  - the integration database command in `AGENTS.md`.
- **Not covered elsewhere.** The scripts audit found this (DEBT-532). BUG-351, about the seed's stale input, does not cover it.

## Impact

- **Trigger:** the variable is exported in the operator's shell, or set by a parent process, when `db:seed:prod` runs. Likelihood is low, and nothing shows it has happened.
- **Not checked:** whether production holds a published placeholder. A read-only query for the ten placeholder slugs would show it.
- **Effect:** ten synthetic questions published in the live bank, and learners' answers to them scored. They stay until a later seed without the flag archives them. While no release is active, every seed without the flag archives them.
- `db:seed:all` takes the same path for the non-production targets, where the harm is smaller.

## Options

1. **Remove `SEED_INCLUDE_PLACEHOLDERS` from the child's environment in `seedDatabase`.** One line; the ambient read stays.
2. **Make the choice explicit.**
   - `runSeed(databaseUrl, { includePlaceholders })`.
   - `run-managed-db-seed.ts` and `db-seed.ts` take an `--include-placeholders` flag. CI, the hosted Checkout smoke and the local E2E plan pass it; the environment seeds never do.
   - This removes the ambient read. It touches `ci.yml`, `stripe-hosted-checkout-smoke.yml`, `e2e-local-orchestrator.ts` and the guides that set the variable.
3. **Build the child's environment from an allowlist.** This closes any future ambient variable too, at the risk of leaving out one the child needs.
4. **Refuse placeholders for a remote target inside `runSeed`.** First confirm that no deliberate remote run, such as a deploy-target E2E check, relies on them.

## Resolution (proposed)

Option 2, with option 1 as an immediate guard if option 2 waits. Red first: a test of `seedDatabase` that sets the variable in the parent and fails while it reaches the child.

## Verification

- [ ] A test fails while a parent `SEED_INCLUDE_PLACEHOLDERS=true` reaches the production seed's child, and passes after the fix.
- [ ] CI, the hosted Checkout smoke and the local E2E plan still seed the placeholders.
- [ ] A read-only check shows no published placeholder slug in production. This needs the owner, or a session with read access.

## Related

- DEBT-532: the scripts audit that found this.
- BUG-351: the production seed's input freshness.
- BUG-315: placeholder archival by exact slug.
- DEBT-483: the bootstrap; once a release is active, the seed refuses production.
