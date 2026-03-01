# DEBT-265: Retry Lineage and Review/Practice Unification

**Status:** Active
**Priority:** P2
**Date:** 2026-03-01
**Owner:** Practice Engine
**Related:** [Practice Engine Retry Logic](../practice-engine/retry-logic.md) (SSOT), [SPEC-034](../_archive/specs/spec-034-review-mode-readonly-and-try-again-scoping.md), [SPEC-036](../_archive/specs/spec-036-bookmark-review-mode-alignment.md), BUG-068, BUG-153

---

## Problem Statement

The retry experience is partially unified but has five structural gaps:

1. **No provenance tracking.** Retry attempts have no lineage metadata (`retryOfAttemptId`, origin context). Analytics cannot distinguish "first attempt in tutor session" from "standalone retry after reviewing bookmarks." This matters for understanding learning patterns and mastery progression.

2. **Session review is a dead end.** Session review currently blocks all retry (no Submit/Try Again). A user reviewing their tutor or exam results who sees a wrong answer has no way to retry it — they must manually navigate away to a different context. The fix is inline retry within the session review flow: the user clicks "Try Again" in place, retries without leaving the review daemon, and the result is persisted as a standalone attempt. Session scores remain immutable.

3. **Hydration outcomes are conflated.** The controller does not distinguish `no_prior_attempt` from `hydration_error`. In standalone review this can silently degrade to fresh submit mode, and in session review this can produce a locked read-only page with missing context.

4. **Ambiguous mixed-identifier contract.** Current use case behavior allows both `attemptId` and `sessionId`, with `attemptId` precedence. This is acceptable as legacy behavior but ambiguous for retry provenance unless normalized.

5. **Permutation coverage is incomplete in docs/tests.** Dashboard session-review entry (`from=dashboard&sessionId`) and `session_unanswered` inline-retry semantics are not fully spelled out as explicit contracts yet.

---

## Design Foundation: Two-Layer Model

See [retry-logic.md §1](../practice-engine/retry-logic.md#1-core-design-principle-two-layer-model) for full explanation.

**Key invariants this work must preserve:**

- **Session scores are immutable.** A retry from session review never changes the session's score or question states. The session is a historical snapshot.
- **Attempts are append-only.** Every retry creates a new standalone attempt row. Prior attempts are never mutated.
- **Question-status classification uses latest-attempt-wins.** Status-driven surfaces (Practice status filters, History Questions row correctness) use the most recent attempt for each question, regardless of context. Aggregate analytics may continue counting all attempts.

---

## Why This Is Debt (Not a One-Line Fix)

This crosses multiple architecture layers:

- **Domain model** — `Attempt` entity needs optional provenance fields
- **Application/port contracts** — Submit payload + validation rules must accept and verify provenance
- **Controller schema** — Input surface must pass provenance from frontend
- **Database schema** — New nullable columns + index on `retryOfAttemptId`
- **Frontend state + UX** — Retry handoff must carry provenance; session review needs inline retry; hydration failures need explicit fallback UI with clear user intent
- **Observability** — Retry-aware telemetry by origin

A local UI tweak cannot safely solve this without creating data/model drift.

---

## Required Change Set

### 1) Retry Provenance Model

Add nullable fields to the `Attempt` entity and `attempts` table:

| Field | Type | Purpose |
|---|---|---|
| `retryOfAttemptId` | `uuid \| null` | Points to the specific prior attempt the user was reviewing when they clicked "Try Again." One hop back only; chains are reconstructable by following pointers. |
| `retryOrigin` | `enum \| null` | Which UI surface the retry came from: `history`, `dashboard`, `bookmarks`, `session_review`, `other` |
| `retrySessionId` | `uuid \| null` | Populated when `retryOrigin = session_review`. Captures which session the user was reviewing when they decided to retry. |

**Validation rules:**
- Same user ownership (retry attempt user = parent attempt user)
- Same question linkage (retry attempt question = parent attempt question)
- Parent attempt exists when `retryOfAttemptId` is provided
- `retrySessionId` is only populated when `retryOrigin = session_review`
- `retryOfAttemptId = null` is valid for first-attempt submissions from review surfaces that legitimately have no displayed parent attempt (`no_prior_attempt`, `session_unanswered`)

**Cross-origin handling:** A bookmarked question may have been first encountered in a tutor session, exam session, quick practice, or never answered. The provenance chain handles this naturally: `retryOfAttemptId` points to the prior attempt, and the prior attempt already carries its own `practiceSessionId` (or null). No per-origin special-case logic needed. See [retry-logic.md §7](../practice-engine/retry-logic.md#7-cross-origin-provenance-the-bookmark-gotcha).

### 2) Submit Flow Contract Updates

- Extend `submitAnswer` controller schema and use-case input to accept optional retry provenance.
- Preserve immutable historical attempts: retries always create new rows with `practiceSessionId = null`.
- Validate provenance when provided; ignore gracefully when absent (forward-compatible with old clients).
- Keep retry provenance server-authoritative: derive `retryOfAttemptId` from displayed review state, not directly from raw URL params.

### 3) Inline Retry Within Session Review

- Enable "Try Again" button within the session review flow (tutor and exam review).
- User retries the question **in place** without leaving the session review daemon (prev/next navigation, question grid stay intact).
- On submit: create a standalone attempt (`practiceSessionId = null`) with provenance (`retryOfAttemptId`, `retryOrigin=session_review`, `retrySessionId`).
- **Session data remains immutable:** session score unchanged, session question states unchanged, original session attempt row unchanged.
- After retry, user sees their new result inline, then continues reviewing the next question.
- The session review question grid preserves original session state visually. Retry is additive context (e.g., a visual indicator that the question was retried), not a replacement of the original result.
- Implementation: `canReattemptInContext()` must be updated to return `true` for session review, but the submit path must route to standalone attempt creation (not session attempt creation).
- Include `session_unanswered` path explicitly: inline "Try Again" from unanswered reveal creates standalone attempt with `retryOrigin=session_review`, `retrySessionId=<session-id>`, and `retryOfAttemptId=null`.

### 4) Hydration Failure Safety

- Replace silent fallback in review contexts with explicit hydration states:
  - `attempt`
  - `session_unanswered`
  - `no_prior_attempt`
  - `hydration_error`
- Behavior rules:
  - `no_prior_attempt` may proceed as fresh attempt.
  - `hydration_error` requires explicit user action before any new submit.
- In session review, `hydration_error` must not strand the user with a silent locked state.
- In standalone review, `hydration_error` must not silently degrade to submit-ready form.

### 5) Route Contract Normalization

- Normalize mixed review params (`attemptId + sessionId`) at question-page entry:
  - either reject as invalid input, or
  - deterministically normalize and log telemetry for mismatch.
- Document precedence contract explicitly if backward compatibility requires temporary coexistence.

### 6) Observability + Docs Consistency

- Emit retry-aware telemetry counters/events by `retryOrigin` and outcome (correct/incorrect).
- Emit route-normalization telemetry for mixed `attemptId + sessionId`.
- Emit hydration outcome telemetry (`attempt`, `session_unanswered`, `no_prior_attempt`, `hydration_error`) for review surfaces.
- Keep docs synchronized:
  - `docs/practice-engine/retry-logic.md` (SSOT — already updated)
  - `docs/practice-engine/question-rendering-architecture.md`
  - `docs/practice-engine/spec-coverage-map.md` terminology cleanup

---

## Concrete Scenarios

### Scenario: Tutor Session → Session Review → Inline Retry

1. User completes 20-question tutor session. Score: 15/20.
2. Later, reviews the session from History. Navigating question by question with prev/next.
3. Lands on Q7 — they got it wrong. Sees their wrong answer, the correct answer, explanation.
4. Clicks "Try Again" — stays in the session review flow.
5. Form resets inline. User selects new answer, submits.
6. **Result:** Session stays 15/20. Q7's global status → correct. Q7 drops from "Incorrect" filter. User clicks "Next" to continue reviewing Q8 — never left the review daemon. Question grid still shows Q7 as originally incorrect in session, with a visual indicator that it was retried.

### Scenario: Bookmarked from Exam → Retry from Bookmarks

1. User bookmarked Q12 during an exam where they got it wrong.
2. Opens Bookmarks → Q12. Review shows the exam attempt.
3. Clicks "Try Again." Retries and gets it right.
4. **Result:** Exam session score unchanged. Q12's global status → correct. Provenance: `retryOrigin=bookmarks`, `retryOfAttemptId=<exam-attempt-id>`.

### Scenario: Dashboard Session Review → Inline Retry

1. User opens Dashboard → Recent sessions and enters review (`from=dashboard&mode=review&sessionId=...`).
2. On Q3, user clicks "Try Again" inline.
3. **Result:** User remains in the session daemon (prev/next + grid), retry writes standalone attempt with `retryOrigin=session_review`, original session snapshot remains unchanged.

### Scenario: Session Unanswered Reveal → Inline Try Again

1. User reviews a session question they skipped.
2. `session_unanswered` reveal shows correct answer + explanation.
3. User clicks "Try Again" inline and submits.
4. **Result:** Standalone attempt is created with `retryOrigin=session_review`, `retrySessionId=<session-id>`, and `retryOfAttemptId=null`.

### Scenario: Chain Retry (Retry of a Retry)

1. User retried Q7 from bookmarks, got it wrong again.
2. Clicks "Try Again" on the retry result.
3. **Result:** New attempt with `retryOfAttemptId` pointing to the first retry (not the original session attempt). The chain is: session attempt → retry 1 → retry 2. Fully reconstructable by following `retryOfAttemptId` pointers.

### Scenario: Bookmarked but Never Answered

1. User bookmarked Q15 before ever attempting it.
2. Opens Bookmarks → Q15. No prior attempt to hydrate.
3. Page loads in fresh-attempt mode (not review). No provenance — this is a first attempt, not a retry.
4. **Result:** New standalone attempt, no retry metadata. Normal behavior.

---

## Minimum Test Matrix (Required)

- `app/(app)/app/questions/[slug]/question-page-logic.test.ts`
  - `canReattemptInContext` allows session review inline retry in target behavior.
  - Hydration state distinguishes `no_prior_attempt` vs `hydration_error`.
- `app/(app)/app/questions/[slug]/use-question-page-controller.browser.spec.tsx`
  - Inline retry from session review submits standalone payload with session-review provenance.
  - Mixed `attemptId + sessionId` route normalization behavior is enforced.
- `app/(app)/app/questions/[slug]/question-page-client.test.tsx`
  - Session review action bar shows Try Again inline without dropping prev/next.
  - Session grid/original correctness state remains unchanged after retry result display.
- `src/application/use-cases/submit-answer.test.ts`
  - Provenance validation (same user, same question, parent exists).
  - `retryOfAttemptId=null` valid for `session_unanswered` and `no_prior_attempt`.
- `src/application/use-cases/get-previous-attempt.test.ts`
  - Explicit hydration outcome contract (`attempt`, `session_unanswered`, `no_prior_attempt`, error path).
- `tests/e2e/review-mode-audit.spec.ts` (or equivalent review E2E)
  - History/practice/dashboard session-review inline retry stays in flow and preserves session snapshot.
  - Standalone hydration-error path requires explicit "Answer as new" confirmation before submit.

---

## Acceptance Criteria

- [ ] Session review supports inline retry ("Try Again" button) without leaving the review flow.
- [ ] Inline retry within session review creates a standalone attempt (never a session-scoped attempt).
- [ ] Session scores and session question states are never mutated by retries.
- [ ] Session review question grid preserves original session state; retry is additive visual context.
- [ ] All retries (session review, standalone review, bookmarks, history, dashboard) carry provenance metadata (`retryOfAttemptId`, `retryOrigin`).
- [ ] Session-review entry from Dashboard (`from=dashboard&sessionId`) follows the same inline-retry + immutability contract.
- [ ] Question global status (correct/incorrect) always reflects the latest attempt, regardless of context.
- [ ] The "Incorrect" filter on the Practice page respects latest-attempt-wins.
- [ ] Cross-origin retries (e.g., bookmarked question from exam, retried from bookmarks) correctly chain provenance without special-case logic.
- [ ] Review hydration outcomes are explicit (`attempt`, `session_unanswered`, `no_prior_attempt`, `hydration_error`) and never silently conflated.
- [ ] `hydration_error` paths require explicit user intent before any submit.
- [ ] Mixed `attemptId + sessionId` route input is normalized/rejected deterministically with telemetry.
- [ ] Retry provenance is queryable in DB and visible in logs/analytics.
- [ ] Practice-engine docs are consistent on retry semantics across all modes.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Over-coupling retry metadata to frontend routing params | Validate + normalize in controller/use case; treat route params as hints, not authority |
| Backfill/reporting drift during migration | Keep provenance nullable and forward-compatible; default old rows to null lineage |
| UX confusion between review and attempt modes | Explicit labels/CTA copy and visible mode indicators |
| Session metrics contamination from retries | Compute session summaries from session-scoped attempts only (`WHERE practice_session_id = ?`); standalone retries are excluded by definition |
| Chain provenance becoming expensive to query | Single-hop `retryOfAttemptId` is sufficient for most queries; full chain reconstruction is a reporting concern, not a hot path |
| "Latest attempt wins" creating confusion when user retries and gets it wrong again | The latest attempt still wins — status stays "incorrect." The user sees they still need to study this question. This is correct behavior. |
