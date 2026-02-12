# Practice Engine: Practice Modes

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Ad-hoc, Tutor, and Exam modes — lifecycle, grading, concurrency
> **Last Verified:** 2026-02-11

---

## 1. Mode Comparison

The Practice Engine supports three distinct user experiences:

| Mode | Route | Session? | Explanation Timing | Progress | Summary |
|------|-------|----------|-------------------|----------|---------|
| **Ad-hoc (Quick Practice)** | `/app/practice/quick` | No | Immediate | No | No |
| **Tutor** | `/app/practice/[sessionId]` | Yes | Immediate after each answer | X/N counter | Yes (totals + per-question) |
| **Exam** | `/app/practice/[sessionId]` | Yes | Hidden until session ends | X/N counter + mark-for-review | Yes (totals + per-question + explanations revealed) |

---

## 2. Session Lifecycle

```text
[User configures mode/count/tags/difficulty]
    ↓
StartPracticeSession → creates session with shuffled questionIds
    ↓
[Question loop: getNextQuestion → render → submitAnswer → repeat]
    ↓ (tutor: explanation shown immediately)
    ↓ (exam: answer stored, no explanation)
    ↓
EndPracticeSession → computes totals from questionStates
    ↓
[Summary view: totals + per-question breakdown]
    ↓ (exam: all explanations now revealed)
```

---

## 3. Exam Mode Special Features

- **Mark for review:** Users can flag questions during the session. `SetPracticeSessionQuestionMark` persists the flag. Only available in exam mode.
- **Review stage:** Before finalizing, users see a navigator grid showing answered/unanswered/marked questions and can jump to any question.
- **Deferred explanations:** `SubmitAnswer` returns `explanationMd: null` for active exam sessions. Explanations become visible only after `EndPracticeSession`.

---

## 4. Question Selection

For sessions, questions are selected at creation time:
1. `listPublishedCandidateIds(filters)` — get all matching question IDs
2. `shuffleWithSeed(candidates, createSeed(userId, now))` — deterministic shuffle
3. Take first `count` questions → persist as `questionIds` in `paramsJson`

For ad-hoc mode, `selectNextQuestionId()` picks the least-recently-seen question from candidates matching the user's attempt history.

---

## 5. Answer Grading

`gradeAnswer(question, choiceId)` → `{ isCorrect, correctChoiceId }`. Pure domain function. The use case then:
1. Inserts an `Attempt` row
2. If session: updates `questionStates` via CAS (optimistic concurrency, 3 retries)
3. Returns grading result + explanations (gated by mode)

---

## 6. Concurrency Protection

- **Duplicate session answers:** Partial unique index `attempts(practiceSessionId, questionId)` prevents two concurrent submits for the same question in a session. Postgres error code `23505` is caught and mapped to `ApplicationError('CONFLICT')`.
- **Session state updates:** CAS (compare-and-swap) pattern — read current `paramsJson`, compute update, write with `WHERE paramsJson = expectedValue`. Retries up to 3 times on conflict.
