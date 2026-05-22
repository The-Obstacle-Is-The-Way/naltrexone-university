# SPEC-040: Omitted Exam Answer Scoring

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Proposed
**Layer:** Feature (touches Domain, Application, Adapters, App)
**Date:** 2026-05-22

---

## Overview

This spec implements the fix diagnosed in [DEBT-390](../debt/debt-390-omitted-exam-questions-recorded-as-unattempted-not-incorrect.md): when an exam is finalized, questions with no draft and no latest answer are silently dropped instead of being recorded as incorrect. Today `FinalizeExamAnswersUseCase` only writes `attempts` rows for drafted states (`src/application/use-cases/finalize-exam-answers.ts:86-88`), so omitted questions leave no attempt row and stay terminal `null` in session state. The session accuracy percentage already counts them against the denominator, but every attempt-backed consumer (incorrect-question history, status filters, dashboard stats) is blind to them.

This spec makes the omission a **first-class scored outcome**: a real `attempts` row with no selected choice, marked omitted, scored incorrect. Once such rows exist, the existing `isCorrect`-keyed consumers work unchanged; only choice-rendering code needs updating.

DEBT-390 is the diagnosis and the source of truth for the decided direction. This spec is the executable plan. Read DEBT-390 first.

## Relationship to Other Specs

- **Blocks [SPEC-039](./spec-039-exam-mode-timer.md).** The timer's auto-submit-on-expiry routes through `FinalizeExamAnswersUseCase`. SPEC-039 must not ship until omitted scoring is correct, or every timed-out exam under-records blanks exactly as manual submit does today.
- **Interacts with SPEC-034** (Review Mode Read-Only & Try-Again scoping). After this fix an omitted exam question has a session-scoped attempt, so the `kind: 'session_unanswered'` fallback in `get-previous-attempt.ts:99-137` is no longer the path for omitted rows — review reads the omitted-outcome attempt instead.

## Requirements

### Functional

1. Finalizing an exam (manual submit or, later, SPEC-039 timer expiry) MUST process **every** question in the session, not just drafted ones.
2. A question with a persisted draft continues to grade the selected choice exactly as today.
3. A question with neither a draft nor a latest selected answer MUST produce an attempt row with: no selected choice, `isOmitted: true`, `isCorrect: false`, and `timeSpentSeconds` derived from any persisted server-side time (`0` when none exists).
4. Omitted attempts MUST be visible to all attempt-backed consumers once the session ends (incorrect-question history, Quick Practice `incorrect` status filter, dashboard totals/accuracy, recent activity, streaks).
5. The `unanswered` status filter MUST stop classifying an omitted (now attempted) exam question as unanswered.
6. Session/post-exam review MUST display omitted questions as **incorrect with "no answer selected"**, distinguishable from an active (not-yet-finalized) unanswered question.
7. Historical exams finalized before this ships MUST be reconciled by an idempotent backfill so identical exams score identically regardless of submission date (DEBT-390 "Historical Data").
8. Non-exam semantics are unchanged: no omitted attempts for Quick Practice abandonment, and no automatic incorrect attempts for tutor early-end blanks.

### Non-Functional

1. Illegal states MUST be unrepresentable at the database layer via CHECK constraints, not just convention.
2. The domain MUST NOT expose a raw nullable choice; the answer outcome is a discriminated union value object.
3. `gradeAnswer` stays pure and choice-required — it is never called for an omission.
4. Finalize remains a single transaction and idempotent: re-finalize is rejected (`finalize-exam-answers.ts:56-60, 79-84`), the idempotency key short-circuits (`practice-controller.ts:255-279`), and `attempts_session_question_uq` (`db/schema.ts:474-478`) keeps duplicate session/question rows illegal.
5. TDD: every change lands behind a failing test first. Fakes over mocks (`src/application/test-helpers/fakes/`).

## Design

### 1. Domain — answer-outcome value object

New pure value object. No external imports (domain-layer rule).

```typescript
// src/domain/value-objects/answer-outcome.ts
export type AnswerOutcome =
  | { readonly kind: 'answered'; readonly selectedChoiceId: string }
  | { readonly kind: 'omitted' };

export function answeredOutcome(selectedChoiceId: string): AnswerOutcome;
export function omittedOutcome(): AnswerOutcome;
export function isOmittedOutcome(outcome: AnswerOutcome): boolean;
export function selectedChoiceIdOrNull(outcome: AnswerOutcome): string | null;
```

### 2. Domain — Attempt entity

Replace `selectedChoiceId: string` (`src/domain/entities/attempt.ts:41`) with `outcome: AnswerOutcome`. Add a construction invariant: an `omitted` outcome MUST have `isCorrect === false` (mirrors the DB CHECK). Keep `isCorrect`, `timeSpentSeconds`, retry metadata, `answeredAt` as-is.

Readers migrate from `attempt.selectedChoiceId` to `selectedChoiceIdOrNull(attempt.outcome)`.

### 3. Schema migration (Drizzle, generated — never `drizzle-kit push`)

- `attempts.selected_choice_id` → nullable (`db/schema.ts:437-439`).
- Add `is_omitted boolean not null default false`.
- Add CHECK constraints (Postgres has no `XOR`):
  - `CHECK ((selected_choice_id IS NOT NULL) <> is_omitted)` — exactly one of selected/omitted holds.
  - `CHECK (NOT is_omitted OR is_correct = false)` — an omission is always incorrect.
- Keep `attempts_session_question_uq` (`db/schema.ts:474-478`).

### 4. Ports & mappers

- `AttemptInsertInput` (`src/application/ports/attempt-repository.ts:12-22`): replace `selectedChoiceId: string` with an outcome-shaped input (`outcome: AnswerOutcome` or `{ selectedChoiceId: string | null; isOmitted: boolean }` — pick one and keep it consistent through the fake).
- `attempt-row-mappers.ts`: replace `requireSelectedChoiceId` (`:19-32`) and `toAttemptDomain` (`:34-67`) with invariant-aware mapping: `is_omitted` row → `omittedOutcome()`; non-omitted row → `answeredOutcome(selected_choice_id)`, throwing if a non-omitted row has a null choice.

### 5. FinalizeExamAnswersUseCase

Change the loop in `finalize-exam-answers.ts:86-127` to iterate **all** `activeSession.questionStates`:

- Drafted state (`draftSelectedChoiceId !== null`): unchanged — `gradeAnswer`, capped time, `answeredOutcome`.
- Otherwise, if there is no latest selected answer: insert an omitted attempt (`omittedOutcome()`, `isCorrect: false`, `timeSpentSeconds: 0`, null retry metadata) and update session state so review shows a terminal incorrect omission.
- End the session in the same transaction (`:127`), unchanged.

### 6. Consumers

**No scoring-logic change needed** once `isCorrect=false` rows exist (DEBT-390 proves this): `GetAttemptedQuestionsUseCase`, `DrizzleQuestionRepository` `correct`/`incorrect` status filters (`:226-239`), `GetUserStatsUseCase` (`:81-101`), recent activity, streaks. They consume ordinary `isCorrect`-keyed rows.

**Choice-rendering / DTO changes needed** (DEBT-390 "Output DTO Ripple"): `GetPracticeSessionReviewUseCase` (`:121-130`), `GetCompletedSessionQuestionsWithFeedbackUseCase` (`:133-149`), `GetPreviousAttemptUseCase` (`:22-32`), `QuestionView`/`QuestionSurfaceBody`, `PostExamReviewView` (`:127-142`), `Feedback` (`:162-193`), `SessionBreakdownList` (`:75-87`), and review navigator/badge copy — each needs an explicit omitted signal so an omitted row renders "no answer selected" **and** incorrect, distinct from an active unanswered question.

### 7. Backfill migration (separate, idempotent)

A one-time data migration, independent of the schema migration and tested on its own. Walk ended exam sessions (`db/schema.ts:396-401`), read persisted per-question state (`practice-session-params.ts:19-35, 120-133`), find terminal-`null` states, and insert omitted-incorrect attempts **only where no session/question attempt already exists** (the unique index `db/schema.ts:474-478` is the backstop, but the migration must be explicitly idempotent).

## Tests First

Layered, in dependency order. Each is Red before the corresponding Design item is built.

1. **`answer-outcome.test.ts`** (domain, `*.test.ts`): constructors produce the right `kind`; `selectedChoiceIdOrNull` returns the id for answered and `null` for omitted; `isOmittedOutcome` is correct.
2. **`attempt.test.ts`** (domain): an omitted attempt with `isCorrect: true` is rejected; answered attempt round-trips its choice.
3. **`finalize-exam-answers.test.ts`** (use-case, fakes): **update the existing case** at `:76` ("leaves unanswered questions untouched") to the new contract — q4 (no draft) now produces an attempt with `isOmitted: true`, `isCorrect: false`, `timeSpentSeconds: 0`; drafted q1–q3 behavior preserved; session ends; `answered`/`correct`/`accuracy` reflect the chosen "answered" semantics (decide explicitly whether `answered` counts scored outcomes or literal selections, and update assertions/labels).
4. **`fake-attempt-repository.ts`**: handle omitted outcomes; existing `isCorrect`-based filters/counters keep working.
5. **Integration** (`*.integration.test.ts`, requires local test DB): omitted row inserts and reads back as omitted; the two CHECK constraints reject illegal rows (omitted-with-choice, omitted-with-correct, answered-without-choice); `incorrect` filter includes an omitted row, `unanswered` excludes it; `getUserStats` totals/accuracy include it.
6. **Backfill integration**: seeds an ended exam with a terminal-`null` question and no attempt → backfill inserts one omitted-incorrect attempt; running it twice inserts nothing the second time (idempotent).
7. **Browser/UI** (`*.browser.spec.tsx` where interactive): review/feedback renders an omitted row as incorrect with "no answer selected", distinct from active unanswered.

## Implementation Order

1. Failing domain tests → `answer-outcome.ts`, `Attempt` outcome + invariant.
2. Schema migration + CHECK constraints (generated migration; run against test DB per CLAUDE.md).
3. Ports + row mappers + `FakeAttemptRepository`.
4. `FinalizeExamAnswersUseCase` (the behavior change) — green the use-case test.
5. Repository integration green.
6. Consumer DTOs/UI + browser tests.
7. Backfill migration + its idempotency test.
8. Full gate before push (`pnpm typecheck && lint && test --run && test:browser && test:integration && build`).

## Edge Cases

- **Marked-for-review but unanswered** → still omitted (marking is orthogonal; `set-practice-session-question-mark` writes no answer).
- **Time for omitted** → `0` today; the system does not persist time-only drafts (`question-flow-actions.ts:174-180`, `practice-schemas.ts:56-62`).
- **Idempotent re-finalize** → blocked by `endedAt` guard + idempotency key + unique index; omitted rows obey the same constraint.
- **Active-exam visibility** → omitted rows are written in the same transaction that ends the session, so they become visible immediately and are never exposed mid-exam (`active-exam-visibility.ts:16-21`).
- **Retry metadata** → omitted rows are original outcomes: all retry fields null.

## Out of Scope

- The exam timer UI/countdown — that is SPEC-039.
- Tutor early-end blanks and Quick Practice abandonment — explicitly unchanged (DEBT-390 "Out of Scope").
- The accuracy-percentage denominator (`computeAccuracy` / `questionCount`) — already correct.

## Related

- [DEBT-390](../debt/debt-390-omitted-exam-questions-recorded-as-unattempted-not-incorrect.md) — diagnosis & decided direction (source of truth)
- [SPEC-039](./spec-039-exam-mode-timer.md) — exam-mode timer (blocked on this)
- [SPEC-013](../_archive/specs/spec-013-practice-sessions.md), [SPEC-020](../_archive/specs/spec-020-practice-engine-completion.md), [SPEC-034](../_archive/specs/spec-034-review-mode-readonly-and-try-again-scoping.md)
- [Practice Engine](../practice-engine/index.md)
