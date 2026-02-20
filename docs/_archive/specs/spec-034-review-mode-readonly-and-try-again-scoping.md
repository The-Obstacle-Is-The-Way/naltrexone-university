# SPEC-034: Review Mode Read-Only Behavior & Try Again Scoping

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development. Write failing tests FIRST for every behavioral change.

**Status:** Implemented
**Layer:** Feature  
**Date:** 2026-02-18  
**Resolves:** [BS-022](../_archive/brainstorming/bs-022-unanswered-question-review-handling.md), [BS-023](../_archive/brainstorming/bs-023-try-again-state-consistency.md)

---

## 1. Overview

BS-022 and BS-023 are the same product issue from two angles:

- In session review, unanswered questions currently render as active forms (not review content).
- In review contexts that allow submission, "Try Again" creates detached attempts that can diverge from session history semantics.

Target behavior in this spec:

1. **Session review is read-only and educational.**  
   If a question is unanswered in a completed session, auto-reveal the correct answer and explanation with an explicit unanswered indicator.
2. **Try Again is scoped to non-session contexts only.**  
   Session review pages do not offer Submit or Try Again.

### Verified code-truth baseline (authoritative)

1. `loadPreviousAttempt()` falls back to attempt mode when server returns `null`; no unanswered-session reveal path exists today (`app/(app)/app/questions/[slug]/question-page-logic.ts`).
2. `getQuestionBySlug` output does **not** include `choices[].isCorrect`, `correctChoiceId`, or `explanationMd`; BS-022's "already client-side" claim is stale (`src/adapters/controllers/question-view-controller.ts`).
3. `reattemptQuestion()` is purely client-side state reset (`app/(app)/app/questions/[slug]/question-page-logic.ts`).
4. `submitAnswer` hard-stops ended sessions **only when `sessionId` is provided** (`src/application/use-cases/submit-answer.ts`).
5. `QuestionPage` review submits currently omit `sessionId`; review submissions are standalone by payload (`app/(app)/app/questions/[slug]/question-page-logic.ts`).

### Verified routing reality (corrected)

| Context | Route params actually passed today |
|---|---|
| Practice Session Review | `from=practice&mode=review&sessionId=...` |
| History Session Review | `from=history&mode=review&sessionId=...` (+ `historyHref`) |
| History Individual Review | `from=history&mode=review` (+ `historyHref`) |
| Dashboard Individual Review | `from=dashboard&mode=review&attemptId=...` |
| Bookmarks Reattempt | `from=bookmarks` (no `mode=review`, no session context) |

---

## 2. Resolved Decisions

| Source | Open Question | Resolution | Rationale |
|---|---|---|---|
| BS-022 Q1 | Should unanswered exam questions count as incorrect in stats? | **Yes.** | Matches exam-submit warning and test-sim fidelity. |
| BS-022 Q2 | Should tutor treat unanswered differently from exam? | **Yes.** Tutor remains `correct / answered`; exam becomes `correct / total`. | Tutor is learning progression; exam is scoring simulation. |
| BS-022 Q3 | Show "did not answer" banner? | **Yes (required).** | Makes session-unanswered state explicit and removes ambiguity. |
| BS-022 Q4 | Offer Try Again for unanswered review questions? | **No in session review.** | Session review is read-only. |
| BS-022 Q5 | Exam accuracy denominator? | **`correct / total` for exam only.** | Eliminates warning-vs-stats mismatch. |
| BS-023 Q1 | Remove Try Again from session review? | **Yes.** | Prevents detached review submissions and keeps review deterministic. |
| BS-023 Q2 | If kept, standalone reattempts only? | **Yes, but only in non-session contexts.** | Bookmarks/history-individual/dashboard remain practice contexts. |
| BS-023 Q3 | Track reattempt chains (`previousAttemptId`)? | **Defer.** | Requires domain/schema expansion; not needed for this fix. |
| BS-023 Q4 | Is Try Again appropriate for exam mode? | **No in exam session review.** | Exam review is final/read-only. |
| BS-023 Q5 | Quick fix or spec? | **Spec-required.** | Changes span app, application, controller, and UI behavior contracts. |

---

## 3. Behavior Matrix (Target State)

| Context | Answered Question Render | Unanswered Question Render | Try Again | Submit | Action Bar | New Attempt Created |
|---|---|---|---|---|---|---|
| Practice Session Review (`from=practice&mode=review&sessionId`) | Existing answer + correct answer + explanation (read-only) | Auto-reveal correct answer + explanation + **Unanswered banner** (read-only) | No | No | `← Previous · Next → · Back to Session` | No |
| History Session Review (`from=history&mode=review&sessionId`) | Existing answer + correct answer + explanation (read-only) | Auto-reveal correct answer + explanation + **Unanswered banner** (read-only) | No | No | `← Previous · Next → · Back to History` | No |
| History Individual Review (`from=history&mode=review`) | Existing answer + explanation | Fallback form only if attempt lookup missing (rare) | Yes | Yes when no prior attempt resolved | Answered: `Try Again · Back to History` / Missing-attempt fallback: `Submit` | Yes (standalone) |
| Dashboard Individual Review (`from=dashboard&mode=review&attemptId`) | Attempt-specific answer + explanation | Fallback form only if attempt lookup missing | Yes | Yes when no attempt resolved | Answered: `Try Again · Back to Dashboard` / Missing-attempt fallback: `Submit` | Yes (standalone) |
| Bookmarks Reattempt (`from=bookmarks`) | Post-submit feedback | Pre-submit form (normal practice) | Yes (post-submit) | Yes (pre-submit) | Pre-submit: `Submit`; post-submit: `Try Again · Back to Bookmarks` | Yes (standalone) |

---

## 4. Phase 1: Unanswered Question Auto-Reveal

### 4.1 `src/application/use-cases/get-previous-attempt.ts`

Replace output contract with a discriminated union:

- `kind: 'attempt'` (existing answered behavior)
- `kind: 'session_unanswered'` (new reveal payload)

`session_unanswered` payload must include:

- `correctChoiceId`
- `explanationMd`
- `choiceExplanations`
- `referenceMd`

Resolution logic:

1. Keep precedence: `attemptId → sessionId+questionId → latest`.
2. If no attempt and `sessionId` is present:
   - Validate session ownership (`findByIdAndUserId`).
   - Require `session.endedAt !== null`.
   - Require `questionId` is in `session.questionIds`.
   - Load question and build reveal payload from canonical question data.
   - Return `kind: 'session_unanswered'`.
3. If no attempt and no valid ended-session context, return `null`.

### 4.2 `src/adapters/controllers/question-view-controller.ts`

Update `GetPreviousAttemptOutput` type import/usage to the new union; keep action input schema unchanged.

### 4.3 `app/(app)/app/questions/[slug]/question-page-logic.ts`

Update `loadPreviousAttempt()` handling:

- `kind: 'attempt'` → current behavior (set selected choice + submitResult).
- `kind: 'session_unanswered'` → set a dedicated read-only reveal state (do **not** fabricate a submit result).
- `null`/error → current fallback behavior.

Add `SessionUnansweredReveal` type in this file for UI consumption.

### 4.4 `app/(app)/app/questions/[slug]/use-question-page-controller.ts`

Add controller state:

- `sessionUnansweredReveal: SessionUnansweredReveal | null`

Propagate it to `QuestionView` output and reset it when question changes.

### 4.5 `app/(app)/app/questions/[slug]/question-page-client.tsx`

Add read-only unanswered render path for session review:

- Render an explicit banner: **"You did not answer this question during this session."**
- Reveal correct choice in `QuestionCard` using `sessionUnansweredReveal.correctChoiceId`.
- Render explanation content using `sessionUnansweredReveal` payload.
- For this state: no Submit, no Try Again.

### 4.6 Action bar for unanswered session review

For `mode='review'` with session navigation present and unanswered reveal active:

- show `← Previous` / `Next →` / back link only
- hide `Submit`
- hide `Try Again`

---

## 5. Phase 2: Try Again Scoping

### 5.1 `app/(app)/app/questions/[slug]/question-page-client.tsx`

Introduce explicit derived flags:

- `isReviewMode = props.mode === 'review'`
- `hasSessionId = typeof props.sessionId === 'string'`
- `isSessionReviewReadOnly = isReviewMode && hasSessionId`

Read-only scoping must key off route session identity (not loaded navigation data). This prevents fail-open behavior where `sessionNavigation` is `null` due to fetch/error conditions but the route is still session review.

Button visibility rules:

- `Submit` renders only when `!isSessionReviewReadOnly && !props.submitResult`
- `Try Again` renders only when `!isSessionReviewReadOnly && !!props.submitResult`

### 5.2 `app/(app)/app/questions/[slug]/question-page-logic.ts`

Add guard helpers:

- `canReattemptInContext({ mode, sessionId })`
- returns `false` for review + session contexts
- `canSubmitQuestionAnswer({ mode, sessionId, selectedChoiceId, submitResult })`
- returns `false` for review + session contexts before checking selection/submit state

### 5.3 `app/(app)/app/questions/[slug]/use-question-page-controller.ts`

Wrap `onReattempt` with the context guard so session-review reattempt is a no-op even if invoked programmatically.

### 5.4 Rule definition (SSOT)

If `mode='review'` and session context is present, the page is read-only:

- no Submit
- no Try Again
- no new attempts from this page

Non-session contexts (Bookmarks, History individual review, Dashboard review) keep standalone reattempt behavior.

---

## 6. Phase 3: Exam Scoring Alignment

**In scope in this spec** (separate PR allowed).

### 6.1 `src/domain/services/session-stats.ts`

Keep `computeSessionStats()` as answered/correct counter.  
Do **not** repurpose `answered`; denominator policy is applied at use-case level.

### 6.2 `src/application/use-cases/end-practice-session.ts`

Compute accuracy denominator by mode:

- exam: `totalQuestions` (`session.questionIds.length`)
- tutor: `answered`

Update `EndPracticeSessionOutput` to include:

- `mode`
- `questionCount`

Update output schema validation in:

- `src/adapters/controllers/practice-schemas.ts` (Zod contract for `EndPracticeSessionOutput`)

### 6.3 `src/application/use-cases/get-session-history.ts`

Compute row accuracy with same policy:

- exam: `correct / questionCount`
- tutor: `correct / answered`

### 6.4 `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

Use `summary.mode` to render accuracy label:

- exam: always show percent (`0%` allowed when answered=0)
- tutor: keep em dash when answered=0

### 6.5 `app/(app)/app/history/components/history-sessions-tab.tsx`

Use row mode for fraction and accuracy label:

- exam rows: fraction `${row.correct}/${row.questionCount}`, percent from exam denominator
- tutor rows: fraction `${row.correct}/${row.answered}`, keep em-dash behavior for zero answered

Current mixed-denominator string interpolation (`${row.correct}/${row.questionCount}` for all rows) must become mode-aware.

### 6.6 `app/(app)/app/dashboard/page.tsx`

Dashboard recent-session snippets consume the same history row semantics and must apply the same mode-aware denominator policy (exam total vs tutor answered) to avoid reintroducing mixed labels.

---

## 7. Tests First

All tests below follow Red → Green → Refactor.

### Phase 1 tests (auto-reveal)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `src/application/use-cases/get-previous-attempt.test.ts` | `returns kind=session_unanswered with answer key when session question is unanswered in ended session` | No attempt + valid ended session yields reveal payload | Unit (`.test.ts`) |
| `src/application/use-cases/get-previous-attempt.test.ts` | `includes referenceMd in kind=session_unanswered payload when question has reference content` | Reveal payload carries optional reference field for review rendering | Unit |
| `src/application/use-cases/get-previous-attempt.test.ts` | `returns null for unanswered question when session is active or question not in session` | Reveal path is restricted to ended session review | Unit |
| `app/(app)/app/questions/[slug]/question-page-logic.test.ts` | `maps kind=session_unanswered to sessionUnansweredReveal without submitResult` | No pseudo submit result is created | Unit |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | `renders unanswered banner and read-only reveal for session review unanswered question` | Banner appears; Submit/Try Again absent | Component (`.test.tsx`) |

### Phase 2 tests (Try Again scoping)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | `hides Try Again in answered session review` | Session review action bar is nav-only | Component |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | `keeps Try Again in history individual review` | Non-session review remains standalone reattempt-capable | Component |
| `app/(app)/app/questions/[slug]/question-page-logic.test.ts` | `canReattemptInContext returns false for review plus session` | Guard semantics are explicit and unit-tested | Unit |
| `app/(app)/app/questions/[slug]/use-question-page-controller.browser.spec.tsx` | `onReattempt is no-op in session review context` | Programmatic guard prevents session-review resets | Browser (`.browser.spec.tsx`) |
| `tests/e2e/review-mode-audit.spec.ts` | `session review is read-only and non-session review allows reattempt` | End-to-end parity across contexts | E2E |

### Phase 3 tests (exam scoring alignment)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `src/application/use-cases/end-practice-session.test.ts` | `computes exam accuracy using total question count denominator` | Exam unanswered count as incorrect in accuracy math | Unit |
| `src/application/use-cases/end-practice-session.test.ts` | `keeps tutor accuracy denominator as answered` | Tutor behavior unchanged | Unit |
| `src/application/use-cases/get-session-history.test.ts` | `computes per-row accuracy by mode (exam total, tutor answered)` | History output reflects new policy | Unit |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.test.tsx` | `shows 0% for exam summary when answered is zero` | Exam UI no longer renders em dash for zero answered | Component |
| `app/(app)/app/history/components/history-sessions-tab.test.tsx` | `shows exam zero-answered accuracy as 0% and keeps tutor zero-answered as —` | Session list mode-specific display is correct | Component |

### Existing test updates required

- `app/(app)/app/questions/[slug]/question-page-client.test.tsx` (around `~333`, `~493`) currently encodes pre-read-only review actions and must be updated for session review Submit/Try Again removal.
- `app/(app)/app/history/components/history-sessions-tab.browser.spec.tsx` (around `~274`) currently encodes old mixed-denominator rendering and must be updated for mode-aware fraction/percentage behavior.

### Test conventions (mandatory)

- Every new `*.test.tsx` starts with `// @vitest-environment jsdom` on line 1.
- Render tests use `renderToStaticMarkup`.
- Interactive async tests use `*.browser.spec.tsx` with `vitest-browser-react`.
- Use existing fakes (`FakeAttemptRepository`, `FakePracticeSessionRepository`, etc.); no mocks for application internals.

---

## 8. Non-Functional Requirements

1. Existing attempt records and session history must remain intact (no data migration).
2. Question navigator coloring logic remains unchanged (correct/incorrect/unanswered colors).
3. Bookmark flows remain unchanged.
4. Quick Practice remains unchanged.
5. In-progress Practice session behavior remains unchanged; only review behavior is altered.
6. No API contract breakage for unrelated routes/actions.
7. Tutor end-session flow (no confirmation dialog) remains unchanged.
8. Exam pre-submit Review Questions screen remains unchanged.

---

## 9. Implementation Notes

### PR sequencing

1. **PR A (Phase 1 + 2):** review read-only + Try Again scoping (shared file touch: `question-page-client.tsx`)
2. **PR B (Phase 3):** exam scoring denominator alignment + session/history display updates

### Ordering dependencies

- Phase 1 must land before Phase 2 UI finalization (Phase 2 depends on explicit unanswered reveal state).
- Phase 3 is independent of Phase 2 logic and can ship separately after Phase 1.

### Rollback strategy

- If Phase 1/2 regress review UX, revert PR A only (no schema/data side effects).
- If Phase 3 produces unacceptable metrics deltas, revert PR B while retaining Phase 1/2 read-only behavior.

---

## 10. Success Criteria

1. In session review contexts, unanswered questions no longer render as blank submittable forms.
2. Session review never renders Submit or Try Again; action bar is navigation/back only.
3. Non-session contexts (Bookmarks, Dashboard individual, History individual) still support standalone Submit/Try Again.
4. No new attempts are created from session review pages.
5. Unanswered session-review pages show explicit unanswered indicator plus correct answer/explanation.
6. Exam session accuracy uses `correct / total`; tutor remains `correct / answered`.
7. `pnpm typecheck`, `pnpm lint`, `pnpm test --run`, and relevant browser/E2E specs pass.

---

## 11. Deferred Items

1. Reattempt chain modeling (`previousAttemptId`, retry lineage analytics).
2. Product/analytics decisions about surfacing standalone reattempt history in UI.
3. Potential future dedicated "review answer key" controller if unioning `getPreviousAttempt` becomes too broad.

---

## 12. Related

- [BS-022](../_archive/brainstorming/bs-022-unanswered-question-review-handling.md)
- [BS-023](../_archive/brainstorming/bs-023-try-again-state-consistency.md)
- [SPEC-027](../_archive/specs/spec-027-session-review-navigation.md)
- [SPEC-032](../_archive/specs/spec-032-action-bar-standardization.md)
