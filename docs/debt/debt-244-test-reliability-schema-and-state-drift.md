# DEBT-244: Test Reliability Drift (Schema + Stateful E2E Data + Spec Drift)

**Status:** Active  
**Date:** 2026-02-23  
**Owner:** Test Infrastructure

## Problem

Full verification currently reports:

- Unit: `217/217` files passing (`1605` tests)
- Browser-mode: `27/27` files passing (`128` tests)
- Integration: passing after seed (`65` tests)
- Build: passing
- E2E: `24` failed, `44` passed

This is not 24 independent bugs. It is a small number of systemic drifts causing cascading failures.

## Evidence (Direct)

### 1) Idempotency schema drift in active `.env.local` database

Code now expects `idempotency_keys.completed_at`:

- `src/adapters/repositories/drizzle-idempotency-key-repository.ts`

Live DB schema for `idempotency_keys` does **not** include `completed_at` (column list query on active `DATABASE_URL` confirms only: `user_id, action, key, result_json, error_code, error_message, created_at, expires_at`).

Migration history in DB is behind current migration set:

- DB `drizzle.__drizzle_migrations` latest timestamp aligns with `0011`
- Repo includes `db/migrations/0012_whole_baron_strucker.sql` adding `completed_at`

### 2) E2E user state drift references missing/unpublished questions

Active E2E user data query results:

- `attempts` total: `550`
- attempts pointing to missing/unpublished questions: `310`
- session `questionIds` pointing to missing/unpublished questions: non-zero

This directly matches multiple failing snapshots that render `Question not found`.

### 3) E2E assertion drift vs current UI contract

Current history sessions implementation:

- `app/(app)/app/history/components/history-sessions-tab.tsx`
- Row uses `tabIndex` + keyboard handlers + `focus-visible` classes
- Row is **not** `li[role="link"]`

Failing BUG-151 specs still assert `li[role="link"]`/legacy structure:

- `tests/e2e/bug-151-affordance-audit.spec.ts`

Question page now intentionally supports history-sequence navigation without `sessionId`:

- `app/(app)/app/questions/[slug]/question-page-client.tsx`
- `app/(app)/app/questions/[slug]/question-page-client.test.tsx` (`renders history-sequence navigation links without sessionId`)

Failing spec still expects zero previous/next in that flow:

- `tests/e2e/session-review-navigation.spec.ts`

### 4) Integration suite hidden seed dependency (separate but related)

On a clean test DB, integration failed until `pnpm db:seed` ran:

- `tests/integration/tag-taxonomy-census.integration.test.ts` (`rows.length` was `0`)

This means `pnpm test:integration` is not self-contained against an empty migrated DB.

## Failure Mapping (24 E2E Failures)

### Root Cause A: idempotent mutation path broken by DB schema drift

- `tests/e2e/practice.spec.ts` (2)
- `tests/e2e/bs-019-action-bar-audit.spec.ts` (2)
- `tests/e2e/bs-028-history-ux-audit.spec.ts` (1)
- `tests/e2e/review-mode-audit.spec.ts` session-start-dependent cases (2)
- `tests/e2e/session-continuation.spec.ts` (1)
- `tests/e2e/session-review-navigation.spec.ts` session-creation case (1)
- `tests/e2e/core-app-pages.spec.ts` bookmark-setup path (1)
- `tests/e2e/subscribe-and-practice.spec.ts` bookmark-setup path (1)

Pattern: practice start remains on `/app/practice` with `Internal error`, or bookmark mutation never reaches `Remove bookmark`.

### Root Cause B: stale review/history references to missing questions

- `tests/e2e/brainstorming-audit.spec.ts` (2)
- `tests/e2e/cross-page-navigation.spec.ts` (2)
- `tests/e2e/history.spec.ts` (1)
- `tests/e2e/review-mode-audit.spec.ts` question-load cases (4)

Pattern: `/app/questions/[slug]` renders `Question not found`.

### Root Cause C: stale assertions after UX/interaction model changes

- `tests/e2e/bug-151-affordance-audit.spec.ts` (3)
- `tests/e2e/session-review-navigation.spec.ts` non-session-nav assertion (1)

Pattern: spec expects old DOM/behavior, app intentionally differs.

### Root Cause D: Dev server ECONNRESET / keep-alive socket race (infrastructure)

During 8+ minute E2E runs, the Next.js dev server emits `[WebServer] ⨯ Error: aborted` with `code: 'ECONNRESET'`. Root cause:

- Node.js HTTP `keepAliveTimeout` defaults to 5 seconds
- Playwright's Chromium aggressively reuses TCP keep-alive connections
- After long-running specs (several set `test.setTimeout(180_000)`), stale sockets get closed server-side while Chromium still holds references
- Next request on that stale socket → `ECONNRESET`

This is the mechanism behind cascading `ERR_CONNECTION_REFUSED` failures observed in earlier runs. When benign, it produces a single noisy log line. When severe, the dev server process dies and all subsequent tests fail.

Contributing gaps in this codebase:

- `playwright.config.ts`: no `stdout`/`stderr` suppression for webServer noise
- `next.config.ts`: no custom server to tune `keepAliveTimeout`/`headersTimeout`
- No Playwright-level `page.on('requestfailed')` retry fixture for transient resets
- `retry.ts` already handles `ECONNRESET` for outgoing Stripe calls but is not wired into the E2E layer

## Current State Update (2026-02-23 end-of-day)

After DEBT-243 preflight implementation and agent-driven assertion fixes:

- E2E: `66` passed, `2` skipped, `0` failed (was `24` failed, `44` passed)
- Schema drift (Root Cause A): resolved — `verifyIdempotencySchema` preflight added to `credential-health-check.ts`
- Assertion drift (Root Cause C): partially resolved — agent updated selectors in `bug-151-affordance-audit.spec.ts` and `session-review-navigation.spec.ts`
- Stale data (Root Cause B): masked by data-dependent `test.skip(...)` — not structurally resolved
- Server stability (Root Cause D): not resolved — ECONNRESET still observed in latest passing run

## Why This Happened (First Principles)

1. Credential preflight (DEBT-243) validates secrets and service connectivity, but not **schema version/shape**.
2. E2E uses a long-lived shared user account; mutable state accumulates across runs and content updates.
3. Audit specs are coupled to implementation details (`role`, exact DOM shape) instead of stable behavior contracts.
4. Integration test command does not enforce required seed preconditions.

## Definitive Resolution (No Optionality)

### 1) Add schema-shape preflight for E2E (extend DEBT-243 implementation)

Update:

- `tests/e2e/helpers/credential-health-check.ts`

Add a blocking validator that checks:

- `idempotency_keys.completed_at` exists
- any other columns required by idempotent repositories

Fail with explicit code:

- `E2E_PREFLIGHT:SCHEMA_DRIFT_IDEMPOTENCY_KEYS`

### 2) Enforce migrations before E2E in local and CI flows

Update:

- `.github/workflows/ci.yml`
- E2E runbook/docs

Requirement:

- apply latest migrations against the E2E DB before Playwright starts
- fail fast if migration level is behind repo migrations

### 3) Make E2E user state deterministic per run

Update setup:

- `tests/e2e/global.setup.ts`
- new helper, e.g. `tests/e2e/helpers/reset-e2e-user-state.ts`

Reset before specs:

- clear attempts, practice sessions, bookmarks for E2E user
- seed only deterministic baseline rows needed by specs

### 4) Repair stale review/history references in surfaced lists

Update read paths to avoid brittle links to unavailable questions:

- history question list controllers/use-cases
- dashboard recent activity/session breakdown producers

Policy:

- if question is unavailable, exclude row from navigable review lists or surface explicit unavailable state (never silent broken link)

### 5) Update stale E2E assertions to current contract

Update:

- `tests/e2e/bug-151-affordance-audit.spec.ts`
- `tests/e2e/session-review-navigation.spec.ts`

Use behavior assertions (focus visibility, keyboard navigation, destination correctness) over brittle legacy structure checks.

### 6) Make integration command deterministic

Update:

- `package.json` integration workflow scripts or integration setup

Guarantee `pnpm test:integration` has required seed data (or fails with explicit precondition error instructing exact command).

### 7) Harden dev server stability for E2E runs

Options (choose one):

- Tune `keepAliveTimeout` / `headersTimeout` via custom `server.ts` or `instrumentation.ts`
- Use `pnpm start` (production server) for local E2E instead of `pnpm dev`
- Add Playwright navigation retry fixture for transient `ECONNRESET`

Outcome: eliminate cascading connection-reset failures in long E2E suites.

## Verification Plan

1. Break schema intentionally (remove/rename `completed_at` in a temp DB) and run `pnpm test:e2e`.  
Expected: one preflight failure with `E2E_PREFLIGHT:SCHEMA_DRIFT_IDEMPOTENCY_KEYS` before specs run.

2. Run migrations, rerun only session-start specs (`practice.spec.ts`, `session-continuation.spec.ts`).  
Expected: no `/app/practice` start timeout due `Internal error`.

3. Reset E2E user state, rerun history/review specs (`history.spec.ts`, `review-mode-audit.spec.ts`, `cross-page-navigation.spec.ts`).  
Expected: no `Question not found` for seeded paths.

4. Update stale assertions and rerun targeted audits (`bug-151-affordance-audit.spec.ts`, `session-review-navigation.spec.ts`).  
Expected: assertions match current UX contract.

5. On clean Docker test DB: run integration from scratch via documented command path.  
Expected: deterministic pass without ad-hoc manual recovery.

## Priority

**P1** — This blocks reliable E2E signal and causes false regression noise across feature branches.
