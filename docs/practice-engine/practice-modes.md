# Practice Engine: Practice Modes

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Ad-hoc, Tutor, and Exam modes — lifecycle, grading, concurrency
> **Last Verified:** 2026-03-19

---

## 1. Mode Comparison

The Practice Engine supports two session modes (tutor, exam) plus a stateless Quick Practice route:

| Mode | Route | Session? | Explanation Timing | Progress | Summary |
|------|-------|----------|-------------------|----------|---------|
| **Ad-hoc (Quick Practice)** | `/app/practice/quick` | No | Immediate | No | No |
| **Tutor** | `/app/practice/[sessionId]` | Yes | Immediate after each answer | X/N counter | Yes (totals + per-question) |
| **Exam** | `/app/practice/[sessionId]` | Yes | Hidden until `Submit exam`, then shown in post-exam review and summary | X/N counter + mark-for-review | Yes (post-exam review → terminal summary) |

---

## 2. Session Lifecycle

```text
[User configures mode/count/tags/difficulty]
    ↓
StartPracticeSession → creates session with shuffled questionIds
    ↓
[Question loop: getNextQuestion → render → answer drafts / submitAnswer → repeat]
    ↓ (tutor: explanation shown immediately)
    ↓ (exam: draft answer stored on navigation, no explanation)
    ↓ (exam only: user enters review-and-submit stage before final submit)
    ↓
EndPracticeSession → computes totals from questionStates
    ↓
[Exam only: post-exam review stage with score banner + inline feedback]
    ↓
[Summary view: totals + per-question breakdown]
```

**Current-vs-target note:** the lifecycle above reflects the **current implementation path**. The accepted target redesign in [Interaction Contracts](./interaction-contracts.md) changes active exam mode specifically: draft-save on navigation, mutable answers while the session is in progress, and batch finalization on `Submit exam`. Tutor and Quick Practice continue to use the one-shot `submitAnswer` path.

---

## 3. Exam Mode Special Features

- **Mark for review:** Users can flag questions during the session. `SetPracticeSessionQuestionMark` persists the flag. Only available in exam mode.
- **Review stage:** Before finalizing, users enter a review checklist with answered/unanswered/marked counts and can jump back into any exam question. Entry is via the header `Finish exam` action and the last-question footer `Next` action.
- **Post-exam review stage:** After `Submit exam`, the user stays on the session route and enters an ephemeral post-exam review stage with a score banner, correctness-colored navigator, inline feedback, and a `View Summary` escape hatch.
- **Deferred explanations (policy):** Correctness/explanations remain hidden while the exam session is active, then become visible only after `Submit exam` finalizes the session. See [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md) for the canonical enforcement contract and regression scope.

---

## 4. Question Selection

For sessions, questions are selected at creation time:
1. `listPublishedCandidateIds(filters)` — get all matching question IDs
2. `shuffleWithSeed(candidates, createSeed(userId, now))` — deterministic shuffle
3. Take first `count` questions → persist as `questionIds` in `paramsJson`

For ad-hoc mode, `selectNextQuestionId()` prefers the **first unattempted** candidate (in candidate order). If all candidates have been attempted, it selects the question with the **oldest** last-attempt timestamp.

For ad-hoc mode, candidate order is daily-seeded and user-specific before selection:
1. `listPublishedCandidateIds(filters)`
2. `canonicalize(candidates)` (stable ID sort, so repository order cannot leak into selection)
3. `shuffleWithSeed(canonicalCandidates, createSeed(userId, Date.UTC(year, month, date)))`
4. `selectNextQuestionId(shuffledCandidates, attemptHistory)`

This keeps same-day behavior stable for the same user while changing the daily seed at UTC day boundaries (so order is expected to rotate over time).

---

## 5. Answer Grading

`gradeAnswer(question, choiceId)` → `{ isCorrect, correctChoiceId, correctLabel }`. Pure domain function. The use case then:
1. Inserts an `Attempt` row
2. If session: updates `questionStates` via CAS (optimistic concurrency, 3 retries)
3. Returns grading result + explanations (gated by mode)

---

## 6. Interaction Contracts

For the full click-by-click UI contract (buttons, persistence boundaries, locking rules, navigation, and post-session flows) for each mode, see **[Interaction Contracts](./interaction-contracts.md)**. That doc also calls out the current-vs-target gap for the accepted exam-mode redesign.

---

## 7. Concurrency Protection

- **Duplicate session answers:** Partial unique index `attempts(practiceSessionId, questionId)` prevents two concurrent submits for the same question in a session. Postgres error code `23505` is caught and mapped to `ApplicationError('CONFLICT')`.
- **Session state updates:** CAS (compare-and-swap) pattern — read current `paramsJson`, compute update, write with `WHERE paramsJson = expectedValue`. Retries up to 3 times on conflict.
