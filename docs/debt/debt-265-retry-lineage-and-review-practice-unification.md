# DEBT-265: Retry Lineage and Review/Practice Unification

**Status:** Active
**Priority:** P2
**Date:** 2026-03-01
**Owner:** Practice Engine
**Related:** [Practice Engine Retry Logic](../practice-engine/retry-logic.md) (SSOT), [SPEC-034](../_archive/specs/spec-034-review-mode-readonly-and-try-again-scoping.md), [SPEC-036](../_archive/specs/spec-036-bookmark-review-mode-alignment.md), BUG-068, BUG-153

---

## Problem Statement

The retry experience is partially unified but has three structural gaps:

1. **No provenance tracking.** Retry attempts have no lineage metadata (`retryOfAttemptId`, origin context). Analytics cannot distinguish "first attempt in tutor session" from "standalone retry after reviewing bookmarks." This matters for understanding learning patterns and mastery progression.

2. **Session review is a dead end.** Session review currently blocks all retry (no Submit/Try Again). A user reviewing their tutor or exam results who sees a wrong answer has no way to retry it — they must manually navigate away to a different context. The fix is inline retry within the session review flow: the user clicks "Try Again" in place, retries without leaving the review daemon, and the result is persisted as a standalone attempt. Session scores remain immutable.

3. **Silent hydration failures.** When review mode can't load a prior attempt (transient error, race condition), the page silently degrades to fresh-attempt mode. The user may unknowingly create a duplicate attempt without realizing they're no longer in review.

---

## Design Foundation: Two-Layer Model

See [retry-logic.md §1](../practice-engine/retry-logic.md#1-core-design-principle-two-layer-model) for full explanation.

**Key invariants this work must preserve:**

- **Session scores are immutable.** A retry from session review never changes the session's score or question states. The session is a historical snapshot.
- **Attempts are append-only.** Every retry creates a new standalone attempt row. Prior attempts are never mutated.
- **Question global status uses latest-attempt-wins.** The "Incorrect" filter, dashboard stats, and any mastery query use the most recent attempt for each question, regardless of which context produced it.

---

## Why This Is Debt (Not a One-Line Fix)

This crosses multiple architecture layers:

- **Domain model** — `Attempt` entity needs optional provenance fields
- **Application/port contracts** — Submit payload + validation rules must accept and verify provenance
- **Controller schema** — Input surface must pass provenance from frontend
- **Database schema** — New nullable columns + index on `retryOfAttemptId`
- **Frontend state + UX** — Retry handoff must carry provenance; session review needs bridge CTA; hydration failures need explicit fallback UI
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

**Cross-origin handling:** A bookmarked question may have been first encountered in a tutor session, exam session, quick practice, or never answered. The provenance chain handles this naturally: `retryOfAttemptId` points to the prior attempt, and the prior attempt already carries its own `practiceSessionId` (or null). No per-origin special-case logic needed. See [retry-logic.md §7](../practice-engine/retry-logic.md#7-cross-origin-provenance-the-bookmark-gotcha).

### 2) Submit Flow Contract Updates

- Extend `submitAnswer` controller schema and use-case input to accept optional retry provenance.
- Preserve immutable historical attempts: retries always create new rows with `practiceSessionId = null`.
- Validate provenance when provided; ignore gracefully when absent (forward-compatible with old clients).

### 3) Inline Retry Within Session Review

- Enable "Try Again" button within the session review flow (tutor and exam review).
- User retries the question **in place** without leaving the session review daemon (prev/next navigation, question grid stay intact).
- On submit: create a standalone attempt (`practiceSessionId = null`) with provenance (`retryOfAttemptId`, `retryOrigin=session_review`, `retrySessionId`).
- **Session data remains immutable:** session score unchanged, session question states unchanged, original session attempt row unchanged.
- After retry, user sees their new result inline, then continues reviewing the next question.
- The session review question grid preserves original session state visually. Retry is additive context (e.g., a visual indicator that the question was retried), not a replacement of the original result.
- Implementation: `canReattemptInContext()` must be updated to return `true` for session review, but the submit path must route to standalone attempt creation (not session attempt creation).

### 4) Hydration Failure Safety

- Replace silent fallback in non-session review contexts with explicit UI state:
  - Clear message: "Could not load your previous answer."
  - Explicit user action required before submitting as a fresh attempt (e.g., "Answer as new" button).
  - No provenance metadata attached to fallback attempts (since we don't know what they're retrying).

### 5) Observability + Docs Consistency

- Emit retry-aware telemetry counters/events by `retryOrigin` and outcome (correct/incorrect).
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

## Acceptance Criteria

- [ ] Session review supports inline retry ("Try Again" button) without leaving the review flow.
- [ ] Inline retry within session review creates a standalone attempt (never a session-scoped attempt).
- [ ] Session scores and session question states are never mutated by retries.
- [ ] Session review question grid preserves original session state; retry is additive visual context.
- [ ] All retries (session review, standalone review, bookmarks, history, dashboard) carry provenance metadata (`retryOfAttemptId`, `retryOrigin`).
- [ ] Question global status (correct/incorrect) always reflects the latest attempt, regardless of context.
- [ ] The "Incorrect" filter on the Practice page respects latest-attempt-wins.
- [ ] Cross-origin retries (e.g., bookmarked question from exam, retried from bookmarks) correctly chain provenance without special-case logic.
- [ ] Non-session review hydration failure is explicit (no silent degradation to attempt mode).
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
