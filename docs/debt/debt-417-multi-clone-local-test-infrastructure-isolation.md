# DEBT-417: Multi-Clone Local Test Infrastructure Is Not Isolated

**Priority:** P2
**Created:** 2026-06-12
**Source:** Discovered live while running the full gate for BUG-245 with a second clone (`naltrexone-university-3`) concurrently running its own E2E suite for BUG-244/246.
**Related:**
- [DEBT-411 Local E2E flakiness + masked reset errors](../_archive/debt/debt-411-local-e2e-flakiness-and-error-masking.md) — made local `pnpm test:e2e` hermetic, but single-clone; this debt is the multi-clone follow-on it did not cover.
- [DEBT-391 Local E2E schema-drift preflight](../_archive/debt/debt-391-local-e2e-schema-drift-preflight.md)
- **Distinct from** the git "shared remote" concern (a second clone pushes to `main`/`dev` out-of-band). That is a *source-control* coordination problem; this is a *local test-resource isolation* problem. Different axis, same two-clone setup.
**Status:** Implemented in the BUG-245 branch per owner instruction to combine the DevX fix with the checkout-race PR. Do not archive until merge/close-out.

---

## Context

This repository is regularly worked from **two clones on one machine** that share the
same remote (e.g. `naltrexone-university` and `naltrexone-university-3`). During the
BUG-245 gate, both clones ran `pnpm test:e2e` at overlapping times. The result was a
**false E2E failure** in this clone: the first run died mid-suite with
`/bin/sh: ... pnpm start Killed: 9`, followed by a cascade of pure
`ERR_CONNECTION_REFUSED` navigation failures — i.e. the local app server was killed out
from under Playwright, not a product regression. Process inspection confirmed two E2E
process groups alive simultaneously, one rooted in each clone.

The local test harness assumes a **single clone**. It shares mutable global singletons —
a fixed TCP port and a fixed Docker container — with no per-clone namespacing, so two
clones actively corrupt each other's runs.

## Original Root Cause — Two Independent Collision Vectors

### Vector A — Blanket `:3000` SIGKILL (the symptom we observed)

The pre-fix hermetic E2E plan opened with an unconditional
`lsof -ti:3000 | xargs kill -9` of **whatever** held port 3000. It did not check
*whose* server that was. Playwright then starts its own server via
`webServer.command: 'pnpm build && pnpm start'` and waits on
`${baseURL}/api/health` (`playwright.config.ts:39-44`), where
`baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000'`
(`playwright.config.ts:9`).

`baseURL` is *parameterizable* via `NEXT_PUBLIC_APP_URL`, but:
1. `pnpm start` runs `next start` (`package.json:11`), whose non-default port
   must be provided by `PORT` or `-p`, and
2. the kill step is **hardcoded to `:3000`** regardless.

So clone B's E2E pre-step `kill -9`s clone A's in-flight Next server → clone A's
Playwright sees `ERR_CONNECTION_REFUSED` and reports a phantom failure.

Current implementation evidence: the local E2E plan resolves a per-clone target
(`scripts/e2e-local-orchestrator.ts:65-66`) and starts/migrates/seeds/runs Playwright
with that target env (`scripts/e2e-local-orchestrator.ts:67-94`). The plan contains no
server-kill step.

### Vector B — Shared Docker Test Database (quieter, more dangerous)

The pre-fix test-DB container name was a single hardcoded constant
(`naltrexone-test-db`) pinned in both the helper and Compose file. The old
`ensureLocalTestDatabase` inspected by name and reused that container without verifying
ownership. Consequences:

- **Integration path (`pnpm db:test:up` → `docker compose up -d --wait`):** Docker
  refuses a second container with a duplicate `container_name`, so the second clone's
  integration setup fails outright with a name conflict (observed live).
- **E2E path (`ensureLocalTestDatabase`):** both clones converge on the *same* Postgres
  instance by name. Clone B's migrate/seed and the per-test baseline reset retained from
  DEBT-411 then truncate and reseed the database **underneath** clone A's running suite —
  silent cross-clone data corruption and flakiness, not a clean error.

Current implementation evidence:

- `docker-compose.yml:5-13` no longer has `container_name`, so Compose can namespace
  service containers by project.
- `scripts/local-test-db.ts:31-63` resolves the current target and starts/reuses the
  `db` service with `docker compose -p <target.composeProjectName> ...`, not a global
  container name.
- `scripts/resolve-local-test-target.ts:43-61` derives the local instance id, DB port,
  app port, Compose project name, `DATABASE_URL`, and app URL from one source of truth.
- `scripts/resolve-local-test-target.ts:82-92` exports the exact env surface consumed by
  Compose, migrations, integration tests, Next, and Playwright.

## Why This Is Debt, Not a Product Bug

- It produces **false negatives** (phantom `ERR_CONNECTION_REFUSED` failures) and
  **silent data corruption** that look like flaky product regressions, eroding trust in
  the gate.
- It only manifests in the **multi-clone DevX workflow** — which is a deliberate,
  recurring practice on this machine (concurrent bug fixes across clones), not an edge
  case.
- The product code is unaffected; the defect lives entirely in the local
  test-orchestration scripts and the Compose file.

## Reproduction

1. In clone A: `pnpm test:e2e` (hermetic path: `!CI && !E2E_USE_EXISTING_DATABASE`).
2. While clone A is mid-suite, in clone B: `pnpm test:e2e`.
3. Clone B's `Stop stale local Next.js server on :3000` step `kill -9`s clone A's server.
4. Clone A's Playwright begins failing with `ERR_CONNECTION_REFUSED`.
   Separately, `pnpm db:test:up` in clone B fails on the duplicate `naltrexone-test-db`
   container name.

## Implemented Fix (Professional, Layered)

### Tier 0 — Stop the foot-gun

The silent cross-clone kill is removed:

- `scripts/e2e-local-orchestrator.ts:67-94` has no `lsof`, no `kill -9`, and no
  stale-server cleanup by port.
- Manual/dev servers are no longer targeted by E2E cleanup. If a port is occupied,
  Playwright/Next fails normally on that target instead of killing a foreign process.
- Shell `flock` was rejected as the default because this macOS host does not expose it in
  `PATH`; the implemented fix relies on per-clone isolation rather than global
  serialization.

### Tier 1 — Real fix: per-clone namespacing (recommended primary)

Give every clone its own isolated app port and Docker Compose project from one source of
truth. The resolver must be deterministic for debuggability **and** collision-safe in
practice:

1. **Introduce `scripts/resolve-local-test-target.ts` as the single source of truth.**
   It returns one object consumed by `scripts/e2e-local-orchestrator.ts`,
   `scripts/local-test-db.ts`, `scripts/run-local-test-db.ts`,
   `scripts/run-local-integration.ts`, the `db:test:*` package scripts, and the local
   integration-test command path:

   ```ts
   type LocalTestTarget = {
     instanceId: string;
     composeProjectName: string;
     dbHost: '127.0.0.1';
     dbPort: string;
     dbName: 'addiction_boards_test';
     databaseUrl: string;
     appHost: '127.0.0.1';
     appPort: string;
     appUrl: string;
     lockPath: string;
   };
   ```

   Keep the Postgres database name constant **inside** each namespaced container; the
   isolation boundary is the Compose project/service container, network, host port, and
   that container's data. Deriving a database name is only needed for a future
   shared-Postgres mode.
2. **Derive a stable instance id.** Prefer an explicit `LOCAL_TEST_INSTANCE` /
   `E2E_INSTANCE` when set. Otherwise derive a sanitized id from the absolute worktree
   path plus a short hash. Use that id for names and deterministic port slots outside the
   historical `:3000` / `:5434` defaults. Pure manual `3000 + offset` wiring remains
   rejected because it lets scripts drift; the resolver owns the mapping.
3. **Adopt Docker Compose's native project namespacing.** **Remove** the hardcoded
   `container_name:` from `docker-compose.yml` and set `COMPOSE_PROJECT_NAME` (or pass
   `docker compose -p <composeProjectName>`) per target. Compose's documented project
   name exists to isolate multiple copies of an environment on one host, and Compose
   labels created resources with `com.docker.compose.project`. The fixed
   `container_name` must go because it opts out of generated names and makes the name a
   global singleton. `TEST_DB_CONTAINER_NAME` should become a resolved/inspected Compose
   service container, not a module constant.
4. **Thread the app target consistently.** `PORT=<appPort>` and
   `NEXT_PUBLIC_APP_URL=<appUrl>` are passed into the Playwright invocation so
   `next start`, Playwright `baseURL`, and `webServer.url` all agree. There is no
   replacement "kill whatever is on the derived port" step.
5. **Thread the DB target consistently.** `pnpm db:test:up`, `pnpm db:test:down`,
   `pnpm db:test:reset`, local `pnpm test:integration`, and local `pnpm test:e2e` now
   flow through resolver-backed wrappers (`package.json:21-32`). The wrappers export
   `COMPOSE_PROJECT_NAME`, `DB_TEST_PORT`, and `DATABASE_URL`; `vitest.integration.config.ts`
   intentionally remains unaware of local target derivation.

### Tier 2 — Ephemeral per-run container (rejected as primary, noted as alternative)

Spin up a uniquely-named disposable Postgres on a random free port per run, torn down on
exit (this is exactly the manual workaround used to unblock the BUG-245 integration gate:
`docker run --name naltrexone-test-db-bug245 ... -p 55434:5432`). Maximally hermetic, but
adds container start/health latency to every run and discards the warm-DB reuse DEBT-411
deliberately kept. **Prefer Tier 1** (named, reused, namespaced-per-clone); keep Tier 2
in reserve for CI-style full isolation.

## Implemented Decision

**Tier 0 + Tier 1 shipped in this branch.** The destructive SIGKILL is gone. Local test
isolation is now the default: `scripts/resolve-local-test-target.ts` derives one
local-test target, Docker Compose project namespacing isolates the database
container/network, and `PORT`/`NEXT_PUBLIC_APP_URL`/`DATABASE_URL` are threaded from the
same object. Tier 2 remains the documented fallback if true per-run hermeticity is ever
needed.

Rejected shortcuts:

- **Blanket `kill -9` on any port:** destructive and exactly the observed failure mode.
- **Hand-wired offset:** deterministic but too easy for scripts/docs to drift without a
  resolver-owned env surface.
- **Shell `flock` as the default:** not available on this host; per-clone isolation keeps
  the common two-clone workflow concurrent without depending on a host-specific lock.
- **Ephemeral container as the default:** maximally isolated but discards DEBT-411's
  deliberate warm-DB reuse and slows every local run.

## Additional Shared-Resource Audit

- **Manual/dev server on `:3000`: real gap.** `pnpm dev` is `next dev`
  (`package.json:9`) and project docs describe it as `http://localhost:3000`; the current
  E2E pre-step can kill a human's local dev server or a dev server in another clone, not
  only another Playwright `webServer`.
- **Playwright reports/artifacts: audited non-gap for two-clone isolation.**
  `playwright.config.ts:21` uses the HTML reporter and does not override `outputDir`, so
  reports/artifacts are repo-local defaults (`playwright-report`, `test-results`). Two
  different clones have different working directories, so these paths are not shared
  machine-global resources. They would still collide for two concurrent E2E runs inside
  the **same** worktree, which is outside this debt.
- **`.next` build output: audited non-gap for two-clone isolation.** `.next` is
  worktree-local. It is not shared between `naltrexone-university` and
  `naltrexone-university-3`, though same-worktree concurrent builds remain a separate
  local ergonomics concern.
- **DEBT-411 reset/seed behavior: preserved by Tier 1.** The warm database stays warm per
  clone because the Compose project is stable. The per-test deterministic baseline reset
  still runs, but only against that clone's resolved `DATABASE_URL`, so it no longer
  truncates another clone's run.

## Scope / Non-Goals

- **Local DevX only.** CI runs one clone per runner and is unaffected (`shouldUseHermeticLocalE2E` is already gated by `CI`/`E2E_USE_EXISTING_DATABASE`); the fix must keep the CI path byte-identical.
- **Not** the git "shared remote / out-of-band push" coordination problem — that stays its own concern.
- This doc is **analysis + implementation record**. The fix touches
  `scripts/resolve-local-test-target.ts` (new), `scripts/e2e-local-orchestrator.ts`,
  `scripts/local-test-db.ts`, `scripts/run-local-test-db.ts`,
  `scripts/run-local-integration.ts`, `docker-compose.yml`, `package.json`, and the
  local integration-test wrapper/docs, and is landing in the BUG-245 PR per owner
  instruction to combine the DevX fix.

## When To Do It

Now — implemented in this branch because the multi-clone workflow is active *right now*
(two clones fixing BUG-244/245/246 concurrently) and this directly threatens gate trust.

## Interim Workaround (until fixed)

Until this branch lands everywhere, run E2E (and `db:test:up`) in **only one old clone at
a time**. In this branch, local E2E/integration/DB lifecycle commands resolve a per-clone
target by default. Use `pnpm exec tsx scripts/resolve-local-test-target.ts env` to inspect
the target for the current worktree.
