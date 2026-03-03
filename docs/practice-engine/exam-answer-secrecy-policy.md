# Practice Engine: Exam Answer Secrecy Policy

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Canonical policy for when correctness/explanations may be exposed
> **Last Verified:** 2026-03-03
> **Status:** Active (known open drift in BUG-191/BUG-192/BUG-193; BUG-180/BUG-181/BUG-185 are archived as fixed and BUG-186/BUG-187 are fixed on branch)

---

## 1. Policy Statement

For any attempt that belongs to an **active exam session** (`mode='exam'` and `endedAt === null`), the system MUST NOT expose correctness signals to the user until the session is ended.

This is a cross-layer invariant, not a UI preference.

---

## 2. Why This Exists

The product contract is explicit: exam mode hides correctness/explanations until session end.

- Master spec: [master_spec.md](/Users/ray/Desktop/github/naltrexone-university-1/docs/specs/master_spec.md:2383)
- Active answering must remain neutral: [master_spec.md](/Users/ray/Desktop/github/naltrexone-university-1/docs/specs/master_spec.md:2384)

Recent bugs showed this invariant can drift when enforcement is duplicated across routes/use-cases/projections.

Initial drift family fixed and archived:
- [BUG-180](../_archive/bugs/bug-180-active-exam-answer-leak-via-review-hydration.md)
- [BUG-181](../_archive/bugs/bug-181-session-review-retry-allows-active-exam-answer-reveal.md)
- [BUG-185](../_archive/bugs/bug-185-dashboard-recent-activity-reveals-active-exam-correctness.md)

Current open drift set:
- [BUG-191](../bugs/bug-191-get-next-question-leaks-latestIsCorrect-active-exam.md)
- [BUG-192](../bugs/bug-192-history-page-exposes-active-exam-correctness.md)
- [BUG-193](../bugs/bug-193-submit-answer-returns-isCorrect-active-exam.md)

Recently fixed (pending archive):
- [BUG-186](../bugs/bug-186-active-exam-review-projection-leaks-correctness.md)
- [BUG-187](../bugs/bug-187-dashboard-accuracy-includes-active-exam-attempts.md)

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
| **Application use cases** | Gate correctness payloads for active exams across `GetPreviousAttempt`, `GetPracticeSessionReview`, `GetNextQuestion`, and `SubmitAnswer` |
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

## 6. Minimum Regression Test Set

Every change that touches review hydration, retry, stats projections, or exam rendering must keep these tests green:

1. `GetPreviousAttempt` blocks active-exam leaks for all identifier paths:
- `sessionId`
- `attemptId`
- latest-by-question (no ids)

2. `GetPracticeSessionReview` must not surface per-question `isCorrect` while session is active exam.

3. `SubmitAnswer` must not return `isCorrect` for active exam submits.

4. `GetNextQuestion` must not return `latestIsCorrect` for active exam sessions.

5. Dashboard/stats projection does not expose correctness for active-exam attempts.

6. History attempted-questions projection does not expose correctness for active-exam attempts.

7. UI-level review paths do not render correctness badges from active-exam attempts.

---

## 7. Documentation Ownership

This file is the canonical registry for exam-answer secrecy.

When behavior changes, update this file first, then update dependent docs:

- `docs/practice-engine/security-model.md`
- `docs/practice-engine/practice-modes.md`
- `docs/practice-engine/retry-logic.md`
- `docs/practice-engine/current-state.md`
- `docs/practice-engine/spec-coverage-map.md`
- Frontend guardrails (`docs/frontend/design-principles.md`, `docs/frontend/standards.md`)
- Validation checklists (`docs/dev/stabilization-checklist.md`)
