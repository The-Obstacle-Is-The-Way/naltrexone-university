# Practice Engine: Exam Answer Secrecy Policy

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Canonical policy for when correctness/explanations may be exposed
> **Last Updated:** 2026-04-24
> **Status:** Enforced. BUG-180/181/185 and BUG-186/187/191/192/193/195 are archived as fixed; BUG-237 now rejects active-exam `SubmitAnswer` at the use-case boundary. This document remains the regression contract.

---

## 1. Policy Statement

For any attempt that belongs to an **active exam session** (`mode='exam'` and `endedAt === null`), the system MUST NOT expose correctness signals to the user until the session is ended.

This is a cross-layer invariant, not a UI preference.

---

## 2. Why This Exists

The product contract is explicit: exam mode hides correctness and explanations until session end.

- Master spec: [master_spec.md](../specs/master_spec.md)
- Active answering must remain neutral until the exam is ended.

Recent bugs showed this invariant can drift when enforcement is duplicated across routes/use-cases/projections.

Initial drift family fixed and archived:
- [BUG-180](../_archive/bugs/bug-180-active-exam-answer-leak-via-review-hydration.md)
- [BUG-181](../_archive/bugs/bug-181-session-review-retry-allows-active-exam-answer-reveal.md)
- [BUG-185](../_archive/bugs/bug-185-dashboard-recent-activity-reveals-active-exam-correctness.md)

All previously open drift bugs have been resolved and archived:
- [BUG-186](../_archive/bugs/bug-186-active-exam-review-projection-leaks-correctness.md)
- [BUG-187](../_archive/bugs/bug-187-dashboard-accuracy-includes-active-exam-attempts.md)
- [BUG-191](../_archive/bugs/bug-191-get-next-question-leaks-latestIsCorrect-active-exam.md)
- [BUG-192](../_archive/bugs/bug-192-history-page-exposes-active-exam-correctness.md)
- [BUG-193](../_archive/bugs/bug-193-submit-answer-returns-isCorrect-active-exam.md)
- [BUG-195](../_archive/bugs/bug-195-question-candidate-status-filter-leaks-active-exam-correctness.md) (inference via count delta)

---

## 3. Forbidden vs Allowed Signals (While Exam Is Active)

### Forbidden (must not be exposed)

- `isCorrect` shown to user
- `correctChoiceId`
- `explanationMd`
- `choiceExplanations`
- UI labels/badges that reveal correctness (`Correct`, `Incorrect`)
- Review links that use active-exam attempts as correctness-bearing hydration sources

### Allowed

- Neutral progress states: `answered` / `unanswered` / `current` / `marked`
- Question navigation and mark-for-review controls
- Session-level progress counts without correctness disclosure

---

## 4. Enforcement Matrix (Where Policy Must Be Applied)

| Layer | Responsibility |
|------|----------------|
| **Application use cases** | Gate correctness payloads for active exams across `GetPreviousAttempt`, `GetPracticeSessionReview`, and `GetNextQuestion`; reject active-exam `SubmitAnswer` before attempt/session-answer writes |
| **Repository projections** | Exclude or redact active-exam correctness fields in user-facing aggregates (`GetUserStats`, attempted-question history feeds) |
| **Controllers** | Preserve strict input contracts; do not allow alternate identifier paths to bypass application gates |
| **Frontend rendering** | Never infer correctness from partial data; render only neutral state in active exam contexts |
| **Tests** | Must cover all ingress paths (sessionId, attemptId, latest-attempt, retry provenance, dashboard projection, history questions projection) |

---

## 5. Canonical Guard Pattern

When reviewing an attempt-derived payload, first resolve whether it belongs to an active exam session and gate before exposing correctness fields.

```ts
function isActiveExamSession(session: {
  mode: 'tutor' | 'exam';
  endedAt: Date | null;
} | null): boolean {
  return Boolean(session && session.mode === 'exam' && session.endedAt === null);
}
```

Use this guard consistently at all answer-key disclosure points. Do not duplicate ad-hoc condition variants per feature.

---

## 6. Current Enforcement Status

These code paths are current as of 2026-04-24:

- `GetPreviousAttempt` returns `null` for active-exam attempts and only reveals `session_unanswered` answers after the exam session has ended.
- `GetPracticeSessionReview` redacts per-question `isCorrect` while an exam session is still active.
- `GetNextQuestion` redacts `session.latestIsCorrect` for active exams and only hydrates `previousSubmission` for answered tutor-session questions.
- `SubmitAnswer` rejects active exam sessions with `VALIDATION_ERROR` before inserting an `attempts` row or calling `recordQuestionAnswer(...)`; active exam answers must use `SaveExamDraftAnswer` before `FinalizeExamAnswers` creates final attempts. See [BUG-237](../bugs/bug-237-submit-answer-allows-active-exam-session-writes.md).
- `DrizzleQuestionRepository` excludes active-exam attempts from status-filter and user-history correctness projections via `activeExamVisibilityCondition()`.

---

## 7. Minimum Regression Test Set

Every change that touches review hydration, retry, stats projections, or exam rendering must keep these tests green:

1. `GetPreviousAttempt` blocks active-exam leaks for all identifier paths:
   - `sessionId`
   - `attemptId`
   - latest-by-question (no ids)

2. `GetPracticeSessionReview` must not surface per-question `isCorrect` while session is active exam.

3. `SubmitAnswer` must reject active exam submits before attempt/session-answer writes.

4. `GetNextQuestion` must not return `latestIsCorrect` for active exam sessions.

5. Dashboard/stats projection does not expose correctness for active-exam attempts.

6. History attempted-questions projection does not expose correctness for active-exam attempts.

7. UI-level review paths do not render correctness badges from active-exam attempts.

---

## 8. Documentation Ownership

This file is the canonical registry for exam-answer secrecy.

When behavior changes, update this file first, then update dependent docs:

- `docs/practice-engine/security-model.md`
- `docs/practice-engine/practice-modes.md`
- `docs/practice-engine/retry-logic.md`
- `docs/practice-engine/current-state.md`
- `docs/practice-engine/spec-coverage-map.md`
- Frontend guardrails (`docs/frontend/design-principles.md`, `docs/frontend/standards.md`)
- Validation checklists (`docs/dev/stabilization-checklist.md`)
