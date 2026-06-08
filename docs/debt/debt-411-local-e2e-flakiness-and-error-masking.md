# DEBT-411: Local E2E Flakiness — Per-Test Neon Resets + Masked Errors (Not Schema Drift, Not a Product Bug)

**Priority:** P2 (developer-experience + signal integrity; no product/user impact)
**Created:** 2026-06-07
**Audit-verified:** 2026-06-06 (America/New_York) — corrected after adversarial re-run; see §2.
**Audit-corrected:** 2026-06-06 (America/New_York) — PR #406 audit corrected current git-reality statements.
**Audit-corrected:** 2026-06-07 (America/New_York) — post-merge reconciliation: PR #406 is merged; DEBT-391 is resolved and archived via PR #408/`cfdae416`; cross-links and remediation sequencing refreshed against HEAD.
**Status:** Investigation complete and present on current `dev`/`main`; definitive remediation documented (§6 + §6.5 blast-radius). The code fix ships as a follow-up test-infra PR.
**Source:** During DEBT-410 PR-1, a delegated agent's local `pnpm test:e2e` retry failed 5 practice-flow tests, including masked `E2E_RESET:DATABASE_MUTATION_FAILED` reset failures and downstream stale practice-state symptoms (first run additionally had its Playwright web server killed). The same PR passed full CI E2E (7m42s) and merged-quality checks. Owner asked for a complete root-cause dossier.
**Related:** [Debt Index](./index.md) · [DEBT-391](../_archive/debt/debt-391-local-e2e-schema-drift-preflight.md) (resolved/archived; a **distinct** failure mode — schema drift — detected in the E2E credential preflight, not in the reset helper) · [DEBT-410](./debt-410-free-trial-pathway-and-pricing-access-copy.md) (the PR that surfaced this) · `tests/e2e/helpers/reset-e2e-user-state.ts` · `playwright.config.ts` · `.github/workflows/ci.yml`

---

## 0. Verdict (read this first)

The original "schema drift" diagnosis was wrong, and the reset helper's error masking is real. The stronger claim that the exact root cause was a proven transient Neon connection blip is **not proven** from the available evidence, because the helper discarded the underlying Postgres error.

What is verified:

- **The `.env.local` database is current.** Read-only inspection showed **21/21 migrations applied**, `attempts.is_omitted` exists and `selected_choice_id` is nullable, all reset write-path tables exist, and both placeholder question fixtures are published with choices. → It is **not** DEBT-391 schema drift in the current database.
- **The reset works now under load.** The exact `runE2EUserStateReset()` succeeded **5/5** (1963/1588/1560/1577/1600ms) and then **20/20** under a tight sequential loop (min/avg/max 1511/1591/1783ms). A separate read-only churn probe opened **100/100** short-lived pooled Neon connections successfully at concurrency 20.
- **The focused live suite works now.** `pnpm exec playwright test tests/e2e/practice.spec.ts --project=chromium --reporter=line` passed **10/10** (global setup + 9 practice tests) in **1.8m** against the same `.env.local` target.
- **The saved artifacts were mixed.** Two failing artifacts directly show masked `E2E_RESET:DATABASE_MUTATION_FAILED`; the others show downstream stale/session/idempotency state (`Practice session already ended`, `Practice session not found`, `Idempotency key not found`). Those could be contamination after a reset failure, old residue, or another local harness issue, but they are not all direct reset exceptions.

Corrected root cause statement: **local E2E failed through the shared reset/harness surface, not PR-1 or current schema drift; the exact DB failure is unknowable until reset errors attach `cause`.** The most likely class is intermittent local harness/state contamination around per-test resets against a remote `.env.local` database, but connection exhaustion was not reproduced.

**Correction recorded for honesty:** the first-pass triage during PR-1 (including in the PR #406 description) attributed these failures to DEBT-391 local schema drift. The direct DB inspection here **falsifies that** — the local DB is fully migrated and seeded. PR #406's conclusion (PR-1 is unaffected; CI is authoritative for product behavior) still holds; only the *reason the local E2E was red* was misattributed.

**Second correction:** this audit also narrows the dossier's own claim. "Transient Neon connection blip" remains plausible, but it is not proven. The only definitive defect is that the reset helper masked the underlying error and made the incident non-diagnosable.

---

## 0.5 Plain-English primer: which database is used where

Each environment uses a different database. Only one is miswired.

| Context | Database | How its schema is updated |
|---|---|---|
| **Production** | Neon production (real users, Vercel prod) | deliberately, by the operator: `pnpm db:migrate` against the Neon prod URL |
| **Preview / dev** | Neon dev branch (the `dev` branch / Vercel preview deploys) | deliberately, against the Neon dev URL |
| **CI tests** | a throwaway Docker `postgres:16` **inside GitHub Actions** | CI builds it fresh, runs `db:migrate` + `db:seed` automatically, then discards it (`ci.yml:20-37,106,109`) |
| **Local unit/integration tests** | a throwaway Docker `postgres:16` **on the dev machine** (`pnpm db:test:up`, port 5434, `docker-compose.yml`) | migrate/seed the throwaway, then discard |
| **Local E2E tests (today)** | the **remote Neon dev branch** from `.env.local` | manual (now guarded by DEBT-391's migration-ledger preflight for schema drift, but still the flakiness surface here) |

The last row is the odd one out: **local E2E is the only test type that reaches across the internet to a remote, shared, serverless database.** Remote + serverless = latency, cold starts, and connection limits — i.e. flakiness. Every other test type, and all of CI, uses a fast, private, disposable Docker Postgres and is stable. **CI is already correct;** only local E2E is miswired.

The structural fix is to make local E2E behave like CI: run it against a **local Docker Postgres** (migrated + seeded), not remote Neon. CI already runs E2E this exact way and is green — that is the proof it works.

---

## 1. The incident (what was observed)

From the PR-1 implementation run (`feat/debt-410-pricing-access-copy`, change = anonymous pricing banner copy only):

- Run 1: failed after "Playwright's web server was killed."
- Run 2 (clean retry): **5 practice-flow tests failed, 30 passed.** Failures were all in `tests/e2e/practice.spec.ts`. `pricing-unauthenticated.spec.ts` and `smoke.spec.ts` **passed**.
- The other six gate stages (typecheck, lint, unit, browser, integration, build) all passed locally; full CI (incl. E2E) passed.

The prior local run's generated Playwright artifacts (not committed repo files) showed two direct reset failures plus three later practice-flow state failures:

| Artifact class | Evidence |
|---|---|
| Masked reset mutation failure | `test-results/practice-practice-subscrib-94407--session-and-end-on-summary-chromium/error-context.md`; `test-results/practice-practice-reopens--cd64e-ed-from-the-session-summary-chromium/error-context.md` |
| Stale/ended session card | `test-results/practice-practice-subscrib-ca967-om-the-last-question-footer-chromium/error-context.md` shows "Continue session" followed by "Practice session already ended" |
| Session missing while inside exam flow | `test-results/practice-practice-exam-mod-58ef3-without-showing-explanation-chromium/error-context.md` shows "Practice session not found" |
| Idempotency state missing during session start | `test-results/practice-practice-resets-t-f86ab--between-reviewed-questions-chromium/error-context.md` shows "Idempotency key not found" |

The partial failure pattern rules out a simple deterministic migration/schema break, but the mixed artifacts mean the exact chain is not proven from the original logs.

---

## 2. Evidence (each claim is independently verifiable)

### 2.1 The local DB is fully migrated and seeded (read-only inspection)

Querying the `.env.local` `DATABASE_URL` (a remote Neon pooled branch; host masked per §7):

```text
APPLIED migrations (drizzle ledger): 21   | repo journal entries: 21
attempts cols: is_omitted (NOT NULL), selected_choice_id (nullable)   ← migrations 0017/0018 applied
tables present: practice_sessions, attempts, bookmarks, idempotency_keys, questions, choices, stripe_subscriptions
placeholder fixtures present: 2 / 2, both published
placeholder choices present: 4 choices each; placeholder-01 has 1 correct, placeholder-02 has 3 incorrect
Neon pooler endpoint: yes
connection ceiling observed via pg_settings: max_connections=112, active_connections=1 during inspection
```

→ No drift. The exact conditions DEBT-391 warns about are **absent** here.

### 2.2 The reset succeeds on demand (live reproduction)

`runE2EUserStateReset()` run 5× back-to-back against the current DB:

```text
run 1: OK (1963ms)
run 2: OK (1588ms)
run 3: OK (1560ms)
run 4: OK (1577ms)
run 5: OK (1600ms)
RESULT: 5/5 succeeded, 0/5 failed
```

Stress probes:

```text
sequential reset loop: 20/20 OK, min/avg/max 1511/1591/1783ms
read-only connection churn: 100/100 OK, concurrency=20, elapsed=894ms
focused practice spec: 10/10 OK, 1.8m
```

PR #406 recheck on 2026-06-06 (America/New_York): `runE2EUserStateReset()` succeeded 3/3 against the same masked `.env.local` target after loading dotenv.

→ The DB writes, fixtures, Clerk resolution, and verification all work now. The earlier failure was not reproducible on demand. That supports a local intermittent/harness diagnosis, but does **not** prove the exact Postgres cause.

### 2.3 Local has zero retries; CI retries twice

`playwright.config.ts:15`: `retries: process.env.CI ? 2 : 0`. `:18` `workers: 1`, `:13` `fullyParallel: false` (so the configured suite is not intentionally concurrent; it shares one test user). `:38` local `webServer.command` is `pnpm build && pnpm start` (fresh build+start each run).

→ Locally a single transient failure is terminal. CI gets two retries.

### 2.4 Every authenticated spec resets per-test, against remote Neon

`tests/e2e/practice.spec.ts:106-107`:

```ts
test.beforeEach(async () => { await runE2EUserStateReset(); });
```

Same `beforeEach(runE2EUserStateReset)` pattern in `core-app-pages.spec.ts:22`, `bookmarks.spec.ts:15`, `cross-page-navigation.spec.ts:22`, `history.spec.ts:21`, `subscribe-and-practice.spec.ts:19`, `session-continuation.spec.ts:15`, `session-review-navigation.spec.ts:33`, and `review-mode-audit.spec.ts:63`.

Each `runE2EUserStateReset()` (`reset-e2e-user-state.ts:530-622`) opens a **new `postgres(url, { max: 1 })` per service method** — `ensurePlaceholderQuestionsPublished` (`:143`), `clearUserState` (`:199`), `resolveRequiredQuestionFixtures` (`:227`), `resolveRequiredChoiceFixtures` (`:279`), `seedDeterministicBaseline` (`:339`), `verifyDeterministicBaseline` (`:470`), plus the shared app-user lookup (`tests/e2e/helpers/e2e-reset-shared.ts:194`) — i.e. **7 short-lived DB client lifecycles + 1 Clerk API call per reset**.

`practice.spec.ts` has 9 tests. A focused `practice.spec.ts` run executes 10 resets total when including `global.setup.ts:10`, so it opens about **70** DB client lifecycles before counting app-page traffic.

→ This is real churn, but this audit did **not** reproduce connection exhaustion: the configured `.env.local` URL uses a Neon pooler endpoint, and 100 short-lived read-only connections at concurrency 20 succeeded.

### 2.5 The reset masks the real Postgres error

`reset-e2e-user-state.ts:211` and `:454` are bare `} catch {` blocks that throw a generic `E2E_RESET:DATABASE_MUTATION_FAILED` **without capturing or attaching the underlying error as `cause`**. The query-path catches (`:259-268`, `:314-323`, `:510-519`) likewise collapse to `DATABASE_QUERY_FAILED` without the real message. The fixture sync catch (`:175-184`) captures `error` only to rethrow known reset errors and drops non-reset causes. The shared reset support also drops causes in the Clerk transport catch (`tests/e2e/helpers/e2e-reset-shared.ts:159-164`) and app-user lookup catch (`:203-208`).

→ Connectivity blips, constraint violations, missing columns, and genuine bugs **all surface identically**. This is why the failure looked deterministic/scary and could not be triaged from the report.

### 2.6 CI provisions a fresh local Postgres, migrates, seeds, and retries

`.github/workflows/ci.yml`: `:20-22` `services: postgres: image: postgres:16`; `:37` sets `DATABASE_URL` to the local CI Postgres service; `:106` `pnpm db:migrate`; `:109/111` `pnpm db:seed` with `SEED_INCLUDE_PLACEHOLDERS: 'true'`; `:193` `pnpm test:e2e` (with `retries: 2` from the config).

→ CI's E2E DB is local-to-the-runner, always freshly migrated+seeded, and retried. That makes CI the stronger product-signal check for PR-1. It does not remove the local harness debt, because local `.env.local` runs exercise a different remote-DB path.

---

## 3. Root cause (corrected)

A **compounding test-infrastructure** problem with **two core, independent defects we must fix** — **(A) a structural miswiring**: local E2E targets a remote, shared, serverless database (Neon via `.env.local`) instead of a local Docker Postgres like CI (§6 structural direction; §0.5), a sensible-engineering oversight; and **(B) error masking**: the reset swallows the underlying Postgres error so failures are undiagnosable (item 1 below) — plus several contributors:

1. **Proven: error masking** (`reset-e2e-user-state.ts:175,211,259,314,454,510` and `e2e-reset-shared.ts:159,203`) — the real DB/transport error is discarded, so every reset write failure looks like the same deterministic catastrophe.
2. **Verified: no local retry buffer** (`playwright.config.ts:15`, local `retries: 0`) — any intermittent local harness failure is terminal.
3. **Verified: high reset churn** — per-test `beforeEach` resets × 7 DB client lifecycles each, plus Clerk lookup. This is worth reducing, but connection exhaustion was **not** reproduced in this audit.
4. **Verified risk: fixed global deterministic UUIDs** — `seedDeterministicBaseline` inserts fixed IDs (`reset-e2e-user-state.ts:12-20`, `:372-452`). If those IDs ever remain under a different app user (for example after changing the E2E Clerk user), `clearUserState(userId)` will not delete them and the next seed can fail deterministically with a primary-key conflict. Current DB state does **not** show this stale-owner condition: the three deterministic baseline rows currently exist and share one owner.

The original incident's exact DB cause is unknowable from the masked artifact. Based on current live probes, this is best framed as **local-only E2E reset/harness flakiness or state contamination**, not as a proven product/schema defect and not as proven connection-limit exhaustion.

---

## 4. What it is NOT (with proof)

| Hypothesis | Verdict | Proof |
|---|---|---|
| Schema drift (DEBT-391) | **Ruled out** | DB is 21/21 migrated; `is_omitted` present; fixtures seeded (§2.1) |
| Product/application bug caused by PR-1 | **Ruled out** | PR-1 touched pricing banner copy; pricing+smoke E2E passed; focused current practice spec passed 10/10 (§2.2) |
| Configured Playwright parallel race | **Ruled out for normal runs** | `workers: 1`, `fullyParallel: false` — serial by design (§2.3) |
| Connection-limit/churn as a proven root cause | **Not proven** | Reset 20/20 OK; read-only churn 100/100 OK at concurrency 20; Neon pooler endpoint in use (§2.2, §2.4) |
| A real SQL fault inside `seedDeterministicBaseline` | **Unverifiable for the incident** | The helper masked the underlying error. Current live mutation succeeds; historical cause is lost (§2.5) |
| Fixed-ID stale-owner risk | **Real but not present now** | Seed uses fixed global UUIDs; current DB has all three deterministic rows under one owner (§3) |
| PR-1 (the pricing copy change) caused it | **Ruled out** | PR-1 touches only the anonymous pricing banner; failures are in unrelated practice DB resets; pricing+smoke E2E passed in the same run; CI green |

---

## 5. Answers to the owner's questions

- **Are there actual failures?** Yes — the local test runner really reported failures. Current re-runs do not reproduce them.
- **Where are they from?** The direct reset failures came from `practice.spec.ts:106` `beforeEach(runE2EUserStateReset)` → `seedDeterministicBaseline` (`reset-e2e-user-state.ts:333-459`) with the real error swallowed at `:454`. The other saved failures show downstream stale/session/idempotency state, not direct reset exceptions.
- **Is it concerning?** It's a real **developer-experience and signal-integrity** problem (flaky, scary, un-triageable, time-wasting) but current evidence does not show a product/user risk. The app, schema, and reset path are healthy in live re-runs.
- **Why do we keep running into this?** Per-test remote-DB resets + zero local retries + masked errors + fixed-ID cleanup assumptions create intermittent failures that look novel each time.
- **How did we only find it now?** It is local-only/intermittent. The masking ensured the failed run left no diagnosable trail.
- **Do we not run E2E / the full suite?** We do. **CI runs the full E2E suite on every PR/push and it passed for #406.** Local E2E is also in the pre-push gate "when the billing E2E env is available" — it **did** run here (that is how the issue was caught). The local harness remains less deterministic than CI because it uses a remote `.env.local` database path and has no local retry buffer.

---

## 6. Remediation (staged test-infra resolution)

Prioritized by leverage. Item 1 is mandatory because it is the single change that makes the next occurrence definitively diagnosable.

**Structural direction (the definitive infrastructure fix):** make local E2E **hermetic** — run it against a **local Docker Postgres** (migrated + seeded), mirroring CI, instead of the remote Neon `.env.local` branch. Wire this via the E2E command/global setup (e.g., a `pretest:e2e` that runs `db:test:up` + migrate + `SEED_INCLUDE_PLACEHOLDERS=true db:seed` against the Docker URL, and runs Playwright with `DATABASE_URL` overridden to the Docker DB). This removes the entire class of remote-serverless variance (latency, cold starts, connection limits) and the CI-vs-local divergence in one move. CI already runs E2E this exact way and is green, which proves it works; coverage is not reduced (Docker `postgres:16` ≈ Neon's Postgres at the SQL/schema level, and E2E only needs the seeded placeholder fixtures). It is a hermetic/deterministic/prod-parity-on-schema test design (Fowler, Ousterhout, *Designing Data-Intensive Applications*). It does **not** by itself explain the original masked incident, so items 1–2 below remain mandatory. **Blast radius is test-only — see §6.5.**

**PR-A (signal-integrity stage) implements items 1–4 below. PR-B remains responsible for the hermetic Docker local-E2E switch, web-server startup hygiene, and per-test reset-frequency review, so DEBT-411 remains Active until PR-B closes the structural half.**

1. **Unmask the real error (HIGH, cheap) — PR-A.** In `reset-e2e-user-state.ts` and `e2e-reset-shared.ts`, capture the caught error and attach it as `cause` (and include a short, non-secret form of its message) on every `E2EUserStateResetError` thrown from the `catch` blocks (`reset-e2e-user-state.ts:175-184`, `:211-216`, `:259-268`, `:314-323`, `:454-459`, `:510-519`; `e2e-reset-shared.ts:159-164`, `:203-208`). Then a future failure says *"duplicate key value violates unique constraint"* vs *"connection terminated unexpectedly"* vs *"column ... does not exist"* — instantly triageable. Add/extend unit tests in `reset-e2e-user-state.test.ts` and `e2e-reset-shared.test.ts` asserting `cause` is propagated without leaking `DATABASE_URL`, hostnames, passwords, Clerk/Stripe secrets, or raw Neon project/account identifiers.
2. **Add a stale-baseline-owner preflight (HIGH) — PR-A.** Keep the deterministic baseline IDs for now, but before `seedDeterministicBaseline` inserts them, query the fixed `DETERMINISTIC_BASELINE` session/attempt IDs across `practice_sessions` and `attempts` for rows owned by a different app user. If any exist, fail before mutation with an actionable, non-masked `E2E_RESET:STALE_BASELINE_OWNER` code and remediation to reset the disposable/local E2E database or intentionally clear stale rows for the previous E2E user. Unit-test that the stale-owner path does not collapse into `E2E_RESET:DATABASE_MUTATION_FAILED` and does not leak secrets. This prevents an E2E-user change from turning the reset into a deterministic masked primary-key failure.
3. **Cut reset DB client churn (MEDIUM) — PR-A.** In `runE2EUserStateReset()`, open **one** `postgres()` connection and pass it to service methods instead of 7 separate `postgres(url,{max:1})` opens. Include the shared app-user lookup currently in `e2e-reset-shared.ts:194` in the same connection seam, so the reset has one DB lifecycle for connectivity/cleanup/fixture resolution/seed/verify. The current `.env.local` URL already uses a Neon pooled endpoint; this remediation should not depend on switching URLs.
4. **Set one local E2E retry after #1 ships (MEDIUM) — PR-A.** `playwright.config.ts:15` → `retries: process.env.CI ? 2 : 1` reduces developer pain now that reset errors are diagnosable. The inline config comment must state that the retry is a local ergonomics buffer, not a substitute for fixing reset errors.
5. **Web-server startup hygiene (LOW) — PR-B.** The "web server killed" on run 1 suggests port/process contention. Honor the documented `lsof -ti:3000 | xargs kill -9` pre-step (CLAUDE.md) and/or add a health-gated startup guard so a stale/failed server doesn't cascade.
6. **Reconsider per-test reset frequency (OPTIONAL) — PR-B.** Evaluate whether each spec truly needs a full `beforeEach` reset, or whether a per-describe reset + lighter per-test cleanup would cut churn substantially.

DEBT-391's schema-drift preflight is now **resolved and archived**: PR #408 squash-merged as `6c2f9791`, then `cfdae416` moved the dossier to `docs/_archive/debt/`. The shipped check lives in `tests/e2e/helpers/credential-health-check.ts`: `verifyMigrationLedger(sql)` runs in the E2E credential preflight between connectivity and `verifyIdempotencySchema` (`:483-488`), before `seedTestSubscription()` and `runE2EUserStateReset()` in `tests/e2e/global.setup.ts:7-10`. It does **not** live in `reset-e2e-user-state.ts`, and it does not unmask reset-helper catches. The relationship is complementary: DEBT-391 detects schema drift on the active E2E database; DEBT-411 makes local E2E hermetic and makes reset failures diagnosable. The §6 structural fix (local E2E → Docker) would prevent local schema drift by construction because the local E2E setup would migrate/seed the Docker DB before Playwright, while the already-shipped DEBT-391 preflight remains a useful guardrail for any workflow that intentionally validates `.env.local` or another deploy-target database.

---

## 6.5 Blast radius — what a fix changes, and what it does NOT

The remediation is entirely **test-infrastructure**. Confirming the boundary because the owner asked directly:

**Changes (local testing only):**

- Local E2E obtains its database from a local Docker Postgres instead of remote Neon, and the reset helper surfaces real errors. Result: local E2E becomes fast, deterministic, and diagnosable — matching CI.

**Does NOT change (verified by architecture):**

- **Production** (still Neon prod) and **preview/dev deploys** (still Neon dev) — untouched. The app's runtime DB config lives in Vercel env vars, not in test config.
- **The official migration workflow** — you still run `pnpm db:migrate` against the Neon prod/dev URL deliberately for real schema changes, exactly as today. Vercel deploys code only; it never migrated databases, and that is unchanged.
- **main ↔ dev syncing** — that is git/code (`git push origin dev:main`), not databases — untouched.
- **CI** — already correct (Docker + migrate + seed + retries); no change required there.
- **Database content/data** — no production or Neon data is read or written by the fix; it operates on disposable test databases and the non-prod E2E test user.

In one line: **this fixes local E2E reliability and nothing else.** Production, deploys, Neon, migrations, and branch syncing keep working exactly as they do now.

---

## 7. Public-safety boundary

Do not commit: the `.env.local` `DATABASE_URL`, the Neon endpoint hostname, DB passwords, Clerk/Stripe secrets, or account/project ids. This dossier refers to the database only as "the remote Neon pooled branch configured in `.env.local`." (Inspection above masked the host.) Follows the same rule as DEBT-391 §"Public-Safety Boundary."

---

## 8. Acceptance criteria (for the staged remediation)

- [x] PR-A: Every `E2EUserStateResetError` thrown from a `catch` in `reset-e2e-user-state.ts` and `e2e-reset-shared.ts` carries the underlying error as `cause`; forced DB and Clerk failures surface a short non-secret message (unit-tested).
- [x] PR-A: Cause propagation tests assert the failure report does **not** leak `DATABASE_URL`, hostnames, passwords, Clerk/Stripe secrets, or raw Neon project/account identifiers.
- [x] PR-A: Fixed-ID stale-owner risk fails before mutation with explicit `E2E_RESET:STALE_BASELINE_OWNER` and does not collapse into `DATABASE_MUTATION_FAILED` (unit-tested).
- [x] PR-A: Reset opens materially fewer DB client lifecycles per invocation, measured; target is one DB connection for the reset path, including the shared app-user lookup.
- [x] PR-A: Local `pnpm test:e2e` retry policy is decided after cause propagation ships; local retries are set to 1 with an inline "ergonomics buffer, not a substitute for diagnosable errors" comment.
- [ ] PR-B: Local E2E runs against a migrated+seeded Docker Postgres by default, while CI E2E stays green and unchanged in behavior.
- [ ] PR-B: Web-server startup hygiene and per-test reset-frequency review are resolved or explicitly rejected with evidence.
- [x] DEBT-391's already-shipped credential preflight remains in front of seed/reset in `global.setup.ts`; DEBT-411 does not duplicate it inside the reset helper.
- [x] This doc and the debt index stay synchronized; no duplicate DEBT-411 id remains after reconciliation with the parallel investigation (see note below).

---

## 9. Coordination note

A second investigation ran in a different clone in parallel and independently corrected this dossier (see the §0 corrections and §2 evidence). PR #406 has since merged, so **this doc is now the active DEBT-411 source of truth on current `dev`/`main`**. The parallel DEBT-391 schema-drift preflight also shipped separately in PR #408 and was archived at `cfdae416`; keep future edits clear that DEBT-391 = credential-preflight drift detection, while DEBT-411 = local E2E hermeticity + reset error unmasking. If the parallel investigation surfaced additional evidence, fold it in as a follow-up edit; confirm no duplicate DEBT-411 id remains.

---

## Appendix — evidence commands (re-runnable; secrets masked)

- DB schema/fixtures: read-only `SELECT` against `.env.local` `DATABASE_URL` for `drizzle.__drizzle_migrations` count, `information_schema.columns` on `attempts`, `to_regclass(...)` on write-path tables, and a `questions` slug count → 21/21, columns present, fixtures 2/2.
- Reset reproduction: load `.env.local`, call `runE2EUserStateReset()` ×5 → 5/5 OK (1963/1588/1560/1577/1600 ms), then ×20 → 20/20 OK (min/avg/max 1511/1591/1783 ms).
- Connection stress: read-only pooled Neon connection churn ×100 at concurrency 20 → 100/100 OK.
- Focused suite: `pnpm exec playwright test tests/e2e/practice.spec.ts --project=chromium --reporter=line` → 10/10 OK in 1.8m.
- Config: `playwright.config.ts:13-18,37-42`; `tests/e2e/global.setup.ts:7-11`; `tests/e2e/practice.spec.ts:106-107`; `reset-e2e-user-state.ts:143,175,199,211,227,259,279,314,339,454,470,510`; `tests/e2e/helpers/e2e-reset-shared.ts:159,194,203`; `tests/e2e/helpers/credential-health-check.ts:483-488`; `.github/workflows/ci.yml:20-37,106,109,111,193`.
