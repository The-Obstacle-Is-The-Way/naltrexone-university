# DEBT-448: Rate Limiter — Current 90-Day Retention, Target 24-Hour Horizon, Practice Admission Gaps, Health-Probe Diagnostic Masking

**Status:** Open
**Priority:** P3
**Date:** 2026-07-09
**Re-verified accurate against `ddad8eee` on 2026-07-18.**

---

## Direction (2026-07-19 forest review)

| Part | Verdict | Chosen option | Rejected as disproportionate | One-line rationale |
| --- | --- | --- | --- | --- |
| 1. Rate-limit retention | **FIX (Option 1, minimal form)** | Name a rate-limit-specific 24-hour retention constant (1,440 one-minute windows), keep cleanup in the existing hot path, and pin the cutoff in a unit test. | Option 2's IP-prefix/WAF policy and any new cleanup owner. | (a) Changes one constant and test instead of adding key-normalization or infrastructure state; (b) 90-day retention is code-proven although production volume is unmeasured; (c) Blast radius: the table and its indexes retain up to 129,600 expired information windows per stable key. Fix cost: one constant and cutoff test, reducing the horizon 98.9% while keeping one-day debugging headroom; (d) gives the policy one explicit name; (e) DEBT-444 remains the sole cleanup-mechanism owner. |
| 2a. Draft saves | **FIX (Option 1, minimal form)** | Add a direct per-user `EXAM_DRAFT_SAVE_RATE_LIMIT` at 120/minute before `saveExamDraftAnswer`; no idempotency layer is added. | Reusing a semantically unrelated named constant; adding idempotency solely to host the limiter. | (a) Reuses the existing limiter with one named policy; (b) draft save is a repeatable, directly reachable write today; (c) Blast radius: an entitled caller can repeatedly drive session/question reads and CAS writes without admission. Fix cost: one limiter call and named configuration at the existing controller boundary; (d) keeps policy naming explicit; (e) uses the same 24-hour retained limiter table. |
| 2b. Keyed end/finalize/mark | **FIX (Option 1, minimal form)** | Pass the existing per-user practice-mutation limiter through each action's `beforeExecute`, so only fresh claims consume quota and same-key success/error replays bypass admission. | Limiter-before-idempotency ordering; a new wrapper or bespoke replay check. | (a) Reuses the DEBT-424 seam with no abstraction; (b) mark is repeatable and finalize is high fan-out, while terminal guards bound successful end/finalize; (c) Blast radius: fresh keys can repeatedly admit mark/check work and each admitted finalize can fan out across a session. Fix cost: one existing hook per action with controller tests; (d) preserves the single idempotency law; (e) keeps replay semantics coherent across all keyed mutations. |
| 2c. Expired-exam `getNextQuestion` branch | **ACCEPT (Option 3, minimal form)** | Keep ordinary and expired session fetches unmetered; rely on entitlement, 20/minute session creation, expiry, and terminal finalization guards. | A limiter-aware finalizer adapter or blanket `getNextQuestion` limiter. | (a) Adds no cross-layer quota mechanism; (b) the branch is real but one successful finalize per created session is already bounded and no abuse is measured; (c) Blast radius: repeated expired-session reads can reach finalization checks and one call can perform a full-session finalize. Cure cost: a limiter-aware injected-finalizer adapter or a regression to blanket read throttling, which is disproportionate; (d) preserves the read-use-case contract; (e) avoids creating a second admission owner inside composition. Accepted failure: a user can make repeated expired-session reads reach finalization checks, and the first successful call can perform one full-session finalize without a dedicated quota. |
| 3. Health diagnostic ordering | **ACCEPT (Option 3)** | Keep limiter-first control flow and document that its 503 can be the first symptom of a general database outage. | Option 1's second probe on an already-failing path; copy-only Option 2 as a pseudo-fix. | (a) Adds no failure-path query/state; (b) masking is source-proven but no alert miss is recorded; (c) Blast radius: a general outage returns a less-specific body while status and logging remain correct. Cure cost: another database call and response branch on an already-failing path, which is disproportionate; (d) current behavior is already accurately tested; (e) no cleanup/retention ownership changes. Accepted failure: a general database outage can return `503 Rate limiter unavailable` instead of the later `500 Database connection failed` body. |

The rate-limit table keeps its existing request-path cleanup owner; DEBT-444 changes only that owner's SQL shape, while this doc sets a 24-hour table-specific retention horizon. Direct mutations receive admission at their existing boundary, and all keyed actions must preserve DEBT-424's cache-miss-only law. The two accepted residuals are bounded diagnostic/capacity risks and do not justify new composition or health-probe machinery.

## Description

Three distinct gaps remain around the DB-backed `DrizzleRateLimiter`: its 60-second counters are **currently** retained for 90 days while a public per-IP endpoint can create a large rolling key set, and the selected **target** is a rate-limit-specific 24-hour horizon; five entitled practice actions can execute database writes without admission control (one only on its expired-exam branch); and the health handler attempts the limiter's database write before its database read probe, masking the dedicated DB-failure response during a general outage. No production abuse, row count, storage bill, or health-alert miss is recorded in the repository; the numeric costs below are projections from code constants.

### 1. Current 90-day retention of 60-second windows + public `health:` key cardinality; target 24 hours

[`drizzle-rate-limiter.ts:14`](../../src/adapters/gateways/drizzle-rate-limiter.ts#L14) sets `PRUNE_RETENTION_DAYS = 90`, and [`line 79`](../../src/adapters/gateways/drizzle-rate-limiter.ts#L79) computes that cutoff. All **12** named configurations in [`rate-limits.ts`](../../src/adapters/shared/rate-limits.ts#L12) use [`ONE_MINUTE_MS = 60_000`](../../src/adapters/shared/rate-limits.ts#L10), including health and reconciliation. Because the key is `(key, window_start)`, a row no longer affects a future decision after its one-minute window ends. Ninety days contains 129,600 one-minute windows; that is the verified retention-to-information ratio. [ADR-016:108](../adr/adr-016-rate-limiting.md#L108) calls rows older than the window dead, while archived BUG-102 introduced pruning without deciding a 90-day policy.

Both GET and POST `/api/health` are public ([`lib/public-routes.ts:7`](../../lib/public-routes.ts#L7); [`route.ts:22-29`](../../app/api/health/route.ts#L22)) and key the limiter as [`health:${ip}`](../../app/api/health/handler.ts#L25). In production, [`getClientIp`](../../lib/request-ip.ts#L1) ignores generic forwarding headers and uses `x-vercel-forwarded-for` or `unknown`, so this does **not** reopen DEBT-135's header-spoofing ruling. A repeated source IP can create at most one health row per minute; a caller able to originate requests from different real source IPs can create one row per address/request without approaching the 600/min **per-IP** threshold. IPv6 makes the theoretical address space large, but whether a specific caller can rotate addresses in its assigned prefix is an external network fact, not proven by this repository.

The original “strictly unbounded” claim is false. On every new `(key, window)` insert (`count === 1`), the implementation attempts to prune up to [`PRUNE_BATCH_LIMIT = 100`](../../src/adapters/shared/prune-constants.ts#L1) rows older than 90 days ([`drizzle-rate-limiter.ts:76-92`](../../src/adapters/gateways/drizzle-rate-limiter.ts#L76)). If cleanup keeps pace, sustained cardinality approaches a rolling 90-day volume: 10 new keys/s projects to 77,760,000 rows, and one request/min from one stable monitor projects to 129,600 rows. These are arithmetic scenarios, **not measured production counts**. The table has a composite primary key and a separate `window_start` index ([`db/schema.ts:277-288`](../../db/schema.ts#L277)), so more rows imply more storage/index/vacuum work, but the repository contains no query-plan, table-size, or Neon-cost measurement.

DEBT-444 already owns the prune transaction's request-path contention, scheduled-owner alternative, and missing direct real-Postgres coverage. This part owns only the **retention duration and public health-key cardinality**; it does not propose a second cleanup owner or duplicate DEBT-444's coverage gap.

### 2. Five practice action paths can write without rate limiting; six sibling mutation surfaces are metered

The complete practice-surface mutation inventory is:

| Action/path | Write behavior | Admission control |
|---|---|---|
| `startPracticeSession` | Creates a session/state rows | 20/min via `START_PRACTICE_SESSION_RATE_LIMIT` ([`practice-controller.ts:198-217`](../../src/adapters/controllers/practice-controller.ts#L198)) |
| `submitAnswer` | Inserts an attempt and updates session state | 120/min via `SUBMIT_ANSWER_RATE_LIMIT` ([`question-controller.ts:249-268`](../../src/adapters/controllers/question-controller.ts#L249)) |
| `discardPracticeSession` | Deletes an incomplete exam session and its state rows | 60/min via `PRACTICE_SESSION_MUTATION_RATE_LIMIT` ([`practice-controller.ts:297-316`](../../src/adapters/controllers/practice-controller.ts#L297)) |
| `setBookmark` | Bookmark mutation | 60/min via `BOOKMARK_MUTATION_RATE_LIMIT` ([`bookmark-controller.ts:90-109`](../../src/adapters/controllers/bookmark-controller.ts#L90)) |
| `rateQuestion` / `submitQuestionReport` | Feedback writes | 60/min and 10/min ([`question-feedback-controller.ts:141-160`](../../src/adapters/controllers/question-feedback-controller.ts#L141), [`question-feedback-controller.ts:197-216`](../../src/adapters/controllers/question-feedback-controller.ts#L197)) |
| `saveExamDraftAnswer` | Session/question reads, then a versioned state update | **No limiter; no idempotency key** ([`practice-controller.ts:369-386`](../../src/adapters/controllers/practice-controller.ts#L369)) |
| `endPracticeSession` | Ends the parent session | Idempotency-keyed, **no limiter** ([`practice-controller.ts:265-285`](../../src/adapters/controllers/practice-controller.ts#L265)) |
| `finalizeExamAnswers` | Finalizes every state and ends the exam in one transaction | Idempotency-keyed, **no limiter** ([`practice-controller.ts:327-353`](../../src/adapters/controllers/practice-controller.ts#L327)) |
| `setPracticeSessionQuestionMark` | Versioned state update | Idempotency-keyed, **no limiter** ([`practice-controller.ts:417-439`](../../src/adapters/controllers/practice-controller.ts#L417)) |
| `getNextQuestion` | Normally read-only; **writes by finalizing** when it detects an expired exam | **No limiter** ([`question-controller.ts:193-216`](../../src/adapters/controllers/question-controller.ts#L193), [`get-next-question.ts:174-189`](../../src/application/use-cases/get-next-question.ts#L174)) |

The remaining practice-controller actions (`countAvailableQuestions`, incomplete/completed-session loads, review, summary, and history) and the ordinary `getNextQuestion` branches are reads. SPEC-017 explicitly accepts unmetered question fetching as read-only ([`SPEC-017:35-37`](../specs/spec-017-rate-limiting.md#L35)); it did not evaluate the later expired-exam finalizer branch or rule that new write actions should remain unlimited. A blanket limiter on all `getNextQuestion` calls would re-litigate that accepted read policy, so any remediation must isolate its write branch.

`saveExamDraftAnswer` is the clearest repeatable write: a successful call loads the session, loads the question, then opens a transaction that selects and conditionally updates the state row, with up to three compare-and-swap attempts ([`save-exam-draft-answer.ts:33-114`](../../src/application/use-cases/save-exam-draft-answer.ts#L33); [`practice-session-question-state-updater.ts:128-182`](../../src/adapters/repositories/practice-session-question-state-updater.ts#L128)). The three explicitly keyed actions were correctly listed as “idempotent, no limiter” by archived DEBT-424 ([lines 50-56](../_archive/debt/debt-424-rate-limit-idempotent-actions-on-cache-miss-only.md#L50)); fresh UUIDs bypass replay caching and execute the use case. However, the original impact claim was overstated: successful `endPracticeSession` and `finalizeExamAnswers` are terminal state transitions, so arbitrarily many fresh keys do **not** produce arbitrarily many successful ends/finalizations or repeated attempt inserts for one session. They still cause idempotency claims and at least the use case's terminal checks, while repeated fresh-key mark calls can continue writing on an active session. Idempotency retention/prune behavior belongs to DEBT-443/444 and is not duplicated here.

`finalizeExamAnswers` remains the largest single admitted unit of work: it loops the session's states and inserts/finalizes each not-yet-finalized answer ([`finalize-exam-answers.ts:212-278`](../../src/application/use-cases/finalize-exam-answers.ts#L212)). The `getNextQuestion` expired branch invokes that same use case through the composition root ([`lib/container/use-cases.ts:172-180`](../../lib/container/use-cases.ts#L172)). Start-session admission (20/min) and terminal-state guards constrain repeated reachability, so this is capacity defense-in-depth rather than evidence of unbounded successful writes.

The BUG-238/252/258 documents prove prior correctness defects on the draft/finalize path; they do not prove a rate-limit incident or runaway loop. The original “concrete trigger lineage” attribution is therefore removed.

### 3. Health's limiter write precedes `SELECT 1`, masking the DB-specific response during a general outage (P4)

[`app/api/health/handler.ts:21-49`](../../app/api/health/handler.ts#L21) awaits the limiter before the database probe at [`lines 51-67`](../../app/api/health/handler.ts#L51). The route wires both dependencies to the same Drizzle `db` ([`route.ts:1-18`](../../app/api/health/route.ts#L1)), and `DrizzleRateLimiter.limit()` begins with `INSERT ... ON CONFLICT` ([`drizzle-rate-limiter.ts:53-64`](../../src/adapters/gateways/drizzle-rate-limiter.ts#L53)). If the database cannot serve either operation, the write throws first, the handler returns 503 `{ ok:false, error:'Rate limiter unavailable'}`, and the later 500 `{ error:'Database connection failed' }` branch is not reached. The thrown value is passed to the structured logger at line 44, but the repository cannot guarantee how diagnostic a provider/runtime error message will be.

The health signal remains correct: `ok:false` and non-2xx are sufficient for status/`ok`-based monitoring to detect failure. In a reads-healthy/writes-failing case, “Rate limiter unavailable” is also accurate. The bug register previously rejected “503 on limiter failure” as a false positive ([`docs/bugs/index.md:747`](../bugs/index.md#L747)), and [`route.test.ts:105-140`](../../app/api/health/route.test.ts#L105) pins the external 503 response. This part does not reopen that ruling; it is only about distinguishing a general DB outage from a limiter-only/write-path failure. P4 remains appropriate.

## Impact

- **Part 1 (P3):** projected rolling storage/index/vacuum load from a retention policy 129,600 times the only configured window. At 10 new real-IP keys/s the arithmetic ceiling is ~77.76M rows if cleanup keeps pace; actual traffic, rows, bytes, plans, and Neon cost are unmeasured.
- **Part 2 (P3):** an entitled client can repeatedly drive the draft state write or active-session mark writes without admission control, and one admitted finalize can fan out across the full session. Terminal guards and the 20/min start limit prevent the originally claimed unbounded repeat-finalization writes. No abuse incident is documented.
- **Part 3 (P4):** a general DB outage is labeled as a limiter outage in the response body; alert status remains correct and the exception is logged.

## Proposed Resolution

**Part 1:**
- **Option 1 (CHOSEN, minimal form):** rename the retention policy so it is explicitly rate-limit-specific, set it to 24 hours (1,440 one-minute windows), and pin the cutoff in `drizzle-rate-limiter.test.ts`. This reduces the rolling time horizon by 98.9% while keeping one day of debugging headroom.
- **Option 2 (REJECTED BY DIRECTION REVIEW):** reduce public key cardinality through IP-prefix policy or Vercel WAF. That introduces fairness/trust and external-configuration decisions without measured abuse; it is not needed to correct the 90-day retention mismatch.
- **Ownership boundary:** if cleanup moves off the hot path or its SQL/tests change, implement that under DEBT-444 rather than duplicating the owner here.

**Part 2:**
- **Option 1 (CHOSEN FOR DIRECT MUTATIONS, minimal form):** add a named `EXAM_DRAFT_SAVE_RATE_LIMIT` of 120/minute and enforce it directly before `saveExamDraftAnswer`. Pass the existing `PRACTICE_SESSION_MUTATION_RATE_LIMIT` through `beforeExecute` for end/finalize/mark; a reused key must replay without a limiter call exactly as DEBT-424 requires. Use per-action, per-user keys so one mutation class does not consume another's quota.
- **Option 2 (REJECTED AS INCOMPLETE):** gate only draft/direct-finalize while leaving the repeatable mark write unmetered. The existing `beforeExecute` seam makes consistent direct-action coverage cheaper than documenting that exception.
- **Option 3 (CHOSEN ACCEPTANCE FOR EXPIRED FETCH ONLY):** keep the expired-exam branch of `getNextQuestion` unmetered together with ordinary reads. Entitlement, start admission, expiry, and terminal guards bound successful work to one finalize per created session; no limiter-aware application/composition adapter is added. The concrete accepted failure is recorded in the Direction table.

**Part 3:**
- **Option 1 (REJECTED BY DIRECTION REVIEW):** attempt `SELECT 1` after limiter failure. It adds another database operation and response branch during an outage to refine copy while the health signal is already correct.
- **Option 2 (NOT A SEPARATE FIX):** copy-only clarification would document rather than change the same accepted behavior.
- **Option 3 (ACCEPTED):** retain limiter-first control flow and the current tested response. A general database outage may be labeled as a limiter outage in the response body; status and structured error logging remain the operational signal.

## Verification

- **Part 1:** extend [`drizzle-rate-limiter.test.ts`](../../src/adapters/gateways/drizzle-rate-limiter.test.ts) to pin the 24-hour cutoff. Direct real-Postgres prune behavior remains DEBT-444 scope.
- **Part 2:** controller tests prove draft calls cross 120/minute, end/finalize/mark fresh keys are limited through `beforeExecute`, and same-key cached success/error replays make no limiter call (using the existing `FakeRateLimiter`). Existing expired-exam tests remain unmetered and pin the accepted one-finalize terminal behavior. Keep existing test-file import/timeout policy.
- **Part 3:** keep the existing limiter-failure route tests unchanged as the accepted external contract: 503, `Rate limiter unavailable`, no `SELECT 1`, and one structured error log.

## Related

- [ADR-016: Rate Limiting](../adr/adr-016-rate-limiting.md) — says rows older than their window are dead; does not choose 90-day retention.
- [SPEC-017: Rate Limiting](../specs/spec-017-rate-limiting.md) — accepts unmetered question reads; does not rule on the later expired-exam write branch or the four direct mutations.
- [BUG-102 (archived)](../_archive/bugs/bug-102-rate-limits-table-unbounded-growth.md) and [BUG-104 (archived)](../_archive/bugs/bug-104-double-pruning-webhook-and-hot-paths.md) — introduced hot-path cleanup and removed duplicate webhook cleanup without deciding the retention duration.
- [DEBT-444](./debt-444-hot-path-prune-contention-and-coverage.md) — sole owner of prune contention, cleanup-owner alternatives, and direct real-Postgres prune coverage.
- [DEBT-135 (archived)](../_archive/debt/debt-135-rate-limit-client-ip-trust-boundary-hardening.md) — resolved header trust/spoofing; does not address real source-IP cardinality.
- [DEBT-424 (archived)](../_archive/debt/debt-424-rate-limit-idempotent-actions-on-cache-miss-only.md) — built `beforeExecute`, explicitly left end/finalize/mark without limiters, and requires replays to bypass admission checks.
- [DEBT-408 (archived)](../_archive/debt/debt-408-clerk-ui-solana-react-native-subtree.md) and [DEBT-437 (archived)](../_archive/debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) — ACCEPT-process precedents only.
- [DEBT-332 (archived)](../_archive/debt/debt-332-security-posture-audit.md) — health work removed timestamp disclosure; it did not evaluate probe ordering.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
