# Bug Reports

**Project:** Naltrexone University
**Last Updated:** 2026-06-30 (**BUG-264 resolved + prod-verified** — stale independently keyed "Remove bookmark" surfaces could remove then re-add a bookmark because the server mutation toggled current state instead of applying an idempotent desired-state write. Fixed by replacing the toggle use case/controller with an idempotent `setBookmark` desired-state write (add/remove idempotent in both directions; remove no longer requires a published question; the bookmarks page and in-place practice/review surfaces send explicit bookmark intent); repository and port unchanged. Shipped via PR #540 (squash `ca17b5f6`) → promoted via PR #541 (merge `72dd2aff`); production deploy `dpl_22bpJvPoiZWKHZFPj6Dw1JioqdaG` (`72dd2aff`) verified READY (`addictionboards.com` HTTP 200, `/api/health` `{"ok":true,"db":true}`). Active Bugs register empty; Next Bug ID BUG-265.)

---

## What are Bug Reports?

Bug reports document issues discovered in the codebase along with their root cause, fix, and verification. They serve as:

1. **Issue Tracking** — Formal record of what went wrong and how it was fixed
2. **Regression Prevention** — Ensure we don't reintroduce the same bugs
3. **Knowledge Base** — Help future developers understand past issues

**Next Bug ID:** BUG-265

**Latest follow-up (2026-06-28) — BUG-260 completion resolved (no new bug ID):**
- [BUG-260](../_archive/bugs/bug-260-question-feedback-trusts-client-context-ids.md)'s original fix shipped + prod-verified + archived, but a post-archive re-audit found one residual both-ID context gap: a standalone owned attempt for the feedback question could still be paired with an unrelated owned session that also contained that question. Completion branch `fix/bug-260-feedback-context-completion` tightened `validateFeedbackContext` so both IDs require direct attempt membership in the supplied session or a verified standalone session-review retry (`retryOrigin=session_review` and matching `retrySessionId`). The retry exception is required by the real question-page session-review "Try Again" flow, which creates a standalone retry attempt while feedback still carries the reviewed session id. Regression coverage rejects the incoherent standalone/session pair at the helper level and through both feedback use cases. Shipped via PR #524 and promoted via PR #526; production smoke passed 2026-06-28.

**Latest sweep (2026-06-25) — broad adversarial P0–P4 sweep (~14 surfaces):** swept notifications/bookmarks/tags, dashboard/stats/history, Clerk/webhooks/entitlement, cron/reconciliation, error-handling/logging/PII, frontend hooks/state, content/markdown/XSS, CAS/transaction-integrity, schema/constraints/mappers, routing/redirects/caching, env/config + rate-limiter, build/headers/CSP/assets, content/seed/parse pipeline, and accessibility. **1 filed bug: BUG-262** (P4, cron drain starvation). Every other surface was clean or already-tracked; each candidate was graded from ground truth before filing — a claimed P3 "Stripe secret key + customer PII in logs" was **dismissed as a false positive** (the Stripe SDK error carries no outgoing `Authorization`/secret key, and the `retrieve`-by-id path carries no PII). Minor self-healing/latent items were noted but not filed (frontend navigator-mislabel + count-error Start; content-pipeline L1/L2 canonicalization, unreachable with current content). One accessibility P4 (answer-verdict live-region announcement timing) is under separate owner review.

**Latest manual report (2026-06-23) — Practice corners and adjacent-system follow-up sweep:**

**Methodology:**
- Read prior art first: `docs/bugs/index.md`, archived BUG-251..258, and the known non-refile registry for active-exam visibility, BUG-137 renewal boundaries, BUG-253, BUG-250, BUG-257 out-of-band publication-state cases, and prior Stripe/billing Audit #21.
- Split the sweep across practice stats/history/tags/quick-start/resume, bookmarks/feedback/export/notifications, Clerk/entitlement/cron/idempotency/rate limiting, and performance/concurrency/observability.
- For each candidate, traced a real entry point through controller/schema/use case/repository or UI sink with current file:line anchors, then ran an independent skeptic pass that tried to refute reachability, harm, and prior-art uniqueness.
- Filed only candidates that survived with concrete user/operator harm. All survivors are P4 because each is narrow, recoverable, or metadata-hardening rather than score/security/data-loss.

**3 new bugs filed (BUG-259..261):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| [BUG-259](../_archive/bugs/bug-259-in-place-rate-limit-errors-cache-idempotency-retries.md) | Idempotency / rate limiting / answers / bookmarks / feedback | P4 | In-place answer/bookmark/rating/report rate-limit errors are cached under the reused idempotency key, so retry can stay stuck after the limiter window resets |
| [BUG-260](../_archive/bugs/bug-260-question-feedback-trusts-client-context-ids.md) | Question feedback / analytics metadata | P4 | Rating/report actions persist client-supplied attempt/session context IDs without ownership or question/session validation |
| [BUG-261](../_archive/bugs/bug-261-history-sessions-out-of-range-offset-shows-empty-state.md) | History / session pagination UI | P4 | Out-of-range session-history pages with `total > 0` render the true-empty "No completed sessions yet" state |

**Coverage ledger:**

| Surface | Result |
|---------|--------|
| Dashboard/stats aggregates and streaks | Clean: shared active-exam visibility predicates still apply to counts, recent activity, and answered-at inputs; no divide-by-zero or denominator drift survived tests/source review |
| Session history projections | Found BUG-261 in the sessions-tab UI sink; repository count/page shape and summary math were otherwise clean |
| Attempted-question history/filtering | Clean: list and count paths apply the same filters; questions tab already handles out-of-range pages with recovery |
| Question feedback/rating/export | Found BUG-260 context-integrity gap; BUG-250 CSV formula injection remains fixed, default export redacts user IDs and omits comments unless explicitly requested |
| Answer submission and bookmarks in practice/review | Found BUG-259 through the in-place idempotency/rate-limit interaction; user scoping and stale-load guards otherwise held |
| Tag/taxonomy selection and quick practice | Clean: visible tag-kind filtering, candidate sorting/shuffling, status pools, and empty-result handling matched tests and ordering policy |
| Tutor mode and session start/resume | Found the BUG-259 answer-submit rate-limit/idempotency retry wedge; immediate grading, retry semantics, incomplete-session conflict, quick-start idempotency/stale-response guards, and expired-exam summary recovery otherwise held |
| Clerk lifecycle/webhooks | Clean: `verifyWebhook(req)` is live, event claim/locks/tombstones/pending Stripe cancellation drain cover replay/deletion races |
| Entitlement/access gating | Clean by current product rule: app layout and every app-data server action require `requireEntitledUserId`; no bypass found |
| Cron/reconciliation | Clean: Vercel cron exists, auth runs before config/rate/work, all-pages job reports early stop; DEBT-422 covers resume/keyset concerns |
| Stripe replay and billing idempotency | Clean against prior Audit #21 fixes: subscription-write guard prevents stale terminal overwrites; checkout/open-session idempotency and duplicate-sub cancellation remain covered |
| Performance/concurrency/observability | Clean: bounded sessions plus set-based fetches avoid counted N+1s; CAS updater and monotonic draft guard held; no answer-key/comment/PII logging sink survived grep and trace |

**Refuted candidates deliberately NOT filed (with why):**
- **Active exam attempts leaking into stats/history:** refuted by `getActiveExamVisibilityCondition()` usage in aggregate/recent/streak/history queries and prior BUG-187/235/236/237 coverage.
- **Session accuracy denominator drift:** refuted by shared question-count denominator behavior in summary/history and tests for exam, tutor, and zero-answered sessions.
- **History question filters/count mismatch:** refuted because page filters flow into both attempted-question list and count SQL.
- **Diagnosis tags in history filters:** refuted by the visible-kind allowlist for `topic` / `substance` / `treatment` and direct page coverage.
- **Quick-practice and start-session full candidate-pool fetch:** refuted as intentional ordering-policy behavior, not a counted N+1; current content size is finite and persisted session size is capped at 200.
- **Review/completed-feedback N+1:** refuted by set-based question/session-attempt fetches before bounded per-row mapping.
- **Session-state lost update or stale draft overwrite:** refuted by CAS `params_json` compare/retry and repository monotonic cumulative draft guard.
- **Missing await/unhandled rejection in practice async flows:** refuted by transition wrappers, fire-and-forget catch handlers, and action-result error paths.
- **Question feedback CSV formula injection or default privacy leak:** refuted by BUG-250 escaping and default export redaction/comment omission.
- **Feedback report comment logging:** refuted; failure logs include error/question/category but not free-text comments, and tests cover omission.
- **Clerk webhook dummy-secret bypass, deletion replay, and resurrection races:** refuted by live `verifyWebhook(req)`, event claim/processed checks, locks, tombstones, and drain job.
- **Practice entitlement bypass:** refuted; protected layout and server actions independently enforce entitlement, and the domain check requires an entitled status plus unexpired period.
- **Cron auth/config leak or missing schedule:** refuted; `vercel.json` schedules the job and auth precedes rate limiting and work.
- **Stale Stripe webhook/checkout-success replay overwriting active entitlement:** refuted by the shared subscription-write guard and checkout-success fallback to the protected current row.
- **Concurrent two-tab checkout duplicate subscriptions:** refuted by deterministic Stripe idempotency keys plus open-session reconciliation.
- **Reconciliation early-stop without automatic resume:** known DEBT-422 observability/resume policy, not a new bug.
- **Billing idempotency replay consuming rate limit before cache replay:** prior-art accepted ordering for billing; relevant only as the safe contrast for BUG-259.

**Latest manual report (2026-06-23) — Practice/quiz engine correctness, clock, lifecycle, async, observability, performance sweep:**

**Methodology:**
- Read prior-art first: `docs/bugs/index.md`, archived BUG-251..257, and adjacent archived debt before filing. Honored the known non-refile list: BUG-251..257, BUG-253 withdrawn, active-exam visibility BUG-187/235/236/237, BUG-137 renewal boundary, and the synthetic `allowExamCommit` false positive.
- Read representative tests before judging behavior: finalization/draft save use-case tests, controller schema tests, timer/page-model browser tests, review/summary tests, repository state/attempt tests.
- Traced the practice engine from real entry points: `PracticeView`/page-model hooks → shared question-flow actions → controllers/Zod schemas → use cases → Drizzle/fake ports → domain grading/statistics.
- Ran eight lenses explicitly: scoring/grading, timing/clock, lifecycle/interruption, move-aways/client async, state/concurrency, observability, performance/jank, and incorrect programming/boundary.
- For each candidate, did a skeptic pass: reachable user action, concrete harm, not prior-art, and line-level sink trace.

**1 new bug filed (BUG-258):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| [BUG-258](../_archive/bugs/bug-258-server-expired-draft-save-client-clock-skew-omits-selection.md) | Practice / exam clock / draft finalization | P3 | Server-expired draft-save failure can be ignored when the browser clock lags, leaving the selected answer local-only and later omitted — **RESOLVED + archived 2026-06-23** |

**Surfaces confirmed clean (with evidence):**
- **Scoring/grading:** `gradeAnswer` validates selected-choice membership and exactly one correct choice; `FinalizeExamAnswersUseCase` records omitted attempts for null persisted drafts; attempt schema enforces selected-vs-omitted XOR and omitted-implies-incorrect; summary/history project from session state and persisted `endedAt`.
- **Timing bounds:** BUG-238 remains covered by controller `.max(MAX_DRAFT_CUMULATIVE_MS)`, use-case clamp, repository monotonic draft guard, and finalization cap; BUG-255's `computeFinalExamEndedAt` preserves `endedAt >= latestAnsweredAt`.
- **Lifecycle/idempotency:** active-exam generic `endPracticeSession` is server-rejected; abandon hard-deletes through discard; finalize rejects ended sessions and unique `(practice_session_id, question_id)` prevents duplicate final attempts; idempotency keys protect controller repeats.
- **Authorization/boundary:** practice/question controllers derive `userId` from `requireEntitledUserId`, schemas are strict and UUID-bounded, `SaveExamDraftAnswerUseCase` proves session membership before session-owned question reads, and repositories scope session reads/writes by `id + userId`.
- **Navigation/order:** explicit/session navigation clamps indexes and returns `null` on true no-question states; BUG-256's bootstrap recovery handles expired-session `ok(null)` to summary; completed-session review navigation has prior BUG-226 coverage.
- **Concurrency/state:** Drizzle session-state CAS validates membership, refuses ended sessions, compares `params_json`, and retries boundedly; draft save monotonicity prevents stale/lower cumulative overwrites.
- **Performance/jank:** review, completed feedback, history, stats, and finalization use set-based question fetches; sessions are bounded at 200 questions; no concrete N+1 or unbounded render/query artifact survived.
- **Observability:** server action errors flow through `toActionResult` logging, client async failures use `reportClientError`, missing question read models log structured warnings, and no answer-key/PII leakage was found in practice-flow logging.

**Uncertain candidates deliberately NOT filed (with why):**
- **Plain reload/close after selecting an unsaved exam answer:** real local state loss, but no current product invariant promises save-on-every-radio-click; existing design saves on in-app question/review navigation. Classified as product/debt unless the owner chooses autosave-on-selection semantics.
- **Browser clock ahead of server on timer expiry:** the final flush can be rejected as "before deadline", but the ordinary draft save should still succeed before the server deadline, preserving the selection for later finalization. UI friction, not confirmed score loss.
- **Active `getNextQuestion` still uses published-only reads for serving a session question:** same out-of-band publication-state class as BUG-257, no in-app unpublish/delete trigger, and BUG-257 deliberately fixed write paths without relaxing public browsing/discovery. Not refiled.
- **Mark-for-review after server deadline under client clock skew:** mark state can change until session end, but it has no scoring/progress integrity impact and finalization remains server-authoritative.
- **Question deletion cascading historical attempts:** no in-app delete/status mutation path exists; BUG-257's reachability analysis covers publication/content operations as out-of-band P4 hardening, not a new user-triggerable bug.
- **CAS retry count/backoff:** bounded immediate retry is an intentional optimistic-concurrency pattern documented in prior false-positive registries; no lost-update trace survived.
- **Large-session review/finalize jank:** bounded by `MAX_PRACTICE_SESSION_QUESTIONS = 200` and set-based fetches; no measured or counted artifact supports a performance bug.

**Latest archival (2026-06-29) — BUG-263 resolved (duplicate subscription canonicalization could prefer a non-entitled row over a current paid subscription):**
- [BUG-263](../_archive/bugs/bug-263-billing-canonicalization-prefers-non-entitled-duplicate-subscription.md) (P2) **RESOLVED + archived (2026-06-29):** the daily production Stripe reconciliation cron (`vercel.json` `dryRun=false&scope=all`) selected a customer's canonical subscription from the blocking set (`active`/`trialing`/`past_due` **and** non-entitled `unpaid`/`incomplete`/`paused`) by latest `currentPeriodEnd` only, with no entitlement ranking. A non-entitled duplicate with a later period end could therefore be persisted as the user-keyed row (revoking app access, since `unpaid`/`paymentProcessing`/`paused` are non-entitled) and the active paid subscription canceled at Stripe; the shared `shouldPersistSubscriptionWrite` guard had the same gap (it blocked only terminal incoming), so Stripe webhooks and checkout-success sync could likewise let a different non-entitled subscription overwrite a current entitled row. Narrow precondition (needs a duplicate blocking subscription with a later period end; BUG-245 closed the main in-app duplicate path) but concrete automated money + access harm, hence P2. **Fix:** a shared domain entitlement-tier canonical ordering (`compareCanonicalSubscriptionCandidates`: entitled tier → later `currentPeriodEnd` → deterministic id) consumed by both reconciliation Phase 3 and the write guard, surfaced to adapters through an application seam; a different subscription may supersede a current entitled row only if it is itself entitled and ranks higher, while same-subscription lifecycle transitions and recovery over a non-entitled stored row are preserved. TDD: RED-first reconcile non-entitled-duplicate (plus dryRun and `incomplete`/`paused` variants) + the flipped write-guard contract + webhook/checkout-success regressions + a domain comparator unit test; full gate green (typecheck, lint, unit 3029, build). Shipped via PR #528 (squash `19d0a215` on `dev`; CodeRabbit incremental review covered the exact head `38e1ab31`, "No actionable comments", 0 unresolved threads) → promoted to `main` via PR #529 (merge `9021887a`; required `test` check green, CodeRabbit `APPROVED` on the exact head `19d0a215`, 0 unresolved threads); production deploy `dpl_HvgfaMzTPZtZm1uwyJn38zuyLuqM` (commit `9021887a`) verified READY 2026-06-29 (`addictionboards.com` HTTP 200, `/api/health` `{"ok":true,"db":true}`); `main` and `dev` trees identical. **Active Bugs register is empty; Next Bug ID BUG-264.**

**Latest archival (2026-06-25) — BUG-262 resolved (first-page reconcile failure starves the deleted-account cancellation drain):**
- [BUG-262](../_archive/bugs/bug-262-reconcile-page0-failure-starves-cancellation-drain.md) (P4) **RESOLVED + archived (2026-06-25):** the daily billing cron ran `reconcileAllStripeSubscriptionPages` and `drainPendingStripeCancellations` in one shared `try` (reconcile-first); the all-pages orchestrator re-throws on a true page-0 reconcile failure (e.g. the `listLocalSubscriptions` query throwing — NOT a caught row-level Stripe error), so the deleted-account cancellation drain (BUG-246's safety net) was skipped for that cron cycle, leaving a deleted user's Stripe subscription billable an extra ~24h. Self-healing next run, no state corruption, hence P4. **Fix:** decouple reconcile and the drain into separate `try`/`catch` blocks, and mark `drainFailed = (drain throws) || (drain.failed > 0)` so a partial drain failure also surfaces as 500 (reconcile keeps throw-only semantics — per-row reconcile failures are routine eventual-consistency, retried next run). TDD: still-drains-on-reconcile-throw + drain-throw + partial-drain-failure tests + the updated existing throw tests; full gate green (unit 2997, build). The only filable survivor of a broad ~14-surface adversarial P0–P4 sweep. Shipped via PR #520 (squash `5aac1d5d` on `dev`; CodeRabbit `APPROVED` the route fix on head `f79c3a57`, then a Major partial-drain-failure finding + a doc/index re-audit correction were addressed) → promoted to `main` via PR #521 (merge `f40b1904`; CodeRabbit `APPROVED` the corrected doc on the exact promo head `c91c7450`, 0 unresolved threads); production deploy `dpl_BGQQppuN4vaiozxrocgbuXjrDi7t` (commit `f40b1904`) verified READY 2026-06-25 (`addictionboards.com` HTTP 200); `main` and `dev` trees identical.

**Latest archival (2026-06-25) — BUG-260 resolved (question feedback trusted client-supplied attempt/session context IDs):**
- [BUG-260](../_archive/bugs/bug-260-question-feedback-trusts-client-context-ids.md) (P4) **RESOLVED + archived (2026-06-25):** `rateQuestion` / `submitQuestionReport` accepted optional client-supplied `attemptId` / `practiceSessionId` with only UUID-shape validation and persisted them unchanged — the use cases verified only that the question was published, never that the attempt/session belonged to the caller, matched the feedback question, or contained it — so an authenticated, entitled user could attach feedback to an unrelated existing attempt/session and corrupt the SPEC-041 mode/correctness-correlation metadata the feedback export emits. Recoverable operator-export metadata pollution only (no score corruption or cross-user app-read disclosure; the honest UI sends server-derived context), hence P4. **Historical fix:** a shared `validateFeedbackContext` application helper, with `AttemptRepository` + `PracticeSessionRepository` injected into both use cases — a present `attemptId` must be owned by the caller (`findByIdAndUserId`) and its `questionId` must equal the feedback question; a present `practiceSessionId` must be owned by the caller and its `questionIds` must include the question; when both are present and the attempt is session-scoped, the attempt's `practiceSessionId` must match the supplied session. Not-found/not-owned → `NOT_FOUND`; found-but-mismatched → `VALIDATION_ERROR`; null context still allowed; only validated context IDs are persisted. Controller, schema, repository, and export script unchanged. The spec was independently audited + verified accurate against current code immediately before the fix. TDD: helper tests + per-use-case reject/valid/null integration tests, red→green verified (neutering the validator failed exactly the 11 guard tests); full gate green (typecheck, lint, unit 2994, build). Shipped via PR #516 (squash `542eedbc` on `dev`; CodeRabbit `APPROVED` on the exact fix head `3cb21ae2`, "No actionable comments", 0 unresolved threads) → promoted to `main` via PR #517 (merge `602997b9`; the promo's CodeRabbit was rate-limited but its tree was byte-identical to the CR-approved fix head `3cb21ae2` — verified by `git diff 3cb21ae2 origin/main` being empty — so it merged under an owner-authorized override, no unreviewed code shipped); production deploy `dpl_EFeg1cHqhTvdTU2W5bWq5iuyJDDe` (commit `602997b9`) verified READY 2026-06-25 (`addictionboards.com` HTTP 200); `main` and `dev` trees identical. A later #524 completion follow-up fixed the standalone-attempt + unrelated-session residual and preserved the legitimate standalone `session_review` retry path; it shipped and prod-smoked on 2026-06-28.

**Latest archival (2026-06-24) — BUG-259 resolved (in-place rate-limit errors cached under reused idempotency keys):**
- [BUG-259](../_archive/bugs/bug-259-in-place-rate-limit-errors-cache-idempotency-retries.md) (P4) **RESOLVED + archived (2026-06-24):** the in-place answer-submit, bookmark, rating, and report flows ran their rate-limit check **inside** the `executeIdempotent` closure, so a denied `RATE_LIMITED` `ApplicationError` was stored under the client idempotency key and replayed for repeat requests until the row expired — a user could wait out the one-minute window and still get the cached error. **Fix:** hoist each limiter **before** `executeIdempotent` (after auth), matching the deliberate billing-controller ordering (BUG-204); applied to the four in-place surfaces + a consistency hoist of `startPracticeSession`. Controller-side only; action names/keys/schemas/use-case calls unchanged. A spec audit widened scope to include `submitAnswer`. CodeRabbit's valid follow-on — limiter-before-idempotency also gates idempotent **replays** (a replay while rate-limited returns `RATE_LIMITED` instead of the stored result) — is transient/self-healing and consistent with billing; the ideal "rate-limit on cache-miss only" semantics is tracked as **DEBT-424** (filed + independently audited in the same PR). TDD: per-surface RATE_LIMITED-not-cached (red→green) + success-still-idempotent + use-case-error-still-cached guards; gate green (unit 2948, build). Shipped via PR #508 (squash `e8c74fea` on `dev`; CodeRabbit `APPROVED` the code on head `1638cc55`, 0 unresolved threads; post-approval delta docs-only — DEBT-424 + doc nit — CR of that differential waived by owner) → promoted to `main` via PR #509 (merge `c72c01ab`). Vercel's git integration **skipped** the production build for the merge commit (build-dedup against the byte-identical `dev` preview `e8c74fea`), so production was force-redeployed with `vercel deploy --prod`; production deploy `dpl_EpnW95vSdj24jj6WymRTwdKbwQXg` (commit `c72c01ab`) verified READY 2026-06-24 (`addictionboards.com` HTTP 200); `main` and `dev` trees identical. **BUG-260 is now the only open bug** (P4; see Active Bugs). **DEBT-424** (rate-limit on cache-miss only) is the tracked follow-up in `docs/debt/`.

**Latest archival (2026-06-23) — BUG-261 resolved (out-of-range session-history page showed a false empty state):**
- [BUG-261](../_archive/bugs/bug-261-history-sessions-out-of-range-offset-shows-empty-state.md) (P4) **RESOLVED + archived (2026-06-23):** `/app/history?tab=sessions` with a valid but out-of-range `offset` (repository returns `rows: []` with `total > 0`) rendered the true-empty "No completed sessions yet." + "Go to Practice" state because `HistorySessionsTab` checked `rows.length === 0` before reading `total`, telling a user who has completed sessions that they had none. Recoverable UI misinformation only (no data/score/security impact), hence P4. **Fix:** read `{ rows, limit, offset, total }` before the empty branch and split it, mirroring `HistoryQuestionsTab` — `total === 0` keeps the true-empty state, while `total > 0` renders "No more sessions on this page." + a "Back to first page" link (`buildHistorySessionsHref({ limit, offset: 0, mode: modeFilter })`, preserving the mode filter and limit). UI-only; the in-range pagination path is unchanged. TDD: a new out-of-range test (red-before-green, verified against the parent commit) plus the existing true-empty test; full gate green (typecheck, lint, unit 2936, build). Shipped via PR #504 (squash `b3bbf76f` on `dev`; CodeRabbit `APPROVED` on the exact fix head `ad2db641`, 0 unresolved threads — two quick-win test findings addressed: `@/` alias import + canonical `tests/shared/dom-helpers`) → promoted to `main` via PR #505 (merge `7466dfe9`; the promo's CodeRabbit was rate-limited but its tree was byte-identical to the CR-approved fix head `ad2db641` — verified by tree-hash equality — so it merged under an owner-authorized override, no unreviewed code shipped); production deploy `5175666513` verified READY 2026-06-23 (`addictionboards.com` HTTP 200); `main` and `dev` trees identical. **BUG-259 and BUG-260 remain open** (P4; see Active Bugs).

**Latest archival (2026-06-23) — BUG-258 resolved (server-expired draft save dropped the final selection under client clock skew):**
- [BUG-258](../_archive/bugs/bug-258-server-expired-draft-save-client-clock-skew-omits-selection.md) (P3) **RESOLVED + archived (2026-06-23):** in an active timed exam, a manual draft-saving control (Review & Submit / Next / Previous) invoked after the server deadline while the browser clock lagged decided expiry from `Date.now()` instead of honoring the server's `CONFLICT: Exam time has expired`, so the captured on-screen selection was neither persisted nor flushed; a reload before the local timer self-healed then finalized the question as omitted (permanent wrong score). The timer stays active through the error state, so self-healing bounded the harm to a reload inside the skew window — hence P3, not P2. **Fix:** typed the exam draft-save seam (`ExamDraftSaveResult = { ok: true } | { ok: false; code }`) so the server's CONFLICT — not the browser clock — drives expiry recovery: `onEndSession` (browser-clock `Date.now()` gate removed) and the nav handlers `onNavigateQuestion`/`onNextQuestion` (via a page-model expiry callback guarded against re-finalizing during post-exam review) flush the captured `finalDraftAnswer` to the server-authoritative `finalizeExamAnswers`; non-`CONFLICT` failures still surface an error. App-layer hooks only; `SaveExamDraftAnswerUseCase`, the finalize grace window, and all server use-cases are unchanged. TDD: skew browser tests for Review & Submit + next-question + explicit navigation (clock held behind the deadline → finalize-with-draft), plus guard and non-`CONFLICT` coverage; full gate green (2935 unit + 312 browser + integration + build + 36 e2e). Shipped via PR #498 (squash `bf653f5a` on `dev`; CodeRabbit clean on the fix head `f966aebf` — "No actionable comments", `reviewDecision` APPROVED, 0 unresolved threads) → promoted to `main` via PR #499 (merge `cf7b88a7`; required `test` / `codecov/patch` / `Vercel` checks green; the promo's CodeRabbit was rate-limited but its tree was byte-identical to the CR-clean fix head, so it merged under an owner-authorized override — no unreviewed code shipped); production deploy `5172902620` verified READY 2026-06-23 (`addictionboards.com` HTTP 200); `main` and `dev` trees identical. This closed the active register at that point in the timeline.

**Latest archival (2026-06-23) — BUG-257 resolved (active-exam writes depended on current publication state):**
- [BUG-257](../_archive/bugs/bug-257-active-session-finalization-depends-on-current-published-question.md) (P4) **RESOLVED + archived (2026-06-23):** active-session draft save / finalize grading / the BUG-254 expiry flush refetched drafted questions via published-only repo reads (`findPublishedById(s)`), so a question unpublished or archived mid-exam threw `NOT_FOUND` and stranded save/submit while read models tolerated it (`isAvailable: false`). No in-app flow triggers it (`QuestionRepository` is read-only; nothing mutates `questions.status` at runtime), hence P4 hardening. Fixed by adding session-scoped, publication-agnostic reads `QuestionRepository.findByIdForSession(id)` / `findByIdsForSession(ids)` (no `status` filter; relations kept; request order preserved) used ONLY after session ownership is proven: `SaveExamDraftAnswerUseCase` gates on `session.questionStates` membership before the non-public lookup (prevents drafting arbitrary archived questions), finalization grades drafted state via the new `fetch-session-owned-questions-by-id.ts`, and the BUG-254 flush validates via `findByIdForSession`; public browsing and candidate selection stay published-only. TDD incl. Drizzle WHERE-predicate introspection (status present on public methods, absent on session methods + request-order preservation), membership-bypass rejection, archived-question grading, cached-reads + integration coverage. Shipped via PR #494 (squash `de29bf32` on `dev`; CodeRabbit went `CHANGES_REQUESTED` → `APPROVED` on the exact head `08f947dd`, 0 unresolved threads, "No actionable comments generated") → promoted to `main` via PR #495 (merge `8acc2964`; required `test` check green; the promo tree was byte-identical to the CR-approved #494 head and was merged under an owner-authorized override of CodeRabbit's review-rate-limit cooldown); production deploy `6kHUtCD6ZT3JZ3n6Fi4j36n81WTv` verified READY 2026-06-23 (`addictionboards.com` HTTP 200); `main` and `dev` trees identical. **BUG-258 is now open** (see Active Bugs).

**Latest archival (2026-06-22) — BUG-255 resolved (Review & Submit stopped the exam timer):**
- [BUG-255](../_archive/bugs/bug-255-review-submit-screen-stops-exam-timer.md) (P4) **RESOLVED + archived (2026-06-22):** the Review & Submit screen disabled the active exam timer (`isTimerActive` required `!reviewStage.review`), so a deadline that passed on that screen did not auto-finalize and a late manual submit stamped an uncapped wall-clock `endedAt`/`durationSeconds` (inflating summary + history duration and completed-session `desc(endedAt)` ordering; no score/integrity impact — post-deadline draft saves were already server-rejected). Fixed with a server-authoritative end-time cap in `FinalizeExamAnswersUseCase`: a new pure `computeFinalExamEndedAt({ now, deadline, latestAnsweredAt })` = `deadline === null ? now : min(now, max(deadline, latestAnsweredAt))`, with finalization-created attempts stamped at the capped `answeredAt` except an accepted BUG-254 grace-window flush (which keeps its in-grace `answeredAt` so `endedAt` never precedes a recorded attempt). Threaded optional `endedAt?`/`answeredAt?` through `PracticeSessionRepository.end()` + `AttemptInsertInput` (Drizzle + fakes), defaulting to the repo clock so the tutor `EndPracticeSessionUseCase` is unchanged; summary + history project from the one persisted value. TDD: late-cap / early-unchanged / untimed-null / grace-flush-monotonicity use-case tests + adapter-forwarding + fake tests. Shipped via PR #490 (squash `2a8d1a64` on `dev`; CodeRabbit `APPROVED` on `0fb4243f`, 0 unresolved threads) → promoted to `main` via PR #492 (merge `ce8373ef`; required `test` check green, CodeRabbit `APPROVED` on `2a8d1a64`, 0 unresolved threads); production deploy `dpl_EokBHBs9hG1MgrhWHoCKvviLAgSg` verified READY 2026-06-22 (`addictionboards.com` HTTP 200); `main` and `dev` trees identical. **BUG-257 remains open** (P4; see Active Bugs).

**Latest archival (2026-06-22) — BUG-256 resolved (expired-exam resume empty state):**
- [BUG-256](../_archive/bugs/bug-256-expired-exam-resume-shows-empty-question-state.md) (P3) **RESOLVED + archived (2026-06-22):** resuming an expired exam finalized server-side via `getNextQuestion` (which returns `null`) but left the client on the generic "No more questions found" card instead of the summary. Fixed with an app-layer null-question recovery hook (`runLoadQuestionFlow` → `recoverBootstrapSummaryAfterNullQuestion`): on a bootstrap-fallback `ok(null)` it re-reads the server-authoritative summary before the empty state commits, then renders results — read-only and idempotent (no extra finalize/end mutation), request-id/unmount-race guarded, and scoped so normal in-session navigation nulls keep the existing empty state. `GetNextQuestionUseCase`'s `null` contract is unchanged; browser + unit coverage added. Shipped via PR #479 (squash `b848a778` on `dev`; CodeRabbit `APPROVED` on `4b480784`, 0 unresolved threads) → promoted to `main` via PR #487 (merge `5f71d9cc`; required `test` check green, CodeRabbit `APPROVED` on `b848a778`); production deploy `dpl_35zefrDS2AX7vi6MTTySDcaZdMTc` verified READY 2026-06-22 (`addictionboards.com` HTTP 200); `main` and `dev` trees identical. **BUG-255/257 remain open** (P4; see Active Bugs).

**Latest archival (2026-06-21) — BUG-254 resolved (active-exam expiry lost selection):**
- BUG-254 (P2) verified fixed and archived to `docs/_archive/bugs/`. At exam-timer expiry the client now passes the on-screen current-question draft into `finalizeExamAnswers`, which re-validates it server-side (ownership, in-session question, choice membership, monotonic `cumulativeMs` clamp) and accepts it only within a 15s post-deadline grace window (`FINALIZE_FLUSH_DEADLINE_GRACE_MS`, one mutation round-trip), then grades it inside the finalize transaction — so a selection made just before zero is graded instead of recorded as omitted. Grading stays server-authoritative and finalize stays idempotent; ordinary post-deadline draft saves are still rejected. 13 targeted flush tests added. Fixed via PR #476 (squash `87650d55` on `dev`) after a CodeRabbit `APPROVED` review on the exact head (`fe6de800`, 0 unresolved threads); promoted to `main` via PR #477 (merge `0bc288fb`) with the required `test` check green and CodeRabbit `APPROVED` on the exact head (`87650d55`); production deploy `dpl_E7C6BeT2QF8dFubtXmu9VaHBrXcT` verified READY 2026-06-21 (`addictionboards.com` HTTP 200); `main` and `dev` trees identical. **BUG-255/256/257 remain open** (see Active Bugs).

**Latest manual report (2026-06-20) — Practice/quiz engine deep sweep follow-up:**
- [BUG-254](../_archive/bugs/bug-254-active-exam-expiry-loses-local-selection.md) (P2) **RESOLVED + archived (2026-06-21):** active exam timer expiry rejected the final draft save yet still finalized, turning a locally selected answer into an omitted incorrect attempt. Fixed with a bounded single-question server-side finalization flush (15s post-deadline grace window, full server-side re-validation, graded inside the finalize transaction). Shipped via PR #476 → `main` PR #477, production deploy verified READY.
- [BUG-255](../_archive/bugs/bug-255-review-submit-screen-stops-exam-timer.md) (P4) **RESOLVED + archived (2026-06-22)** — was: the Review & Submit screen disabled the active exam timer, so expiry did not auto-finalize and a late manual submit inflated recorded `endedAt`/`durationSeconds` only — answers were locked at the deadline (server rejects post-deadline saves), so no score/integrity impact. Fixed with a server-authoritative end-time cap in `FinalizeExamAnswersUseCase` (PR #490 → `main` PR #492, production deploy verified READY).
- [BUG-256](../_archive/bugs/bug-256-expired-exam-resume-shows-empty-question-state.md) (P3) **RESOLVED + archived (2026-06-22)** — was: resuming an expired exam can finalize server-side through `getNextQuestion` but briefly leave the client on "No more questions found" instead of summary/results; recoverable (end-session button + self-heals on reload), data intact.
- [BUG-257](../_archive/bugs/bug-257-active-session-finalization-depends-on-current-published-question.md) (P4) **RESOLVED + archived (2026-06-23)** — was: active exam draft save/finalization refetched currently published questions, a latent hardening gap (read tolerated missing rows, write threw `NOT_FOUND`) with no in-app unpublish/delete trigger requiring an out-of-band content change during an active exam. Fixed with session-scoped, publication-agnostic `findByIdForSession`/`findByIdsForSession` reads gated on proven session membership (PR #494 → `main` PR #495, production deploy verified READY).
- Refuted during this pass: the synthetic browser-probe `allowExamCommit` path is not reachable from the production exam UI because `PracticeView` renders no exam submit-answer button; Review & Submit answer changes persist through draft save on navigation/back-to-review, not through per-question `submitAnswer`.

**Latest archival (2026-06-20) — BUG-252 resolved (unanswered exam draft timing):**
- BUG-252 (P3) verified fixed and archived to `docs/_archive/bugs/`. The exam draft write contract now accepts nullable `selectedChoiceId`, so unanswered time-only drafts persist `draftCumulativeMs` (the client now does a server round-trip on navigation whenever cumulative time advances, even with no choice selected); `FinalizeExamAnswersUseCase` is unchanged and reads the now-correct capped server-side draft timing. BUG-238 cumulative bounds preserved (schema `.max`, use-case clamp, repo monotonic guard, finalize cap); the null-save path cannot null an existing draft choice because the UI selection is hydrated from `draftSelectedChoiceId` on load and exam radios have no deselect. Fixed via PR #472 (squash `2916f416` on `dev`) after a CodeRabbit `APPROVED` review on the exact head (`08787944`, 0 actionable, 0 threads) and full gate green (typecheck, lint, unit 2883, browser 298, integration 112, build, e2e 36); promoted to `main` via PR #473 (merge `d2f96d61`, merged under an owner-authorized override of CodeRabbit's review-rate-limit cooldown justified by #472's approval of the byte-identical tree); production deploy for `d2f96d61` verified READY; `main` and `dev` trees identical. This closed the active register at that point in the timeline.

**Latest archival (2026-06-19) — BUG-251 resolved (exam abandon discard lifecycle):**
- BUG-251 (P2) verified fixed and archived to `docs/_archive/bugs/`. Exam "Abandon" now means true discard: a new `DiscardPracticeSessionUseCase` + `discardPracticeSession` action hard-deletes the incomplete exam session (`DELETE WHERE id / user_id / ended_at IS NULL`, idempotent, exam-only) instead of routing through generic `endPracticeSession`, so a discarded exam no longer persists as a misleading reviewable "completed" session. `EndPracticeSessionUseCase` rejects active-exam ends (defense in depth); tutor abandon is unchanged. Fixed on `dev`, promoted to `main` via PR #464 (merge `d5568288`) after a CodeRabbit `APPROVED` review on the exact head (CHANGES_REQUESTED → fixes → APPROVED) and full gate green (typecheck, lint, unit 2874, browser 298, integration 111, build, e2e 36); production deploy for `d5568288` verified READY; `main` and `dev` trees identical. **BUG-252 (P3) remains open** (deferred — narrow omitted-question timing-accuracy gap).

**Latest manual report (2026-06-18) — Practice/quiz engine correctness sweep:**
- BUG-251 (P2) filed: active exam abandon calls generic `endPracticeSession`, marks the exam completed without final attempts, and persists a discard action as a misleading reviewable session.
- BUG-252 (P3) filed: unanswered exam-question elapsed time is tracked only in browser state and is not persisted, so final omitted attempts can record `timeSpentSeconds = 0`.

**Latest archival (2026-06-18) — BUG-250 resolved (feedback CSV formula injection):**
- BUG-250 (P3) verified fixed and archived to `docs/_archive/bugs/`. `csvCell` in `scripts/export-question-feedback.ts` now prefixes an apostrophe to spreadsheet-formula-capable cells (leading `=`/`+`/`-`/`@`, a raw leading tab/CR/LF, and leading-whitespace bypass forms) before delimiter quoting, and the existing `values.map(csvCell)` path applies it to every CSV column; the `--json` export path is untouched and still emits raw comment text. Fixed via TDD directly on `dev` (no feature branch): fix `b98306a6`, doc `523ae02d`. Full local gate green (typecheck, lint, unit 2859, build) and focused suite 19/19; owner-graded A. Promoted to `main` via PR #460 (merge `d76a3516`); production Vercel deploy for `d76a3516` verified READY; `main` and `dev` trees identical. This closed the active register at that point in the timeline.

**Latest archival (2026-06-16) — BUG-241 resolved (deploy migration enforcement):**
- BUG-241 (P2) verified fixed and archived to `docs/_archive/bugs/`. The fix adds `"buildCommand": "pnpm db:migrate && pnpm build"` to `vercel.json`, so every git-triggered Vercel deploy applies checked-in Drizzle migrations to its environment-scoped Neon branch before serving, failing the build closed on migration error. Merged via PR #453 (squash `ff46fbda` → `dev`) and promoted to `main` via PR #454 (merge `daed8479`); `main` and `dev` trees are identical. Verified live on real Vercel builds: the Preview deploy migrated Neon `dev` and the Production deploy migrated Neon `main`, each logging `[✓] migrations applied successfully!` before `next build`. Neon branch isolation (Production vs shared Preview/Development) was confirmed by a value-free host comparison. `pnpm db:seed` (content) remains a documented manual step. This closed the active register at that point in the timeline.

**Latest manual report (2026-06-13) — AUDIT-012 repository governance blockers filed:**
- BUG-248 (P1) filed: public `main` has no GitHub-enforced merge gate. Requires a human-owned branch-protection/ruleset settings change.
- BUG-249 (P1) filed: GitHub vulnerability alerts and automated security fixes are disabled. Local Dependabot config was repaired, but repository security settings require human action.

**Latest archival (2026-06-13) — Audit #21 BUG-247 resolved (Stripe sweep complete):**
- BUG-247 (P3) verified fixed and archived to `docs/_archive/bugs/`. PR #424 (squash `424df206`, `main` fast-forwarded) routes pricing-page billing-portal failures to `/pricing?portal=error` and adds a `getPricingBanner` branch rendering portal-specific copy ("Couldn't open the billing portal. Please try again."), matching the app-billing sibling and reserving `checkout=error` for genuine checkout failures (its BUG-114 origin). All portal error codes (`INTERNAL_ERROR`/`STRIPE_ERROR`/`RATE_LIMITED`/`NOT_FOUND`) and raw throws share the single configured failure redirect in `manage-billing-core`, so the one-line redirect change covers every path; `UNAUTHENTICATED` → `/sign-up` is unchanged. The branch was cut orthogonally to PR #421 (zero file overlap) and rebased onto the post-#421 dev head before merge. Owner-graded, full local + remote gate green (typecheck, lint, unit 2815, browser 297, integration 111, build, E2E 36), CodeRabbit `APPROVED` on the exact head `c638c376` after a real `CHANGES_REQUESTED` → `APPROVED` cycle. This closed the Audit #21 Stripe/billing sweep (BUG-242..247); subsequent AUDIT-012 filing leaves BUG-248, BUG-249, and BUG-241 active.

**Latest archival (2026-06-12) — Audit #21 BUG-244/246 resolved:**
- BUG-244 (P2) and BUG-246 (P2) verified fixed and archived to `docs/_archive/bugs/`. PR #420 (squash `fac21601`) wired the reconciliation route to a daily Vercel cron (shared `GET`/`POST`, auth + rate-limit before any work) and folded the deleted-account `pending_stripe_cancellations` drain into the same scheduled run (working from the row's stored `stripeCustomerId`); PR #422 (squash `6679cfe2`, `main` synced) flipped the cron to `dryRun=false` to activate it. Production deploy `dpl_GFqkgVoarFVqXbWbsq17Kh6MwtxK` is READY with the `0 8 * * *` cron registered. `CRON_SECRET` was normalized header-safe across all Vercel scopes (the prior Production value was empty, Preview had trailing whitespace) and is now guarded by `scripts/validate-header-safe-secret.ts` + a CI step. Safe to activate immediately because the connected Stripe account has zero subscriptions (pre-revenue). Owner-graded, full gate green + CodeRabbit approved on the exact head. BUG-245 and BUG-247 from the same Audit #21 sweep remain open.

**Latest archival (2026-06-12) — Audit #21 BUG-242/243 resolved:**
- BUG-242 (P1) and BUG-243 (P2) verified fixed and archived to `docs/_archive/bugs/`. PR #419 (squash `6decfb70`, `main` synced) added the shared pure-domain `shouldPersistSubscriptionWrite` guard — called by the advisory-locked Drizzle repo and `FakeSubscriptionRepository` — so a superseded-subscription terminal write can no longer clobber the current entitled row; checkout-success now computes its outcome from the protected row on a skipped write. Owner-graded, full gate + E2E green, CodeRabbit approved on the exact head. BUG-245 and BUG-247 from the same Audit #21 sweep remain open.

**Audit #21 (2026-06-11) — Stripe/Billing Deep Sweep:** 6 confirmed bugs filed (BUG-242..247). Two paired P1/P2 read-model corruptions (a late webhook from a superseded subscription, and a stale `/checkout/success` URL replay) share one root cause — the userId-keyed last-write-wins `subscriptions.upsert` has no subscription-identity/recency guard. Two ops-infra gaps: the reconciliation safety net is never scheduled (BUG-244) and the deleted-account Stripe-cancellation queue has no drain past Svix retries (BUG-246). One concurrent two-tab checkout race creates duplicate live subscriptions (BUG-245). One P3 copy bug (pricing portal failures show checkout-failure copy, BUG-247). See the Audit #21 section below for methodology, the clean-surface list, and uncertain candidates deliberately not filed.

**Latest archival (2026-06-03) — SPEC-041 migration rollout incident remediated:**
- BUG-240 verified fixed and archived: migrations `0019_illegal_warbound` and `0020_fat_ironclad` were applied to the deployed dev/preview and production DBs with `DATABASE_URL=<env> pnpm db:migrate`; read-only verification confirms the `question_feedback` table, all 3 enums, 7 indexes, and migration head `0020`. PR #391 merged with green CI/CodeRabbit, and dev/main are aligned at `704eabbf`.

**Manual report (2026-06-03) — deploy migration enforcement gap remains open:**
- BUG-241 filed (P2): systemic cause — the deploy pipeline had no migration step. CI migrates only its throwaway DB (`ci.yml:37,106`); the `deploy` job is a no-op placeholder (`ci.yml:218-224`); before this PR's `vercel.json` `buildCommand`, Vercel fell back to `package.json` `build=next build` with no `db:migrate`. So every schema-bearing PR could ship code referencing tables that did not exist in the deployed Preview/Development or Production database with fully green CI. BUG-240 was the first outage from this gap; the accepted fix is Vercel Build Command release-phase migration with a DEBT-391-style drift-gate floor.

**Latest archival (2026-04-25) — BUG-238 active-exam draft timing bound:**
- BUG-238 verified fixed (PR #287, merged dev `ee1f801e`): `saveExamDraftAnswer` now rejects oversized `cumulativeMs` at the controller boundary, clamps non-controller use-case calls, and caps legacy oversized drafts during exam finalization. Archived to `docs/_archive/bugs/`.

**Latest manual report (2026-04-25) — post-archive active-exam follow-up:**
- BUG-238 filed: active-exam `saveExamDraftAnswer` accepts unbounded `cumulativeMs`, which can persist impossible draft timing and later make `finalizeExamAnswers` write or compute invalid `timeSpentSeconds`.
- BUG-239 filed: two implicit latest-attempt readers still select raw active-exam attempts before applying visibility semantics, so older visible attempts can be hidden behind a newer active-exam row.

**Latest archival (2026-04-25) — audit-#19 active-exam visibility trilogy resolved:**
- BUG-237 verified fixed (PR #284, merged dev `c71c5deb`): `SubmitAnswerUseCase` now rejects active-exam sessions with `VALIDATION_ERROR` before any `attempts` insert or `recordQuestionAnswer(...)` write. Archived to `docs/_archive/bugs/`.
- BUG-236 verified fixed (PR #285, merged dev `dded5033`): `DrizzleAttemptRepository.listAnsweredAtByUserIdSince(...)` now joins `practice_sessions` and applies `activeExamVisibilityCondition()` so dashboard streak inputs match counts and recent activity. Archived to `docs/_archive/bugs/`.
- BUG-235 verified fixed (PR #286, merged dev `8fe7c74e`): `DrizzleAttemptRepository.latestAttemptRowsSubquery(...)` now filters active-exam attempts before `row_number()` ranking, preserving older visible attempts as the History latest-visible row. Archived to `docs/_archive/bugs/`.

**Manual report (2026-04-24) — active-exam visibility regression sweep:**
- BUG-237 filed: `submitAnswer` still accepts active exam sessions and writes final attempt/session-answer state before `Submit exam`.
- BUG-235 filed: attempted-question History ranks active-exam attempts before applying the visibility guard, so a prior visible attempt for the same question can disappear during an active exam.
- BUG-236 filed: dashboard `Current streak` still reads unfiltered attempt timestamps and can include active-exam attempts before exam end.

**Previous archival (2026-04-09):**
- BUG-234 verified fixed (PR #271): `AuthUserButton` client wrapper isolates Clerk `UserButton` from the server render path; `AuthNav` no longer reaches across the provider boundary. Archived to `docs/_archive/bugs/`.

**Previous archival (2026-04-06):**
- BUG-232 verified fixed (PR #267): `CreatePortalSessionFn` widened to accept `idempotencyKey`, threaded through core/actions/UI; `IdempotencyKeyField` extracted to `components/idempotency-key-field.tsx` as shared component. Archived to `docs/_archive/bugs/`.
- BUG-231 verified fixed (PR #266): `removeBookmarkAction` now parses `idempotencyKey` from FormData and forwards it to `toggleBookmark`; form includes `<IdempotencyKeyField />`. Archived to `docs/_archive/bugs/`.
- BUG-233 verified fixed (PR #265): `startSession(...)` now uses `startSessionIdempotencyKeyRef` to drop stale responses after config changes; config controls disabled during loading. Archived to `docs/_archive/bugs/`.

**Manual report (2026-04-03) — server-action idempotency + stale start sweep:**

- BUG-231 filed: bookmarks remove form action still bypasses bookmark-toggle idempotency, so duplicate submits can re-add the bookmark and redirect with `remove_failed`.
- BUG-232 filed: pricing and app billing manage-billing server actions still drop portal-session idempotency at the UI boundary, so duplicate submits create fresh Stripe portal sessions.
- BUG-233 filed: practice session start allows stale in-flight completions to navigate or error after the user changes the visible session configuration.

**Previous archival (2026-03-23):**
- BUG-230 verified fixed (PR #246): `loadPostExamReview(...)` now uses a monotonic `latestPostExamReviewRequestIdRef` to drop stale retry responses, preventing out-of-order settlement from overwriting newer state. Archived to `docs/_archive/bugs/`.

**Manual report (2026-03-21) — follow-up bug sweep:**

- BUG-230 filed: post-exam review retry path has no request-sequencing guard, so stale retry responses can overwrite newer state in `usePracticeSessionReviewStage`.

**Previous archival (2026-03-21):**
- BUG-229 verified fixed: marketing footer copyright year now derives from UTC via `toISOString().slice(0, 4)`, regression coverage freezes `2026-01-01T00:30:00.000Z` under `America/New_York`, and the bug doc is archived to `docs/_archive/bugs/`.

**Latest archival (2026-03-18):**
- BUG-228 resolved and archived: `parseSentryIngestOrigin()` now extracts the DSN origin at middleware init and adds it to `connect-src`. Browser Sentry transport is unblocked.

**Manual report (2026-03-16) — agent-browser auth + observability sweep:**

- BUG-228 filed: Clerk-owned CSP omits Sentry ingest from `connect-src`, so browser-side error reporting is blocked even when `NEXT_PUBLIC_SENTRY_DSN` is configured.

**Latest archival (2026-03-16):**
- BUG-227 resolved (PR #227): promoted app/marketing header brand to `font-heading`, raised app nav breakpoint from `sm:` to `md:`, added `whitespace-nowrap` to desktop nav links, and archived to `docs/_archive/bugs/`.

---

**Manual report (2026-03-15) — completed-session navigation:**

- BUG-226 resolved (PR #220) and archived.

---

**Audit batch (2026-03-15) — search-param scalar assumption sweep (verified via tracer bullets):**

5 bug docs were filed in this batch (all 5 resolved and archived).

---

**Previous audit batch (2026-03-13) — comprehensive codebase audit (verified via tracer bullets):**

15 bug docs were filed in this batch (all 15 archived: 13 resolved, 2 invalidated). No remaining open bugs from this audit.

---

**Latest archival (2026-03-16):**
- BUG-226 verified fixed (PR #220): session "Next" button in completed sessions now routes through navigator `nextQuestionId` instead of unanswered-only `fromIndex`, restoring forward navigation after completion, and archived to `docs/_archive/bugs/`.
- BUG-223 verified fixed (PR #222): widened bookmarks page `searchParams` to accept `string | string[]`, normalized `error` and `toast` via shared `normalizeSearchParam`, restored remove-bookmark error banners and success toasts for repeated query params, and archived to `docs/_archive/bugs/`.
- BUG-221 stale `docs/bugs/` copy removed (already archived previously).

**Previous archival (2026-03-15):**
- BUG-225 verified fixed (PR #223): replaced 7 ad-hoc `typeof === 'string'` guards with shared `normalizeSearchParam` on the question review page, restoring session/attempt/history context for array-valued query params, and archived to `docs/_archive/bugs/`.
- BUG-224 verified fixed (PR #221): widened practice-session page `searchParams` to accept `string | string[]`, normalized `toast`, `requestedCount`, and `actualCount` via shared `normalizeSearchParam` at the server page boundary, restored session-start and filtered-count toasts for repeated query params, and archived to `docs/_archive/bugs/`.
- BUG-222 verified fixed (PR #219): widened pricing-page `checkout` / `reason` search params to accept `string[]`, normalized both once with shared `normalizeSearchParam`, restored banner selection and the manage-billing CTA for repeated query params, and archived to `docs/_archive/bugs/`.
- BUG-221 verified fixed (PR #217): extracted shared `normalizeSearchParam`, normalized array-valued checkout `session_id` at the page boundary, reused the helper in History and Billing, and archived to `docs/_archive/bugs/`.
- BUG-212, BUG-213, BUG-214 verified fixed (PR #214): client-side error reporting — bookmark toggle, session start, and `runTransitionedAsyncAction` now log/report errors unconditionally with try/catch-hardened callbacks and mount-safe ordering, archived to `docs/_archive/bugs/`.
- BUG-215, BUG-219, BUG-220 verified fixed (PR #215): dead code cleanup — consolidated `StripeSubscriptionStatus` to adapter-owned source, removed unused `SkipAuthGateway`, strengthened weak test assertions, archived to `docs/_archive/bugs/`.
- BUG-207, BUG-210, BUG-217 verified fixed (PR #213): boundary hardening — cron auth ordering prevents config state leak, injectable clock for deterministic checkout session tests, UUID validation on `getPreviousAttempt` questionId, archived to `docs/_archive/bugs/`.
- BUG-206 and BUG-218 verified fixed (PR #212): adapter error wrapping consistency — raw DB errors now wrapped in `ApplicationError` with `{ cause }`, idempotency parse errors now preserve original cause, archived to `docs/_archive/bugs/`.
- BUG-208 and BUG-209 verified fixed (PR #210): Clerk webhook deletion races and replay resurrection resolved with transaction seams, event dedup, tombstones, and per-user advisory locks, archived to `docs/_archive/bugs/`.
- BUG-211 and BUG-216 invalidated (false positives from audit batch): count-aggregate fallbacks are dead defensive code, health handler Drizzle import is spec-mandated framework-layer code, archived to `docs/_archive/bugs/`.

**Previous archival (2026-03-11):**
- BUG-205 verified fixed (PR #199): reconciliation canonical selection short-circuit removed, always sorts full blocking set by period-end + deterministic tie-break, archived to `docs/_archive/bugs/`.

**Previous archival (2026-03-10):**
- BUG-204 verified fixed (PR #193): rate limiting and idempotency added to portal session creation, archived to `docs/_archive/bugs/`.
- BUG-203 invalidated after package-level tracer-bullet verification of Clerk `verifyWebhook()`, archived to `docs/_archive/bugs/`.

**Earlier archival (2026-03-09):**
- BUG-199 invalidated after tracer-bullet verification, archived to `docs/_archive/bugs/`.
- BUG-200 reclassified as DEBT-286, archived to `docs/_archive/bugs/`.
- BUG-201 and BUG-202 verified fixed (commit `a8ce087c`), archived to `docs/_archive/bugs/`.

**Earlier archival (2026-03-03):**
- BUG-186, BUG-187, BUG-188 verified fixed (PR #164), archived to `docs/_archive/bugs/`.
- BUG-189, BUG-190, BUG-191 verified fixed (PR #166), archived to `docs/_archive/bugs/`.
- BUG-192, BUG-193, BUG-194 verified fixed (PR #165), archived to `docs/_archive/bugs/`.
- BUG-195, BUG-196, BUG-197, BUG-198 verified fixed (PR #167), archived to `docs/_archive/bugs/`.

**Earlier archival (2026-03-02):**
- BUG-182, BUG-183, and BUG-184 verified fixed (PR #163), archived to `docs/_archive/bugs/`.
- BUG-180, BUG-181, and BUG-185 verified fixed (PR #162), archived to `docs/_archive/bugs/`.
- Audit #8: all 12 bugs (BUG-167..179, excluding false-positive BUG-174) verified fixed, archived to `docs/_archive/audits/audit-008-deep-codebase-sweep.md`.
- BUG-165 and BUG-166 verified fixed (PRs #146, #147), archived to `docs/_archive/bugs/`.
- BUG-160 through BUG-164 verified fixed, merged (PR #144), and archived to `docs/_archive/bugs/`.

## Active Bugs

| Bug | Severity | Component | Summary |
|-----|----------|-----------|---------|
| _None_ | - | - | No active bugs currently tracked. |

## Audit #21 — Stripe/Billing Deep Sweep (2026-06-11)

Adversarial walk of the **entire Stripe surface** after the DEBT-410…415 free-trial campaign and the DEBT-413 `FREE_TRIAL_ENABLED` flag removal, focused on the owner's hypothesis that **state transitions** hide the bugs: trial→paid, trial→canceled (no card), cancel, payment lapse (past_due/unpaid), start/stop/resubscribe, monthly⇄annual, paused/resumed. Every confirmed finding has a line-level tracer-bullet trace from a real entry point (server action / webhook route / cron / page render) and was rechecked for trace validity, reachability + Stripe semantics, and prior-art/registry collisions. 8 candidate findings were generated; 6 survived, 2 were refuted as duplicate refiles of already-known candidates.

**Methodology:**
- Read the false-positive registry (`index.md` "Findings Confirmed as NOT Bugs" sections) and grepped `docs/_archive/bugs/` + `docs/_archive/debt/` before filing, honoring the do-not-refile list (BUG-077 paymentProcessing, BUG-137 boundary, BUG-148/149/198 idempotency, BUG-205 reconciliation winner, DEBT-383/384/385/386, Audit #4/#7/#13 rejections).
- Read the representative tests for each surface to learn intended behavior before judging.
- Rechecked the transition matrix + cross-cutting seams (webhook auth ordering, cron auth, entitlement gates, URL construction, env validation, `trialEndsAt` consistency, idempotency), producing a structured finding set + a clean-surface list.
- Per candidate, revalidated the trace, reachability + Stripe semantics, and prior-art/registry status. Every cited `file:line` was re-opened against the live tree.

**6 new bugs filed (BUG-242..247):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| [BUG-242](../_archive/bugs/bug-242-stale-subscription-webhook-overwrites-active-row.md) | Billing / webhook state machine | P1 | Late webhook from a superseded subscription overwrites the active row (no identity/recency guard on the userId-keyed upsert) |
| [BUG-243](../_archive/bugs/bug-243-checkout-success-replay-overwrites-active-subscription.md) | Billing / checkout-success eager sync | P2 | Stale `/checkout/success` URL replay overwrites the newer active subscription (writes before the entitlement check) |
| [BUG-244](../_archive/bugs/bug-244-reconciliation-cron-never-scheduled.md) | Billing / reconciliation / infra | P2 | Reconciliation safety net never runs — no scheduler invokes the POST-only, `dryRun`-default route |
| [BUG-245](../_archive/bugs/bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) | Billing / checkout race | P2 | Concurrent two-tab checkout creates duplicate live subscriptions; per-tab UUIDs bypass the deterministic-key collapse |
| [BUG-246](../_archive/bugs/bug-246-deleted-account-stripe-cancellation-no-drain.md) | Billing / Clerk deletion | P2 | Deleted-account Stripe cancellation has no drain past Svix retries; cascade-deleted rows hide the orphan |
| [BUG-247](../_archive/bugs/bug-247-pricing-portal-failure-shows-checkout-error-copy.md) | Billing / pricing copy | P3 | Pricing portal failures show checkout-failure copy for a non-checkout action |

**Two refuted (duplicate refiles, not factually wrong):** a finder independently re-derived the unscheduled-reconciliation gap and the deleted-account drain gap; both are real and now filed once as BUG-244 and BUG-246 respectively (not double-counted).

**Surfaces confirmed clean (with evidence):**
- **Trial lifecycle (rows 1–6, 20):** trial_period_days=7 reaches Stripe for both monthly and annual with `payment_method_collection: 'if_required'` + `missing_payment_method: 'cancel'`; `metadata.user_id` preserved; `trialEndsAt` derived only while `inTrial` from `currentPeriodEnd`, single source across check-entitlement and the app-shell countdown; price↔plan mapping inverse-consistent both directions; trial-end revocation is exact because `isEntitled` requires `currentPeriodEnd > now`. All trial events (`created/updated/deleted/paused/resumed/trial_will_end/pending_update_*` + checkout/invoice refs) are handled and converge on retrieve-current-state.
- **Payment failure (rows 7–9, 18):** `pastDue` grace is bounded by `currentPeriodEnd` and ends at Stripe's dunning verdict; `pastDue→active` recovery is event-complete; no `unpaid`/`paused` lockout state exists (every shape converges on the portal, which needs only the customer mapping, not entitled status); `getTrialDaysLeft` clamp/ceil is correct at clock edges. (The renewal-seam eventual-consistency window — a paid `active` user briefly redirected if `subscription.updated` is delayed — is the architecture-wide BUG-137 boundary, pre-adjudicated, not refiled.)
- **Plan switch / rare states (rows 12–15):** monthly⇄annual portal switch syncs correctly via priceId→plan; fresh-checkout plan switch is correctly blocked and no UI offers it; `paused` is unreachable in this product (no `pause_collection`, trial end_behavior is `cancel`) and harmless if forced; `pending_update_*` handled and untriggerable; refunds/disputes correctly no-op locally (mirrors Stripe; owner cancel+refund still syncs via `deleted`); `invoice.payment_action_required` cannot regress status (always re-fetches live).
- **Cross-cutting seams:** webhook signature-presence 400 precedes the limiter; `x-vercel-forwarded-for`-only IP trust (DEBT-135) prevents source-IP 429 starvation on Vercel; cron auth before any state change (BUG-207 not regressed) with timing-safe compare; every app-data controller calls `requireEntitledUserId`; success/cancel/return URLs built only from env + ROUTES (no open redirect, `{CHECKOUT_SESSION_ID}` template intact); `STRIPE_WEBHOOK_E2E_OWNER` inert for real prod subscriptions; API version pin matches the SDK bundled version (no drift beyond archived DEBT-404/406); `executeIdempotent` re-validates replayed results against strict output schemas; auth precedes rate-limit precedes idempotency.
- **UI/CTA truth table:** every reachable `SubscriptionStatus × entitlement` combination maps to a banner/CTA whose click can deliver what it promises; `?checkout=`/`?reason=` precedence and reason-param spoofing fail safe; the checkout-success interstitial copy matches synced status; marketing-home pricing does not drift from the pricing page.

**Uncertain candidates deliberately NOT filed (with why):**
- Pre-claim deterministic processor failures (e.g. a price id not in the configured plan) throw *before* `stripeEvents.claim`, so they burn Stripe's ~3-day retry window with no `stripe_events` row for observability — but the trigger is ops misconfiguration, not a user flow, and it is adjacent to archived DEBT-384. Noted only.
- `SUBSCRIPTION_LIST_LIMIT=10` in the gateway pre-check vs 100 in reconcile: a customer with >10 subscriptions could in theory hide a blocking sub past page 1, but no realistic breaking input could be constructed (Stripe lists newest-first; >10 subs needs extreme duplicate history). Noted only.
- Stripe `409 idempotency_key_in_use` is not classified transient, so an exactly-concurrent duplicate sharing a deterministic key fails one side with a generic `checkout=error` instead of returning the winner's result — one-click recovery, P4 polish; becomes more relevant if BUG-245's fix adopts deterministic Stripe keys. Noted only.
- Billing page renders raw camelCase domain enums (`monthly · inTrial`) to users — cosmetic P4, no concrete harm evidence (no-speculative-debt rule). Not filed.
- Non-Vercel-host `getClientIp → 'unknown'` collapses the webhook limit to one shared bucket — deployment-dependent class the registry already rejects (Audit #13), and DEBT-135 documents `'unknown'` keying as the chosen fail-safe. Not filed.
- Price-env rotation making `toDomain` throw `INTERNAL_ERROR` for existing subscribers, and `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` having only `min(1)` (vs the price-id `price_` regex) — both deployment/config-dependent, registry precedent rejects them. Not filed.

## Audit #20 — Post-Archive Active-Exam Follow-Up (2026-04-25)

Focused follow-up after the BUG-235/236/237 archival pass. The goal was to confirm the archive/register state, repair stale SSOT links, and continue the active-exam regression search from first principles without reopening already-fixed audit-#19 issues.

**Methodology:**
- Verified `docs/bugs/` had no stale active BUG-235/236/237 copies and the archived docs existed under `docs/_archive/bugs/`.
- Traced active-exam draft writes from controller schema through `SaveExamDraftAnswerUseCase`, session params persistence, and `FinalizeExamAnswersUseCase`.
- Traced remaining attempt "latest" readers that were not covered by BUG-235 or BUG-236.
- Cross-checked the old `endPracticeSession` concern against current review-stage wiring and browser coverage; treated it as intentional abandon-session behavior, not a bug.
- Spot-checked webhook, cron, idempotency, and active-exam visibility boundaries for P0-P4 issues; filed only code-trace-confirmed behavior bugs.

**2 new bugs filed (BUG-238..239):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| [BUG-238](../_archive/bugs/bug-238-active-exam-draft-cumulative-ms-unbounded.md) | Practice / active-exam draft validation | P3 | `saveExamDraftAnswer` accepted unbounded `cumulativeMs`, letting malformed draft timing reach finalization |
| [BUG-239](../_archive/bugs/bug-239-active-exam-latest-attempt-readers-drop-visible-fallback.md) | Practice / active-exam reader fallback | P4 | Remaining implicit latest-attempt readers can hide older visible attempts behind newer active-exam rows |

**Surfaces confirmed clean or intentionally deferred:**
- Audit-#19 archive state is correct: BUG-235/236/237 are archived and the active bug register no longer lists them.
- The review-stage `Submit exam` path correctly calls `finalizeExamAnswers`; the older `endPracticeSession` action remains valid for tutor sessions and abandoning incomplete sessions.
- BUG-237 prevents new active-exam `attempts` rows through the normal `submitAnswer` path; BUG-239 is defense-in-depth for historical rows and future callers.
- Stripe webhook, Clerk webhook, cron auth, and idempotency transaction seams did not produce a confirmed new bug in this pass.

## Audit #19 — Active-Exam Visibility Regression Sweep (2026-04-24)

Focused follow-up sweep across exam-answer secrecy, History projections, dashboard stats, and adjacent repository query families. The goal was to find only code-trace-confirmed regressions that survived the earlier BUG-180..198 active-exam cleanup batch.

**Methodology:**
- Read representative adapter tests/source first to match current repo patterns before filing anything.
- Cross-checked active debt, practice-engine policy docs, and archived active-exam bug reports before filing new IDs.
- Traced active exam writes through `submitAnswer`, `saveExamDraftAnswer`, and `finalizeExamAnswers`.
- Traced dashboard stats from page render through `GetUserStatsUseCase` into `AttemptStatsReader` repository methods.
- Traced History attempted-question list/count semantics through latest-attempt ranking, active-exam visibility filtering, and question-progress repository comparison code.
- Searched mutation, billing, review, bookmark, webhook, cron, search-param, and markdown-rendering boundaries for P0-P4 bugs; filed only confirmed app behavior issues.

**3 new bugs filed (BUG-235..237):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| [BUG-237](../_archive/bugs/bug-237-submit-answer-allows-active-exam-session-writes.md) | Practice / active-exam write boundary | P2 | `submitAnswer` accepts active exam sessions and can persist final attempts before exam submission |
| [BUG-235](../_archive/bugs/bug-235-attempted-question-history-drops-latest-visible-attempt.md) | History / active-exam visibility | P3 | Attempted-question History ranks before filtering active-exam attempts, so older visible attempts can disappear |
| [BUG-236](../_archive/bugs/bug-236-dashboard-current-streak-includes-active-exam-attempts.md) | Dashboard / active-exam visibility | P3 | Current streak uses unfiltered `answeredAt` rows and can count active-exam attempts |

**Surfaces confirmed clean or intentionally deferred:**
- Dashboard aggregate counts and recent activity still use the shared active-exam visibility predicate from the BUG-187 fix.
- History attempted-question list/count still exclude active-exam attempts directly; BUG-235 is the narrower latest-visible fallback gap, not a renewed correctness leak.
- Post-exam review, bookmark vocabulary, and `Bookmark` vs `Mark for review` surface policy remain aligned with the DEBT-365 closeout.
- Debt/optimization items (e.g. DEBT-337 active; DEBT-349 deferred/parked, DEBT-332 resolved) are debt/optimization concerns rather than open bug reports.

## Audit #18 — Server-Action Idempotency + Stale Start Sweep (2026-04-03)

Focused follow-up sweep across mutation-oriented form actions and the interactive practice-session starter after recent idempotency and stale-request fixes landed in adjacent surfaces.

**Methodology:**
- Read representative adapter tests/source first to match current repo patterns before filing anything.
- Traced each mutation form from rendered `<form action=...>` through the server action and shared helper into controller idempotency/rate-limit seams.
- Cross-checked current bookmark and billing entry points against prior fixes (BUG-096 and BUG-204) to confirm whether the idempotent path is still reachable from the UI.
- Reviewed the practice-session starter for loading-state behavior, stale-request guards, and whether configuration changes remain possible while a start request is in flight.

**3 new bugs filed (BUG-231..233):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| [BUG-231](../_archive/bugs/bug-231-remove-bookmark-action-missing-idempotency.md) | Bookmarks / server actions | P4 | Remove-bookmark form posts are not replay-safe and can toggle the bookmark back on under duplicate submit |
| [BUG-232](../_archive/bugs/bug-232-manage-billing-actions-drop-portal-idempotency.md) | Billing / server actions / Stripe | P4 | Manage Billing UI entry points still cannot reach the controller's portal-session idempotency path |
| [BUG-233](../_archive/bugs/bug-233-practice-session-start-stale-response-after-config-change.md) | Practice / client async state | P3 | Session-start requests can still commit stale navigation or stale error state after visible configuration changes |

**Surfaces confirmed clean:**
- Pricing checkout forms already emit an `IdempotencyKeyField` and forward it through `subscribeMonthlyAction` / `subscribeAnnualAction`.
- `toggleBookmark(...)` and `createPortalSession(...)` both have working idempotent replay paths when callers actually supply `idempotencyKey`.
- The session-start button itself now shows a loading state correctly; the remaining gap is stale completion after the user changes still-enabled controls.

## Audit #17 — UTC/Date Consistency Sweep (2026-03-21)

Targeted audit of date/time handling after a broad claim that the codebase had zero UTC inconsistencies.

**Methodology:**
- Read representative adapter tests/source first to match repo patterns before auditing.
- Verified schema timestamp definitions and the shared Postgres session timezone config.
- Searched production code for timezone-sensitive APIs, date formatting, Unix-second normalization, and non-injected clock usage.
- Confirmed the footer-year bug with the absolute instant `2026-01-01T00:30:00.000Z` under a forced `America/New_York` runtime timezone.

**1 bug filed and fixed (BUG-229):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| ~~BUG-229~~ | Marketing / datetime consistency | P4 | ~~Marketing footer year used local runtime timezone instead of UTC~~ — **Resolved.** Footer now derives the year from UTC and has a regression test covering the January 1 rollover. [Archived](../_archive/bugs/bug-229-marketing-footer-year-uses-local-time.md). |

## Audit #16 — Agent-Browser Auth + Observability Sweep (2026-03-16)

Targeted browser-led sweep focused on local auth setup, documented `agent-browser` gotchas, and whether current observability plumbing survives a real browser session.

**Methodology:**
- Read repo-local browser/auth docs first: `docs/tooling/agent-browser.md`, `docs/dev/testing-infrastructure.md`, `docs/dev/deployment-environments.md`
- Verified local auth prerequisites from `.env.local` without exposing secret values
- Started the app locally and generated a clean authenticated baseline with the repo's Clerk/Playwright helpers
- Used `agent-browser` for live sign-in exploration and page inspection, then used a narrow Playwright corroboration pass where console/runtime evidence was needed
- Cross-checked findings against archived bug/debt history before filing

**1 new bug filed (BUG-228):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| ~~BUG-228~~ | Observability / CSP | P2 | ~~Clerk-owned CSP omits Sentry ingest~~ — **Resolved.** [Archived](../_archive/bugs/bug-228-client-sentry-ingest-blocked-by-csp.md). |

**Surfaces confirmed clean:**
- Authenticated dashboard load succeeds under plain Playwright password sign-in with the local E2E Clerk user
- The current repo docs correctly call out several `agent-browser` gotchas: `.env.local` is not auto-loaded, refs expire after navigation, hidden radio inputs can hang direct clicks, and Clerk direct-fill is less reliable than Playwright-assisted auth
- `agent-browser --state /tmp/agent-browser-state.json` did not preserve local Clerk dev-mode auth into a fresh session during this sweep; treated as a workflow/tooling gotcha rather than an app bug because the same app session loaded correctly under plain Playwright

## Audit #15 — Search Param Scalar Assumption Sweep (2026-03-15)

Focused follow-up sweep for page-level query parsing drift after BUG-182 fixed History normalization and Billing added explicit array handling. The goal was to find remaining server-page boundaries that still assume scalar `searchParams` despite Next.js runtime support for repeated params.

**Methodology:**
- Cross-check every server page and query-driven client handoff against the BUG-182 normalization pattern and Billing's array-safe parser.
- Trace redirect-producing flows into their landing pages: checkout success, pricing recovery banners, bookmark removal, session start, and question review navigation.
- File only cases where runtime `string[]` values cause a real user-visible failure, lost feedback, or lost review context.

**5 new bugs filed (BUG-221..225):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| BUG-221 | Search params / checkout | P3 | Repeated `session_id` arrays are forwarded as invalid input and bounce successful checkout returns to the generic error route |
| BUG-222 | Search params / pricing | P4 | Pricing page still assumes scalar `checkout` / `reason` params, hiding recovery banners and manage-billing CTA |
| BUG-223 | Search params / bookmarks | P4 | Repeated `error` / `toast` params suppress remove-bookmark feedback |
| BUG-224 | Search params / practice | P4 | Repeated session-start toast params suppress or degrade practice-session startup feedback |
| BUG-225 | Search params / review | P4 | Repeated review-context params are dropped instead of normalized, stripping session/attempt/history context |

**Surfaces confirmed clean:**
- History page parsers normalize `string | string[] | undefined` centrally (`app/(app)/app/history/history-search-params.ts`).
- Billing page already normalizes array-valued `error` params before banner selection.
- Quick-practice search param handling uses `URLSearchParams.get(...)`, which already returns a scalar.

## Audit #14 — Boundary Sweep: Reconciliation Canonical Selection (2026-03-10)

Focused follow-up sweep on boundary-heavy billing and domain paths after the BUG-204 verification work. The goal was to find only non-duplicate, code-trace-confirmed bugs with realistic impact.

**Methodology:**
- Full-file review of reconciliation job logic, Stripe normalization, cron entrypoint, and adjacent tests.
- Cross-check against archived reconciliation bugs and debt items to avoid refiling known issues.
- Targeted verification run: `pnpm test --run src/adapters/jobs/reconcile-stripe-subscriptions.test.ts`

**1 new bug filed (BUG-205):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| BUG-205 | Billing / reconciliation | P1 | Reconciliation short-circuits canonical selection to the stale local subscription and may cancel the actual Stripe winner |

## Audit #13 — Adversarial Security Re-Verification (2026-03-10)

Follow-up adversarial audit focused on server actions, authorization boundaries, webhook verification, rate limiting, configuration, and transaction/race behavior. Every candidate finding was re-verified against the current code and cross-checked against archived bug/debt history before filing.

**Methodology:**
- Full-file review of all server-action/controller entry points, webhook routes, env validation, billing flows, schema/migrations, and key domain services.
- Tracer-bullet traces from public entry points through controllers/use cases into repositories or Stripe gateways.
- Targeted verification run: `pnpm test --run lib/env.test.ts app/api/webhooks/clerk/route.test.ts src/adapters/controllers/billing-controller.test.ts app/api/cron/reconcile-stripe-subscriptions/route.test.ts`
- Prior audit/debt register cross-check to avoid refiling archived issues or known false positives.

**1 new bug filed (BUG-204):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| BUG-204 | Authenticated abuse / billing | P3 | Billing portal creation lacks rate limiting and blocks callers from supplying the idempotency key already supported by the application port |

**1 bug invalidated after deeper runtime verification:**
- BUG-203 was initially filed, then invalidated after inspecting the installed `@clerk/nextjs` and `@clerk/backend` runtime. `verifyWebhook()` reads `process.env.CLERK_WEBHOOK_SIGNING_SECRET` directly and fails closed when that env var is missing; our typed `env` fallback is not consulted by the Clerk SDK.

**Candidate findings rejected after re-verification:**
- Cron weak-secret guessing path was not filed as a bug because exploitation depends on operators choosing a weak `CRON_SECRET`; the code should be hardened, but the current evidence is too deployment-dependent for a bug filing.
- The remove-bookmark double-submit race was not re-filed because it collapses to the previously rejected last-write-wins bookmark-toggle race family.

## Audit #12 — Extended Sweep: Inference Leaks, Transaction Safety, Zombie Keys (2026-03-03)

Follow-up sweep after Audit #11, targeting three additional families: indirect exam secrecy leaks (inference via count deltas), transaction boundary violations, and idempotency edge cases.

**Methodology:**
- 3 parallel agents: (1) exhaustive exam secrecy re-sweep across all remaining surfaces, (2) async race condition sweep across all hooks/effects, (3) data integrity audit covering CAS, transactions, idempotency, type safety, error handling, boundary violations.
- Every finding manually verified at the line level before filing.

**4 new bugs filed (BUG-195..198):**

| Bug | Family | Priority | Summary |
|-----|--------|----------|---------|
| BUG-195 | Exam secrecy (inference) | P3 | `latestAttemptRowsSubquery` in question repo has no active-exam exclusion — count delta reveals correctness |
| BUG-196 | Race condition | P3 | `loadReview` has no concurrency guard — double-click fires duplicate `finalizeSession` |
| BUG-197 | Transaction safety | P2 | `SubmitAnswer` does attempt insert + session state update without a DB transaction — orphan risk on failure |
| BUG-198 | Idempotency | P3 | Claimed-but-never-completed idempotency key becomes 24-hour zombie blocking retries |

**Surfaces confirmed clean:**
- All other use cases returning correctness data (audit exhaustive — see Audit #11 matrix)
- All hooks with proper `mounted` + cleanup patterns (bookmarks, tags, incomplete session, available counts, navigator, summary review, mark-for-review)
- Domain layer boundary purity (zero external imports)
- SQL injection (all Drizzle parameterized queries, one validated string interpolation in Stripe search)
- Error handling (no silent swallowing of business-critical errors)

---

## Audit #11 — Exam Secrecy Deep Sweep + Race Condition Audit (2026-03-03)

Adversarial verification of BUG-186 through BUG-190 (filed by a prior agent), followed by a comprehensive sweep for additional exam secrecy violations and async race conditions across all layers.

**Methodology:**
- Tracer-bullet code trace for each claimed bug (verified at the line level)
- Cross-layer exam secrecy audit: every use case returning `isCorrect` checked for active-exam gating
- Async race condition sweep: every `useEffect` firing async operations checked for stale-request guards
- CAS pattern audit: normalization vs DB comparison verification
- `Promise.all` snapshot consistency audit under READ COMMITTED isolation

**5 prior bugs verified (BUG-186..190):** All confirmed real with enhanced documentation.
**4 new bugs filed (BUG-191..194):** 2 exam secrecy violations, 1 history page leakage, 1 async race condition.

### Exam Secrecy Violation Summary

The codebase has a systemic pattern: `shouldShowExplanation(session)` gates explanations and correctChoiceId, but `isCorrect`/`latestIsCorrect` is returned unconditionally. Affected use cases:

| Use Case | Field | Gated? | Bug |
|----------|-------|--------|-----|
| `GetPracticeSessionReview` | `isCorrect` | No | BUG-186 |
| `GetUserStats` (counts) | aggregate counts | No | BUG-187 |
| `GetNextQuestion` | `latestIsCorrect` | No | BUG-191 |
| `GetAttemptedQuestions` | `isCorrect` | Yes (BUG-192 fix: active-exam rows excluded at repository) | Fixed |
| `SubmitAnswer` | `isCorrect` | Yes (BUG-193 fix: gated behind `shouldShowExplanation`) | Fixed |
| `GetPreviousAttempt` | `isCorrect` | Yes (BUG-180 fix) | Fixed |

### Race Condition Summary

| Surface | Guard Pattern | Status | Bug |
|---------|--------------|--------|-----|
| `runLoadQuestionFlow` | `isMounted()` + `isLatestRequest()` | Correct | — |
| `runSubmitAnswerFlow` | `isMounted()` + `isLatestRequest()` | Correct (BUG-194 fix) | Fixed |
| `useQuestionPageModel` (load) | `isMounted()` only, no cleanup | Missing guard | BUG-189 |
| `useQuestionPageModel` (hydrate) | `isMounted()` only | Missing guard | BUG-189 |
| `useQuestionPageModel` (session nav) | `isStale` cleanup | Correct | — |
| `useHistorySessions` | sessionId token | Reopen race | BUG-190 |

## Audit #10 — Exam Secrecy and Cross-Layer Invariant Sweep (2026-03-02)

Policy-driven investigation targeting exam-answer secrecy invariant enforcement across use cases, controllers, repository projections, and retry/review surfaces. Each finding was verified with executable repro harnesses and full tracer-bullet traces.

**6 new confirmed bugs filed:** BUG-180 (P1), BUG-181 (P1), BUG-182 (P2), BUG-183 (P2), BUG-184 (P2), BUG-185 (P1).

- BUG-180, BUG-181, BUG-185 form a family: active-exam correctness/explanation exposure via review hydration, retry provenance, and dashboard projection.
- BUG-182 is an independent input-normalization crash (repeated query params).
- BUG-183 is an independent transaction-rollback issue (Stripe webhook failure state lost).
- BUG-184 is an independent race condition (concurrent count/page divergence).

Canonical policy established: [Exam Answer Secrecy Policy](../practice-engine/exam-answer-secrecy-policy.md).

---

## Audit #7 — Deep Sweep for First-Principles, Silent-Drop, and Relative Bugs (2026-02-27)

Five-axis investigation covering: (1) existing bug documentation and audit history, (2) domain layer entities and business logic, (3) application use cases and error handling, (4) adapters, server actions, and wiring, and (5) frontend components, race conditions, and accessibility. Ran 5 parallel exploration agents, then **manually verified every finding** against previous audit false-positive records and the actual code with full tracer-bullet traces.

**2 new confirmed bugs filed:** BUG-165 (P3), BUG-166 (P3). Both underwent full tracer-bullet verification — **double-verified** with a second pass of 4 parallel exploration agents (adapters, frontend, domain/application, lib/config) plus manual code reading of every finding.

### Tracer-Bullet Verification (2026-02-27)

The traces below capture the pre-fix code state at discovery time during Audit #7.

**BUG-165 — Full vertical + horizontal trace (12-step):**
1. `app/(app)/app/billing/manage-billing-actions.ts` → server action entry point (`'use server'`)
2. → `manage-billing-action.ts` → `runManageBillingActionCore` with `{ failure: '/app/billing?error=portal_failed' }` (NO `unauthenticated` key)
3. → `manage-billing-core.ts` `runManageBillingAction` → calls `deps.createPortalSessionFn({})`
4. → `billing-controller.ts` `createPortalSession` → `d.authGateway.requireUser()`
5. → `clerk-auth-gateway.ts` line 78: throws `ApplicationError('UNAUTHENTICATED', 'User not authenticated')`
6. → `create-action.ts` line 44-46: catches → `handleError()` → `err('UNAUTHENTICATED', ...)`
7. → back to `manage-billing-core.ts` line 30: `result.ok` is false
8. → line 33: `getManageBillingErrorRedirect('UNAUTHENTICATED', deps.redirects)`
9. → line 12: `errorCode === 'UNAUTHENTICATED'` is true, BUT `redirects.unauthenticated` is `undefined`
10. → line 16: falls back to `redirects.failure` → `/app/billing?error=portal_failed`
11. User sees error banner instead of sign-in redirect
- **Horizontal comparison:** `app/pricing/manage-billing-action.ts` provides `unauthenticated: ROUTES.SIGN_UP` (line 16) — app billing does not
- **Type trace:** `ManageBillingRedirects.unauthenticated` is optional (`string?`) — type system does not enforce it
- **Test trace:** Pricing page tests UNAUTHENTICATED → `/sign-up` ✓; App billing tests have NO UNAUTHENTICATED test case (the bug is untested)
- **Core test:** `manage-billing-core.test.ts` line 73-79 tests the fallback path (when unauthenticated is not configured) — validates the bug behavior EXISTS

**BUG-166 — Full vertical trace (catch-block anatomy):**
1. `manage-billing-core.ts` lines 25-29: `catch {` — no error parameter binding
2. Both `manage-billing-action.ts` files (app billing AND pricing) call this core function — both are affected
3. `createPortalSessionFn` is `billing-controller.ts` `createPortalSession` wrapped by `createAction` — should NOT throw (returns `ActionResult`)
4. Catch block defends against: container load failures (`loadAppContainer` dynamic import fails), JavaScript runtime errors, unexpected `createPortalSessionFn` implementations
5. Impact: Even rare errors (container wiring, module resolution, unexpected Stripe SDK errors that bypass `createAction`) are permanently lost — zero server-side record
6. The catch block has no error parameter, no logging, no monitoring — immediate redirect to failure URL

### Findings Confirmed as NOT Bugs (27 False Positives)

**Re-verified from previous audits (already documented):**
- Session history pagination total (DB `isNotNull(endedAt)` filters both COUNT and ROWS — Audits #3, #4)
- `StartPracticeSession` count/mode validation (Zod schema enforces at controller — Audit #3)
- Bookmark toggle race condition (handled by `onConflictDoUpdate` — Audit #4)
- `loadPreviousAttempt` silent catch (intentional best-effort design — Audit #4)
- `paymentProcessing` excluded from `EntitledStatuses` (intentional — BUG-077)
- DB singleton `NODE_ENV` caching pattern (standard Next.js HMR pattern — Audit #3; in production modules are cached by Node.js)

**New false positives verified this audit:**
- `SetPracticeSessionQuestionMark` missing question-in-session validation (FALSE — `practice-session-question-state-updater.ts` lines 43-51 validates membership with `NOT_FOUND` error)
- `StartPracticeSession` missing `input.count` validation (FALSE — Zod schema `z.number().int().min(1).max(200)` at controller)
- `StartPracticeSession` missing `input.mode` validation (FALSE — `zPracticeMode` enum validation at controller)
- `GetSessionHistory` pagination broken by defensive filter (FALSE — DB already filters; `skippedCount` is always 0)
- `GetSessionHistory` "dead code" defensive filter (not a bug — legitimate defense-in-depth)
- `CreateCheckoutSession` missing email/URL validation (URLs constructed from internal `ROUTES` constants + `appUrl`; email from Clerk — system boundary already validated)
- `CreateCheckoutSession` wrong error code for missing clerkUserId (INTERNAL_ERROR is correct — null `clerkUserId` with valid `userId` indicates corrupted user data, not unauthenticated access)
- `GetPracticeSessionReviewUseCase` silent continue on null questionId (defensive guard for impossible `string[]` state)
- `GetPreviousAttemptUseCase` default sessions no-op parameter (intentional test ergonomics)
- `ToggleBookmarkUseCase` race condition (last-write-wins is acceptable; concurrent same-user bookmark is near-zero probability)
- `CountAvailableQuestions` missing filter validation (empty arrays are valid filters — "no filter applied")
- Domain test factory `86_400_000` magic number (correct value; importing `DAY_MS` would be cleaner but risk is zero — DAY_MS is a physical constant)
- Health check 503 on rate limiter failure (correct behavior — service unavailable)
- Idempotency prune silent catch (intentional — pruning must not block caller; logged as warning)
- Subscription price ID rotation strategy (architectural concern, not a runtime bug)
- `fireAndForget` without error UI (callers handle errors in `run()`; catch is safety net per Audit #4)
- `practice-session-page-view` conditional button rendering (correct gating on optional callback)
- Stripe checkout session retrieve failure leaves old session open (FALSE — intentional defensive design; old sessions auto-expire in 24h; attempting to expire an uninspectable session could be worse if user is mid-checkout; tested at `stripe-checkout-sessions.test.ts` line 443-463)
- `stripe-subscription-normalizer.ts` missing `.bind()` on `stripeSubscriptions` (FALSE — `stripeSubscriptions` is the namespace OBJECT, not an extracted method; `stripeSubscriptions.retrieve(...)` preserves `this` because the method is called ON the object. Compare with BUG-069/070 where `stripe.customers.search` was extracted as a standalone FUNCTION variable, losing `this`)
- `db.ts` connection not cached in production (FALSE — re-confirmed from Audit #3; standard Next.js pattern; in production, Node.js module caching ensures `conn` persists at module scope; `globalThis` caching is only needed for dev HMR which re-evaluates modules)
- Frontend layer clean — no new error handling gaps, race conditions, or accessibility issues found across all pages and components
- Domain layer clean — zero first-principles logic errors in scoring, grading, session state, entitlement, streak, or question selection

### Domain Layer Health

**Excellent.** Zero first-principles logic bugs. All scoring, grading, session state, entitlement, streak, and question selection logic verified correct. All domain value objects have proper validators with full test coverage. No `any` types, no unsafe assertions, no silent failures. Domain layer maintains zero external imports.

### Security Posture Re-Verified

- Three-layer auth enforcement intact: proxy.ts middleware → layout entitlement → server action `requireEntitledUserId()`
- All queries scoped to authenticated userId (no IDOR)
- All SQL parameterized via Drizzle ORM (no injection)
- Webhook signatures verified (Stripe HMAC, Clerk Svix, cron timing-safe comparison)
- Rate limiting fail-closed on all public endpoints
- No magic numbers in security-critical paths
- No silently dropped IDs, configs, or variables in critical paths

---

## Audit #6 — Full-Stack Bug Sweep with 5 Parallel Agents (2026-02-25)

Five-axis investigation covering: (1) existing bug documentation review, (2) source code architecture and logic, (3) tests and configuration, (4) API routes, server actions, and webhooks, and (5) UI/UX and accessibility. Ran 5 parallel exploration agents, then **manually verified every finding** with full code traces.

**3 new confirmed bugs filed:** BUG-160 (P3), BUG-161 (P3), BUG-162 (P4). All 3 underwent full tracer-bullet verification.

### Tracer-Bullet Verification (2026-02-25)

All 3 bugs were traced end-to-end with vertical and horizontal tracer bullets:

- **BUG-160:** 6-layer vertical trace (DB → use case → controller → dashboard render → history page reference → test gap). Confirmed `firstQuestionSlug` and `sessionId` are fetched but unused. Correct pattern exists 70 lines below the bug in the same file's "Recent activity" section.
- **BUG-161:** 12+ file horizontal trace across webhook → normalizer → status mapper → DB → entitlement → layout → pricing page. Confirmed `paymentFailed` is routed through the same `payment_processing` reason path as `paymentProcessing`. Second affected path found in `checkout-success-sync.tsx:245`. Existing test at `check-entitlement.test.ts:120` encodes the bug as correct behavior.
- **BUG-162:** Vertical trace from controller → use case → repository port → Drizzle impl → Postgres. Horizontal trace across all 10 controller files confirmed this is the sole unbounded offset instance. SQL path involves `ROW_NUMBER()` window function making large offsets especially costly.

### Findings Confirmed as NOT Bugs (Initial Sweep — 10 False Positives)

- History session state persistence across pagination (correct UX — toggle deselects, `useHistorySessions` manages via refs)
- `GetPreviousAttemptUseCase` silent null return (already documented and fixed as BUG-139)
- Empty catch blocks (none found in codebase)
- Skipped tests (only E2E credential-gated skips, not logic gaps)
- TODO/FIXME/HACK markers (none found)
- Stale closure in practice controller (refs ARE the solution)
- `paymentProcessing` excluded from `EntitledStatuses` (intentional — BUG-077 resolved with specific messaging)
- Missing pricing error boundary (exists at `app/pricing/error.tsx`)
- Subscribe button missing disabled state (has `disabled={pending}`)
- Middleware naming false positive (Next.js 16 `proxy.ts` pattern, confirmed via build)

### Findings Confirmed as NOT Bugs (Deep Dive — 12 False Positives)

- Dashboard stats error handling (ErrorCard with retry renders correctly)
- Practice session CAS retry pattern (correct for optimistic concurrency)
- Session history drill-down toggle (correct accordion-style UX)
- Bookmark message timeout (cleanup on unmount already handled)
- Rate limiter fail-closed behavior (correct — denies on error)
- Webhook signature verification (Stripe HMAC verified before processing)
- Clerk webhook Svix verification (standard Clerk pattern)
- CSP header configuration (delegated to Clerk middleware correctly)
- Question selection randomization (Fisher-Yates shuffle, correct)
- Pagination total count consistency (filtered identically on COUNT and ROWS)
- Stripe customer search query safety (validated before interpolation, BUG-106 resolved)
- Idempotency key pruning (hot-path pruning wired, BUG-103/104 resolved)

### Security Posture Re-Verified

- Three-layer auth enforcement intact: middleware → layout entitlement → server action `requireEntitledUserId()`
- All queries scoped to authenticated userId (no IDOR)
- All SQL parameterized via Drizzle ORM (no injection)
- Webhook signatures verified, rate limiting fail-closed
- Security headers (HSTS, X-Frame-Options, Permissions-Policy, X-Content-Type-Options) all configured

## Audit #5 — Six-Axis Codebase Bug Sweep (2026-02-22)

Six-axis investigation covering domain layer, application layer, adapters layer, frontend/UI, configuration/infrastructure, and test coverage. Ran 6 parallel exploration agents, then **manually verified every finding** with full code traces and a production build.

**2 new confirmed bugs filed:** BUG-148 (P3), BUG-149 (P3). Both were latent at discovery and are now resolved.

**Findings confirmed as NOT bugs after manual verification:**

- `proxy.ts` naming is "broken middleware" (FALSE — Next.js 16 recognizes `proxy.ts` as middleware; confirmed via `pnpm build` output: `ƒ Proxy (Middleware)`)
- AlertDialogAction missing `disabled` in incomplete session card (Radix auto-closes dialog on action click; trigger `disabled={isPending}` prevents re-open)
- AlertDialogAction missing `disabled` in bookmarks removal (auto-close + page revalidation removes bookmark from UI; no second trigger possible)
- Redundant `isPending` guard in ExamReviewView (code smell, not a bug; `disabled` attribute is sufficient)
- `createPracticeSession` factory allows mismatched `questionIds`/`questionStates` (test helper only; application layer handles defensively with warning logs; tested explicitly)
- Domain `PracticeSessionQuestionState` allows null fields together (intentional design for partial state)
- `QuestionProgressStatus` missing "correct" value (intentional design per domain model)
- `selectNextQuestionId` defensive null check (safe defensive programming)

**Test coverage observations (not bugs, but noted for improvement):**

- Cron auth token validation route handler lacks unit test (P1 coverage gap)
- `practice-session-params.ts` serialization layer untested (P2 coverage gap)
- `practice-session-question-state-updater.ts` retry logic untested (P2 coverage gap)
- No E2E test for subscription cancellation → entitlement denial (P1 coverage gap)
- No integration test for idempotency key persistence in billing flows (P1 coverage gap)

**Security posture confirmed solid (re-verified from Audit #4):**

- `proxy.ts` middleware running and applying Clerk auth + CSP headers
- Three-layer auth enforcement intact: middleware → layout entitlement → server action `requireEntitledUserId()`
- All queries scoped to authenticated userId (no IDOR)
- All SQL parameterized via Drizzle ORM (no injection)
- Webhook signatures verified, rate limiting fail-closed
- Security headers (HSTS, X-Frame-Options, Permissions-Policy, X-Content-Type-Options) all configured

## Audit #4 — Middleware, Core Paths, and Security Deep Dive (2026-02-16)

Eight-axis investigation covering middleware consistency, auth enforcement, webhook security, data validation, error handling, question selection, Stripe subscription lifecycle, and data consistency edge cases. Ran 8 parallel exploration agents, then manually verified every finding through the actual code.

**1 new confirmed bug filed:** BUG-143 (same root cause as BUG-136 — `NODE_ENV` Turbopack inlining — but affecting Sentry environment tag).

**Findings confirmed as NOT bugs after tracer-bullet verification:**

- Practice session CAS retry without backoff (correct pattern for optimistic concurrency; immediate retry is optimal for short contention windows)
- Orphaned attempt on rollback failure (already resolved as DEBT-190)
- Practice session review missing question state (already resolved as DEBT-159)
- Cron endpoint 503 when CRON_SECRET missing (correct status — service unavailable, not unauthorized)
- Client `runTransitionedAsyncAction` error swallowing in prod (callers handle errors in `run()`; catch is a safety net, not primary handler)
- `pastDue` status granting entitlement (standard SaaS practice: grace period during Stripe payment retries)
- `cancelAtPeriodEnd` not checked in `isEntitled()` (correct Stripe convention: user paid through period end; status transitions to `canceled` naturally)
- Reconciliation job subscription selection heuristic (keeping longest-remaining subscription is correct deduplication strategy)
- History pagination total inconsistency (repository already filters `isNotNull(endedAt)` on both COUNT and ROWS — same finding as Audit #3)
- Bookmark toggle race condition (handled by `onConflictDoUpdate` conflict strategy)
- Webhook peek optimization race window (secondary `lock()` guard prevents double-processing)
- Cron error message information disclosure (minimal impact — reveals config name only, not secrets)

**Security posture confirmed solid across all axes:**

- Middleware applies consistently to all protected routes; no bypass patterns
- Three-layer auth enforcement: middleware → layout entitlement → server action `requireEntitledUserId()`
- All queries properly scoped to authenticated userId (no IDOR)
- All SQL parameterized via Drizzle ORM (no injection)
- Markdown rendering sanitized via `rehype-sanitize` + `skipHtml` (no XSS)
- Webhook signatures verified (Stripe HMAC, Clerk Svix, cron timing-safe comparison)
- Rate limiting on all public endpoints with fail-closed behavior
- CSP, HSTS, X-Frame-Options, Permissions-Policy all configured
- No redirect loops detected

## Audit #3 — Codebase-Wide Bug Sweep (2026-02-16)

Five-axis audit covering domain, application, adapters, frontend, and configuration layers. Ran 5 parallel exploration agents, then **triple-checked every finding** with full vertical/horizontal tracer-bullet traces through the actual code paths.

**14 agent-reported findings were confirmed as false positives** after manual code review:

- DB singleton `NODE_ENV` pattern (standard Next.js pattern, correct as-is)
- `mapWithConcurrencyLimit` race condition (JS is single-threaded; `nextIndex` access is atomic between await points)
- Idempotency key `lt(expiresAt, now())` "inverted" logic (correctly reclaims expired keys)
- Stripe SDK `.bind()` missing in canceler (method calls on objects bind `this` correctly)
- Question repo `or()` with empty array (guarded by `hasStatusFilter` check)
- Frontend stale closure in practice controller (refs ARE the solution, not the problem)
- Missing pricing `error.tsx` (it exists at `app/pricing/error.tsx`)
- Subscribe button missing `disabled` (already has `disabled={pending}` on line 17)
- `crypto.randomUUID()` missing fallback (supported in all modern browsers)
- `StartPracticeSession` count <= 0 (Zod schema enforces `min(1)`, UI clamps to `[1,100]`, output requires `min(1)`)
- Session history pagination total inaccurate (Drizzle repo filters `isNotNull(endedAt)` on both COUNT and ROWS)
- `paymentProcessing` excluded from `EntitledStatuses` (intentional design; BUG-077 resolved this with specific messaging; test coverage exists)
- `ports/use-cases.ts` incomplete (architectural preference with zero runtime impact)
- Container logger fallback bypasses redaction (unreachable code — no caller passes `undefined` logger; DEBT-088 resolved)

Audit #3 produced BUG-136 and BUG-139. BUG-137 was reclassified as SSOT-consistent. Audit #4 added BUG-143.

---

## Recently Triaged

| ID | Title | Status | Resolution |
|----|-------|--------|------------|
| [BUG-185](../_archive/bugs/bug-185-dashboard-recent-activity-reveals-active-exam-correctness.md) | Dashboard Recent Activity Reveals Active Exam Correctness | Resolved | Added active-exam exclusion predicate in `listRecentByUserId` and repository regression coverage |
| [BUG-184](../_archive/bugs/bug-184-attempted-questions-count-page-divergence-drops-rows.md) | Attempted Questions Count/Page Divergence Can Drop Real Rows | Resolved | Removed `totalCount === 0` short-circuit, preserving non-empty page rows under count/list divergence; added regression assertion for row identity |
| [BUG-183](../_archive/bugs/bug-183-stripe-webhook-failure-state-rolled-back.md) | Stripe Webhook Failure State Is Rolled Back | Resolved | Transaction callback now returns `{ ok: false, error }` after `markFailed`, allowing commit before outer rethrow; rollback-aware regression test added |
| [BUG-182](../_archive/bugs/bug-182-history-questions-tag-array-query-crash.md) | History Questions Crashes on Repeated `tag` Query Param | Resolved | Added shared search-param normalization across all history parsers, including numeric `limit`/`offset` parsing for repeated params |
| [BUG-181](../_archive/bugs/bug-181-session-review-retry-allows-active-exam-answer-reveal.md) | Session-Review Retry Allows Active Exam Answer Reveal | Resolved | Added active-session `session_review` guard before grading plus regression coverage |
| [BUG-180](../_archive/bugs/bug-180-active-exam-answer-leak-via-review-hydration.md) | Active Exam Answer Leak via Review Hydration | Resolved | Added active-exam attempt guard in answered-attempt branch and identifier-path regression tests |
| [BUG-151](../_archive/bugs/bug-151-card-row-affordance-inconsistency.md) | Card/Row Affordance Inconsistency — Misleading Hover, Missing Focus Rings, Pattern Asymmetry | Resolved | Removed misleading hover from non-interactive cards, added missing focus-visible rings to interactive inner links, converted history question cards to Pattern A (Link-as-Card), and updated regression/test coverage |
| [BUG-150](../_archive/bugs/bug-150-proxy-function-named-middleware.md) | Proxy Default Export Named `middleware` — Recurring False-Positive Audit Noise | Resolved | Renamed `proxy.ts` default export from `middleware` to `proxy`, renamed inner `clerkMiddleware` local to `clerkMw`, and added `proxy.test.ts` regression coverage to prevent naming drift |
| [BUG-149](../_archive/bugs/bug-149-idempotency-null-result-indistinguishable-from-pending.md) | Idempotency Null Result Is Indistinguishable from Pending State | Resolved | Added explicit `completed_at` completion marker to `idempotency_keys`, updated idempotency repository contracts/implementations, switched `withIdempotency` to completion-marker semantics with legacy non-null payload fallback, and added unit + integration regression coverage for null-result replay |
| [BUG-148](../_archive/bugs/bug-148-stripe-checkout-idempotency-key-fallback-random.md) | Stripe Checkout Idempotency Key Fallback Uses randomUUID() | Resolved | Replaced random fallback with deterministic `checkout_session:${userId}:${plan}` and added stale-session replay detection with a recovery key path (`checkout_session_recovery:${userId}:${plan}:${sessionId}`) |
| [BUG-147](../_archive/bugs/bug-147-user-upsert-unhandled-email-uniqueness-conflict.md) | User Upsert Fails on Email Uniqueness Conflict When Clerk User ID Changes | Resolved | Added `users_email_uq` catch-and-update path in `DrizzleUserRepository`, added fake email-uniqueness parity, and added integration/unit regression tests |
| [BUG-146](../_archive/bugs/bug-146-marketing-footer-sign-in-up-casing-inconsistent.md) | Marketing Footer “Sign in/up” Casing Is Inconsistent with the Rest of the App | Resolved | Standardized footer auth labels to “Sign In” / “Sign Up” and added regression coverage |
| [BUG-145](../_archive/bugs/bug-145-frontend-ssot-docs-out-of-sync-with-question-view.md) | Frontend SSOT Docs Are Out of Sync with Current Question View Implementation | Resolved | Updated stale SSOT architecture docs to match current question page navigation and state restoration behavior |
| [BUG-144](../_archive/bugs/bug-144-marketing-layout-nests-main-landmarks.md) | MarketingLayout Nests `<main>` Landmarks (Regression of BUG-100) | Resolved | Centralized `#main-content` ownership in MarketingLayout and removed nested child `<main>` landmarks with regression tests |
| [BUG-137](../_archive/bugs/bug-137-entitlement-off-by-one-period-end-boundary.md) | Entitlement Check Off-by-One at Period End Boundary | Reclassified | SSOT and implementation both use an exclusive boundary (`currentPeriodEnd > now`); keep doc as policy record with a spec-change path for inclusive semantics |
| [BUG-139](../_archive/bugs/bug-139-get-previous-attempt-silent-null-on-data-mismatch.md) | GetPreviousAttemptUseCase Silently Returns Null on Data Integrity Mismatch | Resolved | Throw `NOT_FOUND` on attemptId/questionId mismatch (keeps UX fallback, but makes mismatch distinguishable); add regression coverage |
| [BUG-143](../_archive/bugs/bug-143-sentry-environment-tag-uses-inlined-node-env.md) | Sentry Environment Tag Uses Inlined NODE_ENV — Preview Errors Report as Production | Resolved | Use `VERCEL_ENV` (server) + `NEXT_PUBLIC_VERCEL_ENV` (client) for Sentry environment tags; inject client env via `next.config.ts`; add regression tests |
| [BUG-136](../_archive/bugs/bug-136-logger-uses-inlined-node-env-for-level.md) | Logger Uses Unreliable Inlined NODE_ENV for Log Level Selection | Resolved | Prefer `VERCEL_ENV` runtime lookup for default level selection; add regression tests |
| [BUG-134](../_archive/bugs/bug-134-mark-for-review-race-updates-wrong-question.md) | Mark-for-Review Race Can Update the Wrong Question UI State | Resolved | Guard mark-for-review sessionInfo updates by current questionId; add browser regression coverage |
| [BUG-133](../_archive/bugs/bug-133-stale-closure-practice-session-onsubmit.md) | Stale Closure in Practice Session onSubmit After Async Await | Resolved | Read post-await values from refs in submit handler; add browser regression coverage |
| [BUG-132](../_archive/bugs/bug-132-duplicate-nav-links-pricing-dashboard.md) | Duplicate Nav Links — "Pricing" and "Dashboard" Appear Twice in Header | Resolved | Removed duplicate links from AuthNav; layout owns left-nav links, AuthNav owns right-side auth controls |
| [BUG-131](../_archive/bugs/bug-131-e2e-bookmarks-empty-state-assertion-failure.md) | E2E Bookmarks Empty State Assertion Fails After Remove | Resolved | Stabilized the test by asserting either count decrement or empty-state with increased timeout |
| [BUG-130](../_archive/bugs/bug-130-e2e-session-start-selector-mismatch.md) | E2E Session Start Selectors Don't Match Current UI | Resolved | Updated `startSession()` to click SegmentedControl buttons and fill `Questions` input |
| [BUG-129](../_archive/bugs/bug-129-e2e-choice-radio-selector-mismatch.md) | E2E Choice Radio Selector Cannot Find Question Choices | Resolved | Updated `selectChoiceByLabel()` to match ChoiceButton DOM and assert radio checked |
| [BUG-128](../_archive/bugs/bug-128-sessioninfo-cleared-on-null-question.md) | sessionInfo Cleared on Null Question — Exam Defaults to Tutor, Navigator Drops | Resolved | Preserve sessionInfo when next question is null; added regression coverage |
| [BUG-127](../_archive/bugs/bug-127-double-click-submit-exam-race.md) | Double-Click "Submit Exam" Race in Review | Resolved | Ref-based guard + unanswered warning in confirm dialog; added browser regression coverage |
| [BUG-126](../_archive/bugs/bug-126-end-session-blocked-by-bookmark-pending.md) | End Session Blocked During Bookmark Operations | Reclassified | Not reproducible in current implementation; added regression guard |
| [BUG-125](../_archive/bugs/bug-125-no-more-questions-dead-end.md) | "No More Questions" Dead-End — No Action Buttons | Resolved | Add explicit session CTA in empty state; add regression coverage |
| [BUG-124](../_archive/bugs/bug-124-exam-review-stale-after-review-answer.md) | Exam Review Data Stale After Changing Answer from Review | Resolved | Verified reload path and added browser regression coverage |
| [BUG-123](../_archive/bugs/bug-123-exam-mode-correctchoiceid-leak.md) | Server Returns `correctChoiceId` to Client in Exam Mode | Resolved | Return `correctChoiceId: null` when explanations are hidden; update runtime schema + tests |
| [BUG-122](../_archive/bugs/bug-122-exam-choices-clickable-after-submit.md) | Choices Still Clickable After Exam Mode Submit | Resolved | Restore authoritative answered state and keep choices locked; add regression coverage |
| [BUG-121](../_archive/bugs/bug-121-session-start-button-missing-loading-state.md) | Session Start Button Never Shows Loading State | Resolved | Wire session start status to pending UI; add regression coverage |
| [BUG-120](../_archive/bugs/bug-120-reconciliation-missing-authoritative-conflict-strategy.md) | Reconciliation Job Missing Authoritative Conflict Strategy | Resolved | Reconciliation job now uses authoritative Stripe customer conflict strategy with regression coverage |
| [BUG-119](../_archive/bugs/bug-119-stripe-ended-status-missing-from-db-enum.md) | Stripe 'ended' Subscription Status Missing from DB Enum | Resolved | Removed invalid `'ended'` from Stripe subscription status union and added type-level regression coverage |
| [BUG-118](../_archive/bugs/bug-118-question-page-missing-shared-guards.md) | Question Page Missing Shared Practice-Page Guards | Resolved | Question page now uses shared guard helpers for choice selection, submit transitions, and canSubmit gating |
| [BUG-117](../_archive/bugs/bug-117-stripe-customer-create-missing-retry.md) | Stripe Customer Creation Non-Idempotent Path Missing Retry Wrapper | Resolved | Wrapped both idempotent and non-idempotent `customers.create` calls in `callStripeWithRetry()` and added regression coverage |
| [BUG-116](../_archive/bugs/bug-116-cron-route-blocked-by-clerk-middleware.md) | Cron Reconcile Route Blocked by Clerk Middleware | Resolved | Added cron route to public route matcher list so cron-secret auth executes at the route boundary |
| [BUG-115](../_archive/bugs/bug-115-cron-secret-validation-crashes-production-build.md) | DEBT-160 CRON_SECRET Startup Validation Crashes Production Build | Resolved | Removed import-time `CRON_SECRET` startup validation and scoped enforcement to request-time cron route checks to avoid build/runtime crashes |
| [BUG-114](../_archive/bugs/bug-114-subscribe-action-leaks-error-codes-to-url.md) | Subscribe Action Exposes Internal Error Codes in URL Params | Resolved | Removed internal `error_code/error_message` URL params from pricing redirects and kept diagnostics server-side only |
| [BUG-113](../_archive/bugs/bug-113-orphaned-attempt-on-ended-session.md) | Orphaned Attempt Persisted When Submitting to Ended Session | Resolved | `SubmitAnswerUseCase` now rejects ended-session submissions before insert, preventing orphan attempts and preserving session/attempt consistency |
| [BUG-112](../_archive/bugs/bug-112-navigator-fetch-silent-error-swallowing.md) | Navigator Fetch Silently Swallows Errors with No Error State | Resolved | Added explicit navigator load/error state with retry action so failures are visible, logged, and recoverable |
| [BUG-111](../_archive/bugs/bug-111-bookmark-toggle-silent-error-swallowing.md) | Bookmark Toggle Silently Swallows Errors | Resolved | Bookmark toggle now logs thrown failures before setting UI error state, preserving observability for production diagnostics |
| [BUG-110](../_archive/bugs/bug-110-choice-button-aria-label-overrides-answer-text.md) | ChoiceButton aria-label Overrides Full Answer Text | Resolved | Removed overriding `aria-label` so radios inherit full answer text from the wrapping label; added regression coverage |
| [BUG-105](../_archive/bugs/bug-105-concurrent-answer-submission-race-condition.md) | Concurrent Answer Submission Can Create Duplicate Attempts | Resolved | Migration now deduplicates historical `(practice_session_id, question_id)` collisions before creating partial unique index; repository/fake both map duplicate submissions to `CONFLICT` |
| [BUG-109](../_archive/bugs/bug-109-cron-route-limit-mismatch.md) | Cron Route MAX_LIMIT (1000) Exceeds Reconciliation MAX_LIMIT (500) | Resolved | Route and job now share `RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT` with route-level regression coverage |
| [BUG-108](../_archive/bugs/bug-108-submit-answer-unbounded-time-spent-seconds.md) | submitAnswer Allows Unbounded timeSpentSeconds at Use-Case Layer | Resolved | Use case now enforces 24-hour max cap and controller/shared limit references remain aligned |
| [BUG-107](../_archive/bugs/bug-107-hardcoded-route-incomplete-session-card.md) | Hardcoded Route Path in Incomplete Session Card | Resolved | Replaced hardcoded path with `toPracticeSessionRoute(sessionId)` |
| [BUG-106](../_archive/bugs/bug-106-stripe-customer-search-query-interpolation.md) | Stripe Customer Search Query Uses String Interpolation | Resolved | Added defensive metadata-value validation before Stripe search query construction |
| [BUG-104](../_archive/bugs/bug-104-double-pruning-webhook-and-hot-paths.md) | Double Pruning — Webhook Controller and Hot Paths Both Prune | Resolved | Removed redundant idempotency-key and rate-limit pruning from webhook controller; hot paths are the sole owners |
| [BUG-103](../_archive/bugs/bug-103-idempotency-key-pruning-never-wired.md) | Idempotency Key Pruning Never Wired to Production | Resolved | Added hot-path pruning in `withIdempotency`; webhook-side duplicate pruning was later removed in BUG-104 |
| [BUG-102](../_archive/bugs/bug-102-rate-limits-table-unbounded-growth.md) | Rate Limits Table Unbounded Growth | Resolved | Added `RateLimiter.pruneExpiredWindows` + Drizzle/Fake implementations and opportunistic pruning from `DrizzleRateLimiter.limit()` |
| [BUG-101](../_archive/bugs/bug-101-stripe-checkout-allows-duplicate-subscriptions-when-db-stale.md) | Stripe Checkout Can Create Duplicate Subscriptions if DB State Drifts | Resolved | Added Stripe-side active-subscription guard (`subscriptions.list`) before checkout session creation so stale local state cannot create duplicate paid subscriptions |
| [BUG-100](../_archive/bugs/bug-100-nested-main-landmarks-in-layouts.md) | Nested `<main>` Landmarks Across Root and Segment Layouts | Resolved | Root layout no longer wraps route trees in a global `<main>` and route-level shells now own `#main-content` landmarks |
| [BUG-099](../_archive/bugs/bug-099-checkout-success-race-concurrent-webhook-conflict.md) | Checkout Success Race with Concurrent Webhook CONFLICT | Resolved | Checkout success now uses authoritative customer conflict strategy so webhook-first races remain idempotent and redirect users to dashboard |
| [BUG-098](../_archive/bugs/bug-098-submit-answer-accepts-questions-not-in-session.md) | submitAnswer Accepts Questions Not in Session | Resolved | Added pre-insert session-question membership guard in `SubmitAnswerUseCase` to reject mismatches before persistence |
| [BUG-097](../_archive/bugs/bug-097-widespread-hard-coded-route-strings.md) | Widespread Hard-Coded Route Strings Across Codebase | Resolved | Completed route-constant sweep and added missing `ROUTES.SIGN_IN`/`ROUTES.SIGN_UP` constants |
| [BUG-096](../_archive/bugs/bug-096-toggle-bookmark-missing-idempotency-key.md) | `toggleBookmark` Missing Idempotency Key | Resolved | Wrapped bookmark toggle with `withIdempotency` and propagated client-generated keys |
| [BUG-095](../_archive/bugs/bug-095-set-question-mark-missing-idempotency-key.md) | `setPracticeSessionQuestionMark` Missing Idempotency Key | Resolved | Added schema support + `withIdempotency` and hook-level key propagation |
| [BUG-094](../_archive/bugs/bug-094-exam-review-error-misleading-try-again.md) | Exam Review Error State — Misleading "Try Again" Ends Session | Resolved | Split review-error actions into true retry path and explicit end-session path |
| [BUG-093](../_archive/bugs/bug-093-hard-coded-route-practice-view-navigation.md) | Hard-Coded Route in Practice View Navigation | Reclassified | Closed as duplicate of BUG-097 (single-instance subset) |
| [BUG-092](../_archive/bugs/bug-092-circular-module-dependency-practice-page-decomposition.md) | Circular Module Dependency in Practice Page Decomposition | Resolved | Stale report; cycle already removed via shared `practice-page-types.ts` extraction |
| [BUG-091](../_archive/bugs/bug-091-end-practice-session-missing-idempotency-key.md) | `endPracticeSession` Missing Idempotency Key | Resolved | Added idempotency key schema + `withIdempotency` replay support |
| [BUG-090](../_archive/bugs/bug-090-practice-error-state-missing-escape-hatch.md) | Practice Error State Has No Escape Hatch | Resolved | Added `Return to dashboard` escape hatch to practice error card |
| [BUG-089](../_archive/bugs/bug-089-bookmark-loading-effect-missing-loading-state.md) | Bookmark Loading Effect Missing Loading State | Resolved | Stale report; loading transition already existed in production code |
| [BUG-088](../_archive/bugs/bug-088-clerk-webhook-invalid-payload-message-leak.md) | Clerk Webhook Invalid-Payload Response Leaks Internal Error Message | Resolved | Clerk webhook now returns a generic validation failure message while logging internal context server-side |
| [BUG-087](../_archive/bugs/bug-087-practice-tag-load-throw-stalls-page.md) | Practice Tag Load Throw Leaves Page Stuck in Loading | Resolved | Added try/catch around tag loading and transitioned thrown failures to `tagLoadStatus: 'error'` with regression coverage |
| [BUG-086](../_archive/bugs/bug-086-session-history-drilldown-race-overwrites-selected-session.md) | Session History Drill-Down Race Can Show Wrong Session Details | Resolved | Added latest-request session guard in session-history drill-down so stale responses cannot overwrite selected session review |
| [BUG-085](../_archive/bugs/bug-085-out-of-order-question-load-overwrites-current-state.md) | Out-of-Order Question Loads Can Overwrite Current State | Resolved | Added request-sequencing guards to both question loaders and hooked request IDs in both practice flows so stale responses are discarded |
| [BUG-077](../_archive/bugs/bug-077-payment-processing-confusing-redirect.md) | Payment Processing Users See Wrong Error Message | Resolved | `CheckEntitlementUseCase` now returns redirect context; app layout redirects payment-processing and billing-recovery states with reason-specific messaging |
| [BUG-075](../_archive/bugs/bug-075-checkout-guard-entitlement-mismatch.md) | Pricing CTA Mismatch for Recoverable Subscription States | Resolved | Pricing now consumes entitlement context and shows manage-billing guidance for recoverable non-entitled states while preserving strict checkout guard |
| BUG-076 | Past-Due Immediate Lockout | Reclassified | Reclassified to [DEBT-136](../_archive/debt/debt-136-dunning-grace-period-for-past-due-subscribers.md) — feature request (dunning grace period), not a bug |
| [BUG-074](../_archive/bugs/bug-074-missed-questions-timestamp-tie-misclassification.md) | Missed Questions Can Be Misclassified on `answered_at` Timestamp Ties | Resolved | Use deterministic latest-attempt ranking (`answered_at DESC, id DESC`) for missed-question list/count |
| [BUG-073](../_archive/bugs/bug-073-tutor-mode-missing-session-summary-detail.md) | Tutor Mode Missing Per-Question Session Summary at End | Resolved | Implemented in SPEC-020 Phase 2 / DEBT-123 (PR #63) |
| [BUG-072](../_archive/bugs/bug-072-no-question-navigation-in-practice-sessions.md) | No Question Navigation in Practice Sessions (Both Modes) | Resolved | Implemented in SPEC-020 Phase 2 / DEBT-122 (PR #63) |
| [BUG-071](../_archive/bugs/bug-071-nextjs-preview-blank-page-csp.md) | Preview Deployment Rendered Blank Page After CSP Tightening | Resolved | Delegate CSP to Clerk middleware |
| [BUG-070](../_archive/bugs/bug-070-e2e-test-user-checkout-fails.md) | E2E Test User Checkout Failed (Stripe `this` Binding Bug) | Resolved | Bind `stripe.customers.search` to preserve `this` |
| [BUG-069](../_archive/bugs/bug-069-stripe-checkout-fails-localhost.md) | Stripe Checkout Fails for New Users (Lost `this` Binding) | Resolved | Bind `stripe.customers.search` to preserve `this` |

## Foundation Audits

- **2026-02-02:** [Foundation Audit Report #1](../_archive/audits/audit-001-foundation-report.md) — Vertical/horizontal trace of all critical paths
- **2026-02-07:** [Foundation Audit Report #2](../_archive/audits/audit-002-foundation-report-2.md) — Six-axis deep audit (billing, practice, auth, UI, DB, code quality)
- **2026-02-16:** Audit #3 — Five-axis codebase sweep (domain, application, adapters, frontend, config). 3 confirmed bugs (BUG-136, BUG-137, BUG-139) out of 17 initial findings after triple-check verification.

## Archived Bugs

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [BUG-248](../_archive/bugs/bug-248-main-branch-has-no-github-merge-gate.md) | Public `main` had no GitHub merge gate — resolved by creating the active `main-protection` ruleset (PR required, `test` status check required, force-push + deletion blocked, 0 required approvals to avoid solo-owner lockout). Verified via `gh api repos/:owner/:repo/rulesets`. | P1 | 2026-06-14 |
| [BUG-249](../_archive/bugs/bug-249-dependency-security-automation-disabled.md) | Dependency security automation disabled — resolved by enabling GitHub vulnerability alerts + automated security fixes (`dependabot_security_updates: enabled`) and raising the Dependabot security-update PR cap from 0 to 5. Residual esbuild advisory tracked in DEBT-419. | P1 | 2026-06-14 |
| [BUG-245](../_archive/bugs/bug-245-concurrent-two-tab-checkout-creates-duplicate-subscriptions.md) | Concurrent Two-Tab Checkout Creates Duplicate Subscriptions — fixed via a deterministic per-(user,plan,variant) Stripe idempotency key + lock-free post-create reconciliation (DB-layer dedup retained); Stripe "limit to 1 subscription" Dashboard backstop configured live; shipped with the DEBT-417 multi-clone test-isolation fix in PR #421. | P2 | 2026-06-13 |
| [BUG-159](../_archive/bugs/bug-159-review-mode-hydration-flicker.md) | Review-Mode Hydration Flicker — Transient Submit UI Shown in Review Route | P3 | 2026-02-26 |
| [BUG-158](../_archive/bugs/bug-158-quick-practice-page-ux-polish.md) | Quick Practice Page UX Polish — Back Link Arrow and Filter Tab Affordance | P3 | 2026-02-26 |
| [BUG-153](../_archive/bugs/bug-153-reattempt-label-incorrect-dashboard-bookmarks.md) | "Try Again" Label Shown for Correct Answers on Dashboard and Bookmarks Review | P3 | 2026-02-26 |
| [BUG-156](../_archive/bugs/bug-156-practice-view-post-submit-ux.md) | Practice View Post-Submit UX — Button Promotion and Auto-Scroll to Feedback | P1 | 2026-02-26 |
| [BUG-154](../_archive/bugs/bug-154-markdown-prose-spacing.md) | Markdown Prose Spacing — Question Stem and Explanation Paragraphs Run Together | P1 | 2026-02-26 |
| [BUG-152](../_archive/bugs/bug-152-history-questions-tab-navigator-mismatch.md) | History Questions Tab Navigator Mismatch — Ad-Hoc Questions Grouped Into Fake Session | P1 | 2026-02-26 |
| [BUG-147](../_archive/bugs/bug-147-user-upsert-unhandled-email-uniqueness-conflict.md) | User Upsert Fails on Email Uniqueness Conflict When Clerk User ID Changes | P1 | 2026-02-21 |
| [BUG-146](../_archive/bugs/bug-146-marketing-footer-sign-in-up-casing-inconsistent.md) | Marketing Footer “Sign in/up” Casing Is Inconsistent with the Rest of the App | P4 | 2026-02-17 |
| [BUG-145](../_archive/bugs/bug-145-frontend-ssot-docs-out-of-sync-with-question-view.md) | Frontend SSOT Docs Are Out of Sync with Current Question View Implementation | P3 | 2026-02-17 |
| [BUG-144](../_archive/bugs/bug-144-marketing-layout-nests-main-landmarks.md) | MarketingLayout Nests `<main>` Landmarks (Regression of BUG-100) | P2 | 2026-02-17 |
| [BUG-132](../_archive/bugs/bug-132-duplicate-nav-links-pricing-dashboard.md) | Duplicate Nav Links — "Pricing" and "Dashboard" Appear Twice in Header | P3 | 2026-02-13 |
| [BUG-116](../_archive/bugs/bug-116-cron-route-blocked-by-clerk-middleware.md) | Cron Reconcile Route Blocked by Clerk Middleware | P2 | 2026-02-08 |
| [BUG-115](../_archive/bugs/bug-115-cron-secret-validation-crashes-production-build.md) | DEBT-160 CRON_SECRET Startup Validation Crashes Production Build | P0 | 2026-02-08 |
| [BUG-114](../_archive/bugs/bug-114-subscribe-action-leaks-error-codes-to-url.md) | Subscribe Action Exposes Internal Error Codes in URL Params | P3 | 2026-02-08 |
| [BUG-113](../_archive/bugs/bug-113-orphaned-attempt-on-ended-session.md) | Orphaned Attempt Persisted When Submitting to Ended Session | P3 | 2026-02-08 |
| [BUG-112](../_archive/bugs/bug-112-navigator-fetch-silent-error-swallowing.md) | Navigator Fetch Silently Swallows Errors with No Error State | P2 | 2026-02-08 |
| [BUG-111](../_archive/bugs/bug-111-bookmark-toggle-silent-error-swallowing.md) | Bookmark Toggle Silently Swallows Errors | P2 | 2026-02-08 |
| [BUG-110](../_archive/bugs/bug-110-choice-button-aria-label-overrides-answer-text.md) | ChoiceButton aria-label Overrides Full Answer Text | P1 | 2026-02-08 |
| [BUG-105](../_archive/bugs/bug-105-concurrent-answer-submission-race-condition.md) | Concurrent Answer Submission Can Create Duplicate Attempts | P1 | 2026-02-08 |
| [BUG-109](../_archive/bugs/bug-109-cron-route-limit-mismatch.md) | Cron Route MAX_LIMIT (1000) Exceeds Reconciliation MAX_LIMIT (500) | P2 | 2026-02-08 |
| [BUG-108](../_archive/bugs/bug-108-submit-answer-unbounded-time-spent-seconds.md) | submitAnswer Allows Unbounded timeSpentSeconds at Use-Case Layer | P2 | 2026-02-08 |
| [BUG-107](../_archive/bugs/bug-107-hardcoded-route-incomplete-session-card.md) | Hardcoded Route Path in Incomplete Session Card | P2 | 2026-02-08 |
| [BUG-106](../_archive/bugs/bug-106-stripe-customer-search-query-interpolation.md) | Stripe Customer Search Query Uses String Interpolation | P1 | 2026-02-08 |
| [BUG-104](../_archive/bugs/bug-104-double-pruning-webhook-and-hot-paths.md) | Double Pruning — Webhook Controller and Hot Paths Both Prune | P2 | 2026-02-07 |
| [BUG-103](../_archive/bugs/bug-103-idempotency-key-pruning-never-wired.md) | Idempotency Key Pruning Never Wired to Production | P2 | 2026-02-07 |
| [BUG-102](../_archive/bugs/bug-102-rate-limits-table-unbounded-growth.md) | Rate Limits Table Unbounded Growth | P2 | 2026-02-07 |
| [BUG-101](../_archive/bugs/bug-101-stripe-checkout-allows-duplicate-subscriptions-when-db-stale.md) | Stripe Checkout Can Create Duplicate Subscriptions if DB State Drifts | P1 | 2026-02-07 |
| [BUG-100](../_archive/bugs/bug-100-nested-main-landmarks-in-layouts.md) | Nested `<main>` Landmarks Across Root and Segment Layouts | P2 | 2026-02-07 |
| [BUG-099](../_archive/bugs/bug-099-checkout-success-race-concurrent-webhook-conflict.md) | Checkout Success Race with Concurrent Webhook CONFLICT | P2 | 2026-02-07 |
| [BUG-098](../_archive/bugs/bug-098-submit-answer-accepts-questions-not-in-session.md) | submitAnswer Accepts Questions Not in Session | P2 | 2026-02-07 |
| [BUG-097](../_archive/bugs/bug-097-widespread-hard-coded-route-strings.md) | Widespread Hard-Coded Route Strings Across Codebase | P4 | 2026-02-07 |
| [BUG-096](../_archive/bugs/bug-096-toggle-bookmark-missing-idempotency-key.md) | `toggleBookmark` Missing Idempotency Key | P4 | 2026-02-07 |
| [BUG-095](../_archive/bugs/bug-095-set-question-mark-missing-idempotency-key.md) | `setPracticeSessionQuestionMark` Missing Idempotency Key | P4 | 2026-02-07 |
| [BUG-094](../_archive/bugs/bug-094-exam-review-error-misleading-try-again.md) | Exam Review Error State — Misleading "Try Again" Ends Session | P3 | 2026-02-07 |
| [BUG-093](../_archive/bugs/bug-093-hard-coded-route-practice-view-navigation.md) | Hard-Coded Route in Practice View Navigation | P4 | 2026-02-07 (Reclassified) |
| [BUG-092](../_archive/bugs/bug-092-circular-module-dependency-practice-page-decomposition.md) | Circular Module Dependency in Practice Page Decomposition | P4 | 2026-02-07 |
| [BUG-091](../_archive/bugs/bug-091-end-practice-session-missing-idempotency-key.md) | `endPracticeSession` Missing Idempotency Key | P3 | 2026-02-07 |
| [BUG-090](../_archive/bugs/bug-090-practice-error-state-missing-escape-hatch.md) | Practice Error State Has No Escape Hatch | P3 | 2026-02-07 |
| [BUG-084](../_archive/bugs/bug-084-webhook-error-message-leaks-context.md) | Webhook Error Response Leaks Implementation Details | P2 | 2026-02-07 |
| [BUG-083](../_archive/bugs/bug-083-stale-closure-mark-for-review.md) | Stale Closure Risk in usePracticeSessionMarkForReview | P3 | 2026-02-07 |
| [BUG-082](../_archive/bugs/bug-082-void-promises-swallow-errors.md) | Void Promises Silently Swallow Errors in Practice Page | P2 | 2026-02-07 |
| [BUG-081](../_archive/bugs/bug-081-bookmark-timeout-race-condition.md) | Bookmark Message Timeout Fires After Component Unmount | P2 | 2026-02-07 |
| [BUG-080](../_archive/bugs/bug-080-vercel-env-var-deployment-issues.md) | Vercel Env Var Trailing Newlines + Deployment Protection | P1 | 2026-02-06 |
| [BUG-079](../_archive/bugs/bug-079-preview-dev-environment-verification-failures.md) | Preview/Dev Environment Verification Failures | P1 | 2026-02-06 |
| [BUG-078](../_archive/bugs/bug-078-clerk-production-google-oauth-not-configured.md) | Clerk Production Sign-In Broken | P0 | 2026-02-06 |
| [BUG-077](../_archive/bugs/bug-077-payment-processing-confusing-redirect.md) | Payment Processing Users See Wrong Error Message | P2 | 2026-02-06 |
| [BUG-075](../_archive/bugs/bug-075-checkout-guard-entitlement-mismatch.md) | Pricing CTA Mismatch for Recoverable Subscription States | P2 | 2026-02-06 |
| [BUG-074](../_archive/bugs/bug-074-missed-questions-timestamp-tie-misclassification.md) | Missed Questions Can Be Misclassified on `answered_at` Timestamp Ties | P2 | 2026-02-06 |
| [BUG-071](../_archive/bugs/bug-071-nextjs-preview-blank-page-csp.md) | Preview Deployment Rendered Blank Page After CSP Tightening | P0 | 2026-02-05 |
| [BUG-070](../_archive/bugs/bug-070-e2e-test-user-checkout-fails.md) | E2E Test User Checkout Failed (Stripe `this` Binding Bug) | P1 | 2026-02-05 |
| [BUG-069](../_archive/bugs/bug-069-stripe-checkout-fails-localhost.md) | Stripe Checkout Fails for New Users (Lost `this` Binding) | P1 | 2026-02-05 |
| [BUG-067](../_archive/bugs/bug-067-clerk-shows-ntx-university-name.md) | Clerk Shows Wrong App Name | P3 | 2026-02-05 |
| [BUG-066](../_archive/bugs/bug-066-clerk-development-keys-in-production.md) | Clerk Development Keys in Production | P1 | 2026-02-05 |
| [BUG-064](../_archive/bugs/bug-064-clerk-key-mismatch-warning.md) | Clerk Key Mismatch Warning (False Alarm) | P4 | 2026-02-05 |
| [BUG-062](../_archive/bugs/bug-062-practice-session-modes-not-working.md) | Practice Session Modes Not Working (False Alarm) | P1 | 2026-02-05 |
| [BUG-063](../_archive/bugs/bug-063-csp-blocks-clerk-blob-workers.md) | CSP Blocks Clerk Blob Workers | P3 | 2026-02-05 |
| [BUG-068](../_archive/bugs/bug-068-reattempt-page-ux-confusion.md) | Reattempt Page UX Confusion - Buttons After Submit | P3 | 2026-02-05 |
| [BUG-065](../_archive/bugs/bug-065-explanation-not-available-some-questions.md) | Exam Mode Shows Feedback When It Shouldn't | P2 | 2026-02-05 |
| [BUG-061](../_archive/bugs/bug-061-debt-index-claims-no-active-items-while-listing-debt-102.md) | Debt Index Claims No Active Items While Listing DEBT-102 | P4 | 2026-02-05 |
| [BUG-060](../_archive/bugs/bug-060-question-reattempt-submit-not-disabled-while-loading.md) | Question Reattempt Submit Not Disabled While Loading | P3 | 2026-02-05 |
| [BUG-059](../_archive/bugs/bug-059-marketing-homepage-low-contrast-in-light-mode.md) | Marketing Homepage Low Contrast in Light Mode | P1 | 2026-02-05 |
| [BUG-058](../_archive/bugs/bug-058-theme-toggle-does-not-work-without-themeprovider.md) | Theme Toggle Does Not Work Without ThemeProvider | P3 | 2026-02-05 |
| [BUG-057](../_archive/bugs/bug-057-choice-label-badges-render-clipped.md) | Choice Label Badges Render Clipped | P3 | 2026-02-05 |
| [BUG-056](../_archive/bugs/bug-056-shuffled-choice-labels-out-of-order.md) | Shuffled Choice Labels Display Out of Order | P3 | 2026-02-05 |
| [BUG-055](../_archive/bugs/bug-055-post-login-redirects-to-landing-page.md) | Authenticated Subscribers Redirected to Landing Page After Sign-In | P2 | 2026-02-04 |
| [BUG-054](../_archive/bugs/bug-054-async-state-updates-after-unmount-in-page-logic.md) | Async State Updates After Component Unmount in Page Logic | P2 | 2026-02-03 |
| [BUG-053](../_archive/bugs/bug-053-checkout-success-missing-user-id-metadata.md) | Checkout Success Accepts Missing `metadata.user_id` | P1 | 2026-02-03 |
| [BUG-052](../_archive/bugs/bug-052-non-entitled-subscriptions-could-start-new-checkout.md) | Non-Entitled Subscriptions Could Start New Checkout Sessions | P1 | 2026-02-03 |
| [BUG-051](../_archive/bugs/bug-051-checkout-success-redirects-with-non-entitled-status.md) | Checkout Success Redirects with Non-Entitled Status | P1 | 2026-02-03 |
| [BUG-050](../_archive/bugs/bug-050-stripe-webhook-missing-user-id-metadata.md) | Stripe Webhook Skips Events Missing `metadata.user_id` | P1 | 2026-02-03 |
| [BUG-049](../_archive/bugs/bug-049-silent-pruning-failures-stripe-webhook.md) | Silent Pruning Failures in Stripe Webhook Controller | P3 | 2026-02-03 |
| [BUG-048](../_archive/bugs/bug-048-webhook-rate-limiter-fails-open.md) | Webhook Rate Limiter Failures Fail Open | P2 | 2026-02-03 |
| [BUG-047](../_archive/bugs/bug-047-multiple-subscriptions-per-user.md) | Multiple Subscriptions Created Per User | P1 | 2026-02-02 |
| [BUG-046](../_archive/bugs/bug-046-review-page-ambiguous-column.md) | Review Page SQL Error — Ambiguous Column Reference | P1 | 2026-02-02 |
| [BUG-045](../_archive/bugs/bug-045-checkout-missing-current-period-end.md) | Checkout Success Validation Fails — missing_current_period_end | P1 | 2026-02-02 |
| [BUG-044](../_archive/bugs/bug-044-checkout-success-stale-cache.md) | Checkout Success Page Serving Stale Code | P2 | 2026-02-02 |
| [BUG-043](../_archive/bugs/bug-043-checkout-success-not-public-route.md) | Checkout Success Route Not Public (Stripe Return) | P2 | 2026-02-02 |
| [BUG-041](../_archive/bugs/bug-041-webhook-subscription-created-missing-metadata.md) | Webhook 500 on customer.subscription.created (Missing metadata.user_id) | P2 | 2026-02-02 |
| [BUG-042](../_archive/bugs/bug-042-checkout-success-silent-validation-failure.md) | Checkout Success Redirects Without Diagnostics | P1 | 2026-02-02 |
| [BUG-040](../_archive/bugs/bug-040-clerk-key-mismatch-infinite-redirect.md) | Clerk Infinite Redirect Loop Warning (Key Mismatch) | P2 | 2026-02-02 |
| [BUG-039](../_archive/bugs/bug-039-checkout-success-searchparams-not-awaited.md) | Checkout Success Page Crashes — searchParams Not Awaited | P1 | 2026-02-02 |
| [BUG-028](../_archive/bugs/bug-028-inconsistent-cascade-delete-attempts.md) | Inconsistent Cascade Delete for Attempts | P2 | 2026-02-02 |
| [BUG-024](../_archive/bugs/bug-024-entitlement-race-condition-past-due.md) | Entitlement Race Condition During Payment Failure | P2 | 2026-02-02 |
| [BUG-016](../_archive/bugs/bug-016-memory-exhaustion-power-users.md) | Memory Exhaustion for Power Users — All Attempts Loaded Into Memory | P1 | 2026-02-02 |
| [BUG-023](../_archive/bugs/bug-023-missing-clerk-user-deletion-webhook.md) | Missing Clerk Webhook for User Deletion — Orphaned Data | P2 | 2026-02-02 |
| [BUG-019](../_archive/bugs/bug-019-missing-bookmarks-view-page.md) | Missing Bookmarks View Page — Users Can Bookmark But Can't View | P2 | 2026-02-02 |
| [BUG-020](../_archive/bugs/bug-020-missing-review-missed-questions-page.md) | Missing Review/Missed Questions Page — Dead Controller Code | P2 | 2026-02-02 |
| [BUG-021](../_archive/bugs/bug-021-practice-sessions-never-started.md) | Practice Sessions Never Started/Ended — Dead Session Controller Code | P2 | 2026-02-02 |
| [BUG-025](../_archive/bugs/bug-025-missing-subscription-event-handlers.md) | Missing Subscription Event Handlers (paused/resumed) | P2 | 2026-02-02 |
| [BUG-026](../_archive/bugs/bug-026-concurrent-checkout-sessions.md) | No Protection Against Concurrent Checkout Sessions | P2 | 2026-02-02 |
| [BUG-027](../_archive/bugs/bug-027-stripe-events-unbounded-growth.md) | Stripe Events Table Unbounded Growth | P2 | 2026-02-02 |
| [BUG-038](../_archive/bugs/bug-038-missing-clerk-user-updated-webhook.md) | Missing Clerk user.updated Webhook — Email Sync Gap | P3 | 2026-02-02 |
| [BUG-037](../_archive/bugs/bug-037-no-mobile-navigation-menu.md) | No Mobile Navigation Menu | P2 | 2026-02-02 |
| [BUG-036](../_archive/bugs/bug-036-no-loading-state-subscribe-buttons.md) | No Loading State on Subscribe Buttons | P2 | 2026-02-02 |
| [BUG-022](../_archive/bugs/bug-022-missing-loading-states-on-forms.md) | Missing Loading States on Form Buttons | P3 | 2026-02-02 |
| [BUG-018](../_archive/bugs/bug-018-silent-fallbacks-in-controllers.md) | Silent Fallbacks in Controllers — Data Inconsistency | P2 | 2026-02-02 |
| [BUG-017](../_archive/bugs/bug-017-billing-button-without-subscription.md) | Billing Page Shows "Manage in Stripe" When No Subscription | P2 | 2026-02-02 |
| [BUG-035](../_archive/bugs/bug-035-error-banner-not-clearable.md) | Error Banner Not Clearable on Pricing Page | P3 | 2026-02-02 |
| [BUG-034](../_archive/bugs/bug-034-webhook-error-context-lost.md) | Webhook Catch Block Loses Error Context | P2 | 2026-02-02 |
| [BUG-033](../_archive/bugs/bug-033-stale-closure-toggle-bookmark.md) | Stale Closure in onToggleBookmark — Wrong Question Bookmarked | P2 | 2026-02-02 |
| [BUG-032](../_archive/bugs/bug-032-state-update-after-unmount.md) | State Update After Component Unmount in Practice Page | P2 | 2026-02-02 |
| [BUG-031](../_archive/bugs/bug-031-non-unique-react-key-dashboard.md) | Non-Unique React Key in Dashboard Recent Activity | P3 | 2026-02-02 |
| [BUG-015](../_archive/bugs/bug-015-fragile-webhook-error-matching.md) | Fragile Webhook Error Matching Uses String Instead of Error Code | P1 | 2026-02-02 |
| [BUG-029](../_archive/bugs/bug-029-answer-choices-not-randomized.md) | Answer Choices Not Randomized — Test Validity Issue | P1 | 2026-02-02 |
| [BUG-030](../_archive/bugs/bug-030-time-spent-always-zero.md) | Time Spent Always Zero — No Timer Implementation | P1 | 2026-02-02 |
| [BUG-014](../_archive/bugs/bug-014-pricing-subscribe-action-not-working.md) | Pricing Subscribe Action Not Working (Server Action Serialization) | P1 | 2026-02-02 |
| [BUG-013](../_archive/bugs/bug-013-silent-error-handling.md) | Silent Error Handling — Errors Swallowed Without Logging or User Feedback | P1 | 2026-02-02 |
| [BUG-012](../_archive/bugs/bug-012-incomplete-feature-wiring.md) | Incomplete Feature Wiring — Missing Controllers and E2E Coverage | P2 | 2026-02-02 |
| [BUG-011](../_archive/bugs/bug-011-ux-flow-gaps-multiple-issues.md) | UX Flow Gaps — Multiple Navigation and Wiring Issues | P1 | 2026-02-02 |
| [BUG-010](../_archive/bugs/bug-010-database-not-seeded.md) | Database Not Seeded — No Questions Available | P1 | 2026-02-02 |
| [BUG-001](../_archive/bugs/bug-001-pnpm-s-vim-hang.md) | `pnpm -s …` Can Launch Vim and Hang | P2 | 2026-02-01 |
| [BUG-002](../_archive/bugs/bug-002-next-build-node-env-skip-clerk.md) | `NEXT_PUBLIC_SKIP_CLERK` blocked `next build` | P1 | 2026-02-01 |
| [BUG-003](../_archive/bugs/bug-003-fake-repo-throws-error-not-application-error.md) | FakePracticeSessionRepository throws Error | P0 | 2026-01-31 |
| [BUG-004](../_archive/bugs/bug-004-submit-answer-hardcoded-time-spent.md) | SubmitAnswer hardcodes timeSpentSeconds | P2 | 2026-01-31 |
| [BUG-005](../_archive/bugs/bug-005-auth-nav-dashboard-link-404.md) | Nav Links to Missing `/app/dashboard` | P2 | 2026-02-01 |
| [BUG-006](../_archive/bugs/bug-006-dark-mode-not-applied.md) | Dark Theme Not Applied | P4 | 2026-02-01 |
| [BUG-007](../_archive/bugs/bug-007-question-frontmatter-duplicate-tag-slugs.md) | Duplicate Tag Slugs in Frontmatter | P3 | 2026-02-01 |
| [BUG-008](../_archive/bugs/bug-008-stripe-webhook-endpoint-missing.md) | Stripe Webhook Endpoint Missing (`/api/stripe/webhook`) | P0 | 2026-02-01 |
| [BUG-009](../_archive/bugs/bug-009-vercel-preview-deployment-rate-limit.md) | Vercel Preview Deployment Status Fails Due to Rate Limit | P3 | 2026-02-01 |

## Bug Statuses

- **Open** — Bug confirmed, not yet fixed
- **In Progress** — Fix being developed
- **Blocked - Manual Action Required** — Requires external configuration (Clerk/Vercel/etc) not fixable in-repo
- **Resolved** — Fix merged and verified
- **Won't Fix** — Decided not to fix (with justification)
- **Reclassified** — Root cause accepted, ownership moved to another tracked item (for example technical debt or a feature spec)

## Priority Levels

- **P0** — Critical: System broken, data loss, security issue
- **P1** — High: Major functionality broken
- **P2** — Medium: Feature degraded but workaround exists
- **P3** — Low: Minor issue, cosmetic
- **P4** — Trivial: Nice to have

---

## How to Report a New Bug

1. Create `bug-NNN-short-description.md` using the template below
2. Set status to "Open"
3. Assign priority based on impact
4. Submit PR for triage

## Bug Template

```markdown
# BUG-NNN: Short Title

**Status:** Open | In Progress | Blocked - Manual Action Required | Resolved | Won't Fix | Reclassified
**Priority:** P0 | P1 | P2 | P3 | P4
**Date:** YYYY-MM-DD

---

## Description

What is the bug? What behavior is observed vs expected?

## Steps to Reproduce

1. ...
2. ...
3. ...

## Root Cause

Why did this happen? (Fill in after investigation)

## Fix

What was done to fix it? (Fill in after resolution)

## Verification

How was the fix verified?

- [ ] Unit test added
- [ ] Integration test added
- [ ] Manual verification

## Related

- Links to PRs, commits, related bugs/debt
```

---

## Archive

Resolved bugs are archived to `docs/_archive/bugs/` after verification.
