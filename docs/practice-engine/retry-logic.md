# Practice Engine: Retry and Reattempt Logic

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Current retry/reattempt behavior, provenance rules, and cross-mode consistency
> **Last Verified:** 2026-03-03

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
| Active tutor/exam answering | `/app/practice/[sessionId]` | Session-scoped submit path (`sessionId` included). |
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
| Exam session (active) | `/app/practice/[sessionId]` | Session state | Yes (once/question) | No | Session attempt |
| Exam pre-submit review stage | `/app/practice/[sessionId]` review panel | Session review rows | No retry submit path | No | No new attempts in this stage |
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

## 8. Tracer Bullets

### 8.1 Vertical tracer bullets (end-to-end)

1. **History session review retry**
- Entry: History Sessions row -> `toQuestionRoute(..., { from: 'history', mode: 'review', sessionId })`
- Hydration: `getPreviousAttempt` + `getPracticeSessionReview`
- Retry: `onReattempt` sets provenance from displayed attempt
- Submit: `submitAnswer` (no `sessionId`) + `retryOrigin=session_review`
- Backend: controller validation -> use-case parent check -> attempt insert
- UI: result inline, session navigator marks `wasRetried`

2. **Session unanswered retry**
- Hydration returns `kind='session_unanswered'`
- Retry submit includes `retryOrigin=session_review`, `retrySessionId`, no `retryOfAttemptId`
- Backend accepts this as valid provenance

3. **Hydration error fallback**
- Hydration failure -> explicit error card
- User chooses `Answer as new`
- Submit sends no provenance

### 8.2 Horizontal tracer bullets (layer-by-layer)

| Layer | Implemented slices | Primary files |
|---|---|---|
| Domain | Retry origin enum + provenance validator on `Attempt` | `src/domain/entities/attempt.ts`, `src/domain/entities/attempt.test.ts` |
| DB | `attempt_retry_origin` pgEnum, nullable lineage fields, index | `db/schema.ts`, `db/migrations/0013_quick_xavin.sql` |
| Ports/DTO | Optional provenance on `AttemptInsertInput` | `src/application/ports/attempt-repository.ts` |
| Repositories | Provenance insert/read mapping + fake parity | `src/adapters/repositories/drizzle-attempt-repository.ts`, `src/adapters/repositories/attempt-row-mappers.ts`, `src/application/test-helpers/fakes/fake-attempt-repository.ts` |
| Use case | Provenance validation + parent attempt ownership/question checks + `retrySessionId` ownership/question linkage checks | `src/application/use-cases/submit-answer.ts` |
| Controller | Zod schema + `superRefine` cross-field checks | `src/adapters/controllers/question-controller.ts` |
| Question page | Inline retry, hydration states, provenance passthrough, local retry indicator | `app/(app)/app/questions/[slug]/question-page-logic.ts`, `use-question-page-controller.ts`, `question-page-client.tsx` |
| Route boundary | Mixed ID normalization (`sessionId` precedence) | `app/(app)/app/questions/[slug]/page.tsx` |

---

## 9. Closure Status

Core retry lineage behavior remains implemented across DEBT-265, DEBT-266, and DEBT-267.

- Observability events are emitted for retry submissions, review hydration outcomes, and mixed-id normalization.
- `GetPreviousAttempt` mixed-id contract is hardened (deterministic rejection at controller + use case).
- Session-review retry marker persistence policy is explicitly accepted as visit-scoped (Option A).
- Initial exam-answer secrecy drift family across retry/review/dashboard surfaces is resolved and archived:
  - [BUG-180](../_archive/bugs/bug-180-active-exam-answer-leak-via-review-hydration.md)
  - [BUG-181](../_archive/bugs/bug-181-session-review-retry-allows-active-exam-answer-reveal.md)
  - [BUG-185](../_archive/bugs/bug-185-dashboard-recent-activity-reveals-active-exam-correctness.md)
- Additional active-exam secrecy drift remains open in current code paths:
  - [BUG-186](../bugs/bug-186-active-exam-review-projection-leaks-correctness.md)
  - [BUG-187](../bugs/bug-187-dashboard-accuracy-includes-active-exam-attempts.md)
  - [BUG-191](../bugs/bug-191-get-next-question-leaks-latestIsCorrect-active-exam.md)
  - [BUG-192](../bugs/bug-192-history-page-exposes-active-exam-correctness.md)
  - [BUG-193](../bugs/bug-193-submit-answer-returns-isCorrect-active-exam.md)
- Canonical policy authority is [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md).

Retry lineage is structurally in place; secrecy enforcement is still partially applied and must remain an active regression target.

---

## 10. Acceptance Status

- [x] Session review supports inline retry without leaving review flow.
- [x] Inline session-review retry writes standalone attempts only.
- [x] Session scores/session question states remain immutable.
- [x] Provenance flows controller -> use case -> repository -> DB.
- [x] Hydration states are explicit, including `hydration_error` fallback UI.
- [x] Mixed `attemptId + sessionId` is normalized deterministically at question-page boundary.
- [x] Cross-origin retry chains work via one-hop `retryOfAttemptId` links.
- [x] Dashboard/history/bookmarks/session-review contexts map to retry origins.
- [x] Retry observability events by origin/outcome are emitted and test-covered.
- [x] Server telemetry for mixed-id normalization + hydration outcomes is in place.
- [x] Session-review retry marker persistence policy is explicitly defined (visit-scoped).
- [x] `GetPreviousAttempt` mixed-id contract is hardened beyond boundary normalization.
- [ ] Active-exam secrecy gates are fully enforced across all retry/review/dashboard/history/question-loop surfaces (blocked by BUG-186, BUG-187, BUG-191, BUG-192, BUG-193).

---

## 11. Related

- [DEBT-265](../_archive/debt/debt-265-retry-lineage-and-review-practice-unification.md)
- [DEBT-266](../_archive/debt/debt-266-retry-observability-and-session-review-marker-persistence.md)
- [DEBT-267](../_archive/debt/debt-267-get-previous-attempt-identifier-contract-hardening.md)
- [Question Rendering Architecture](./question-rendering-architecture.md)
- [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md)
- [SPEC-034](../_archive/specs/spec-034-review-mode-readonly-and-try-again-scoping.md)
- [SPEC-036](../_archive/specs/spec-036-bookmark-review-mode-alignment.md)
