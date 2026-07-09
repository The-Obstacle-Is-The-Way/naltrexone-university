# DEBT-448: Rate Limiter — 90-Day Retention of 60-Second Windows, Unmetered Practice Write Actions, Health-Probe Ordering Mislabels DB Outages

**Status:** Active
**Priority:** P3
**Date:** 2026-07-09

---

## Description

Three related gaps around the DB-backed `DrizzleRateLimiter` and the surfaces it does (and does not) protect: dead `rate_limits` rows are retained ~129,600x longer than they carry information while an unauthenticated endpoint can mint uncapped per-IP key rows; the heaviest practice write actions are the only unprotected ones in their controller; and the health endpoint's limiter-before-probe ordering makes the DB-outage response body unreachable.

### 1. 90-day retention of 60-second windows + attacker-mintable `health:` key space

[`drizzle-rate-limiter.ts:14`](../../src/adapters/gateways/drizzle-rate-limiter.ts#L14) sets `PRUNE_RETENTION_DAYS = 90` and applies it as the prune cutoff at [line 79](../../src/adapters/gateways/drizzle-rate-limiter.ts#L79), pruning only opportunistically on `count === 1` in batches of [`PRUNE_BATCH_LIMIT = 100`](../../src/adapters/shared/prune-constants.ts#L1). Yet every configured limit in [`rate-limits.ts`](../../src/adapters/shared/rate-limits.ts#L10) uses `windowMs = 60_000`, so a row carries no rate-limiting information ~60 seconds after its window starts. [ADR-016:108](../adr/adr-016-rate-limiting.md#L108) itself states rows older than the window are dead; the 90-day constant was never a ruled decision (the BUG-102 fix doc that introduced pruning never mentions it).

The key space is also uncapped and partially attacker-mintable: the unauthenticated `/api/health` handler (GET and POST) keys on [`health:${ip}`](../../app/api/health/handler.ts#L26). [`lib/request-ip.ts:2`](../../lib/request-ip.ts#L2) blocks header spoofing in production (only `x-vercel-forwarded-for` is trusted), but an attacker rotating genuine source IPv6 addresses (one /64 = 2^64 addresses, one request each, never tripping the 600/min per-IP [`HEALTH_CHECK_RATE_LIMIT`](../../src/adapters/shared/rate-limits.ts#L62)) mints one 90-day dead row per request.

Verifier correction to the original candidate: growth is **not** strictly unbounded — once rows age past 90 days, each new-window insert prunes up to 100 aged rows, so the table is bounded at ~write_rate × 90 days. That steady-state bound is the problem: ~78M rows at a modest sustained 10 req/s of rotating addresses, and ~129,600 rows per 90 days from a single once-a-minute uptime monitor — bloating the composite PK index [`(key, window_start)`](../../db/schema.ts#L286) and `window_start` index that every gated surface's hot-path upsert traverses, plus Neon storage/vacuum cost. Nothing else prunes the table (BUG-104 made the hot path the sole prune owner). DEBT-135's header-trust hardening is orthogonal — it blocks spoofing, not real source-IP rotation.

### 2. `saveExamDraftAnswer`, `endPracticeSession`, `finalizeExamAnswers`, `setPracticeSessionQuestionMark` have no rate limiter while cheaper siblings are gated

In [`practice-controller.ts`](../../src/adapters/controllers/practice-controller.ts), only `startPracticeSession` (20/min) and `discardPracticeSession` (60/min, via the `beforeExecute` hook at [lines 297–316](../../src/adapters/controllers/practice-controller.ts#L297)) run `d.rateLimiter.limit`. [`saveExamDraftAnswer` (line 369)](../../src/adapters/controllers/practice-controller.ts#L369) — the exam-mode per-answer write path, direct analog of tutor-mode `submitAnswer` which IS limited at 120/min ([`SUBMIT_ANSWER_RATE_LIMIT`](../../src/adapters/shared/rate-limits.ts#L32)) — has no limiter and no idempotency key: every call is an unmetered entitled-user DB write (session load, question load, then a select+versioned-update transaction retried up to 3x at [`practice-session-question-state-updater.ts:132`](../../src/adapters/repositories/practice-session-question-state-updater.ts#L132)).

[`endPracticeSession` (line 265)](../../src/adapters/controllers/practice-controller.ts#L265), [`finalizeExamAnswers` (line 327, `executeIdempotent` at 345 with no `beforeExecute`)](../../src/adapters/controllers/practice-controller.ts#L345), and [`setPracticeSessionQuestionMark` (line 417)](../../src/adapters/controllers/practice-controller.ts#L417) are idempotency-keyed but idempotency provides no shedding against fresh keys — each fresh-UUID call claims an `idempotency_keys` row and runs the full use case, with `finalizeExamAnswers` inserting an attempt row plus finalizing draft state per session question in a loop ([`finalize-exam-answers.ts:212`](../../src/application/use-cases/finalize-exam-answers.ts#L212)). [Archived DEBT-424](../_archive/debt/debt-424-rate-limit-idempotent-actions-on-cache-miss-only.md) documented the 3 no-limiter idempotent actions as out of scope for its replay-gating fix but never ruled that they should remain unlimited — and it built the exact `beforeExecute` seam that makes adding limits trivial now. This contradicts `rate-limits.ts`'s stated rationale ("Keep limits consistent across entry points"): the heaviest write surfaces in the controller are the only unprotected ones. Concrete trigger lineage exists — the `saveExamDraftAnswer` autosave path already has BUG-238/252/258 behind it.

### 3. Health endpoint's limiter write runs before `SELECT 1`, so a DB outage is labeled "Rate limiter unavailable" (P4)

In [`app/api/health/handler.ts`](../../app/api/health/handler.ts#L25) the rate-limit check (lines 25–28) executes before the `SELECT 1` probe ([line 52](../../app/api/health/handler.ts#L52)), and the wired limiter ([`route.ts:7`](../../app/api/health/route.ts#L7)) performs an `INSERT ... ON CONFLICT` write on the same `db` connection ([`drizzle-rate-limiter.ts:53`](../../src/adapters/gateways/drizzle-rate-limiter.ts#L53)). During a database outage the limiter throws first, the catch at lines 43–48 returns 503 `{error:'Rate limiter unavailable'}`, and the DB-specific 500 `{error:'Database connection failed'}` branch (lines 58–66) can never execute. The health signal itself remains correct (`ok:false`, non-2xx, monitors fire) and the raw error is logged at [line 44](../../app/api/health/handler.ts#L44) — this is a diagnostic-labeling gap, not wrong health signaling. A prior audit ruled the 503-on-limiter-failure behavior correct (`docs/bugs/index.md`, refuted-candidates entry "Health check 503 on rate limiter failure (correct behavior — service unavailable)") and [`route.test.ts:105`](../../app/api/health/route.test.ts#L105) pins it, but neither addressed the ordering/masking angle; any fix must not regress the ruled-correct 503-for-limiter-failure contract. The verifier downgraded this leg from P3 bug to P4 debt: monitors keyed on status/ok fire correctly, the true cause is one log line away, and in the reads-OK/writes-failing case the label is technically accurate.

## Impact

- **Part 1 (P3):** Operational, not correctness — no user-visible data corruption. Steady-state dead-row mass (~78M rows at 10 req/s of rotating IPv6; ~129,600 rows/90 days from one uptime monitor) bloats the indexes on the hot-path upsert that gates every surface (submit-answer, bookmarks, checkout, webhooks, health) and inflates Neon storage/vacuum cost.
- **Part 2 (P3):** A runaway exam-page autosave loop or a hostile entitled subscriber scripting `saveExamDraftAnswer` at hundreds of rps (~4+ DB round trips each, zero admission control) can saturate the Neon connection pool and degrade the app for all users; fresh-key calls to the three idempotent actions grow `idempotency_keys` and attempt-write load unboundedly. Blast radius is narrowed by `requireEntitledUserId` (authenticated + entitled required), hence P3 not higher.
- **Part 3 (P4):** During a DB outage, on-call curling `/api/health` is pointed at the rate-limiter subsystem instead of the database; alerting itself is unaffected.

## Proposed Resolution

**Part 1:**
- **Option 1 (recommended):** shrink retention to a small multiple of the maximum configured window — e.g. derive the cutoff from `max(windowMs)` (all currently 60s) with a safety factor (1–24 hours instead of 90 days). One-constant change in `drizzle-rate-limiter.ts`; reduces steady-state dead rows by ~99.9% while preserving debugging headroom. Add a test pinning cutoff << 90 days.
- **Option 2 (complementary):** add a `rate_limits` prune step to the existing daily reconcile cron so cleanup does not depend solely on the `count === 1` hot-path trigger and can drain backlog faster than 100 rows per new window.
- **Option 3 (optional hardening):** normalize IPv6 client IPs to their /64 prefix before building the `health:` key, collapsing the mintable key space per attacker allocation from 2^64 to 1.

**Part 2:**
- **Option 1 (recommended):** per-user limiters via the DEBT-424 seam — `saveExamDraftAnswer` gets a direct pre-call limiter mirroring `SUBMIT_ANSWER_RATE_LIMIT` (120/min; it is the exam analog of `submitAnswer` and takes no idempotency key); `endPracticeSession` / `finalizeExamAnswers` / `setPracticeSessionQuestionMark` pass a `PRACTICE_SESSION_MUTATION_RATE_LIMIT`-style limiter as the existing `beforeExecute` hook so replays with a reused key are never gated (exactly the `discardPracticeSession` pattern). Note the limiter is DB-backed (one `rate_limits` write per call), so it does not reduce per-request writes to zero, but it bounds the far heavier downstream use-case work and gives real shedding.
- **Option 2:** gate only the two genuinely expensive paths (`saveExamDraftAnswer` + `finalizeExamAnswers`) — smaller diff, leaves fresh-key `idempotency_keys` growth unbounded on end/mark.
- **Option 3:** owner ACCEPT ruling documenting that entitled-user abuse of these four actions is tolerated (DEBT-408/437 precedent) — cheapest, but leaves the `rate-limits.ts` consistency rationale contradicted.

**Part 3:**
- **Option 1 (recommended):** disambiguate inside the limiter catch — on limiter failure, attempt the `SELECT 1` probe there; if the probe also fails return the existing 500 "Database connection failed" response, otherwise keep the 503 "Rate limiter unavailable". Preserves the audit-blessed 503 semantics for genuine limiter-only failures and preserves throttling order, at the cost of one extra query only on the already-failing path.
- **Option 2 (cheapest):** keep behavior, change the catch response/log copy to note the limiter is DB-backed (e.g. "Rate limiter unavailable (DB-backed — may indicate database outage)").
- **Option 3:** accept and document — the health signal is correct in all failure modes and the logged error already carries the root cause; record the labeling caveat in the runbook/handler comment.

## Verification

- **Part 1:** unit test on `DrizzleRateLimiter` pinning the prune cutoff to the new derived value (<< 90 days); if Option 2 lands, an integration test proving the cron path deletes aged `rate_limits` rows independently of the `count === 1` trigger; if Option 3 lands, a `getClientIp`/key-derivation test showing two addresses in one /64 collapse to one `health:` key.
- **Part 2:** controller tests asserting `saveExamDraftAnswer` returns `RATE_LIMITED` past 120/min and that the three idempotent actions reject fresh-key calls past 60/min via `beforeExecute` while replays with a reused idempotency key are never gated (mirror the existing `discardPracticeSession` test shape with `FakeRateLimiter`).
- **Part 3:** extend `app/api/health/route.test.ts` — limiter failure + probe failure returns 500 "Database connection failed"; limiter failure + probe success still returns 503 "Rate limiter unavailable" (the existing test at line 105 must keep passing, preserving the ruled-correct contract).

## Related

- [ADR-016: Rate Limiting](../adr/adr-016-rate-limiting.md) — states rows older than the window are dead; never ruled 90-day retention.
- [BUG-102 (archived)](../_archive/bugs/bug-102-rate-limits-table-unbounded-growth.md) — introduced pruning; no retention-duration ruling.
- [BUG-104 (archived)](../_archive/bugs/bug-104-double-pruning-webhook-and-hot-paths.md) — made the hot path the sole prune owner.
- [DEBT-135 (archived)](../_archive/debt/debt-135-rate-limit-client-ip-trust-boundary-hardening.md) — header-trust hardening; orthogonal to real source-IP rotation.
- [DEBT-424 (archived)](../_archive/debt/debt-424-rate-limit-idempotent-actions-on-cache-miss-only.md) — built the `beforeExecute` seam; listed the 3 no-limiter idempotent actions as out of scope without ruling them acceptable.
- [DEBT-437 (archived)](../_archive/debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) — ACCEPT ruling on tutor-submit-vs-end write skew, unrelated to these legs; cited only as ACCEPT-precedent.
- [DEBT-332 (archived)](../_archive/debt/debt-332-security-posture-audit.md) — touched the health endpoint only for timestamp disclosure.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
