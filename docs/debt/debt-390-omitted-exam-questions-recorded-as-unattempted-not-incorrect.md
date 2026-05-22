# DEBT-390: Omitted Exam Questions Are Recorded As Unattempted, Not Incorrect

**Priority:** P2
**Created:** 2026-05-22
**Source:** Investigation for [SPEC-039](../specs/spec-039-exam-mode-timer.md) (exam-mode timer). While mapping the exam finalize path to design auto-submit-on-expiry, the per-question scoring record was found to drop unanswered questions instead of scoring them as incorrect. User confirmed the intended behavior — "unanswered should read as incorrect, consistent with a real exam" — for both manual finalize and timer expiry.
**Related:** [SPEC-039 (Exam Mode Timer)](../specs/spec-039-exam-mode-timer.md) (depends on this), [SPEC-013 (Practice Sessions)](../_archive/specs/spec-013-practice-sessions.md), [SPEC-020 (Practice Engine Completion)](../_archive/specs/spec-020-practice-engine-completion.md), [Practice Engine](../practice-engine/index.md)

**Status:** Active

---

## Verdict

DEBT-390 is real, but the accurate scope is narrower and more precise than "all incomplete answers."

An incomplete answer means different things on each practice surface:

- **Exam mode:** an active exam question reaches final submit with no persisted draft and no recorded latest answer. This state is reachable. Current finalize only processes drafted answers, then ends the session, so blank exam questions remain terminal `null` session states and produce no `attempts` row. The headline exam percentage already counts blanks against the denominator, but per-question/attempt consumers still see the blank as unanswered or never attempted, not incorrect.
- **Tutor mode:** selected answers commit immediately. A tutor session can still be ended early with later questions unanswered, but that is an early-abandon session state, not a deferred "submit the whole exam" omission. Current code records those skipped tutor questions as unanswered/no attempt. DEBT-390 should not silently convert tutor early-end blanks into incorrect attempts unless product policy explicitly changes.
- **Quick Practice / standalone one-question flow:** there is no session finalize/end state. Selecting a choice immediately creates a standalone attempt. Leaving the page without selecting a choice creates no terminal submission, so there is no analogous DEBT-390 gap.

The original DEBT-390 citations for the exam finalize path, accuracy denominator, and non-null attempt schema were verified and are correct. The original doc was incomplete in two places: it did not prove tutor/quick-practice behavior, and it overstated review harm by implying omitted exam questions are not reviewable at all. They are still visible in session/post-exam review as **unanswered**; the bug is that attempt-backed consumers do not record them as **incorrect**.

This remains a real, present scoring-record gap independent of the timer. SPEC-039's auto-submit lands on the same exam finalize path, so DEBT-390 remains a **hard prerequisite** for SPEC-039.

---

## Existing Citation Audit

Every file/line citation that existed in this debt note was re-opened and confirmed against the current code:

- `src/application/use-cases/practice-session-summary.ts:26` - `const questionCount = session.questionIds.length;`
- `src/application/use-cases/practice-session-summary.ts:36` - `const { answered, correct } = computeSessionStats(orderedStates);`
- `src/application/use-cases/practice-session-summary.ts:46` - `accuracy: computeAccuracy(questionCount, correct),`
- `src/domain/services/statistics.ts:12-15` - `computeAccuracy(total, correct)` returns `correct / total` after clamping.
- `src/domain/services/session-stats.ts:12-24` - `computeSessionStats` counts answered only when `state.latestSelectedChoiceId !== null` and correct only when `state.latestIsCorrect === true`.
- `src/domain/services/session-stats.ts:40-53` - `createDefaultQuestionState` initializes `latestSelectedChoiceId`, `latestIsCorrect`, `latestAnsweredAt`, `draftSelectedChoiceId`, and `draftSavedAt` to `null`.
- `src/application/use-cases/finalize-exam-answers.ts:86-88` - `const draftedStates = activeSession.questionStates.filter((state) => state.draftSelectedChoiceId !== null);`
- `src/application/use-cases/finalize-exam-answers.ts:94-125` - only those drafted states get attempts inserted and drafts promoted.
- `src/application/use-cases/finalize-exam-answers.ts:127` - finalize then ends the session with `return tx.sessions.end(...)`.
- `db/schema.ts:437-439` - `selectedChoiceId: uuid('selected_choice_id').notNull().references(...)`.
- `src/domain/entities/attempt.ts:41` - `readonly selectedChoiceId: string;`

The citations are accurate; the interpretation now needs the mode-specific and consumer-specific nuance below.

---

## First-Principles Mode Audit

Terminology: an active unfinished session is not itself a scored result. `src/application/use-cases/get-incomplete-practice-session.ts:45-57` only computes a resume-card `answeredCount`; for active exams it counts drafts/latest selections, and for tutor it uses latest selections. The DEBT-390 question is what happens when a surface reaches a terminal state: exam finalize, tutor end-session, or standalone submit.

### 1. Exam Mode

Exam questions start with nullable latest and draft fields. `src/domain/entities/practice-session.ts:6-15` defines `latestSelectedChoiceId: string | null`, `latestIsCorrect: boolean | null`, `latestAnsweredAt: Date | null`, `draftSelectedChoiceId: string | null`, and `draftSavedAt: Date | null`. `src/application/use-cases/start-practice-session.ts:68-78` creates every session state with `createDefaultQuestionState(questionId)`.

Active exam selection is deferred. The UI blocks per-question submit for normal active exam flow: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:393-410` computes `shouldBlockExamCommit` for `mode === 'exam'` and returns before `commitChoice`. Exam choice clicks update local state but do not submit: `use-practice-session-question-flow.ts:412-420` calls `selectChoice(choiceId)` and returns immediately when `question?.session?.mode === 'exam'`.

Navigation saves a draft only if a selected choice exists. `app/(app)/app/practice/shared/question-flow-actions.ts:162-180` checks active exam mode, then returns without calling `saveExamDraftAnswerFn` when `!selectedChoiceId`. The draft save use case also only accepts a selected choice: `src/application/use-cases/save-exam-draft-answer.ts:10-16` has `selectedChoiceId: string`.

"Marked for review" is orthogonal to answering. `src/application/use-cases/set-practice-session-question-mark.ts:30-44` only permits the feature in active exam sessions, then calls `setQuestionMarkedForReview(...)`; `src/adapters/repositories/drizzle-practice-session-repository.ts:294-310` updates only `markedForReview`. Marking does not create a selected answer or an attempt.

Final submit processes only persisted drafts:

```ts
const draftedStates = activeSession.questionStates.filter(
  (state) => state.draftSelectedChoiceId !== null,
);
```

That is `src/application/use-cases/finalize-exam-answers.ts:86-88`. The loop at `finalize-exam-answers.ts:94-125` inserts attempts and calls `tx.sessions.finalizeDraftAnswer(...)` only for those drafted states, then `finalize-exam-answers.ts:127` ends the session. A question with no draft remains terminal with `latestSelectedChoiceId: null` and no attempt row.

The existing unit test locks in the current behavior: `src/application/use-cases/finalize-exam-answers.test.ts:76` names the case "finalizes drafted exam answers into attempts and leaves unanswered questions untouched"; `finalize-exam-answers.test.ts:150-161` expects `questionCount: 4`, `answered: 3`, `correct: 2`, and `accuracy: 0.5`; `finalize-exam-answers.test.ts:163-184` expects attempts only for `q1`, `q2`, and `q3`; `finalize-exam-answers.test.ts:186-228` expects `q4` to remain `latestSelectedChoiceId: null`, `latestIsCorrect: null`, and `latestAnsweredAt: null`.

**Exam verdict:** broken. A finalized exam can contain terminal unanswered questions. They lower the score percentage but are not recorded as incorrect attempts.

### 2. Tutor Mode

Tutor mode does not use exam drafts. Choice click commits immediately: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:412-420` only returns early for exam; tutor falls through to `void commitChoice(choiceId)`.

The submit use case then records a real attempt. `src/application/use-cases/submit-answer.ts:201-211` builds an attempt with `selectedChoiceId: input.choiceId` and `isCorrect: grade.isCorrect`; `submit-answer.ts:213-232` inserts it and calls `tx.sessions.recordQuestionAnswer(...)` for session-backed practice. `src/adapters/repositories/drizzle-practice-session-repository.ts:209-230` persists `latestSelectedChoiceId`, `latestIsCorrect`, and `latestAnsweredAt`.

Tutor can still end before every question is answered. The non-exam header renders `End session`: `app/(app)/app/practice/components/practice-view.tsx:392-403` shows that action when `mode !== 'exam'`. The end use case only ends the session: `src/application/use-cases/end-practice-session.ts:18-31` calls `this.sessions.end(...)` and projects a summary; it creates no attempts. The repository end path only sets `endedAt`: `src/adapters/repositories/drizzle-practice-session-repository.ts:314-359`.

**Tutor verdict:** no exam-style deferred omission bug, but terminal unanswered tutor session states are reachable through early end. They are currently scored in the session percentage denominator and shown as unanswered/no attempt. Treating those as incorrect is a separate product decision, not an automatic DEBT-390 fix.

### 3. Quick Practice / Standalone

Quick Practice is standalone. `app/(app)/app/practice/quick/quick-practice-client.tsx:51-70` calls `usePracticeQuestionFlow(...)` without a `sessionId`, and `quick-practice-client.tsx:72-120` renders `PracticeView` without `onEndSession`.

Choice click immediately submits. `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts:190-198` calls `selectChoice(choiceId)` and then `void commitChoice(choiceId)`. The standalone submit path uses the same `SubmitAnswerUseCase`; when there is no session, `submit-answer.ts:233-235` inserts the attempt with `practiceSessionId: null`.

Question selection is attempt-backed. `src/domain/services/question-selection.ts:14-16` picks the first candidate not present in attempt history, and the quick-practice loader uses `getNextQuestion` with status filters (`app/(app)/app/practice/practice-page-logic.ts:49-87`).

**Quick Practice verdict:** no terminal blank state exists. A displayed-but-abandoned question has not been submitted; a clicked choice creates an attempt immediately. No DEBT-390 analogue was found.

---

## Consumer Audit

### Session Summary and Session History

Session accuracy already uses total questions as the denominator. `src/application/use-cases/practice-session-summary.ts:26` sets `questionCount` from `session.questionIds.length`, and `practice-session-summary.ts:46` computes `accuracy: computeAccuracy(questionCount, correct)`. `src/application/use-cases/get-session-history.ts:78-90` does the same for completed sessions. The dashboard session list renders `row.correct/{row.questionCount} correct` at `app/(app)/app/dashboard/page.tsx:165-174`.

This part is already correct for exam omissions and should be preserved.

### Session Review, Breakdown, and Post-Exam Review

Review rows derive answered state from selected choice presence. `src/application/use-cases/get-practice-session-review.ts:121-130` returns `isAnswered: selectedChoiceId !== null` and `isCorrect: shouldShowCorrectness ? state.latestIsCorrect : null`. An omitted finalized exam question therefore renders as unanswered with `isCorrect: null`.

The shared breakdown labels this explicitly as unanswered: `app/(app)/app/shared/components/session-breakdown-list.tsx:75-87` uses `row.isAnswered ? ... : 'Unanswered'`. The review navigator does the same: `app/(app)/app/shared/components/review-navigator-utils.ts:9-13` maps `isCorrect === null` to `Unanswered`, and `app/(app)/app/shared/components/review-correctness-badge.tsx:3-10` renders no correctness badge for `null`.

Post-exam review still shows omitted questions, but as unanswered. `src/application/use-cases/get-completed-session-questions-with-feedback.ts:133-149` falls back from an attempt to `state.latestSelectedChoiceId ?? null`; omitted rows therefore have `selectedChoiceId: null`, `isAnswered: false`, and `isCorrect: null`. `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:127-142` then shows the unanswered warning and passes `isUnanswered` to feedback. `components/question/feedback.tsx:178-193` suppresses the incorrect verdict pill for unanswered rows.

So the original harm should be phrased precisely: omitted exam questions are reviewable in session/post-exam review, but they are labeled **unanswered**, not **incorrect**.

### Attempted Questions, Status Filters, and User Stats

Attempt-backed consumers cannot see omitted exam questions because no attempt row exists.

`src/adapters/repositories/drizzle-attempt-repository.ts:51-72` builds latest-attempt rows from the `attempts` table only, and `drizzle-attempt-repository.ts:75-117` supports result filters only for `isCorrect = true` or `isCorrect = false`. `src/application/ports/attempt-repository.ts:37-38` mirrors that with `AttemptedQuestionsResultFilter = 'correct' | 'incorrect'` and source filters `tutor | exam | adhoc`. The history questions tab renders only correct/incorrect attempted rows: `app/(app)/app/history/components/history-questions-tab.tsx:70-75` and `history-questions-tab.tsx:203-235`.

Quick Practice status filters are also attempt-backed. `src/domain/value-objects/question-progress-status.ts:1-4` defines only `unanswered`, `incorrect`, and `bookmarked`. `src/adapters/repositories/drizzle-question-repository.ts:205-225` implements `unanswered` by excluding questions with matching attempts, while `drizzle-question-repository.ts:226-239` implements `incorrect` from latest attempts where `isCorrect` is false. With no omitted attempt row, a blank finalized exam item remains eligible for `unanswered` and not for `incorrect`.

Dashboard stats are attempt-backed too. `src/application/use-cases/get-user-stats.ts:81-101` computes totals and accuracy from `attempts.countByUserId(...)` and `attempts.countCorrectByUserId(...)`; `app/(app)/app/dashboard/page.tsx:59-89` renders those values as "Total answered", "Overall accuracy", "Answered (7 days)", and "Accuracy (7 days)". Omitted exam blanks do not count as misses there today.

`src/application/use-cases/get-previous-attempt.ts:99-137` has a session-specific fallback that can return `kind: 'session_unanswered'` for a completed-session unanswered reveal. That is useful for review continuity, but it is not an incorrect attempt and does not feed attempt-backed history, status filters, or user stats.

### Active-Exam Attempt Visibility (the seam the fix flows through)

Attempt-backed user-facing consumers audited here use a shared active-exam visibility predicate. `src/adapters/repositories/shared/active-exam-visibility.ts:16-21` returns a predicate that permits standalone attempts, non-exam attempts, and ended-session attempts: `isNull(practiceSessions.id)`, `ne(practiceSessions.mode, 'exam')`, or `isNotNull(practiceSessions.endedAt)`. The helper comment at `active-exam-visibility.ts:6-13` states the intended seam: "hides attempt rows belonging to active (non-ended) exam sessions" and requires callers to join `practiceSessions`.

The Drizzle callers apply that predicate, not the rank helper. `src/adapters/repositories/drizzle-question-repository.ts:178-197` builds latest visible attempt rows by joining `practiceSessions` and applying `getActiveExamVisibilityCondition()`. Its `unanswered` subquery does the same at `drizzle-question-repository.ts:215-224`, and `drizzle-question-repository.ts:226-239` then classifies `incorrect` from those latest rows where `isCorrect` is false. `src/adapters/repositories/drizzle-attempt-repository.ts:51-72` builds latest visible attempt rows with the same predicate, and `drizzle-attempt-repository.ts:75-89` applies `correct`/`incorrect` result filters only by `isCorrect`. The shared ranking helper itself is only the window expression: `src/adapters/repositories/shared/latest-attempt-rank-sql.ts:4-10` returns `row_number() over (partition by ... order by ...)`.

This matters for remediation: `FinalizeExamAnswersUseCase` performs attempt inserts, session-state promotion, and `tx.sessions.end(...)` inside one transaction (`src/application/use-cases/finalize-exam-answers.ts:63-127`). Once the transaction commits, omitted-incorrect rows written for that session satisfy the visibility predicate because `practiceSessions.endedAt` is no longer null. A correct-fix test must therefore prove an omitted row is visible and incorrect after finalize, not silently hidden by active-exam filtering.

---

## Schema and Domain Representation

The current system can represent an unanswered session question but cannot represent an omitted incorrect attempt.

- Session state can represent unanswered/null fields (`PracticeSessionQuestionState` in `src/domain/entities/practice-session.ts:6-15`).
- Attempts require a selected choice in the database: `db/schema.ts:437-439` has `selectedChoiceId ... .notNull()`.
- Attempts require a selected choice in the domain: `src/domain/entities/attempt.ts:41` has `readonly selectedChoiceId: string;`.
- Attempt insert ports require a selected choice: `src/application/ports/attempt-repository.ts:12-22` has `selectedChoiceId: string`.
- The Drizzle row mapper actively rejects null selected choices: `src/adapters/repositories/attempt-row-mappers.ts:19-32` throws `Attempt ... selectedChoiceId must not be null`.
- Grading requires a selected choice: `src/domain/services/grading.ts:14-17` looks up `selectedChoiceId` and has no null/omitted path.

Therefore a real fix is structural. It cannot be a finalize-use-case loop alone unless the model learns how to store and read "no selected choice, scored incorrect."

---

## Additional Implementation Constraints

These are diagnosis constraints for the downstream implementation spec, not a TDD plan.

### `isCorrect` Is the Scoring Contract

Omitted exam rows must store `is_correct = false`; consumers must not derive omission incorrectness at read time.

The reason is mechanical. The attempt-history result filters only inspect `isCorrect`: `src/adapters/repositories/drizzle-attempt-repository.ts:83-89` pushes `eq(latestAttemptRows.isCorrect, true)` or `eq(latestAttemptRows.isCorrect, false)`, and `drizzle-attempt-repository.ts:430-468` returns `isCorrect` directly in attempted-question summaries. The Quick Practice status filter also reads `isCorrect` directly: `src/adapters/repositories/drizzle-question-repository.ts:226-239` selects latest rows where `isCorrect` is false for `incorrect`. Dashboard totals/accuracy are also already `isCorrect`-keyed: `src/application/use-cases/get-user-stats.ts:81-101` asks the repository for total attempt counts and correct counts, then calls `computeAccuracy(totalAnswered, correctOverall)`.

With materialized omitted rows and stored `isCorrect: false`, those consumers need rows, not per-consumer omission branches. The code that must change is the code that currently requires or renders a selected choice.

### Time Spent

Attempt rows require `timeSpentSeconds`: `db/schema.ts:440-442` has `isCorrect: boolean('is_correct').notNull()` and `timeSpentSeconds: integer('time_spent_seconds').notNull().default(0)`, and `src/application/ports/attempt-repository.ts:12-22` requires `timeSpentSeconds` on `AttemptInsertInput`.

For drafted answers, finalize already caps draft time and stores seconds: `src/application/use-cases/finalize-exam-answers.ts:103-115` computes `cappedCumulativeMs` from `state.draftCumulativeMs` and writes `timeSpentSeconds: Math.floor(cappedCumulativeMs / MS_PER_SECOND)`. For never-selected exam questions, current navigation deliberately does not persist a time-only draft: `app/(app)/app/practice/shared/question-flow-actions.ts:174-180` returns after local `onSaved` when `!selectedChoiceId`, and `src/adapters/controllers/practice-schemas.ts:56-62` requires `selectedChoiceId` for `SaveExamDraftAnswerInputSchema`.

Therefore omitted rows should use the same capped `state.draftCumulativeMs` calculation when a server state value exists, but must accept that never-selected omissions usually have `0` because the current system does not store time-only drafts.

### Retry and Try Again

Finalize-created omitted rows are original exam outcomes, not retries. The existing retry columns are optional metadata on `attempts` (`db/schema.ts:442-444`), and the domain validator treats all retry metadata as absent only when `retryOrigin === null` and both retry ids are null (`src/domain/entities/attempt.ts:20-34`). `FinalizeExamAnswersUseCase` currently inserts final exam attempts without retry metadata (`src/application/use-cases/finalize-exam-answers.ts:108-115`), so omitted rows should also have `retryOfAttemptId`, `retryOrigin`, and `retrySessionId` null.

SPEC-034's session-review path already has a separate unanswered reveal fallback: `src/application/use-cases/get-previous-attempt.ts:99-137` returns `kind: 'session_unanswered'` only when no session-scoped attempt exists. After this fix, an omitted exam question will have a session-scoped attempt, so review should use the attempt/outcome path instead of that fallback. The question page also hides reattempt for exam review outcomes because `app/(app)/app/questions/[slug]/question-page-client.tsx:182-184` allows reattempt only when `reviewSessionMode !== 'exam'`, and the reattempt button renders from that flag at `question-page-client.tsx:409-419`.

### Finalize Idempotency

The controller path is idempotency-key aware: `src/adapters/controllers/practice-controller.ts:255-279` wraps `finalizeExamAnswers` in `executeIdempotent(...)`, and `src/adapters/controllers/shared/execute-idempotent.ts:35-46` caches keyed results through `withIdempotency`. The use case itself still rejects a completed session (`src/application/use-cases/finalize-exam-answers.ts:56-60` and `finalize-exam-answers.ts:79-84`), and the database prevents duplicate session-question attempts with `attempts_session_question_uq` (`db/schema.ts:474-478`). `DrizzleAttemptRepository.insert` maps that constraint to `CONFLICT` (`src/adapters/repositories/drizzle-attempt-repository.ts:190-197`).

The implementation spec must preserve that shape: a single transactional finalize pass writes selected and omitted outcomes before ending the session, keyed retries return the cached result, and duplicate session/question rows remain illegal.

### Output DTO Ripple

The discriminated-union outcome cannot stay only inside the mapper. Several outputs currently assume either a selected choice or "unanswered":

- `src/application/use-cases/get-previous-attempt.ts:22-32` defines `kind: 'attempt'` with `selectedChoiceId: string`, and `get-previous-attempt.ts:186-197` / `220-231` return `attempt.selectedChoiceId`.
- `src/application/use-cases/get-completed-session-questions-with-feedback.ts:133-149` derives `isAnswered` from `selectedChoiceId !== null` and carries `selectedChoiceId` into the row.
- `src/application/use-cases/get-practice-session-review.ts:121-130` also derives `isAnswered` from selected-choice presence and carries `isCorrect` separately.
- `app/(app)/app/questions/[slug]/question-page-client.tsx:147-155` models the question view around `selectedChoiceId: string | null` plus a separate `sessionUnansweredReveal`, and `question-page-client.tsx:223-241` converts that reveal into `isUnanswered`.
- `components/question/question-surface-body.tsx:12-18` accepts `selectedChoiceId: string | null`, then `question-surface-body.tsx:41-49` passes it into both `QuestionCard` and `Feedback`; `components/question/question-card.tsx:40-48` derives selected/incorrect choice rendering from that id.
- `components/question/feedback.tsx:178-193` suppresses the incorrect verdict when `isUnanswered` is true, and `components/question/feedback.tsx:162-176` only renders the user's wrong choice when `selectedChoiceId` points to one.
- `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:127-142` displays the "did not answer" warning and passes `isUnanswered` into feedback for rows with no selected choice.
- `app/(app)/app/shared/components/session-breakdown-list.tsx:75-87` labels rows as `Unanswered` whenever `row.isAnswered` is false; `app/(app)/app/shared/components/review-navigator-utils.ts:9-13` and `app/(app)/app/shared/components/review-correctness-badge.tsx:3-10` encode the same `null` means unanswered convention.

Those DTOs/components need an explicit omitted/scored-outcome signal so omitted rows can display "no answer selected" while still rendering as incorrect. By contrast, `GetAttemptedQuestionsUseCase`, `DrizzleQuestionRepository` status filters, and `GetUserStatsUseCase` do not render selected answers and should not need omission-specific read logic once `isCorrect=false` rows exist.

---

## Concrete User Harm

A student takes a 10-question exam, leaves 2 blank, and finalizes manually or by SPEC-039 timer expiry:

- The session score percentage correctly uses `correct / 10`.
- The 2 blanks remain visible in session/post-exam review, but as **Unanswered** with no incorrect verdict.
- The 2 blanks do not enter the attempt-backed incorrect question history.
- Quick Practice status filters can still classify them as **unanswered**, not **incorrect**.
- Dashboard/user stats do not count them as incorrect attempts, because there are no attempt rows.

That diverges from the stated exam behavior: omitted exam items should be scored and recorded as incorrect.

---

## Decided Remediation Direction (implementation spec still required)

This debt note is the diagnosis and decided direction. It is **not** the TDD implementation spec; the actual build should be captured in the next implementation spec and is out of scope for this document.

Required shape of the correct fix:

1. **Materialize omissions as attempt rows.** Do not implement per-consumer `UNION` logic over session state. A single finalize write must feed all attempt-backed consumers from the same source of truth. This deliberately broadens the meaning of `attempt` from "selected answer" to **scored question outcome**.
2. **Schema: nullable selected choice + boolean omission marker + check constraints.** Make `attempts.selected_choice_id` nullable, add `is_omitted boolean not null default false`, and add a CHECK that makes illegal states unrepresentable: `(selected_choice_id IS NOT NULL) XOR is_omitted`, plus `is_omitted IMPLIES is_correct = false`. Use a boolean rather than an enum because today's model has only two outcome shapes (selected answer or omission) and consumers already classify score by `isCorrect`; `src/application/ports/attempt-repository.ts:37-38` exposes only `correct | incorrect` result filters and `src/domain/value-objects/question-progress-status.ts:1-4` exposes only `unanswered | incorrect | bookmarked` status filters.
3. **Domain: model the answer outcome as a discriminated union.** Keep the database storage simple, but map it into a domain value object such as selected-vs-omitted so a future third outcome changes the mapper/domain boundary first instead of spreading nullable-choice checks through application code. This follows the existing mapper seam: `src/adapters/repositories/attempt-row-mappers.ts:34-66` is already the adapter-to-domain conversion point.
4. **Store `isCorrect=false` on omitted rows.** Do not derive it in readers. This is what lets `DrizzleQuestionRepository` incorrect filters, `DrizzleAttemptRepository` attempted-question filters, and `GetUserStatsUseCase` totals/accuracy work from ordinary attempt rows with no omission-specific branches.
5. **Keep `gradeAnswer` selected-choice-only.** `src/domain/services/grading.ts:14-17` requires a `selectedChoiceId: string`, and `src/application/use-cases/finalize-exam-answers.ts:103` correctly calls it only for drafted selected answers. The omitted finalize branch should set `isCorrect: false` directly and must not route a null/sentinel choice through `gradeAnswer`.
6. **Finalize all exam questions in one transaction.** Drafted questions continue to produce selected-outcome attempts. Questions with no draft and no latest selected answer produce omitted-outcome attempts with `selectedChoiceId: null`, `isOmitted: true`, `isCorrect: false`, capped `timeSpentSeconds`, null retry metadata, and the session state needed for review DTOs to show a terminal incorrect omission. Preserve non-exam semantics: no omitted attempts for Quick Practice abandonment, and no automatic incorrect attempts for tutor early-end blanks unless product policy changes.

A session-state-only fix is insufficient. Marking `latestIsCorrect = false` without an attempt row would still leave attempted-question history, status filters, dashboard stats, streak/recent-activity inputs, and attempt-backed mastery blind to omissions. The code proves those consumers are attempt-backed: `src/adapters/repositories/drizzle-attempt-repository.ts:317-360` counts attempts/correct attempts, `drizzle-attempt-repository.ts:362-392` lists recent attempts, `drizzle-attempt-repository.ts:395-415` lists answered-at timestamps for streaks, and `src/adapters/repositories/drizzle-question-repository.ts:205-239` implements `unanswered`/`incorrect` from attempts.

### Must-Change List

- `db/schema.ts` and generated migration: make `attempts.selected_choice_id` nullable, add `is_omitted`, add the XOR/incorrect CHECK, keep the session/question unique index (`db/schema.ts:474-478`), and include an independent backfill migration.
- `src/domain/entities/attempt.ts`: replace `selectedChoiceId: string` (`attempt.ts:36-47`) with an answer-outcome value object while keeping `isCorrect`.
- `src/application/ports/attempt-repository.ts`: widen `AttemptInsertInput.selectedChoiceId` (`attempt-repository.ts:12-22`) into the same selected-vs-omitted input shape.
- `src/adapters/repositories/attempt-row-mappers.ts`: replace `requireSelectedChoiceId(...)` (`attempt-row-mappers.ts:19-32`) with invariant-aware outcome mapping.
- `src/adapters/repositories/drizzle-attempt-repository.ts` and `src/application/test-helpers/fakes/fake-attempt-repository.ts`: insert/read omitted outcomes and preserve the existing `isCorrect`-based filters/counters.
- `src/application/use-cases/finalize-exam-answers.ts`: iterate all session question states, grade selected drafts, materialize omitted rows directly as incorrect, update review-facing session state, and end the session in the existing transaction.
- Review output DTOs/UI that render selected answers: `GetPracticeSessionReviewUseCase`, `GetCompletedSessionQuestionsWithFeedbackUseCase`, `GetPreviousAttemptUseCase`, `QuestionView`/`QuestionSurfaceBody`, `PostExamReviewView`, `Feedback`, `SessionBreakdownList`, and review navigator/badge copy where omitted status must be distinguishable from active unanswered.
- Tests/fakes for the above. Follow the repo TDD/fakes rules in the downstream implementation spec; do not encode those tests in this diagnosis doc.

Notably, these do **not** need omission-specific scoring branches once omitted rows store `isCorrect=false`: `GetAttemptedQuestionsUseCase`, `DrizzleQuestionRepository` correct/incorrect status filters, `GetUserStatsUseCase` counts/accuracy, dashboard recent activity correctness labels, and attempted-question history result filters.

### Historical Data

Backfill is required. Forward-only is rejected because two users who submitted identical exams on opposite sides of the ship boundary would have different history/status/dashboard records for the same omitted questions.

The data needed for an idempotent backfill exists today. `db/schema.ts:396-401` stores each practice session's `mode`, `paramsJson`, and `endedAt`; `src/adapters/repositories/practice-session-params.ts:19-35` defines persisted per-question state with nullable `latestSelectedChoiceId`, nullable `latestIsCorrect`, nullable `latestAnsweredAt`, nullable draft fields, and `draftCumulativeMs`; `practice-session-params.ts:120-133` normalizes one state per `questionId`. The backfill should walk ended exam sessions, find terminal-null question states, and insert omitted-incorrect attempts only where no session/question attempt exists. The existing unique index at `db/schema.ts:474-478` is the database backstop, but the migration should still be explicitly idempotent and independently tested.

Do not bundle this backfill into the finalize hot path. It is a one-time data migration with different risk, observability, and rollback concerns from normal exam submission.

---

## Relationship to SPEC-039 (Exam Mode Timer)

SPEC-039's defining behavior is **auto-submit on expiry**, which calls the same exam finalize path. If SPEC-039 ships before this is fixed, a timed-out exam will under-record every unanswered question in exactly the way manual submit does today. SPEC-039 therefore remains correctly framed as blocked on DEBT-390 for the exam auto-submit behavior.

No SPEC-039 rewrite is required from this audit. The nuance is that the blocker is exam-finalization correctness, not tutor or Quick Practice behavior.

---

## Out of Scope

- Changing Quick Practice abandonment semantics. There is no terminal standalone submission without a selected choice.
- Changing tutor early-end semantics unless product explicitly decides that unanswered tutor items should become incorrect attempts.
- The accuracy-percentage denominator (`computeAccuracy` / `questionCount`) - already correct for exam omissions and should be preserved.
- The exam timer UI and countdown mechanics - those remain SPEC-039.
