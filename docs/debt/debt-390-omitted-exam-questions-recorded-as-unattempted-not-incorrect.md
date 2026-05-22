# DEBT-390: Omitted Exam Questions Are Recorded As Unattempted, Not Incorrect

**Priority:** P2
**Created:** 2026-05-22
**Source:** Investigation for [SPEC-039](../specs/spec-039-exam-mode-timer.md) (exam-mode timer). While mapping the exam finalize path to design auto-submit-on-expiry, the per-question scoring record was found to drop unanswered questions instead of scoring them as incorrect. User confirmed the intended behavior — "unanswered should read as incorrect, consistent with a real exam" — for both manual finalize and timer expiry.
**Related:** [SPEC-039 (Exam Mode Timer)](../specs/spec-039-exam-mode-timer.md) (depends on this), [SPEC-013 (Practice Sessions)](../_archive/specs/spec-013-practice-sessions.md), [SPEC-020 (Practice Engine Completion)](../_archive/specs/spec-020-practice-engine-completion.md), [Practice Engine](../practice-engine/index.md)

**Status:** Active

---

## Verdict

When an exam session is finalized — whether the student submits manually or (per SPEC-039) the timer expires — questions the student never answered are **omitted from the per-question record entirely** rather than scored as **incorrect**. This is inconsistent with how a real board exam treats an omitted item (omitted = wrong) and with the user's stated intent.

The headline accuracy **percentage** already behaves correctly (it divides by the total question count, so blanks drag the score down). The defect is at the **per-question record level**: an unanswered exam question produces no `attempts` row, so it surfaces as "unattempted" — not "incorrect" — in session review, history, and the correct/incorrect/unattempted status filters, and it never enters per-question mastery stats as a miss.

This is a real, present scoring-record gap independent of the timer. SPEC-039's auto-submit lands directly on this path, so it is filed as a **hard prerequisite** for SPEC-039 rather than absorbed into it (the fix carries a schema migration and a domain-model change that should not be entangled with a UI feature).

---

## Evidence (verified against code)

### 1. The accuracy percentage already counts blanks as wrong — denominator is the total

`src/application/use-cases/practice-session-summary.ts`:

- Line 26: `const questionCount = session.questionIds.length;` — the **total** session size.
- Line 36: `const { answered, correct } = computeSessionStats(orderedStates);`
- Line 46: `accuracy: computeAccuracy(questionCount, correct)` — divides `correct` by **total**, not by `answered`.

`src/domain/services/statistics.ts:12-15` — `computeAccuracy(total, correct) = correct / total` (clamped to `[0,1]`).

So an unanswered question contributes `0` to `correct` while still counting in the denominator → it already lowers the percentage. **This part is correct and should be preserved.**

### 2. But the per-question record drops unanswered questions

`src/domain/services/session-stats.ts:12-24` — `computeSessionStats` only counts a question as `answered` when `latestSelectedChoiceId !== null` (lines 15-16) and as `correct` when `latestIsCorrect === true` (lines 21-22). An untouched question has both `null` (`createDefaultQuestionState`, `session-stats.ts:40-53`), so it is neither answered nor correct — it is simply absent from both counts.

`src/application/use-cases/finalize-exam-answers.ts:86-88` — finalize only processes questions that have a draft:

```ts
const draftedStates = activeSession.questionStates.filter(
  (state) => state.draftSelectedChoiceId !== null,
);
```

It then inserts an `attempts` row and promotes the draft for each drafted state only (lines 94-125). **A question with no draft gets no attempt row and no `latestSelectedChoiceId`** — it stays at its default null state when the session ends (`finalize-exam-answers.ts:127`, `tx.sessions.end(...)`).

### 3. The schema cannot currently represent an omitted-but-incorrect answer

`db/schema.ts:437-439` — the attempts table requires a selected choice:

```ts
selectedChoiceId: uuid('selected_choice_id')
  .notNull()
  .references(() => choices.id, { onDelete: 'restrict' }),
```

`src/domain/entities/attempt.ts:41` — the domain entity matches: `readonly selectedChoiceId: string;` (non-nullable).

There is therefore **no way to record an attempt that represents "the student selected nothing and it counts as wrong"** without either making the selected choice nullable (introducing an explicit "omitted" concept) or modeling omission some other way. This is why the fix is structural, not a one-liner.

---

## Why this is concrete user harm (not speculative)

A student takes a 10-question exam, leaves 2 blank, and finalizes (or runs out of time under SPEC-039):

- Their headline accuracy correctly shows `correct / 10` — fine.
- But the 2 blanks **do not appear in their incorrect-answer review list**, so they cannot review what they got wrong by omission — the single most important thing to study after a timed exam.
- Per-question mastery (status filters: correct / incorrect / unattempted) treats those 2 as **never seen**, so they resurface as "unattempted" and are never marked as a miss, distorting readiness signals.

This diverges from real board behavior (omitted = incorrect, and it shows in your wrong column) and from the user's explicit expectation.

---

## Remediation direction (to be detailed in its own spec)

This debt warrants its own spec (next available `SPEC-0NN` at implementation time) because it touches the domain model, the schema, and the finalize use case. Sketch of the options to evaluate there — **TDD-first, fakes over mocks**, no implementation before a failing test:

1. **Nullable selected choice + "omitted" attempt.** Make `attempts.selected_choice_id` nullable (migration) and `Attempt.selectedChoiceId: string | null`; at finalize, insert an omitted attempt (`selectedChoiceId: null`, `isCorrect: false`) for every question with neither a draft nor a recorded answer. Most faithful to "omitted = incorrect" and makes blanks first-class in review/history/stats. Largest blast radius (every attempt reader must handle a null choice).
2. **Explicit omission flag.** Add an `is_omitted boolean` (or an attempt-kind enum) so omitted misses are distinguishable from a real wrong selection, keeping `selected_choice_id` semantics for genuine selections. Requires a sentinel or nullable choice anyway for the omitted rows.
3. **Record-only at the session-state layer.** Mark unanswered questions `latestIsCorrect = false` in `questionStates` at finalize without an `attempts` row. Smaller migration, but leaves history/per-question-stats (which read `attempts`) still blind to omissions — likely insufficient against the harm above.

The chosen option must keep behavior #1 (accuracy denominator) intact and apply identically to **manual finalize and SPEC-039 timer expiry** — both flow through `FinalizeExamAnswersUseCase` (`finalize-exam-answers.ts`), so the fix is centralized there.

---

## Relationship to SPEC-039 (Exam Mode Timer)

SPEC-039's defining behavior is **auto-submit on expiry**, which calls the same finalize path. If SPEC-039 ships before this is fixed, a timed-out exam silently under-records every unanswered question. SPEC-039 therefore **declares this debt a prerequisite** and must not implement auto-submit against the current drop-undrafted semantics. Sequencing: resolve DEBT-390 (or at least the finalize-layer scoring fix) first, then ship SPEC-039 on top.

---

## Out of Scope

- Tutor mode — there is no "finalize all at once" step; tutor commits per question and has no omitted-at-end concept.
- The accuracy-percentage computation (`computeAccuracy` / denominator) — already correct, leave untouched.
- The exam timer itself — that is SPEC-039.
