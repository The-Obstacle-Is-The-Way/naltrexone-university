# DEBT-446: Bare `db:migrate`/`db:seed` Can Silently Target a Remote Database, and Production Seeding Lacks an Enforced Consent Gate

**Status:** Resolved
**Priority:** P3
**Date:** 2026-07-09
**Re-verified accurate against `ddad8eee` on 2026-07-18.**
**Resolved:** 2026-07-21 — FW-5 implemented Parts 1, 2, and 3a with one explicit-target classifier/redactor/serializer, exact canonical remote-set consent for human commands, checked-in internal managed callers, guarded migrate/studio/seed entry points, a non-production-only batch seed with the named Production identity as an exclusion fence, and a dedicated named-Production seed command. Part 3b remains PARKED behind its recorded stale-clone overwrite or second-independent-writer trigger; no plan/freshness machinery was added.

---

## Direction (2026-07-20 forest review)

| Part | Verdict | Chosen option | Rejected as disproportionate | One-line rationale |
| --- | --- | --- | --- | --- |
| 1. Migrate/studio target boundary | **FIX (Option 1, minimal shared form)** | One shared target helper must see an explicitly supplied `DATABASE_URL` before fallback config loads, classify only loopback as LOCAL and every other host as REMOTE, print `host[:port]/database`, and require `DB_TARGET_ACK` to equal the canonical JSON array of sorted unique redacted REMOTE target strings for every human-shell invocation; apply it to migrate and studio. Checked-in CI/Vercel/resolver wrappers alone may call an internal managed mode that is not exposed as an environment variable or CLI flag. | Separate migrate/studio classifiers, interactive prompts, config files, ad hoc delimiter formats, boolean acknowledgments, a caller-selectable bypass, and a CI/Vercel env-var matrix. | (a) Consolidates existing redaction/classification/serialization instead of adding policy copies; (b) DEBT-240 proves the ignored-file Production precondition occurred; (c) Blast radius: a bare command can migrate or expose an editor against the wrong remote database. Fix cost: one helper plus thin wrappers, while explicit loopback/resolver and checked-in managed callers remain unchanged; (d) one canonical credential-free encoding and non-self-issued exact consent are clean-code wins; (e) the same helper also owns seed classification. |
| 2. Seed target boundary | **FIX (Option 1, minimal shared form)** | Route direct and batch seed through the same explicit-target helper before opening Postgres. Human REMOTE runs, including `db:seed:all`, must acknowledge the helper's canonical JSON array of sorted unique redacted remote targets and may not self-authorize; preserve BUG-266/281 guards and the internal managed mode used only by checked-in CI/E2E/resolver callers. | A seed-only classifier/serializer, fallback loading, interactive prompts, a caller-selectable managed bypass, or weakening existing content-integrity guards. | (a) Reuses the Part 1 seam; (b) stale same-slug writes are source-proven and the wrong-target precondition is historical; (c) Blast radius: a stale clone can overwrite remote question content and archive placeholders. Fix cost: the same wrapper boundary and one canonical plan token; (d) removes semantic duplication and makes batch consent independent; (e) migration, seed, and batch seed share one classification/consent vocabulary. |
| 3a. Production seed consent | **FIX (Option 2, minimal form)** | `db:seed:all` resolves Vercel's named Development, Preview, and Production identities through the existing pull seam, rejects any non-production target equal to the resolved Production target, and executes only local/Development/Preview after exact human REMOTE-set consent. Dedicated `db:seed:prod` resolves only the named Vercel Production identity itself and requires the same helper's exact token; it does not accept a caller-supplied target URL. | Option 1's two-phase per-question plan/revalidation protocol, a new target allowlist/config file, and any second Production-only classifier or consent implementation. | (a) Deletes Production from the omnibus execution loop while reusing its existing named-environment fence and one token; (b) unattended Production inclusion is code-proven; (c) Blast radius: one broad command or arbitrary target input can overwrite Production from a stale private corpus. Fix cost: split the existing environment-labeled script without a new identity registry; (d) command names and provider-resolved identity make intent honest; (e) no duplicate target owner, redaction, or consent logic. |
| 3b. Per-question plan/freshness fence | **PARK** | Do not build the per-question database plan, plan revalidation, or canonical monotonic corpus revision now. Revive after a recorded seed run overwrites newer same-slug content from an older clone, or after the corpus gains a second independent writer for which ordering cannot be established by the current single source. | Option 1's plan/revalidation machinery and Option 3's new durable corpus-revision state before either trigger. | (a) Avoids a new planning/version protocol; (b) stale overwrite is reachable but no incident is recorded and hashes prove difference, not ancestry; (c) Blast radius: a stale seed can require a corrective current-corpus reseed. Cure cost: database diff plans, revalidation, and durable ordering state, which is heavier today; (d) no speculative abstraction; (e) target authorization remains one shared concern while content ancestry stays separately parked. |

The cluster gets one target classifier/serializer and one consent token: explicit URL presence is checked before fallback loading, logs contain only `host[:port]/database`, every human REMOTE operation acknowledges the canonical JSON array of sorted unique redacted targets, and only checked-in CI/Vercel/resolver wrappers can call the helper's non-user-selectable managed mode. `db:seed:all` keeps the existing named Vercel Production resolution solely as an exclusion fence but executes only local/Development/Preview; `db:seed:prod` resolves the named Production identity itself and uses the same consent boundary. A database diff/version protocol is parked until the named content-history evidence exists.

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
and resolves to an audited non-production Neon host. That file
is not repository state and says nothing about another clone. Likewise,
`db:seed:all` pulls current Vercel values at runtime; the repository proves the
pull and target-comparison logic, not today's dashboard values or branch-specific
Preview overrides. Vercel documents that Preview values may be branch-specific
and that `vercel env pull --environment=...` downloads provider-owned values
([Vercel CLI environment docs](https://vercel.com/docs/cli/env)). Those live
settings are **unverifiable from the repository** in this no-infrastructure
audit.

### 1. Bare `pnpm db:migrate` falls back to `.env.local`/`.env` with no target guard

[`drizzle.config.ts`](../../../drizzle.config.ts#L4) loads `.env.local`, then
`.env`, without overriding an already supplied shell value. Its only application
guard is non-emptiness ([lines 9-12](../../../drizzle.config.ts#L9)).
[`package.json`](../../../package.json#L24) maps `db:migrate` directly to
`drizzle-kit migrate` and `db:studio` directly to `drizzle-kit studio`.

With no shell `DATABASE_URL`, a bare migration therefore uses the first value in
that fallback chain. In this clone at audit time that is the remote Neon dev
host. The installed Drizzle Kit command prints the selected driver and migration
progress, not the target hostname/database, and has no repository target guard.
`db:migrate` mutates immediately; `db:studio` does not mutate merely by starting,
but opens an interactive editor against the same implicit target and can mutate
it. The protections are prose-only: [CLAUDE.md](../../../CLAUDE.md#L94) and
[migration-authoring.md](../../dev/migration-authoring.md#L94) require an explicit
host-verified URL. The closest code precedent is
[`seed-all-environments.sh`](../../../scripts/seed-all-environments.sh#L132), which
computes redacted target keys and rejects Production/non-production aliasing.

This fallback did **not** cause the early-0027 incident. The DEBT-442 record says
Development applied early 0027 through a Vercel Preview build, where Vercel
supplied `DATABASE_URL`; it was not a bare local command
([incident proof](./debt-442-applied-migration-ledger-content-blind.md#L12)).
The severe local variant has nevertheless occurred: archived
[DEBT-240](./debt-240-local-dev-database-url-points-to-production.md#L12)
records this ignored file pointing at Production for about two weeks. That fix
changed one clone's value, not the fallback mechanism.

### 2. Bare `pnpm db:seed` can overwrite remote content without target or freshness checks

[`scripts/seed.ts`](../../../scripts/seed.ts#L11) loads the same fallback chain;
`runSeed()` checks only that a URL exists ([lines 14-20](../../../scripts/seed.ts#L14)).
It opens the connection without printing the hostname. For each local question
whose canonical hash differs from the database, the syncer then:

- overwrites `stem_md`, `explanation_md`, `reference_md`, `difficulty`, and
  `status` without a source-version/freshness comparison
  ([question-syncer.ts](../../../scripts/seed/question-syncer.ts#L247),
  [update](../../../scripts/seed/question-syncer.ts#L278));
- deletes choices absent from that local question only when no attempt or
  normalized session state references them
  ([delete](../../../scripts/seed/question-syncer.ts#L341));
- when `SEED_INCLUDE_PLACEHOLDERS` is not `true`, archives every
  `placeholder-%` question
  ([seed.ts](../../../scripts/seed.ts#L35),
  [placeholder-archiver.ts](../../../scripts/seed/placeholder-archiver.ts#L8)).

The successful command logs aggregate insert/update/skip counts and the local
content root, but not the target or a per-question before/after plan. A stale
clone can therefore downgrade same-slug content on whichever database its
fallback resolves. Under the last measured provider topology that includes the
shared dev database used by Preview/local development, but the current Vercel
mapping was not re-queried in this audit.

Two destructive legs are already fail-closed. Choice deletion throws when an
attempt or practice-session state references the choice
([seed-helpers.ts](../../../scripts/seed-helpers.ts#L63)), and an answer-key flip
over graded history throws unless the explicit BUG-281 override is set
([question-syncer.ts](../../../scripts/seed/question-syncer.ts#L73)). The original
candidate's "remaps `attempts.selectedChoiceId`" claim remains refuted. Those
guards protect references and stored grades; they do not provide target
selection, content freshness, or text-change review. Existing docs warn about
the fallback ([integration-tests.md](../../dev/integration-tests.md#L163),
[deployment-procedure.md](../../dev/deployment-procedure.md#L120)), but operator
discipline is the only target control.

### 3. `db:seed:all` announces, then seeds, Production without enforced consent or a database diff

[`seed-all-environments.sh`](../../../scripts/seed-all-environments.sh#L112) pulls
Development, default Preview, and Production values into a temporary directory,
adds Production to the target list
([lines 142-145](../../../scripts/seed-all-environments.sh#L142)), and runs
`db:seed` for every unique target
([lines 166-169](../../../scripts/seed-all-environments.sh#L166)). It correctly:

- prints a credential-free `label -> host/database` plan, including the explicit
  label `Vercel production`
  ([lines 147-150](../../../scripts/seed-all-environments.sh#L147));
- deduplicates targets and refuses if Production's key equals any local,
  Development, or Preview key
  ([lines 132-140](../../../scripts/seed-all-environments.sh#L132));
- offers `--plan`, which stops before import or database writes
  ([lines 152-155](../../../scripts/seed-all-environments.sh#L152)).

It does **not** require `--plan`, a separate Production acknowledgment, or a
per-question database diff. With a valid private `recall.md`/`vignettes.md`
corpus (the importer fails before seeding if none exists at
[`import-draft-questions.ts`](../../../scripts/import-draft-questions.ts#L69)), the
live path deletes generated files, rebuilds them from clone-local draft
subdirectories, then seeds Production. Both the private draft subdirectories
and generated imported questions are gitignored
([`.gitignore`](../../../.gitignore#L54), [draft rules](../../../.gitignore#L58)).

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

1. **CHOSEN (Option 1, minimal shared form):** replace `db:migrate` with a thin wrapper that checks
   `process.env.DATABASE_URL` **before** Drizzle imports the fallback-loading
   config. Refuse an implicit fallback, classify `localhost`, `127.0.0.1`, and
   `::1` as LOCAL and every other host as REMOTE, print only
   `host[:port]/database`, and then invoke Drizzle Kit with the explicit value.
   Including an explicit port in both display and consent keeps distinct remote
   endpoints distinct. CI, resolver-scoped local tests, and Vercel already
   inject explicit URLs, so no broad `CI`/`VERCEL` bypass matrix is authorized.
2. **CHOSEN (same helper policy):** the shared helper maps REMOTE URLs to
   credential-free `host[:port]/database` strings, removes exact duplicates,
   sorts them lexicographically, and serializes the resulting string array with
   `JSON.stringify`. For a human-operated invocation containing REMOTE targets,
   require `DB_TARGET_ACK` to equal that canonical JSON byte-for-byte; for
   example, a direct command displays and requires
   `DB_TARGET_ACK='["ep-example-pooler.us-east-2.aws.neon.tech/app"]'`.
   JSON escaping is the only delimiter/escaping rule, and raw URLs or
   credentials never enter the token. Only checked-in CI, Vercel, E2E, and
   resolver wrappers may call an internal managed mode; it must not be exposed
   as an environment variable or CLI flag. A generic `remote-dev`, boolean
   acknowledgment, ad hoc joined string, or caller-selectable bypass is
   forbidden.
3. **CHOSEN (same helper policy):** apply the same redacted display and
   acknowledgment to `db:studio`; it is an editor, not a read-only exception.
   Do not create a studio-specific classifier or config file.

**Part 2 -- `db:seed` target boundary:**

1. **CHOSEN (Option 1, minimal shared form):** move fallback resolution behind the same explicit-target helper. Direct
   `db:seed` should require an explicit URL, print the redacted target, and
   require exact REMOTE acknowledgment in a human shell before opening Postgres.
2. **CHOSEN (same helper policy):** preserve existing checked-in CI and local
   E2E/integration bootstrap callers through the helper's internal managed
   mode. `db:seed:all` is a human-operated batch, not a managed caller: it must
   present the helper's canonical JSON array of sorted unique redacted REMOTE
   targets and compare it byte-for-byte with owner-supplied `DB_TARGET_ACK`; it
   may not pass or synthesize the token it just classified. Direct bare seed
   can no longer infer any target from an ignored file.
3. **CHOSEN (unchanged safety law):** keep BUG-266 and BUG-281 guards
   independent. Target authorization must not weaken reference integrity or
   graded-history protection.

**Part 3 -- Production seed consent and review:**

1. **PARKED / REJECTED BY DIRECTION REVIEW:** do not make the operation a
   two-phase per-question plan/revalidation protocol now. Such a protocol and a
   target revision become eligible only after the Part 3b revive trigger. A
   printed plan without ancestry or revalidation would overstate safety.
2. **CHOSEN (Option 2, minimal form):** split the existing named-environment
   script without adding an identity registry. `db:seed:all` still resolves
   Vercel Development, Preview, and Production through the existing
   `vercel env pull --environment=...` seam, rejects any local/Development/
   Preview target equal to the resolved Production target, executes only the
   non-production targets, and requires the owner-supplied exact REMOTE-set
   token before the first write. A separate `db:seed:prod` resolves its target
   internally from `--environment=production`, refuses a caller-supplied
   `DATABASE_URL`, and requires the same helper to match
   the one-element canonical JSON acknowledgment for the resolved Production
   target. The named Vercel environment is the trusted identity boundary; no
   new allowlist/config file or Production-only classifier is authorized.
3. **PARKED / REJECTED BY DIRECTION REVIEW:** do not add a canonical monotonic
   corpus revision, manifest audit state, or freshness table without the Part
   3b trigger. Different hashes prove only "different," not which corpus is
   newer.

The rejected Option 1 plan would have required a per-question database diff,
Production-specific confirmation, and revalidation or a target revision before
writes. Those coupled plan/freshness mechanics are the parked scope, not
acceptance criteria for the chosen dedicated Production command.

## Verification

- **Part 1:** unit tests prove implicit fallback refusal, loopback LOCAL
  classification, all-other-hosts REMOTE classification, credential-free
  `host[:port]/database` formatting, lexicographic sort/de-duplication plus JSON
  escaping, byte-for-byte REMOTE acknowledgment, rejection of caller-selected
  managed mode, unchanged checked-in Vercel/CI/resolver invocation, and the same
  helper/serialization behavior for migrate and studio; permutations and
  duplicates of the same target set produce the same token, and
  `vercel.test.ts` still pins migrate-before-build.
- **Part 2:** direct bare seed fails before opening Postgres; resolver/CI URLs
  pass; an unacknowledged manual REMOTE URL or batch fails; `db:seed:all` cannot
  self-authorize and uses the shared helper's canonical JSON token for its
  explicit non-production targets; logs never contain credentials; BUG-266/281
  tests remain unchanged.
- **Part 3a:** hermetic script tests prove `db:seed:all` resolves the named
  Production environment only as a fence, rejects a local/Development/Preview
  target equal to it, never executes Production, and requires the exact
  owner-supplied REMOTE target-set token. `db:seed:prod` ignores/refuses an
  arbitrary caller `DATABASE_URL`, resolves the named Production environment,
  and fails before opening Postgres when its exact token is missing/mismatched;
  confirmed paths preserve target de-duplication and fail-fast behavior.
- **Part 3b:** no implementation verification is authorized while parked.
  Revival requires the recorded stale-corpus overwrite or second-independent-
  writer evidence named in the Direction table.

## Related

- [DEBT-240](./debt-240-local-dev-database-url-points-to-production.md)
  -- fixed the ignored `.env.local` value, not the fallback mechanism.
- [DEBT-411](./debt-411-local-e2e-flakiness-and-error-masking.md)
  -- moved normal local E2E to resolver-scoped Docker.
- [DEBT-442](./debt-442-applied-migration-ledger-content-blind.md)
  -- shipped persistent-target ledger/content detection and records the
  Preview-deploy mechanism behind early 0027.
- [BUG-266](../bugs/bug-266-practice-session-question-states-fk-breaks-content-sync.md)
  and [BUG-281](../bugs/bug-281-seed-reimport-rewrites-answer-key-under-graded-history.md)
  -- shipped the referenced-choice and graded-answer-key guards.
- [DEBT-343](./debt-343-scripts-cleanup.md) -- created
  `seed-all-environments.sh` with target deduplication and alias rejection; it
  did not decide a Production consent gate.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12
  finder lenses, per-candidate adversarial verification, dedup against the full
  archived register).
