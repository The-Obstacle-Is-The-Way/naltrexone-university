# DEBT-322: Exam action bar UX polish — implementation spec

**Priority:** P2
**Created:** 2026-03-18
**Status:** Ready for implementation
**Related:** [BS-055](../brainstorming/bs-055-exam-session-interaction-model-rethink.md), [DEBT-321](./debt-321-bs055-exam-interaction-model-overhaul.md), [Interaction Contracts](../practice-engine/interaction-contracts.md)

---

## Scope

Implement exactly these four changes in one PR:

1. **D-1:** Remove the exam-mode Q1 spacer. When `hasPreviousQuestion` is false, render nothing in slot 1 and let the visible buttons left-align.
2. **D-2:** Rename the exam header exit from `Review answers` to `Finish exam`. Rename the exam review page heading from `Review Questions` to `Review & Submit`.
3. **D-3:** Keep the exam bottom-bar middle button labeled `Next` on every question, including the last question. On the last question it must still enter the review stage.
4. **D-4b:** Change exam/tutor session Previous-button visibility from navigator-derived `previousQuestionId !== null` to `(props.sessionInfo?.index ?? 0) > 0`.

Do **not** implement D-4a or D-4c in this item. D-4a is not code-confirmed. D-4c is real but out of scope for this locked implementation.

---

## Verified Wiring Constraints

These constraints were re-verified against current `HEAD` before locking the implementation.

### Header exit path is independent of `ExamActionBar`

- `PracticeView` renders the header button directly from `props.onEndSession` and `endSessionLabel` at `app/(app)/app/practice/components/practice-view.tsx` lines **315-326**.
- `PracticeView` also reuses the same `endSessionLabel` in the null-question fallback card at `app/(app)/app/practice/components/practice-view.tsx` lines **389-401**.
- So the header `Finish exam` button does **not** depend on `ExamActionBar`.

### Current last-question footer path is already correct

The current last-question footer button reaches the exam review stage through `onEndSession`, not through the normal sequential Next path:

1. `PracticeView` passes `onEndSession={props.onEndSession}` into `ExamActionBar` at `app/(app)/app/practice/components/practice-view.tsx` lines **444-455**.
2. `ExamActionBar` currently resolves `onMiddleAction` to `props.onEndSession` when `props.isLastSessionQuestion && props.onEndSession` at `app/(app)/app/practice/components/practice-view.tsx` lines **193-196**.
3. `usePracticeSessionPageController` wires `onEndSession: reviewStage.onEndSession` at `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` lines **149-182**, specifically line **170**.
4. `usePracticeSessionReviewStage.onEndSession` saves the current exam draft, then calls `reviewStage.onEndSession()` at `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts` lines **178-199**.
5. `usePracticeSessionReviewStageState.onEndSession` loads review for exam sessions at `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts` lines **154-161**.

This means D-3 can be implemented safely by changing the **label only** while leaving the existing last-question click-handler branch intact.

### Broken path if `ExamActionBar` loses `onEndSession`

If an implementer removes `onEndSession` from `ExamActionBar` and makes the last-question footer button call the ordinary `onNextQuestion` path, the behavior is wrong:

1. `PracticeSessionPageView.onNextQuestionResolved` falls through to `props.onNextQuestion()` when `nextQuestionId` is null at `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` lines **107-114**.
2. `usePracticeSessionPageController` passes `questionFlow.onNextQuestion` at `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` line **179**.
3. `usePracticeSessionQuestionFlow.onNextQuestion` calls `loadNextQuestion({ fromIndex })` at `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts` lines **298-317**.
4. `GetNextQuestionUseCase.executeForSession()` does **not** mean "go to review". It can:
   - wrap to an earlier unanswered question (`src/application/use-cases/get-next-question.ts` lines **195-201**),
   - reload the current unanswered question (`src/application/use-cases/get-next-question.ts` lines **203-205**),
   - or return `null` when no unanswered target exists (`src/application/use-cases/get-next-question.ts` lines **208-211**).
5. When `res.data` is `null`, `runLoadQuestionFlow()` commits `question=null` at `app/(app)/app/practice/shared/question-flow-actions.ts` line **120**, and `PracticeView` then renders `No more questions found.` plus the end-session button at `app/(app)/app/practice/components/practice-view.tsx` lines **389-401**.

**Implementation rule:** do **not** remove `onEndSession` from `ExamActionBar` in this debt item.

---

## D-1: Remove The Exam Q1 Spacer

### Current code

- `ActionBarSpacer` is defined at `app/(app)/app/practice/components/practice-view.tsx` lines **88-90** with `className="h-9 min-w-24"`.
- `ExamActionBar` currently renders that spacer when `props.onPreviousQuestion` exists but `props.hasPreviousQuestion` is false at `app/(app)/app/practice/components/practice-view.tsx` lines **200-216**.
- `TutorActionBar` also uses `ActionBarSpacer` at `app/(app)/app/practice/components/practice-view.tsx` lines **116-145**.

### Required implementation

In `app/(app)/app/practice/components/practice-view.tsx`:

- Change the exam-only Previous slot logic at lines **200-216**.
- Old behavior:
  - `props.onPreviousQuestion ? (props.hasPreviousQuestion ? <Previous /> : <ActionBarSpacer />) : null`
- New behavior:
  - `props.onPreviousQuestion && props.hasPreviousQuestion ? <Previous /> : null`

### Do not change

- Do **not** delete `ActionBarSpacer`. Tutor mode still uses it.
- Do **not** change `TutorActionBar`.
- Do **not** change the bottom action-bar wrapper at lines **438-455**.

### Test updates

Update `app/(app)/app/practice/components/practice-view.test.tsx` lines **512-560**:

- Keep the existing visible-label assertion:
  - `expect(labels).toEqual(['Next', 'Mark for review']);`
- Add a scoped assertion that the exam Q1 action bar contains no spacer placeholder:
  - Parse `actionBar` and assert `actionBar.querySelectorAll('span[aria-hidden=\"true\"]').length === 0`

No other existing test assertions need to change for D-1.

---

## D-2: Rename The Exam Exit And Review Heading

### Required implementation

#### 1. Header label

In `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`:

- Line **235**
- Old:
  - `endSessionLabel={mode === 'exam' ? 'Review answers' : 'End session'}`
- New:
  - `endSessionLabel={mode === 'exam' ? 'Finish exam' : 'End session'}`

This automatically updates both exam surfaces that render `endSessionLabel` inside `PracticeView`:

- header button: `app/(app)/app/practice/components/practice-view.tsx` lines **315-326**
- null-question fallback card button: `app/(app)/app/practice/components/practice-view.tsx` lines **392-401**

#### 2. Review page heading

In `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`:

- Lines **110-112**
- Old heading:
  - `Review Questions`
- New heading:
  - `Review & Submit`

### Do not change

- Keep `Submit exam` unchanged at `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` lines **192-194**.
- Keep `Submit exam?` unchanged at `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` line **198**.
- Do **not** change post-submit `Review your answers` in `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` lines **103-115**.

### Test updates

Update `app/(app)/app/practice/components/practice-view.test.tsx` lines **323-350**:

- Change the prop passed into `PracticeView`:
  - old: `endSessionLabel="Review answers"`
  - new: `endSessionLabel="Finish exam"`
- Change the button filter:
  - old: `button.textContent?.includes('Review answers')`
  - new: `button.textContent?.includes('Finish exam')`
- Keep the expectation at length `2`.

Update review-heading assertions:

- `app/(app)/app/practice/[sessionId]/page.test.tsx` lines **493-495**
  - old: `expect(html).toContain('Review Questions');`
  - new: `expect(html).toContain('Review & Submit');`
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.browser.spec.tsx` line **156**
  - old: `getByText('Review Questions')`
  - new: `getByText('Review & Submit')`
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` lines **97** and **155**
  - old: `getByText('Review Questions')`
  - new: `getByText('Review & Submit')`

### Recommended new regression coverage

Add one active-session exam assertion in `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx`:

- render the answering branch in exam mode
- assert the header button name is `Finish exam`

That covers the actual `PracticeSessionPageView` label wiring, not just raw `PracticeView` rendering.

---

## D-3: Keep Footer Label `Next` On The Last Question

### Required behavior

- The exam bottom-bar middle button must render `Next` on **every** active question, including the last question.
- On the last exam question, clicking that `Next` button must still enter the review stage through `onEndSession`.
- The header `Finish exam` button is the only distinct exit label.

### Required implementation

In `app/(app)/app/practice/components/practice-view.tsx`:

#### 1. Remove only the label switch

- Lines **189-192**
- Old:
  - `const middleLabel = props.isLastSessionQuestion && props.onEndSession ? 'Review answers' : 'Next';`
- New:
  - remove `middleLabel` entirely
  - render the middle button text as the literal `Next`

#### 2. Keep the click-handler switch

- Lines **193-196**
- Keep this logic unchanged:
  - `props.isLastSessionQuestion && props.onEndSession ? props.onEndSession : props.onNextQuestion`

#### 3. Keep last-question state available to `ExamActionBar`

- Keep `isLastSessionQuestion` derivation at `app/(app)/app/practice/components/practice-view.tsx` lines **253-257**
- Keep the `isLastSessionQuestion={isLastSessionQuestion}` prop at line **446**

#### 4. Keep `onEndSession` in `ExamActionBar`

- Keep `onEndSession` in `ExamActionBarProps` at `app/(app)/app/practice/components/practice-view.tsx` lines **171-180**
- Keep `onEndSession={props.onEndSession}` in the `ExamActionBar` call at line **451**

### Explicit non-change

Do **not** move this last-question review-stage routing into:

- `PracticeSessionPageView.onNextQuestionResolved()` at lines **107-114**
- `usePracticeSessionQuestionFlow.onNextQuestion()` at lines **298-317**

Those paths are not review-stage paths.

### Test updates

Update `app/(app)/app/practice/components/practice-view.test.tsx` lines **641-685**:

- Rename the test from:
  - `renders Review answers in the bottom bar on the last exam question before submission`
- To:
  - `renders Next in the bottom bar on the last exam question before submission`
- Change the label assertion:
  - old: `['Previous', 'Review answers', 'Mark for review']`
  - new: `['Previous', 'Next', 'Mark for review']`

Update `app/(app)/app/practice/components/practice-view.browser.spec.tsx` lines **447-498**:

- Rename the test from:
  - `calls onEndSession from the bottom-bar Review answers button after the last exam answer`
- To:
  - `calls onEndSession from the bottom-bar Next button on the last exam question`
- Change the click target:
  - old: `screen.getByRole('button', { name: 'Review answers' })`
  - new: `screen.getByRole('button', { name: 'Next' })`
- Keep the expectation:
  - `expect(onEndSession).toHaveBeenCalledTimes(1);`

### Required new regression coverage

Add a page-level wiring test in `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx`:

- render the active exam-question branch on the **last** question
- pass both `onNextQuestion` and `onEndSession` spies
- click the footer `Next` button
- assert:
  - `onEndSession` was called once
  - `onNextQuestion` was **not** called

That test is required. It protects the exact D-3 failure mode described above.

---

## D-4b: Stabilize Previous-Button Visibility From `sessionInfo.index`

### Current code

- `previousQuestionId` is navigator-derived via `useMemo` at `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` lines **67-82**
- `onPreviousQuestion` depends on `previousQuestionId` at `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` lines **101-105**
- `hasPreviousQuestion` currently uses `previousQuestionId !== null` at `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` line **247**

### Required implementation

In `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`:

- Line **247**
- Old:
  - `hasPreviousQuestion={previousQuestionId !== null}`
- New:
  - `hasPreviousQuestion={(props.sessionInfo?.index ?? 0) > 0}`

### Scope boundary

This debt item intentionally fixes **visibility only**.

Do **not** change:

- `previousQuestionId` derivation at lines **67-82**
- `onPreviousQuestion` callback at lines **101-105**

That means this item removes the spacer/visibility regression but does **not** change how the previous target is resolved.

### Test updates

Update `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` lines **481-523**:

- Rename the test from:
  - `hasPreviousQuestion is false when navigator is missing or current question is not found`
- To:
  - `hasPreviousQuestion is false on the first question when navigator is missing`
- Keep the existing expectation:
  - no `Previous` button for `sessionInfo.index === 0`

Add a new browser test adjacent to that block:

- `navigator={null}`
- `sessionInfo.index = 1`
- `onNavigateQuestion={() => undefined}`
- expect the `Previous` button to be visible

Do **not** click the button in that new test. This item does not change previous-target resolution.

---

## Docs That Must Change In The Same Implementation PR

These active docs encode the old contract and must be updated when the code lands.

- `docs/practice-engine/interaction-contracts.md` lines **101-125**
  - remove Q1 spacer language
  - change header label `Review answers` → `Finish exam`
  - change last-question footer label from `Review answers` to `Next`
  - remove the "intentional duplication" note
- `docs/debt/debt-321-bs055-exam-interaction-model-overhaul.md` lines **210-224**, **233-237**, **257**
  - update the exam action-bar contract
  - replace the last-question `Review answers` test description
  - update the review-entry wording from two `Review answers` triggers to header `Finish exam` + last-question footer `Next`
- `docs/practice-engine/question-rendering-architecture.md` lines **24**, **84**, **157-168**, **274**
  - update exam review-stage entry wording
  - update action inventory
  - update heading text `Review Questions` → `Review & Submit`
- `docs/practice-engine/practice-modes.md` line **46**
  - update review-stage entry wording
- `docs/frontend/design-principles.md` lines **67-69**
  - remove the special `Review answers` last-question row
- `docs/dev/stabilization-checklist.md` line **66**
  - change `Click Review answers` to the new exam exit wording/path

`docs/debt/index.md` also needs its DEBT-322 summary refreshed in this same docs pass.

---

## Out Of Scope

- **D-4a:** not code-confirmed; do not implement in this item
- **D-4c:** responsive header stacking remains unchanged in this item
- **Session Summary CTA:** do not rename `Review your answers`
- **Previous target re-sourcing:** do not change `previousQuestionId` or `onPreviousQuestion`

---

## Implementation Summary

This item is intentionally narrow:

- remove the exam-only Q1 spacer
- rename the exam header exit to `Finish exam`
- rename the exam review heading to `Review & Submit`
- keep the footer label `Next` on every question
- preserve the existing last-question `onEndSession` click path
- stabilize Previous-button visibility from `sessionInfo.index`

No backend, use-case, repository, or schema changes are required.
