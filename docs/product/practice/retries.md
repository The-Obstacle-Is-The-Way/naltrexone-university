# Practice Engine: Retry and Reattempt Logic

> **Parent:** [Practice](./README.md)
> **Scope:** Current retry/reattempt behavior, provenance rules, and cross-mode consistency

---

## 1. Core Design Principle: Two-Layer Model

Retry behavior follows a strict two-layer model:

### Layer 1: Attempt History (Immutable, Append-Only)

Every submit writes a new `attempt` row. Historical attempts are never mutated in place.

### Layer 2: Question Status (Derived, Latest-Attempt-Wins)

Global question status (`correct` / `incorrect` / `unanswered`) is derived from the latest attempt per user+question across all contexts.

### Why this matters

| Question | Answered by |
|---|---|
| "How did I score in that tutor/exam session?" | Layer 1 (`practiceSessionId = session`) only. Immutable snapshot. |
| "Do I currently know this question?" | Layer 2 (latest attempt across all contexts). |
| "How many times did I retry this question?" | Layer 1 lineage chain (`retryOfAttemptId`). |

A retry can change global status, but it must never rewrite historical session scores.

---

## 2. Terms

- **Session attempt:** attempt with non-null `practiceSessionId`.
- **Standalone attempt:** attempt with `practiceSessionId = null`.
- **Session review route:** `/app/questions/[slug]?mode=review&sessionId=...`.
- **Standalone review route:** `/app/questions/[slug]?mode=review` without `sessionId`.
- **Inline retry:** user retries in the same review screen (no navigation away from review flow).
- **Provenance:** retry metadata (`retryOfAttemptId`, `retryOrigin`, `retrySessionId`).
- **Displayed attempt:** hydrated attempt currently shown when user clicks `Try Again`; this is the only valid parent for `retryOfAttemptId`.

---

## 3. Runtime Topology (Page Ownership)

This is the critical boundary that caused ambiguity in prior drafts.

| Flow | Owning page | Notes |
|---|---|---|
| Active tutor answering | `/app/practice/[sessionId]` | Session-scoped submit path (`sessionId` included). |
| Active exam answering | `/app/practice/[sessionId]` | Draft-save path (`saveExamDraftAnswer`) while in progress; final attempts are materialized only by `finalizeExamAnswers` from the review stage. |
| Active exam pre-submit review list | `/app/practice/[sessionId]` | `Open question` loads a session question inside the same page flow; still session-scoped, no retry semantics. |
| Ended-session review (history/dashboard/practice entry) | `/app/questions/[slug]?mode=review&sessionId=...` | This is where inline retry now runs. |
| History/Dashboard/Bookmarks standalone review | `/app/questions/[slug]?mode=review` | Provenance-enabled retry or fresh submit fallback. |
| Quick Practice | `/app/practice/quick` | Fresh standalone attempts, no review hydration. |

So: session review UX is entered from multiple surfaces, but retry execution is unified on the question page route.

---

## 4. Current Behavior Matrix (Code Truth)

| Context | Route / Entry | Hydrates prior state | Submit availability | Retry CTA | Write contract |
|---|---|---|---|---|---|
| Tutor session (active) | `/app/practice/[sessionId]` | Session state | Yes (once/question) | No | Session attempt (`practiceSessionId=session`) |
| Exam session (active) | `/app/practice/[sessionId]` | Draft session state | No per-question submit; footer navigation saves drafts | No | Draft state on `practice_sessions.params_json` |
| Exam pre-submit review stage | `/app/practice/[sessionId]` review panel | Session review rows | No retry submit path | No | No new attempts in this stage |
| Exam finalization | `/app/practice/[sessionId]` review panel | Draft session state | `Submit exam` | No | `finalizeExamAnswers` creates final session attempts and ends the session |
| Session review (ended session) | `/app/questions/[slug]?mode=review&sessionId=...` | `attempt` or `session_unanswered` | Yes (after `Try Again` / `Answer as new`) | Yes | Standalone attempt + provenance (`retryOrigin=session_review`) |
| History standalone review | `/app/questions/[slug]?from=history&mode=review` | Latest attempt | Yes | Yes | Standalone attempt + provenance (`retryOrigin=history`) |
| Dashboard standalone review | `/app/questions/[slug]?from=dashboard&mode=review&attemptId=...` | Specific attempt by `attemptId` | Yes | Yes | Standalone attempt + provenance (`retryOrigin=dashboard`) |
| Bookmarks standalone review | `/app/questions/[slug]?from=bookmarks&mode=review` | Latest attempt (or none) | Yes | Yes (if prior attempt exists) | Standalone attempt + provenance (`retryOrigin=bookmarks`) |
| Quick Practice | `/app/practice/quick` | None | Yes | No | Standalone attempt |

---

## 5. Provenance Contract (Implemented)

### 5.1 Schema and Domain

`Attempt` and `attempts` include nullable lineage fields:

- `retryOfAttemptId: uuid | null`
- `retryOrigin: attempt_retry_origin | null` (`history`, `dashboard`, `bookmarks`, `session_review`, `other`)
- `retrySessionId: uuid | null`

`attempt_retry_origin` is a Postgres enum (`pgEnum`) in `db/schema.ts`.

### 5.2 Validation rules

Enforced by controller + use case + domain helper:

- `retrySessionId` allowed only when `retryOrigin = session_review`.
- `retryOrigin = session_review` requires `retrySessionId`.
- Non-session origins require `retryOfAttemptId`.
- If `retryOfAttemptId` exists, parent attempt must exist for same user and same question.
- If `retryOrigin = session_review`, `retrySessionId` must resolve to a session owned by the submitting user and that session must include the submitted question.

### 5.3 Legitimate `retryOfAttemptId = null` paths

- `session_unanswered` inline retry.
- `no_prior_attempt` review fallback.
- Explicit `hydration_error -> Answer as new` path.

These are fresh attempts, not parent-linked retries.

---

## 6. Session Review Inline Retry Contract

Implemented behavior on `/app/questions/[slug]?mode=review&sessionId=...`:

1. User sees hydrated review (`attempt` or `session_unanswered`).
2. User clicks `Try Again` / `Practice Again`.
3. UI resets local answer state inline.
4. Controller stores pending provenance from displayed state.
5. Submit writes a new standalone attempt (`practiceSessionId = null`) with provenance.
6. Session snapshot remains immutable (score and original per-question correctness unchanged).
7. User continues prev/next/grid within review flow.

### Retry indicator source (important)

`wasRetried` is tracked in question-page client state (`sessionQuestionsBySessionIdRef` + `sessionNavigation`) and rendered in `ReviewQuestionNavigator`.

- It persists while navigating within the same review visit.
- It is not currently persisted server-side, so it resets on hard refresh/new visit.

---

## 7. Hydration + Identifier Normalization

### 7.1 Explicit hydration states

Question-page review state distinguishes:

- `attempt`
- `session_unanswered`
- `no_prior_attempt`
- `hydration_error`

`hydration_error` shows explicit UI with `Retry load` and `Answer as new`; there is no silent degrade-to-submit.

### 7.2 Mixed `attemptId + sessionId`

When both are present in review mode:

- Question page normalizes to `sessionId` precedence.
- `attemptId` is dropped before controller execution.
- Server route boundary emits `review_identifier_normalized` telemetry.
- Downstream controller/use-case contracts reject mixed ids if they bypass normalization.

---

## 8. Related

- DEBT-265
- DEBT-266
- DEBT-267
- [Question Rendering Architecture](../../architecture/question-rendering.md)
- [Exam Answer Secrecy Policy](./exam-answer-secrecy.md)
- SPEC-034
- SPEC-036
