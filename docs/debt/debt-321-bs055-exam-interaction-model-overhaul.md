# DEBT-321: BS-055 Exam Interaction Model Overhaul

**Priority:** P1
**Created:** 2026-03-17
**Related:** [BS-055](../brainstorming/bs-055-exam-session-interaction-model-rethink.md), [Interaction Contracts](../practice-engine/interaction-contracts.md), [Practice Modes](../practice-engine/practice-modes.md)

---

## Summary

BS-055 identified that exam mode's interaction model is fundamentally broken: a vestigial per-question Submit button from tutor mode, a button bar that shifts layout between questions, auto-advance that fires inconsistently, and a silent-discard bug where clicking Next drops a selected answer without saving it.

The fix is a new exam interaction contract: answers are drafts (saved on navigation boundaries), freely changeable, and only finalized when the user clicks `Submit exam`. Tutor mode and quick practice are unchanged.

This debt doc decomposes that into ordered implementation stages. **Stages 1-4 and 8 are independently shippable. Stages 5-7 are a coupled frontend cutover chain unless protected by a feature flag.** Do not deploy Stage 5 or Stage 6 alone — the exam loop would lose persistence or finalization. **Do not reorder stages** — later stages depend on earlier ones.

---

## Guiding Constraints

1. **Tutor mode and quick practice must stay green at every stage.** Every shared-component edit must be validated against both mode's test suites. If a test breaks, the stage is wrong.
2. **Extend existing structures, don't create parallel universes.** The draft model extends `questionStates` in `paramsJson`. It does not create a new table, a new session entity, or a shadow state store.
3. **Each stage has a verification gate.** No stage is done until its specific tests pass AND the pre-PR gate is green.
4. **Domain changes land before frontend changes.** The draft-save operation must exist before the UI can call it.
5. **Application code talks to repository ports, not adapter helpers.** If a use case needs a new state transition, add a `PracticeSessionRepository` method and implement it in adapters/fakes. Do not call `practice-session-question-state-updater.ts` directly from the application layer.
6. **All active-session readers must become draft-aware before the new UI relies on drafts.** The critical readers are `GetNextQuestion`, `GetPracticeSessionReview`, and `GetIncompletePracticeSession`.

---

## Stage 1: Domain — Add draft fields to session question state

**What:** Extend `PracticeSessionQuestionState` with three new nullable fields for exam-mode draft answers.

**Why first:** Every subsequent stage depends on these fields existing. This is the foundation.

**Files to modify:**

| File | Change |
|------|--------|
| `src/domain/entities/practice-session.ts` | Add `draftSelectedChoiceId: string \| null`, `draftSavedAt: Date \| null`, `draftCumulativeMs: number` to `PracticeSessionQuestionState` |
| `db/schema.ts` | Add same three fields to `PracticeSessionParams.questionStates` array type (serialized: `draftSavedAt` as ISO string, `draftCumulativeMs` as number) |
| `src/adapters/repositories/practice-session-params.ts` | Add the three fields to the Zod validation schema (`practiceSessionQuestionStateSchema`). Make them optional with defaults (`null`, `null`, `0`) so existing sessions deserialize without error |
| `src/domain/services/session-stats.ts` | Extend `createDefaultQuestionState(...)` so default state includes `draftSelectedChoiceId`, `draftSavedAt`, `draftCumulativeMs` |
| `src/domain/test-helpers/factories.ts` | Extend `createPracticeSession(...)` default `questionStates` with the new draft fields |
| `src/application/test-helpers/fakes/fake-practice-session-repository.ts` | Normalize seeded/default `questionStates` to include the new draft fields during create/read |

**What NOT to change:** No use case changes. No frontend changes. No changes to `latestSelectedChoiceId` / `latestIsCorrect` / `latestAnsweredAt` — those remain finalized-answer-only fields.

**Verification:**
- Existing unit tests pass (schema is backward-compatible via optional fields with defaults)
- Write a new test: deserialize a `questionStates` entry with no draft fields → defaults to `null/null/0`
- Write a new test: deserialize a `questionStates` entry WITH draft fields → round-trips correctly
- `pnpm typecheck && pnpm test --run`

---

## Stage 2: Application — Create `SaveExamDraftAnswer` use case

**What:** A new use case that persists a draft answer selection into `questionStates` for exam-mode sessions only.

**Why:** The frontend needs a server-side operation to call on navigation boundaries. This must exist before the UI can use it.

**New file:** `src/application/use-cases/save-exam-draft-answer.ts`

**Behavior:**
1. Input: `{ userId, sessionId, questionId, selectedChoiceId, cumulativeMs }`
2. Validate: session exists, belongs to user, is `mode === 'exam'`, is not ended (`endedAt === null`)
3. Reject if `mode !== 'exam'` — this operation is exam-only by definition
4. Update `questionStates` via a new repository-port method that uses CAS semantics under the hood:
   - Set `draftSelectedChoiceId = selectedChoiceId`
   - Set `draftSavedAt = new Date()`
   - Set `draftCumulativeMs = cumulativeMs`
   - Do NOT touch `latestSelectedChoiceId`, `latestIsCorrect`, `latestAnsweredAt`, or `markedForReview`
5. Overwrite semantics are **last write wins**. Re-saving the same question is expected and should simply replace the prior draft snapshot.
6. Return the updated state

**Also modify:**

| File | Change |
|------|--------|
| `src/application/ports/practice-session-repository.ts` | Add a `saveDraftAnswer(...)` port method (or equivalent explicit draft-save method). Do **not** route around the port into adapter helpers. |
| `src/adapters/repositories/drizzle-practice-session-repository.ts` | Implement the new draft-save repository method using the existing CAS updater pattern internally |
| `src/adapters/repositories/practice-session-question-state-updater.ts` | Reuse internally from the repository adapter only; no application-layer caller should import this file directly |
| `src/application/test-helpers/fakes/fake-practice-session-repository.ts` | Implement the new draft-save method in the fake |
| `src/application/use-cases/index.ts` | Export `SaveExamDraftAnswerUseCase` and its input/output types |

**What NOT to change:** No changes to `SubmitAnswer`. No changes to `EndPracticeSession`. No controller/DI/frontend changes in this stage.

**Verification:**
- TDD: write `save-exam-draft-answer.test.ts` using `FakePracticeSessionRepository`
- Test: saves draft for exam session → `draftSelectedChoiceId` updated, `latestSelectedChoiceId` unchanged
- Test: overwrites previous draft → new `draftSelectedChoiceId` replaces old
- Test: rejects for tutor session → `ApplicationError('VALIDATION')`
- Test: rejects for ended session → `ApplicationError('CONFLICT')`
- Test: rejects for nonexistent session → `ApplicationError('NOT_FOUND')`
- `pnpm typecheck && pnpm test --run`

---

## Stage 3: Application — Create `FinalizeExamAnswers` use case

**What:** A new use case that batch-finalizes all draft answers into real `attempts` rows and writes finalized `latest*` fields, then ends the session.

**Why:** This replaces the current per-question `submitAnswer` + manual `endPracticeSession` pattern for exam mode. It's the "hand in the test" operation.

**New file:** `src/application/use-cases/finalize-exam-answers.ts`

**Behavior:**
1. Input: `{ userId, sessionId, idempotencyKey }`
2. Validate: session exists, belongs to user, is `mode === 'exam'`, is not ended
3. In a single write transaction:
   - For each question in `questionStates` where `draftSelectedChoiceId !== null`:
     - Grade the answer: call `gradeAnswer(question, draftSelectedChoiceId)`
     - Insert one `attempts` row with `timeSpentSeconds = Math.floor(draftCumulativeMs / 1000)`
     - Write finalized `latestSelectedChoiceId`, `latestIsCorrect`, `latestAnsweredAt` into `questionStates`
     - Clear draft fields: `draftSelectedChoiceId = null`, `draftSavedAt = null`, `draftCumulativeMs = 0`
   - Questions with no draft (`draftSelectedChoiceId === null`) remain unanswered — no attempt row, no `latest*` write
   - Set `endedAt = now` on the session
4. After the transaction commits, return the same shape as current `EndPracticeSession` output by reusing the shared summary projection (`projectPracticeSessionSummary(...)` or equivalent shared mapper). Do **not** fork summary math in a second place.
5. Do **not** call `EndPracticeSessionUseCase` from inside `FinalizeExamAnswers`. This use case owns the exam-finalization transaction; it should share summary projection logic, not chain use cases.

**Critical constraint:** The `attempts` table unique constraint `(practiceSessionId, questionId)` means each question gets exactly one insert. This is satisfied because draft-save never touches `attempts` — only finalization does.

**Also modify:**

| File | Change |
|------|--------|
| `src/application/ports/practice-session-repository.ts` | Add a finalization-capable write path that writes `latest*` and clears `draft*` atomically per question (do not overload application code with adapter-specific updater calls) |
| `src/adapters/repositories/drizzle-practice-session-repository.ts` | Implement the finalization repository method used by this use case |
| `src/application/test-helpers/fakes/fake-practice-session-repository.ts` | Implement the same finalization behavior in the fake |
| `src/application/use-cases/index.ts` | Export `FinalizeExamAnswersUseCase` and its input/output types |
| `lib/container/types.ts` | Add factory types for `createFinalizeExamAnswersUseCase` and expose it through practice-controller deps |
| `lib/container/use-cases.ts` | Wire the new use case factory with its repositories/transaction wrapper |
| `lib/container/controllers.ts` | Expose `finalizeExamAnswersUseCase` on `createPracticeControllerDeps()` |
| `src/adapters/controllers/practice-schemas.ts` | Add input schema for `finalizeExamAnswers` |
| `src/adapters/controllers/practice-controller.ts` | Add a `finalizeExamAnswers` server action that calls this use case and mirrors the existing idempotent controller pattern used by `endPracticeSession` |
| `src/adapters/controllers/practice-controller.test.ts` | Add controller coverage for the new action |
| `src/application/test-helpers/fakes/fake-use-cases.ts` | Add `FakeFinalizeExamAnswersUseCase` |
| `src/application/test-helpers/fakes/index.ts` | Export the new fake use case |

**What NOT to change:** The existing `SubmitAnswer` and `EndPracticeSession` use cases stay untouched. Tutor mode continues to use them.

**Verification:**
- TDD: write `finalize-exam-answers.test.ts`
- Test: finalizes 3 drafted + 1 unanswered → 3 attempt rows, 1 unanswered
- Test: correct grading → `latestIsCorrect` matches `gradeAnswer`
- Test: `timeSpentSeconds` derived from `draftCumulativeMs`
- Test: draft fields cleared after finalization
- Test: session `endedAt` set
- Test: output matches `EndPracticeSession` shape and is projected via the shared summary mapper
- Test: rejects if already ended (idempotent)
- Test: rejects for tutor session
- `pnpm typecheck && pnpm test --run`

---

## Stage 4: Application — Make active exam readers draft-aware

**What:** During an active (not ended) exam session, every reader that derives answered/unanswered or restores question state must understand draft answers, not just finalized `latest*` fields.

**Why:** Without this stage, active exam state lies in three places:
- The review stage would show drafted questions as unanswered
- The question loader would still pick "next unanswered" based only on `latestSelectedChoiceId`
- The continue-session surface would report `answeredCount = 0` for active exams with saved drafts

**Files to modify:**

| File | Change |
|------|--------|
| `src/application/use-cases/get-practice-session-review.ts` | For active exam sessions, treat `draftSelectedChoiceId` as the source of answered/unanswered status; for ended sessions and tutor mode, keep using finalized `latestSelectedChoiceId` |
| `src/application/use-cases/get-next-question.ts` | Make active exam reads draft-aware when selecting the next unanswered question and when hydrating the current question's session payload |
| `src/application/use-cases/get-next-question.ts` | Extend `NextQuestion['session']` to carry explicit draft fields needed by the frontend (`draftSelectedChoiceId` and `draftCumulativeMs`, or equivalent names) so revisit restoration and stopwatch hydration survive reloads |
| `src/application/use-cases/get-incomplete-practice-session.ts` | For active exam sessions, count drafted questions as answered when computing the resume-card `answeredCount` |

**Draft-aware read rule:**

```typescript
const selectedChoiceIdForActiveRead =
  session.mode === 'exam' && session.endedAt === null
    ? state.draftSelectedChoiceId
    : state.latestSelectedChoiceId;
```

**What NOT to change:** Do not redefine `computeSessionStats(...)` to count drafts globally. Finalized session summaries should continue to derive from `latest*`. Keep draft-aware branching localized to active exam readers.

**Verification:**
- TDD: extend `get-practice-session-review.test.ts`, `get-next-question.test.ts`, and `get-incomplete-practice-session.test.ts`
- Test: active exam with 2 drafts + 1 unanswered → `answeredCount = 2`
- Test: active exam `GetNextQuestion` skips questions with drafts when looking for next unanswered
- Test: active exam `GetNextQuestion` returns `draftSelectedChoiceId` / `draftCumulativeMs` for the current question
- Test: active exam resume card uses drafts for `answeredCount`
- Test: ended exam (finalized) → uses `latestSelectedChoiceId` as before
- Test: tutor session → uses `latestSelectedChoiceId` as before (no regression)
- `pnpm typecheck && pnpm test --run`

---

## Stage 5: Frontend — Exam action bar redesign (PracticeView)

**What:** Replace the conditional button matrix in `PracticeView` with a fixed-slot exam action bar. Remove per-question Submit from exam mode. Remove auto-advance.

**Why:** This is the core UX fix — the thing the user actually sees.

**Deployment note:** This stage is **not independently shippable** without Stage 6 (draft-save on navigation) and Stage 7 (review-stage finalization). Land these three stages together or behind a feature flag.

**Files to modify:**

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-view.tsx` | Split action bar rendering: `isExamMode ? <ExamActionBar /> : <TutorActionBar />`. Exam bar: fixed slots `[Previous] [Next / Review answers] [Mark for review]`. No Submit button. No conditional visibility shifts. |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | Remove `maybeAutoAdvanceAfterSubmit` function entirely. It's exam-only and no longer needed. |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` | Remove the `maybeAutoAdvanceAfterSubmit` call from `onSubmit`. Wire exam Next to call draft-save + navigate (see Stage 6). |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` | Keep exam Previous/Next slot wiring stable after the split; the view currently derives Previous via `onNavigateQuestion`, not a dedicated hook-level previous handler |

**Exam action bar contract (from interaction-contracts.md):**

```
Non-last question:  [ Previous ]  [ Next ]           [ Mark for review ]
Last question:      [ Previous ]  [ Review answers ]  [ Mark for review ]
Q1:                 [ spacer   ]  [ Next ]           [ Mark for review ]
```

- Previous: hidden on Q1 (spacer), visible otherwise. Always position 1.
- Next / Review answers: always position 2. Next on non-last, Review answers on last.
- Mark for review: always position 3.
- Next is always enabled. No disabled state based on selection.

**Tutor action bar:** Unchanged. Same rendering as today. The split ensures exam changes can't regress tutor mode.

**What NOT to change:** `QuestionCard`, `ChoiceButton`, feedback rendering — those stay shared and untouched in this stage.

**Verification:**
- Update `practice-view.test.tsx`: exam mode renders `[Previous] [Next] [Mark for review]`, no Submit
- Update `practice-view.test.tsx`: tutor mode still renders Submit, still shows feedback
- Test: exam Q1 hides Previous (spacer)
- Test: exam last question shows "Review answers" in position 2
- Test: button positions are consistent regardless of answered state
- `pnpm typecheck && pnpm test --run && pnpm test:browser`

---

## Stage 6: Frontend — Draft-save on navigation + time accumulation

**What:** Wire exam-mode Next/Previous/navigator to save the current draft answer before navigating. Add client-side stopwatch time accumulation.

**Why:** This is where "what you see is what gets saved" becomes real. Without this, the AF-5 silent-discard bug persists under a new UI.

**Files to modify:**

| File | Change |
|------|--------|
| `app/(app)/app/practice/shared/question-flow-actions.ts` | Add a `maybeSaveDraftBeforeNavigation` function that calls `saveExamDraftAnswer` server action if: (a) exam mode, (b) a choice is selected, (c) choice differs from the last saved draft. Call it BEFORE `runLoadQuestionFlow` resets `selectedChoiceId`. |
| `app/(app)/app/practice/shared/use-question-flow-core.ts` | Reconcile the existing local `draftSelectedChoicesRef` with the new server-backed draft model. Do not leave the local map as a second source of truth. Restore active exam selection from explicit server draft fields, not finalized `latestSelectedChoiceId`. Hydrate stopwatch baseline from server draft time. |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts` | Inject `maybeSaveDraftBeforeNavigation` into `onNextQuestion` and `onNavigateQuestion`. There is no dedicated `onPreviousQuestion` handler here; Previous flows through `onNavigateQuestion` from the page view. |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts` | Add stopwatch state: `cumulativeMs` (per question, in a ref or state map) and `enteredAt` (timestamp). On question enter: set `enteredAt`. On question leave: `cumulativeMs += now - enteredAt`. |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` | Pass the new `saveExamDraftAnswer` server action into the question-flow hook and keep tutor wiring untouched |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts` | Save current draft before entering review stage (the header "Review answers" button and the last-question "Review answers" button both must trigger a save). |

**Server action to add:**

| File | Change |
|------|--------|
| `src/adapters/controllers/practice-schemas.ts` | Add input schema for `saveExamDraftAnswer` |
| `src/adapters/controllers/practice-controller.ts` | Add `saveExamDraftAnswer` server action wrapping the Stage 2 use case |
| `src/adapters/controllers/practice-controller.test.ts` | Add controller coverage for the new action |
| `lib/container/types.ts` | Add `saveExamDraftAnswerUseCase` to practice-controller deps |
| `lib/container/use-cases.ts` | Expose the Stage 2 use case through the container |
| `lib/container/controllers.ts` | Pass the new use case into `createPracticeControllerDeps()` |
| `src/application/test-helpers/fakes/fake-use-cases.ts` | Add `FakeSaveExamDraftAnswerUseCase` |
| `src/application/test-helpers/fakes/index.ts` | Export the new fake |

**QuestionCard re-selection on revisit:**

| File | Change |
|------|--------|
| `app/(app)/app/practice/shared/use-question-flow-core.ts` | After loading the question for exam mode: if the session payload exposes `draftSelectedChoiceId`, pre-populate `selectedChoiceId` from that value instead of `null`. This restores the user's previous selection when they navigate back or refresh. |

**What NOT to change:** Tutor mode navigation — revisiting a tutor question still restores finalized/locked state only. Do not introduce mutable draft behavior into tutor mode.

**Verification:**
- Test: exam select answer + click Next → draft saved server-side, then navigates
- Test: exam navigate back → previous draft selection restored in UI
- Test: exam change answer on revisit + click Next → draft overwritten
- Test: exam click Next with no selection → skip (no draft save), question stays unanswered
- Test: tutor click Next → no draft save (tutor path unchanged)
- Test: time accumulation across revisits (visit 30s + revisit 20s = 50s cumulative)
- Test: entering review stage saves current draft first
- `pnpm typecheck && pnpm test --run && pnpm test:browser`

---

## Stage 7: Frontend — Wire `FinalizeExamAnswers` into review stage

**What:** Replace the current exam submission flow (`endPracticeSession` from the review stage) with the new batch finalization action. Under the draft model, no exam `attempts` rows exist until this step.

**Why:** Under the draft model, no `attempts` rows exist yet when the user enters the review stage. `Submit exam` must call `FinalizeExamAnswers` to materialize them.

**Files to modify:**

| File | Change |
|------|--------|
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts` | Change `onFinalizeReview` to call `finalizeExamAnswers` server action instead of `endPracticeSession` for exam mode. Tutor continues using `endPracticeSession`. |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` | Pass `finalizeExamAnswers` into the review-stage hook while preserving tutor-mode `endPracticeSession` wiring |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | No structural change needed — it already renders answered/unanswered/marked from the review output. Stage 4 made the review output draft-aware. |

**What NOT to change:** The review stage UI, the submit confirmation dialog, the summary view, the summary cards. These all work off the same output shape.

**Verification:**
- Test: exam Submit exam → all drafts finalized, attempts rows created, session ended
- Test: exam Submit exam with unanswered questions → those stay unanswered, no attempt row
- Test: summary shows correct answered/correct/accuracy/duration
- Test: tutor end session → still uses `endPracticeSession` (no regression)
- Full pre-PR gate: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build`

---

## Stage 8: Bug fix — Session summary back-target (AF-4)

**What:** Fix all summary-launched review links to pass a session-summary-aware origin instead of `from: 'history'`.

**Why:** Currently, clicking "Review your answers" on the summary takes you to question review with `from=history`, so "Back to History" goes to `/app/history` instead of back to the summary. This is a navigation dead-end.

**Files to modify:**

| File | Change |
|------|--------|
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` (line ~108) | Change `from: 'history'` to a summary-aware origin (e.g. `from: 'summary'` with `sessionId`) |
| `app/(app)/app/shared/components/session-breakdown-list.tsx` | Ensure summary breakdown links also pass the summary-aware origin instead of `history` |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Handle the new `from=summary` origin: render "Back to Summary" linking to `/app/practice/[sessionId]` |
| `lib/routes.ts` | Add `'summary'` to `QuestionOrigin` and support it in `toQuestionRoute(...)` |
| `lib/routes.test.ts` | Add/update route-origin tests for `summary` |
| Question review tests | Update tests that currently assert summary-origin review resolves as `history` |

**Verification:**
- Test: summary CTA → question review → "Back to Summary" → returns to summary page
- Test: history-launched review → "Back to History" still works (no regression)
- `pnpm typecheck && pnpm test --run`

---

## Out of Scope (tracked separately)

| Item | Why out of scope | Tracked in |
|------|-----------------|-----------|
| Tutor mode Next pre-submit guard (AF-5 tutor) | Low severity, users naturally submit first. Different fix path (disable Next or save before navigate). | DEBT-318 vicinity or new debt |
| Post-exam session review reattempt suppression (AF-6) | Cross-cutting concern outside the active exam loop | Separate follow-up debt |
| Periodic autosave (30-60s) | Enhancement for crash resilience, not required for core flow | Future enhancement after core lands |
| `visibilitychange` / `beforeunload` draft saves | Same — crash resilience enhancement | Future enhancement |
| Bookmark icon toggle (BS-052) | Visual refinement, independent of interaction model | BS-052 |

---

## Stage Dependency Graph

```text
Stage 1 (domain + serialized draft fields)
    ↓
Stage 2 (application: SaveExamDraftAnswer + draft-save repository port)
    ↓
Stage 3 (application: FinalizeExamAnswers + finalization repository/controller wiring)
    ↓
Stage 4 (application: active exam readers become draft-aware)
    ↓
Stages 5-7 (frontend cutover chain: split action bar → save on navigation → finalize from review)

Stage 8 (summary-origin bug fix) — independent, can ship anytime
```

**Hidden dependency note:** Stage 4 must land before Stage 6 uses server-backed drafts for revisit restoration or resume counts. Stages 5-7 should be treated as one production rollout unless behind a feature flag.

---

## Pre-PR Gate (all stages complete)

```bash
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
```

Plus Chrome agent visual verification of the full exam flow (start exam → answer questions → navigate back and change → review stage → submit exam → summary → question review → back to summary).

---

## Implementation Progress

| Stage | Status | Commit | Notes |
|-------|--------|--------|-------|
| 1 | **Done** | `b7bb2cd6` | Draft fields on domain entity, Zod schema, factories, fakes. 14 files, 367 insertions. |
| 2 | **Done** | `c5817fb7` | SaveExamDraftAnswer use case + port + fake. 7 files, 385 insertions. |
| 3 | **Done** | `4b7f5ec9` | FinalizeExamAnswers use case + DI wiring + controller + server action. 15 files, 834 insertions. |
| 4 | **Done** | `b8a28c1b` | GetPracticeSessionReview, GetNextQuestion, GetIncompletePracticeSession draft-aware. 6 files, 221 insertions. |
| 5 | **Done** | `30471043` | ExamActionBar/TutorActionBar split, maybeAutoAdvanceAfterSubmit deleted. 7 files, 364 insertions. |
| 6 | **Done** | `edbb472d` | maybeSaveDraftBeforeNavigation, stopwatch accumulation, draft restoration on revisit, server action wiring. 21 files, 1074 insertions. |
| 7 | **Not started** | — | Review stage still routes exam submit through endPracticeSession instead of finalizeExamAnswers. |
| 8 | **Not started** | — | Summary back-target still passes `from: 'history'`. |

**Gate status (Stages 1-6):** `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test --run` 2119/2119 passing (22 new tests added). Browser tests and build not yet verified for the full gate.
