# Practice Engine: Exam Answer Secrecy Policy

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Canonical policy for when correctness/explanations may be exposed
> **Last Verified:** 2026-03-02
> **Status:** Active (open drift tracked in BUG-180, BUG-181, BUG-185)

---

## 1. Policy Statement

For any attempt that belongs to an **active exam session** (`mode='exam'` and `endedAt === null`), the system MUST NOT expose correctness signals to the user until the session is ended.

This is a cross-layer invariant, not a UI preference.

---

## 2. Why This Exists

The product contract is explicit: exam mode hides correctness/explanations until session end.

- Master spec: [master_spec.md](/Users/ray/Desktop/github/naltrexone-university-1/docs/specs/master_spec.md:2383)
- Active answering must remain neutral: [master_spec.md](/Users/ray/Desktop/github/naltrexone-university-1/docs/specs/master_spec.md:2384)

Recent bugs show this invariant can drift when enforcement is duplicated across routes/use-cases/projections:

- [BUG-180](../bugs/bug-180-active-exam-answer-leak-via-review-hydration.md)
- [BUG-181](../bugs/bug-181-session-review-retry-allows-active-exam-answer-reveal.md)
- [BUG-185](../bugs/bug-185-dashboard-recent-activity-reveals-active-exam-correctness.md)

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
| **Application use cases** | Gate answer-key payloads and retry flows when source attempt/session is active exam (`GetPreviousAttempt`, `SubmitAnswer`) |
| **Repository projections** | Exclude or redact active-exam correctness fields in user-facing aggregates (`GetUserStats`/dashboard feeds) |
| **Controllers** | Preserve strict input contracts; do not allow alternate identifier paths to bypass application gates |
| **Frontend rendering** | Never infer correctness from partial data; render only neutral state in active exam contexts |
| **Tests** | Must cover all ingress paths (sessionId, attemptId, latest-attempt, retry provenance, dashboard projection) |

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

2. `SubmitAnswer` rejects or redacts session-review retry provenance when `retrySessionId` is active exam.

3. Dashboard/stats projection does not expose correctness for active-exam attempts.

4. UI-level review paths do not render correctness badges from active-exam attempts.

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

