# DEBT-446: Bare `db:migrate`/`db:seed` Silently Target the Shared Remote Neon Dev Branch, and Prod Seeding Lacks a Confirmation Gate

**Status:** Active
**Priority:** P3
**Date:** 2026-07-09

---

## Description

Three related gaps in the manual database-script path share one root shape: the scripts resolve their target from `.env.local` fallbacks or Vercel-pulled env files and then mutate whatever `DATABASE_URL` resolves, with no host verification, no non-local warning, and no confirmation. Every mitigation in force today is either prose ("always prefix with `DATABASE_URL=...`") or a downstream guard that narrows blast radius without touching the targeting decision itself.

### 1. Bare `pnpm db:migrate` falls back to `.env.local` → remote Neon dev, no host guard

[`drizzle.config.ts#L6`](../../drizzle.config.ts#L6) loads `.env.local` when `DATABASE_URL` is unset in the shell, and this clone's `.env.local:7` points at the remote Neon dev branch (`ep-still-frog-...-pooler`). The only guard is non-emptiness ([`drizzle.config.ts#L10`](../../drizzle.config.ts#L10)); [`package.json#L25`](../../package.json#L25) maps `db:migrate` straight to `drizzle-kit migrate`. A bare `pnpm db:migrate` (or `db:studio`) therefore mutates the shared remote database with no output identifying the target host and no confirmation. Mitigations are documentation-only (CLAUDE.md's "Always prefix with `DATABASE_URL=...`"; [`docs/dev/migration-authoring.md#L98`](../dev/migration-authoring.md#L98)), while the repo already ships a fail-closed target-check precedent at [`scripts/seed-all-environments.sh#L137`](../../scripts/seed-all-environments.sh#L137) that this path lacks.

**Verifier correction:** this fallback was **not** the mechanism behind the early-`0027` dev ledger drift. The DEBT-442 archive records that dev applied the early `0027_early_wallow.sql` through a Preview deploy — i.e. the [`vercel.json#L3`](../../vercel.json#L3) `buildCommand: "pnpm db:migrate && pnpm build"` path, where Vercel injects the environment-scoped `DATABASE_URL` and `.env.local` does not exist. The gap is real but the incident attribution in the original candidate was wrong, and the drift *class* now has shipped detection (DEBT-442 content-hash preflight). The severe variant — mutating production — requires `.env.local` to point at the production endpoint, a misconfiguration that has occurred once before (DEBT-240, P1: `.env.local` pointed at `ep-withered-cell` production for ~2 weeks; only the value was fixed, not the fallback mechanism).

### 2. Bare `pnpm db:seed` silently mutates shared dev — content overwrite, unreferenced-choice deletion, placeholder archiving

[`scripts/seed.ts#L11`](../../scripts/seed.ts#L11) loads the same `.env.local` fallback and the only target check is non-emptiness ([`scripts/seed.ts#L16`](../../scripts/seed.ts#L16)) — the script cannot tell a Docker container from a shared Neon host. A bare `pnpm db:seed` from any clone against the resolved shared dev branch:

- unconditionally overwrites remote `stem_md`/`explanation_md`/`reference_md`/`difficulty`/`status` from this clone's gitignored, clone-specific `content/questions/` files ([`scripts/seed/question-syncer.ts#L278`](../../scripts/seed/question-syncer.ts#L278)) — a stale clone downgrades shared dev content for everyone;
- deletes choices absent from local files when nothing references them ([`scripts/seed/question-syncer.ts#L356`](../../scripts/seed/question-syncer.ts#L356));
- with `SEED_INCLUDE_PLACEHOLDERS` unset, flips `status='archived'` on every remote `placeholder-%` question ([`scripts/seed.ts#L35`](../../scripts/seed.ts#L35), [`scripts/seed/placeholder-archiver.ts#L8`](../../scripts/seed/placeholder-archiver.ts#L8)).

Vercel Preview/Development and other developers' local runtimes silently change state; discovery happens only when someone notices missing or downgraded content on dev. **Refuted leg:** the candidate's claim that the sync "remaps `attempts.selectedChoiceId`" is wrong — [`scripts/seed-helpers.ts#L64`](../../scripts/seed-helpers.ts#L64) throws rather than delete any choice referenced by an attempt or session state (BUG-266 guard), and answer-key flips over graded history are fail-closed ([`scripts/seed/question-syncer.ts#L97`](../../scripts/seed/question-syncer.ts#L97), BUG-281 guard). Docs warn about the fallback ([`docs/dev/integration-tests.md#L165`](../dev/integration-tests.md#L165), [`docs/dev/deployment-procedure.md#L92`](../dev/deployment-procedure.md#L92)), but operator discipline is the only mitigation.

### 3. `db:seed:all` seeds production non-interactively from clone-local gitignored content

[`scripts/seed-all-environments.sh#L145`](../../scripts/seed-all-environments.sh#L145) adds the Vercel-pulled production `DATABASE_URL` to the same unattended loop as local/dev/preview and seeds it at [`#L168`](../../scripts/seed-all-environments.sh#L168). The only production-specific guard is refusing when the prod URL key equals a non-prod key ([`#L137`](../../scripts/seed-all-environments.sh#L137)); `--plan` is optional and nothing forces it before a live run. The corpus is rebuilt (`rm -rf content/questions/imported/*` at [`#L161`](../../scripts/seed-all-environments.sh#L161)) from `content/drafts/questions/` subdirectories that are gitignored and clone-specific ([`.gitignore#L54`](../../.gitignore#L54), [`#L61`](../../.gitignore#L61)), and the syncer's SHA-256 idempotency skip passes stale-but-different content straight through. Running from a stale clone — a documented recurring hazard in this multi-clone setup — silently reverts live production question stems, explanations, and choice text, with no diff shown, no prompt, and nothing recording that prod content regressed. The BUG-266/BUG-281 guards ([`scripts/seed/question-syncer.ts#L263`](../../scripts/seed/question-syncer.ts#L263), [`#L341`](../../scripts/seed/question-syncer.ts#L341)) protect attempt-referenced choices and graded answer keys — no user data loss or grade corruption — but text overwrites and unreferenced-choice deletions remain fully unguarded, unlogged, and unconfirmed.

## Impact

Today: shared-dev blast radius for parts 1–2 (in-progress migration SQL, seed-content churn, placeholder archiving, ledger advancement — the DEBT-442 content-hash preflight catches drift only on a later E2E preflight against that persistent target), and a silent prod content-regression path for part 3. All three failures are silent: nothing in the output flags a remote or production host, so mutation is discovered only when someone notices wrong content downstream. Recovery is reseeding from a current clone or a Neon branch restore. Each part contributes P3: the failures require operator error, are recoverable, and the most destructive vectors (answer-key flips, referenced-choice deletion, drift class) already have shipped guards — but the production-pointing precondition for part 1 has been realized once (DEBT-240), and part 3 touches live production content in a routine four-environment command. Vercel Preview deploys auto-apply committed migrations to dev anyway, so the bare local command is not a unique path for half-finished SQL reaching dev, which further caps part 1's residual severity.

## Proposed Resolution

**Part 1 — `db:migrate` target guard:**
1. **(Recommended)** Wrap `db:migrate` in a `scripts/run-db-migrate.ts` that detects when `DATABASE_URL` came from the `.env.local`/`.env` fallback rather than the shell (read `process.env` before the dotenv calls, or an explicit `DB_TARGET_ACK=remote-dev` escape hatch), prints the redacted target host, and refuses non-local hosts unless explicitly acknowledged; keep the Vercel `buildCommand` path exempt via `CI`/`VERCEL` env detection so deploys are unchanged. Mirrors the fail-closed pattern in `seed-all-environments.sh:137-138`.
2. Cheaper: drop the `.env.local` fallback from `drizzle.config.ts` for mutating drizzle-kit commands (keep it for `db:studio` reads) — one-file change, more friction for intentional dev-branch operations.
3. Minimum: accept the risk in the register, noting the mitigations already in force (DEBT-240 value fix, DEBT-411 hermetic local E2E, DEBT-442 drift detection, prose warnings); revisit only if a bare-command incident recurs.

**Part 2 — `db:seed` target guard:**
1. **(Recommended)** Add a target guard to `runSeed()`: parse the resolved `DATABASE_URL` host and require an explicit opt-in env var (e.g. `SEED_ALLOW_REMOTE_TARGET=true`) whenever the host is not localhost/127.0.0.1/a Docker resolver target; print the hostname (never credentials) in the seed summary either way. Mirrors `SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY` and keeps `pnpm db:seed:all` working with one extra flag.
2. Alternative: drop the `.env.local` dotenv fallback from `scripts/seed.ts` so `DATABASE_URL` must be supplied explicitly (matches every documented command), accepting a breaking change for bare local runs against dev.
3. Minimal: always log the target hostname before mutating and add a short delay/confirmation for non-local hosts.

**Part 3 — production seed confirmation:**
1. **(Recommended)** Gate the production target behind explicit opt-in — require the operator to confirm interactively by typing the prod host key (or set `SEED_CONFIRM_PRODUCTION=<prod-host-key>` for CI-less automation), and print a per-target change summary (questions to insert/update/skip, choices to delete) from a dry-run pass before any prod write.
2. Add a corpus-freshness check — record a content-manifest hash in each seeded DB and refuse (or loudly warn) when the target's recorded manifest is not an ancestor/subset of the local corpus, catching the stale-clone case directly.
3. Remove production from `db:seed:all` entirely and add a separate deliberate `db:seed:prod` command so the routine four-environment command can never touch prod.

## Verification

- **Part 1:** a unit test on the new migrate wrapper proving (a) shell-provided `DATABASE_URL` passes through unchanged, (b) fallback-resolved non-local hosts are refused without the acknowledgment env var, (c) `CI`/`VERCEL` environments are exempt; plus a live check that a Vercel deploy still runs `pnpm db:migrate && pnpm build` unchanged.
- **Part 2:** tests on `runSeed()` (or its guard helper) proving localhost/Docker-resolver hosts seed without the flag, non-local hosts throw without `SEED_ALLOW_REMOTE_TARGET=true`, and the hostname (credential-free) appears in the seed summary; update `docs/dev/integration-tests.md` and `deployment-procedure.md` to document the flag.
- **Part 3:** a `--plan`-style dry-run output showing the per-target change summary before any prod write; a scripted test (or documented manual proof) that `db:seed:all` exits non-zero when the production confirmation is absent; if option 2 is chosen, an integration test that a mismatched content-manifest hash refuses the seed.

## Related

- [DEBT-240](../_archive/debt/debt-240-local-dev-database-url-points-to-production.md) — fixed the `.env.local` *value* (was pointing at production), explicitly not the fallback mechanism.
- [DEBT-411](../_archive/debt/debt-411-local-e2e-flakiness-and-error-masking.md) — removed the largest bare-fallback consumer (local E2E now runs hermetic Docker Postgres).
- [DEBT-442](../_archive/debt/debt-442-applied-migration-ledger-content-blind.md) — shipped *detection* (content-hash ledger preflight) for the drift class, and records the Preview-deploy mechanism that refutes the candidate's 0027-drift attribution.
- [BUG-266](../_archive/bugs/bug-266-practice-session-question-states-fk-breaks-content-sync.md) and [BUG-281](../_archive/bugs/bug-281-seed-reimport-rewrites-answer-key-under-graded-history.md) — the shipped referenced-choice and answer-key guards that narrow parts 2–3's blast radius.
- [DEBT-343](../_archive/debt/debt-343-scripts-cleanup.md) — records `seed-all-environments.sh`'s creation and existing guards; does not rule on the no-confirmation prod-seed gap.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
