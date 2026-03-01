# Practice Engine: Retry and Reattempt Logic

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Current retry/reattempt behavior, cross-mode consistency rules, and target-state design
> **Last Verified:** 2026-03-01
> **Industry Reference:** Modeled after the [Anki two-layer pattern](https://github.com/ankidroid/Anki-Android/wiki/Database-Structure) (immutable review log + mutable card state) and [UWorld's "latest attempt wins"](https://www.uworld.com/forum/messages.aspx?TopicID=27875) status model.

---

## 1. Core Design Principle: Two-Layer Model

The retry system separates two distinct concepts that must never be conflated:

### Layer 1: Attempt History (Immutable, Append-Only)

Every answer submission creates a new `attempt` row. Attempts are **never mutated or deleted**. This preserves the full learning chronology: what the user answered, when, in what context, and whether it was correct.

### Layer 2: Question Status (Derived, Latest-Attempt-Wins)

A question's current "status" for a given user (correct / incorrect / unanswered) is always derived from their **most recent attempt**, regardless of which context that attempt came from. This is what powers the "Incorrect" filter on the Practice page and determines whether a question appears as mastered.

### Why Two Layers Matter

| Question | Answered by |
|----------|-------------|
| "How did I do on Tuesday's tutor session?" | Layer 1 — session-scoped attempts only. **Immutable.** Score is 15/20 forever. |
| "Do I currently know question #7?" | Layer 2 — latest attempt across all contexts. **Updates on every retry.** |
| "How many times have I attempted question #7?" | Layer 1 — count of all attempt rows for that question. |

**A retry never changes a session score.** A retry only changes the question's global status.

---

## 2. Terms

- **Attempt:** A persisted answer submission row in `attempts`. Immutable after creation.
- **Session attempt:** An attempt with a non-null `practiceSessionId`. Belongs to a specific tutor/exam session.
- **Standalone attempt:** An attempt with `practiceSessionId = null`. Created from retries, bookmarks, history review, dashboard review, or ad-hoc practice.
- **Review mode:** Question page loaded with `mode=review`, which hydrates a prior attempt via `getPreviousAttempt`.
- **Session review:** Review route with `sessionId` (`from=practice|history|dashboard&mode=review&sessionId=...`). **Current code:** read-only. **Target contract:** inline retry in-flow, with immutable session snapshot.
- **Standalone review:** Review route without `sessionId` (`from=history|dashboard|bookmarks&mode=review...`). Allows retry.
- **Reattempt / retry:** User action after reviewing feedback ("Try Again" / "Practice Again") that resets local form state and allows a new submission. Creates a new standalone attempt — never mutates the original.
- **Inline retry:** A retry performed within the session review flow without navigating away. The user stays in the session review "daemon" (prev/next navigation, question grid) and retries a question in place. Persistence is identical to any other retry (standalone attempt with provenance), but the UX keeps the user in context.
- **Provenance:** Metadata on a retry attempt linking it back to its origin (which attempt it retries, which context it came from, which session if applicable).
- **Displayed attempt:** The exact attempt shown to the user when they click "Try Again." This is the only valid source for `retryOfAttemptId`.

---

## 3. Current Behavior (Code Truth, 2026-03-01)

### 3.1 Context Matrix

| Context | Route / Entry | Previous attempt auto-load | Submit in-context | Reattempt button | Persistence behavior |
|---|---|---|---|---|---|
| Tutor session (active) | `/app/practice/[sessionId]` | Session state restore (`session.previousSubmission`) | Yes (once per question) | No | Writes `attempt` with `practiceSessionId`; updates `practice_sessions.params_json.questionStates` |
| Exam session (active) | `/app/practice/[sessionId]` | Session state restore (feedback hidden until review/summary) | Yes (once per question) | No | Same as tutor; explanations suppressed until review stage |
| Exam review stage | `/app/practice/[sessionId]` (review panel) | N/A | No question-level submit | No | No question attempts written here |
| Session review (history/practice/dashboard sessions) | `/app/questions/[slug]?from=history\|practice\|dashboard&mode=review&sessionId=...` | Yes (`attempt` or `session_unanswered`) | No | No | Read-only; no new attempts |
| History questions (standalone review) | `/app/questions/[slug]?from=history&mode=review` | Yes (latest attempt) | Only fallback when hydration misses | Yes | New standalone `attempt` (`practiceSessionId = null`) |
| Dashboard review (standalone review) | `/app/questions/[slug]?from=dashboard&mode=review&attemptId=...` | Yes (specific attempt by `attemptId`) | Only fallback when hydration misses | Yes | New standalone `attempt` |
| Bookmarks review (standalone review) | `/app/questions/[slug]?from=bookmarks&mode=review` | Yes (latest attempt, fallback for never-answered) | Only fallback when hydration misses | Yes | New standalone `attempt` |
| Quick Practice | `/app/practice/quick` | No | Yes | No (Next flow only) | New standalone `attempt` |

### 3.2 Rules Enforced in Code

1. **Session review is currently fully read-only (gap: should allow inline retry).**
`canReattemptInContext({ mode, sessionId })` returns `false` for `mode=review` with `sessionId`, and both Submit and Try Again are hidden in UI. **This is the primary gap to fix** — session review should allow inline retry while keeping the session data immutable. See §5.3 Rule 7 for the target behavior.

2. **Reattempt is client-side state reset, not persistence.**
`reattemptQuestion()` clears `selectedChoiceId` and `submitResult`, rotates idempotency key, and restarts timing.

3. **Session attempts are immutable after session end.**
`SubmitAnswerUseCase` rejects ended sessions (`CONFLICT`), and session submissions require `sessionId`.

4. **One attempt per question per session.**
`attempts_session_question_uq` prevents duplicates for `(practice_session_id, question_id)` when `practice_session_id IS NOT NULL`.

5. **Standalone reattempts always create new attempts.**
Question page submissions omit `sessionId`, so they persist as ad-hoc attempts and do not mutate ended-session state.

6. **`getPreviousAttempt` currently allows both `attemptId` and `sessionId` together.**
Use case behavior is explicit: `attemptId` takes precedence over `sessionId`. This is tested and intentional in current code, but it is an ambiguous contract for provenance and should be tightened in the retry unification work.

7. **Hydration outcomes are currently conflated in the question-page controller.**
`loadPreviousAttempt()` currently treats thrown errors, action errors, and missing attempt payloads as the same no-op path. In standalone review this silently degrades into fresh-attempt submit mode; in session review it can produce a locked read-only view with no prior-answer context.

### 3.3 Finite State Model (What Must Be Explicit)

Retry behavior is fully determined by four axes:

| Axis | Values |
|---|---|
| Container context | `active_session`, `session_review`, `standalone_review`, `quick_practice` |
| Hydration outcome | `attempt`, `session_unanswered`, `no_prior_attempt`, `hydration_error` |
| User action | `submit_first_attempt`, `try_again`, `navigate_prev_next` |
| Persistence contract | `session_attempt` or `standalone_attempt` |

The missing implementation contract today is around the `hydration outcome` axis (`no_prior_attempt` vs `hydration_error`) and the `attemptId + sessionId` ambiguity.

---

## 4. Audit Findings (P0-P4)

| Priority | Finding | Slice | Why this matters |
|---|---|---|---|
| P0 | None found in retry flow | — | No data-loss/security-critical retry defect identified in this audit. |
| P1 | None found in retry flow | — | No immediate business-critical regression identified. |
| P2 | Retry lineage is not modeled (`attempts` has no `retryOfAttemptId` / retry origin) | Domain, application, DB | We cannot distinguish original session attempts from post-review retries in analytics/reporting. |
| P2 | Session review cannot retry inline and forces context-switching to practice elsewhere | Question-page UX | Breaks tutor/exam review flow expectations; high-friction study loop. |
| P2 | Review hydration does not distinguish `no_prior_attempt` from `hydration_error` | Question-page controller/UX | Users can unknowingly submit duplicate attempts after transient failures; fallback intent is not explicit. |
| P2 | Mixed `attemptId + sessionId` semantics are currently permissive (`attemptId` precedence) | Route/controller contract | Ambiguous source-of-truth for provenance if not normalized in retry implementation. |
| P3 | Docs drift: retry behavior in `question-rendering-architecture.md` and coverage notes are partially stale vs implementation | Practice-engine docs | Team decision-making is slower/riskier when retry contracts are documented inconsistently. |
| P4 | Terminology drift across docs (`retry`, `reattempt`, `Try Again`, `Practice Again`) | Product language | Increases implementation ambiguity for future changes. |

---

## 5. Target Contract (Recommended SSOT)

### 5.1 Immutability Rules

1. **Session history is immutable.** Ended session scores/question states are historical snapshots. A retry from session review **never** changes the session score, question states, or any session-scoped data.

2. **Attempt rows are immutable.** Once an attempt is written, it is never updated or deleted. Every retry creates a new row.

3. **Session-scoped reporting uses session-scoped attempts only.** Session summary (e.g., "15/20 correct") is always computed from attempts where `practiceSessionId = sessionId`. Standalone retries are excluded from this calculation.

### 5.2 Retry Behavior Rules

4. **Retry always creates a new standalone attempt row.** The new attempt has `practiceSessionId = null` and carries provenance metadata linking it back to the prior attempt and origin context.

5. **Question-status classification uses latest-attempt-wins.** Status-based surfaces (Practice `incorrect/unanswered/bookmarked` filters and History Questions correctness row state) should classify by the user's most recent attempt for that question, regardless of context. Aggregate analytics (e.g., total attempts, streak, overall accuracy) may still count all attempts by product decision.

6. **Every retry carries provenance metadata.** A retry attempt records: (a) which prior attempt it retries (`retryOfAttemptId`), (b) which context it came from (`retryOrigin`), and optionally (c) which session the original attempt belonged to (`retrySessionId`).

### 5.3 UX Rules

7. **Session review supports inline retry without leaving the review flow.** The user stays within the session review daemon (prev/next navigation, question grid). Clicking "Try Again" resets the form inline; submitting creates a standalone attempt with provenance. The session score and session-scoped data remain immutable — only the persistence layer knows this is a standalone attempt. From the user's perspective, they retried Q7 and moved on to Q8 without ever leaving their review.

8. **Session review question grid preserves original session state.** After an inline retry, the question grid should visually indicate the original session result (e.g., Q7 was incorrect in session) while also showing the retry occurred. The session score banner (e.g., "15/20") never changes. UX details (badge, overlay, color treatment) are a frontend design decision, but the principle is: original session snapshot stays visible, retry is additive context.

9. **Review hydration outcomes are explicit in all review contexts.** Distinguish:
   - `attempt` loaded (normal review),
   - `session_unanswered` loaded (read-only reveal),
   - `no_prior_attempt` (legitimate first-attempt path),
   - `hydration_error` (transient/system failure).
   Only `no_prior_attempt` may default to fresh attempt. `hydration_error` requires explicit user confirmation.

10. **Route contract must be deterministic for provenance.** `attemptId` and `sessionId` are mutually exclusive in normalized question-page review context. If both are present in URL, normalize deterministically at the entry boundary and emit a warning event.

11. **Retry provenance must come from displayed review state, not URL params.** `retryOfAttemptId` is set only from the hydrated displayed attempt currently in state at click time.

---

## 6. Walkthrough: What Happens When You Retry

### Scenario A: Inline Retry During Session Review (the critical path)

1. User completed a 20-question tutor session. Score: 15/20.
2. User reviews the session from History. Navigating through questions with prev/next and the question grid.
3. User lands on question #7 — they got it wrong. They see their wrong answer, the correct answer, and the explanation.
4. User clicks **"Try Again"** — without leaving the session review flow.
5. Form resets inline. User selects a new answer and submits.
6. **What happens:**
   - A **new standalone attempt** is created behind the scenes (`practiceSessionId = null`, `retryOrigin=session_review`, `retryOfAttemptId=<original-attempt-id>`, `retrySessionId=<session-id>`).
   - The **session score stays 15/20**. Unchanged. The session's original attempt for Q7 still says "incorrect."
   - Q7's **global status** updates based on the retry result. If correct → Q7 drops from the "Incorrect" filter on the Practice page.
   - The user sees their new result inline, then clicks **"Next"** to continue reviewing Q8. They never leave the session review daemon.
   - The **question grid** still shows Q7's original session result (incorrect) but may visually indicate a retry occurred (UX detail TBD).
   - The **attempt history** for Q7 now shows: (a) original session attempt (incorrect), (b) standalone retry (correct).

### Scenario B: Retry from Bookmarks (cross-origin)

1. User bookmarked question #12 during a tutor session where they got it wrong.
2. Later, user opens Bookmarks → clicks question #12.
3. Review mode loads: shows the prior answer (from tutor session), correct answer, explanation.
4. User clicks **"Try Again"**.
5. **What happens:**
   - A new standalone attempt is created with `retryOrigin=bookmarks`, `retryOfAttemptId=<original-attempt-id>`.
   - The original tutor session score is **unchanged**.
   - Q12's global status updates based on the retry result.

**Key edge case:** The bookmarked question's prior attempt may have originated from a tutor session, exam session, quick practice, or any standalone context. The provenance chain captures this: the retry points to the prior attempt, which in turn carries its own `practiceSessionId` (or null). No special handling needed per origin — provenance is always a pointer to the prior attempt, and the prior attempt already knows its own context.

### Scenario C: Retry from History (standalone review)

1. User browses History → Questions tab. Sees Q3 marked incorrect.
2. Clicks Q3. Review mode loads: shows latest attempt, explanation.
3. User clicks **"Try Again"**. Submits new answer.
4. **What happens:**
   - New standalone attempt with `retryOrigin=history`, linked to prior attempt.
   - Whatever session Q3 originally belonged to: **unchanged**.
   - Q3's global status updates.

### Scenario D: Quick Practice (no retry concept)

1. User starts Quick Practice (Incorrect filter, 20 questions).
2. Each question is a fresh attempt. No review hydration, no retry button.
3. After answering, user sees feedback + "Next Question."
4. **The "Incorrect" filter IS the session-level retry mechanism.** It feeds the user questions they previously got wrong. Each new answer updates that question's global status. If they get it right this time, it won't appear in future "Incorrect" filtered sessions.

### Scenario E: Session Review Unanswered Question (no parent attempt)

1. User reviews an ended session and lands on a question they skipped.
2. Page shows `session_unanswered` reveal (correct answer + explanation).
3. User clicks **"Try Again"** inline (target behavior).
4. **What happens:**
   - A standalone attempt is created with `retryOrigin=session_review`, `retrySessionId=<session-id>`.
   - `retryOfAttemptId` is `null` (there is no displayed parent attempt to point to).
   - Session score and question grid snapshot remain unchanged.

### Scenario F: Review Hydration Error (explicit fallback)

1. User opens a standalone review route and hydration times out/errors.
2. UI shows explicit error/fallback state ("Could not load previous answer").
3. User chooses either retry hydration or explicit "Answer as new."
4. **What happens:**
   - If user retries hydration and it succeeds: normal review + provenance-enabled Try Again.
   - If user chooses "Answer as new": standalone attempt with no retry provenance (not attributable to a displayed prior attempt).

---

## 7. Cross-Origin Provenance: The Bookmark Gotcha

A question can be bookmarked from ANY context, and a user may encounter the same question across multiple contexts over time. The retry system must handle this cleanly:

| Original attempt context | User retries from | Provenance on retry |
|---|---|---|
| Tutor session | Session review inline retry | `retryOrigin=session_review`, `retryOfAttemptId=<tutor-attempt>`, `retrySessionId=<tutor-session>` |
| Tutor session | Bookmarks | `retryOrigin=bookmarks`, `retryOfAttemptId=<tutor-attempt>` |
| Tutor session | History standalone | `retryOrigin=history`, `retryOfAttemptId=<tutor-attempt>` |
| Exam session | Session review inline retry | `retryOrigin=session_review`, `retryOfAttemptId=<exam-attempt>`, `retrySessionId=<exam-session>` |
| Exam session | Bookmarks | `retryOrigin=bookmarks`, `retryOfAttemptId=<exam-attempt>` |
| Exam or Tutor session | Dashboard session review (`from=dashboard&sessionId`) | `retryOrigin=session_review`, `retryOfAttemptId=<session-attempt>`, `retrySessionId=<session-id>` |
| Session unanswered reveal | Session review inline retry | `retryOrigin=session_review`, `retrySessionId=<session-id>`, `retryOfAttemptId=null` |
| Quick Practice (standalone) | History standalone | `retryOrigin=history`, `retryOfAttemptId=<standalone-attempt>` |
| Quick Practice (standalone) | Bookmarks | `retryOrigin=bookmarks`, `retryOfAttemptId=<standalone-attempt>` |
| Prior standalone retry | Any | `retryOrigin=<context>`, `retryOfAttemptId=<prior-retry-attempt>` (chains are allowed) |
| Never answered (bookmarked before attempting) | Bookmarks | No provenance (first attempt, not a retry) |

**The rule is simple:** `retryOfAttemptId` always points to the specific attempt that was displayed in review when the user clicked "Try Again." The system doesn't need to know the full chain — just one hop back. The chain is reconstructable by following `retryOfAttemptId` pointers.

---

## 8. Required Changes by Layer

| Layer | Required change | Candidate files |
|---|---|---|
| Domain | Extend `Attempt` with optional retry provenance (`retryOfAttemptId`, `retryOrigin`, `retrySessionId`) | `src/domain/entities/attempt.ts` |
| Application | Accept optional retry metadata in submit flow; validate linkage (user ownership, question match, parent exists) | `src/application/use-cases/submit-answer.ts`, ports under `src/application/ports/` |
| Adapters (controller) | Extend `submitAnswer` input schema for optional retry metadata | `src/adapters/controllers/question-controller.ts` |
| Infrastructure (DB) | Add nullable retry lineage columns + index on `retryOfAttemptId` | `db/schema.ts`, migration files |
| Question-page frontend | Add explicit review hydration state (`attempt` / `session_unanswered` / `no_prior_attempt` / `hydration_error`), track displayed attempt id in state, and pass retry provenance into submit payload | `app/(app)/app/questions/[slug]/question-page-logic.ts`, `use-question-page-controller.ts` |
| Session-review UX | Enable inline retry within session review flow: show "Try Again" button, reset form in place, submit as standalone attempt with session provenance. User stays in session daemon (prev/next navigation preserved). Session score/grid unchanged. | `app/(app)/app/questions/[slug]/question-page-client.tsx`, `question-page-logic.ts` |
| Route normalization | Normalize or reject mixed `attemptId + sessionId` review params at question-page entry and emit warning telemetry | `app/(app)/app/questions/[slug]/page.tsx`, `question-view-controller.ts` |
| Observability | Emit retry events/counters by origin and outcome | Controller/use-case logging path |
| Documentation | Sync retry behavior across practice-engine docs; retire stale terminology | `docs/practice-engine/*` |

---

## 9. Mode-by-Mode Intended End State

| Mode / Page | Retry policy | What the user sees |
|---|---|---|
| Tutor active session | No in-place retry after submit; continue session flow. | Answer → feedback → next question. |
| Exam active session | No in-place retry; exam integrity preserved. | Answer → next question (no feedback until review). |
| Session review (tutor/exam, from history/practice/dashboard sessions) | Inline retry within the review flow; session data immutable. | Prior answer + explanation + "Try Again" button. User retries in place, then continues prev/next to the next question. Session score unchanged. |
| History questions standalone review | Review-first + retry allowed; retry persisted with provenance. | Prior answer + explanation + "Try Again" / "Practice Again" button. |
| Dashboard standalone review | Review-first + retry allowed; retry persisted with provenance. | Same as history standalone. |
| Bookmarks standalone review | Review-first + retry allowed; retry persisted with provenance. | Same as history standalone. |
| Quick Practice | Fresh-attempt loop; not a retry surface. "Incorrect" filter is the session-level retry. | Fresh question → answer → feedback → next. |

---

## 10. Acceptance Criteria for Retry Unification

1. Inline retry within session review creates a standalone attempt (never a session-scoped attempt). The user stays in the session review flow.
2. Session scores are never mutated by retries, regardless of where the retry happens.
3. All retries (session review, standalone review, bookmarks, history, dashboard) create new standalone attempts with provenance metadata.
4. Question global status (correct/incorrect/unanswered) always reflects the latest attempt, regardless of context.
5. The "Incorrect" filter on the Practice page respects the latest-attempt-wins rule.
6. Retry submissions from all contexts are attributable by origin (`retryOrigin`) in logs/analytics.
7. Review hydration distinguishes `no_prior_attempt` from `hydration_error`; only explicit user action can continue after `hydration_error`.
8. Cross-origin retries (e.g., bookmarked question from tutor session retried from bookmarks) correctly chain provenance without special-case logic.
9. Session review question grid preserves original session state visually; retry is additive, not a replacement.
10. Mixed `attemptId + sessionId` route params are normalized deterministically and logged.
11. Practice-engine docs describe one consistent retry contract across all modes.

---

## 11. Related

- [SPEC-034](../_archive/specs/spec-034-review-mode-readonly-and-try-again-scoping.md) — Review mode read-only + Try Again scoping
- [SPEC-036](../_archive/specs/spec-036-bookmark-review-mode-alignment.md) — Bookmark review mode alignment
- [BS-022](../_archive/brainstorming/bs-022-unanswered-question-review-handling.md) — Unanswered question review handling
- [BS-023](../_archive/brainstorming/bs-023-try-again-state-consistency.md) — Try Again state consistency analysis
- [BS-026](../_archive/brainstorming/bs-026-bookmark-reattempt-review-mode-consistency.md) — Bookmark reattempt/review mode consistency
- [Question Rendering Architecture](./question-rendering-architecture.md)
- [DEBT-265](../debt/debt-265-retry-lineage-and-review-practice-unification.md)
