# BS-023: Try Again — State Consistency and Business Logic Gaps

**Date:** 2026-02-17
**Triggered by:** Suspicion that "Try Again" in review mode doesn't integrate consistently with session scoring, attempt history, or user progress tracking
**Scope:** Does the Try Again feature produce coherent state transitions, or does it silently create orphaned attempts with no business logic impact?
**Related:** [BS-022](./bs-022-unanswered-question-review-handling.md), [SPEC-032](../_archive/specs/spec-032-action-bar-standardization.md)

---

## The Problem

"Try Again" appears in every review context (History Session Review, History Individual Review, Dashboard Individual Review, Practice Session Review, Bookmarks Reattempt). When clicked, it resets the UI to a blank form and lets the user submit a new answer. But:

1. **Does the new attempt change anything?** If the session is already ended, the new attempt creates a database record but doesn't update the session's score, accuracy, or question state. The session summary remains frozen at the values from when the session ended.

2. **Does it affect global progress?** The user's "question progress status" (unanswered / incorrect / bookmarked) is derived from their latest attempt. A Try Again submission in review could flip a question from "incorrect" to "correct" globally — but the original session's record doesn't change. This creates a split between "session truth" and "global truth."

3. **Is unlimited re-attempt meaningful?** There's no re-attempt limit. A user can Try Again → Submit → Try Again → Submit indefinitely, creating unlimited `Attempt` records with no linking or version tracking.

4. **Is Try Again appropriate in exam review?** Real board exams don't let you retry questions after submission. Offering Try Again in exam review mode undermines the exam simulation's fidelity.

---

## Root Cause Analysis

### 1. Try Again is client-side only — no domain concept of "reattempt"

**File:** `app/(app)/app/questions/[slug]/question-page-logic.ts` (lines 202-214)

```typescript
export function reattemptQuestion(input: {
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  setSubmitIdempotencyKey: (key: string | null) => void;
  setQuestionLoadedAt: (loadedAtMs: number) => void;
}): void {
  input.setSelectedChoiceId(null);      // Clear selection
  input.setSubmitResult(null);          // Clear feedback
  input.setSubmitIdempotencyKey(/*new key*/);
  input.setQuestionLoadedAt(/*now*/);   // Reset timer
}
```

This is purely UI state manipulation. The domain layer has no concept of a "reattempt" — no `reattemptOf` field, no `isReattempt` flag, no link back to the original attempt. Each submission is an independent `Attempt` entity.

### 2. Ended sessions reject new submissions (sometimes)

**File:** `src/application/use-cases/submit-answer.ts` (lines 85-87)

```typescript
if (session.endedAt !== null) {
  throw new ApplicationError('CONFLICT', 'Practice session already ended');
}
```

If the review context passes a `sessionId` and the session is ended, the submission will **fail with a CONFLICT error**. This means:

- **History Session Review:** User clicks Try Again → Submit → gets an error (session ended)
- **Practice Session Review:** Same — session is ended
- **History Individual Review / Dashboard Review:** May not pass a sessionId — submission might succeed as a standalone attempt
- **Bookmarks:** No session context — submission succeeds as standalone

**The user experience is inconsistent.** In some contexts, Try Again works; in others, it silently fails.

### 3. Attempt entity has no context linking

**File:** `src/domain/entities/attempt.ts`

```typescript
type Attempt = {
  readonly id: string;
  readonly userId: string;
  readonly questionId: string;
  readonly practiceSessionId: string | null;  // Only links to ONE session
  readonly selectedChoiceId: string;
  readonly isCorrect: boolean;
  readonly timeSpentSeconds: number;
  readonly answeredAt: Date;
};
```

No `previousAttemptId`, no `attemptNumber`, no `reattemptContext`. Each attempt is isolated. You can't reconstruct the user's retry history or determine whether improvement happened over time.

### 4. Session question state tracks "latest" — but only while session is active

**File:** `src/domain/entities/practice-session.ts` (lines 6-12)

```typescript
type PracticeSessionQuestionState = {
  questionId: string;
  latestSelectedChoiceId: string | null;
  latestIsCorrect: boolean | null;
  latestAnsweredAt: Date | null;
};
```

The `latest*` fields are updated by `recordQuestionAnswer()` during an active session. After `endedAt` is set, these fields are frozen. A post-session Try Again creates a new `Attempt` record but **never updates these session-level fields**. The session "remembers" the old answer forever.

---

## Severity Assessment

| Aspect | Severity | Rationale |
|--------|----------|-----------|
| State inconsistency | **High** | Post-session reattempts create orphaned attempts that don't update session scores |
| User confusion | **Medium** | User may think retrying changes their score — it doesn't (for ended sessions) |
| Data integrity | **Medium** | Unlimited unlinked attempts pollute the attempt history with no context |
| Exam mode fidelity | **Medium** | Real exams don't allow retries — undermines simulation |
| Error-on-submit | **Medium** | If sessionId is passed for an ended session, the submission fails silently or with error |

### Where "Try Again" Currently Appears

| Review Context | Try Again Visible? | Submission Works? | Updates Session? |
|----------------|-------------------|-------------------|-----------------|
| History Session Review (answered) | Yes | **No** — CONFLICT error (session ended) | N/A |
| History Session Review (unanswered) | No (Submit shown) | **No** — CONFLICT error (session ended) | N/A |
| History Individual Review (answered) | Yes | **Maybe** — depends on whether sessionId is passed | No |
| History Individual Review (post-submit) | Yes | **Maybe** — same | No |
| Dashboard Individual Review | Yes | **Maybe** — depends on attemptId/sessionId | No |
| Practice Session Review (answered) | Yes | **No** — CONFLICT error (session ended) | N/A |
| Bookmarks Reattempt | Yes | **Yes** — no sessionId | No session to update |

---

## State Flow Diagrams

### Current Flow (Problematic)

```
User reviews answered question in ended session
  → Clicks "Try Again"
  → UI resets (client-side only)
  → Selects new answer
  → Clicks "Submit"
  → Server: submitAnswer() called with sessionId
  → Session is ended → CONFLICT error
  → User sees error (or silent failure)
  → Original session state unchanged
  → No new attempt recorded
```

### Alternative: Standalone submission (no sessionId)

```
User reviews question individually (no session context)
  → Clicks "Try Again"
  → UI resets
  → Selects new answer
  → Clicks "Submit"
  → Server: submitAnswer() called WITHOUT sessionId
  → New Attempt created (standalone, no session link)
  → Original session state unchanged
  → User's "latest attempt" for global progress updated
  → BUT: session accuracy not recalculated
```

---

## Proposed Approaches

### Option A: Remove Try Again from session review contexts (Simplest)

- Remove "Try Again" button when reviewing questions from an ended session
- Keep "Try Again" only in contexts where submission is meaningful:
  - **Bookmarks reattempt** — standalone, no session context, makes sense
  - **Quick Practice** — no session, standalone
- In session review, the action bar becomes: `← Previous · Next → · Back to ...`
- Educational value preserved — user sees feedback, just can't resubmit

**Pros:** Eliminates state inconsistency, simplest change, matches exam simulation fidelity
**Cons:** Removes interactive re-learning opportunity in review

### Option B: Allow Try Again but as standalone (no session impact)

- Keep "Try Again" in all review contexts
- When submitting from review of an ended session, **strip the sessionId** — submit as a standalone attempt
- Make it visually clear: "This is a practice reattempt. Your session score won't change."
- New attempt is recorded for global progress tracking but doesn't touch session history

**Pros:** Preserves interactivity, honest about state impact
**Cons:** More complex — need to handle "detached reattempt" concept, potentially confusing UX

### Option C: Full reattempt tracking (Most Ambitious)

- Add `previousAttemptId` to the `Attempt` entity
- Add `attemptNumber` for sequencing
- Track reattempt chains: original → reattempt 1 → reattempt 2
- Surface reattempt history in the UI ("You've attempted this question 3 times")
- Potentially allow a "reattempt score" alongside the original session score

**Pros:** Rich data for learning analytics, shows improvement over time
**Cons:** Significant domain changes, new UI surfaces, scope creep

### Option D: Context-dependent Try Again rules

| Context | Try Again? | Rationale |
|---------|-----------|-----------|
| Exam review | **No** | Exams are final. Review is read-only. |
| Tutor review | **Yes (standalone)** | Tutor is learning-oriented. Reattempt helps learning. |
| History individual | **Yes (standalone)** | User explicitly chose to revisit a question. |
| Bookmarks | **Yes (standalone)** | User bookmarked for practice — reattempt is the point. |
| Dashboard | **No** | Dashboard review is informational, not practice. |

**Pros:** Context-appropriate behavior, respects the purpose of each mode
**Cons:** More rules to maintain, more conditions in the UI

### Recommendation

**Option A (remove from session review) combined with Option D's context rules** is the most pragmatic. The key insight is:

- **Session review = educational, read-only.** You're reviewing what happened. Don't muddy it.
- **Standalone question access = practice.** Bookmarks and individual review are for practice.
- **Exam review = strictly read-only.** This is a simulation of a real exam.

The dividing line: **if a `sessionId` is present and the session is ended, don't offer Try Again.** If there's no session context (bookmarks, standalone), Try Again is fine.

---

## What Needs Investigation

| # | Question | Why It Matters |
|---|----------|---------------|
| Q1 | Does `submitAnswer` actually fail with CONFLICT in all session-review contexts, or does some path strip the sessionId? | Determines if there's already a silent bug |
| Q2 | When a standalone reattempt succeeds, does it change the user's global "question progress status"? | If so, a user could flip "incorrect" → "correct" globally without affecting session history |
| Q3 | Is there any analytics or progress tracking that uses "latest attempt" globally? | If yes, standalone reattempts could skew learning metrics |
| Q4 | How many users actually click "Try Again" in review? | If usage is near zero, the safest fix is removal |
| Q5 | Should the question progress filter ("Unanswered" / "Incorrect" / "Bookmarked") reflect session-level or global-level status? | A reattempt that flips global status could remove a question from the "Incorrect" filter |

---

## Interaction with BS-022

BS-022 proposes auto-revealing correct answers for unanswered questions in review mode. If adopted:

- **Unanswered questions in review** would be read-only (no Submit, no Try Again)
- **Answered questions in review** would show feedback (correct/incorrect)
- **Try Again** would only be relevant for answered questions in review — and this doc questions whether it should exist there either

The two brainstorming docs converge on the same principle: **review mode should be educational and read-only for session-based contexts.**

---

## Open Questions

| # | Question | Context |
|---|----------|---------|
| Q1 | Should Try Again be removed entirely from session review? | Simplest fix; aligns with exam simulation fidelity |
| Q2 | If kept, should reattempts be standalone (no session link)? | Prevents CONFLICT errors but creates orphaned attempts |
| Q3 | Should we track reattempt chains (`previousAttemptId`)? | Enables learning analytics but is a larger domain change |
| Q4 | Is "Try Again" appropriate for exam mode at all? | Real board exams are final — no retries |
| Q5 | Does removing Try Again from review require a spec, or is it a quick fix? | Depends on scope — just button removal vs. domain changes |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-17 | Created brainstorming doc | Suspicion that Try Again doesn't integrate with session scoring or attempt tracking consistently |
| 2026-02-17 | Confirmed: ended sessions reject submissions with CONFLICT | `submit-answer.ts` line 85-87 — Try Again in session review may already be broken |
| 2026-02-17 | Confirmed: no domain concept of "reattempt" | `Attempt` entity has no linking fields — each attempt is independent |
