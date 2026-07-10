# DEBT-446: Bare `db:migrate`/`db:seed` Can Silently Target a Remote Database, and Production Seeding Lacks an Enforced Consent Gate

**Status:** Active
**Priority:** P3
**Date:** 2026-07-09

---

## Description

The manual database scripts resolve targets from `.env.local`/`.env` fallbacks
or from Vercel-pulled environment files, then mutate the resolved
`DATABASE_URL`. Bare `db:migrate` and `db:seed` have no target-classification or
host-confirmation boundary. `db:seed:all` is better: it prints credential-free
target keys and refuses when Production equals a non-production target, but it
still includes Production in the unattended execution loop without requiring a
separate consent token or showing a database change plan.

**Verification boundary (2026-07-10):** this read-only audit parsed, but did not
connect to, this clone's ignored `.env.local`; its `DATABASE_URL` is on line 7
and resolves to the recorded `ep-still-frog...` non-production host. That file
is not repository state and says nothing about another clone. Likewise,
`db:seed:all` pulls current Vercel values at runtime; the repository proves the
pull and target-comparison logic, not today's dashboard values or branch-specific
Preview overrides. Vercel documents that Preview values may be branch-specific
and that `vercel env pull --environment=...` downloads provider-owned values
([Vercel CLI environment docs](https://vercel.com/docs/cli/env)). Those live
settings are **unverifiable from the repository** in this no-infrastructure
audit.

### 1. Bare `pnpm db:migrate` falls back to `.env.local`/`.env` with no target guard

[`drizzle.config.ts`](../../drizzle.config.ts#L4) loads `.env.local`, then
`.env`, without overriding an already supplied shell value. Its only application
guard is non-emptiness ([lines 9-12](../../drizzle.config.ts#L9)).
[`package.json`](../../package.json#L24) maps `db:migrate` directly to
`drizzle-kit migrate` and `db:studio` directly to `drizzle-kit studio`.

With no shell `DATABASE_URL`, a bare migration therefore uses the first value in
that fallback chain. In this clone at audit time that is the remote Neon dev
host. The installed Drizzle Kit command prints the selected driver and migration
progress, not the target hostname/database, and has no repository target guard.
`db:migrate` mutates immediately; `db:studio` does not mutate merely by starting,
but opens an interactive editor against the same implicit target and can mutate
it. The protections are prose-only: [CLAUDE.md](../../CLAUDE.md#L94) and
[migration-authoring.md](../dev/migration-authoring.md#L94) require an explicit
host-verified URL. The closest code precedent is
[`seed-all-environments.sh`](../../scripts/seed-all-environments.sh#L132), which
computes redacted target keys and rejects Production/non-production aliasing.

This fallback did **not** cause the early-0027 incident. The DEBT-442 record says
Development applied early 0027 through a Vercel Preview build, where Vercel
supplied `DATABASE_URL`; it was not a bare local command
([incident proof](../_archive/debt/debt-442-applied-migration-ledger-content-blind.md#L12)).
The severe local variant has nevertheless occurred: archived
[DEBT-240](../_archive/debt/debt-240-local-dev-database-url-points-to-production.md#L12)
records this ignored file pointing at Production for about two weeks. That fix
changed one clone's value, not the fallback mechanism.

### 2. Bare `pnpm db:seed` can overwrite remote content without target or freshness checks

[`scripts/seed.ts`](../../scripts/seed.ts#L11) loads the same fallback chain;
`runSeed()` checks only that a URL exists ([lines 14-20](../../scripts/seed.ts#L14)).
It opens the connection without printing the hostname. For each local question
whose canonical hash differs from the database, the syncer then:

- overwrites `stem_md`, `explanation_md`, `reference_md`, `difficulty`, and
  `status` without a source-version/freshness comparison
  ([question-syncer.ts](../../scripts/seed/question-syncer.ts#L247),
  [update](../../scripts/seed/question-syncer.ts#L278));
- deletes choices absent from that local question only when no attempt or
  normalized session state references them
  ([delete](../../scripts/seed/question-syncer.ts#L341));
- when `SEED_INCLUDE_PLACEHOLDERS` is not `true`, archives every
  `placeholder-%` question
  ([seed.ts](../../scripts/seed.ts#L35),
  [placeholder-archiver.ts](../../scripts/seed/placeholder-archiver.ts#L8)).

The successful command logs aggregate insert/update/skip counts and the local
content root, but not the target or a per-question before/after plan. A stale
clone can therefore downgrade same-slug content on whichever database its
fallback resolves. Under the last measured provider topology that includes the
shared dev database used by Preview/local development, but the current Vercel
mapping was not re-queried in this audit.

Two destructive legs are already fail-closed. Choice deletion throws when an
attempt or practice-session state references the choice
([seed-helpers.ts](../../scripts/seed-helpers.ts#L63)), and an answer-key flip
over graded history throws unless the explicit BUG-281 override is set
([question-syncer.ts](../../scripts/seed/question-syncer.ts#L73)). The original
candidate's "remaps `attempts.selectedChoiceId`" claim remains refuted. Those
guards protect references and stored grades; they do not provide target
selection, content freshness, or text-change review. Existing docs warn about
the fallback ([integration-tests.md](../dev/integration-tests.md#L163),
[deployment-procedure.md](../dev/deployment-procedure.md#L120)), but operator
discipline is the only target control.

### 3. `db:seed:all` announces, then seeds, Production without enforced consent or a database diff

[`seed-all-environments.sh`](../../scripts/seed-all-environments.sh#L112) pulls
Development, default Preview, and Production values into a temporary directory,
adds Production to the target list
([lines 142-145](../../scripts/seed-all-environments.sh#L142)), and runs
`db:seed` for every unique target
([lines 166-169](../../scripts/seed-all-environments.sh#L166)). It correctly:

- prints a credential-free `label -> host/database` plan, including the explicit
  label `Vercel production`
  ([lines 147-150](../../scripts/seed-all-environments.sh#L147));
- deduplicates targets and refuses if Production's key equals any local,
  Development, or Preview key
  ([lines 132-140](../../scripts/seed-all-environments.sh#L132));
- offers `--plan`, which stops before import or database writes
  ([lines 152-155](../../scripts/seed-all-environments.sh#L152)).

It does **not** require `--plan`, a separate Production acknowledgment, or a
per-question database diff. With a valid private `recall.md`/`vignettes.md`
corpus (the importer fails before seeding if none exists at
[`import-draft-questions.ts`](../../scripts/import-draft-questions.ts#L69)), the
live path deletes generated files, rebuilds them from clone-local draft
subdirectories, then seeds Production. Both the private draft subdirectories
and generated imported questions are gitignored
([`.gitignore`](../../.gitignore#L54), [draft rules](../../.gitignore#L58)).

A stale-but-different same-slug corpus does not qualify for the hash skip and is
therefore written. The BUG-266/BUG-281 guards protect referenced choices and
graded answer keys by default, but text/explanation/status changes and
unreferenced-choice deletion have no freshness fence. The script records
aggregate seed counts, not which Production questions changed or their prior
values. Part 3 is therefore an announced but insufficiently gated Production
operation, not a silent-host operation.

## Impact

Parts 1 and 2 silently select a target: in this clone's audited configuration, a
bare command can mutate shared dev or, if an ignored env file is wrong as in
DEBT-240, Production. Part 3 explicitly prints the Production target but can
proceed non-interactively from a stale private corpus without enforced consent
or a change plan. Recovery from content churn is usually a current-corpus
reseed; a database restore is a last resort with the write-loss consequences
tracked by DEBT-445. P3 remains appropriate: each path requires
operator/configuration error and the highest-integrity seed mutations already
have guards, but the Production stale-content path is real and the
implicit-target precondition has occurred before.

## Proposed Resolution

Use one target-classification/formatting helper for migration and seed commands;
do not create separate definitions of local, remote, or credential-safe target
labels.

**Part 1 -- `db:migrate`/`db:studio` target boundary:**

1. **Recommended:** replace `db:migrate` with a thin wrapper that checks
   `process.env.DATABASE_URL` **before** Drizzle imports the fallback-loading
   config. Refuse an implicit fallback, print only `hostname/database`, and then
   invoke Drizzle Kit with the explicit value. CI, resolver-scoped local tests,
   and Vercel already inject explicit URLs, so no broad `CI`/`VERCEL` bypass is
   needed.
2. For an explicitly supplied non-local URL in a human-operated shell, require
   an exact acknowledgment such as `DB_TARGET_ACK=<hostname>/<database>`.
   Non-interactive managed deploys can use a narrowly tested managed-context
   policy; a generic `remote-dev` or boolean acknowledgment is too easy to leave
   stale.
3. Apply the same redacted-target display/acknowledgment policy to `db:studio`;
   it is an editor, not a read-only exception.

**Part 2 -- `db:seed` target boundary:**

1. Move fallback resolution behind the same explicit-target helper. Direct
   `db:seed` should require an explicit URL, print the redacted target, and
   require exact non-local acknowledgment in a human shell.
2. Preserve existing callers: CI, local E2E/integration bootstrap, and
   `db:seed:all` already pass `DATABASE_URL` explicitly. The orchestrator can
   pass the exact acknowledgment it just computed; direct bare seed can no
   longer infer a remote target from an ignored file.
3. Keep BUG-266 and BUG-281 guards independent. Target authorization must not
   weaken reference integrity or graded-history protection.

**Part 3 -- Production seed consent and review:**

1. **Recommended:** make the operation two-phase and non-interactive. First
   compute every target's per-question insert/update/delete plan without writes;
   then require `SEED_CONFIRM_PRODUCTION=<production-host/database>` matching the
   printed target before any environment is mutated. A missing/mismatched token
   exits non-zero.
2. Simpler alternative: remove Production from `db:seed:all` and expose a
   separate deliberate `db:seed:prod` command with the same exact target token.
3. Do not claim a lone corpus hash proves freshness or ancestry. A durable
   freshness fence requires a canonical monotonic corpus revision (plus the
   manifest hash and audit timestamp) that the target can compare with the local
   source; without that source of ordering, two different hashes say only
   "different."

## Verification

- **Part 1:** unit tests prove implicit fallback refusal, explicit local pass,
  exact remote acknowledgment, credential-free target formatting, and unchanged
  Vercel/CI invocation; `vercel.test.ts` still pins migrate-before-build.
- **Part 2:** direct bare seed fails before opening Postgres; resolver/CI URLs
  pass; an unacknowledged manual remote URL fails; `db:seed:all` passes the exact
  target token; logs never contain credentials.
- **Part 3:** hermetic script tests prove Production is never seeded without an
  exact token, a mismatched token fails before the first target write, the plan
  names per-question changes, and the confirmed path preserves target
  deduplication and fail-fast batch behavior.

## Related

- [DEBT-240](../_archive/debt/debt-240-local-dev-database-url-points-to-production.md)
  -- fixed the ignored `.env.local` value, not the fallback mechanism.
- [DEBT-411](../_archive/debt/debt-411-local-e2e-flakiness-and-error-masking.md)
  -- moved normal local E2E to resolver-scoped Docker.
- [DEBT-442](../_archive/debt/debt-442-applied-migration-ledger-content-blind.md)
  -- shipped persistent-target ledger/content detection and records the
  Preview-deploy mechanism behind early 0027.
- [BUG-266](../_archive/bugs/bug-266-practice-session-question-states-fk-breaks-content-sync.md)
  and [BUG-281](../_archive/bugs/bug-281-seed-reimport-rewrites-answer-key-under-graded-history.md)
  -- shipped the referenced-choice and graded-answer-key guards.
- [DEBT-343](../_archive/debt/debt-343-scripts-cleanup.md) -- created
  `seed-all-environments.sh` with target deduplication and alias rejection; it
  did not decide a Production consent gate.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12
  finder lenses, per-candidate adversarial verification, dedup against the full
  archived register).
