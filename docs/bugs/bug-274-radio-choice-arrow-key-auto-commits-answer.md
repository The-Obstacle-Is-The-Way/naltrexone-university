# BUG-274: Arrow-Key Navigation Between Answer Choices Auto-Submits and Locks an Unintended Choice

**Status:** Open
**Resolution State:** Fix implemented and merged to `dev` in PR #582 (merge `a3855c81`); post-merge CodeRabbit findings remediated in the follow-up review PR (Submit pending-state gate, required selection origin, consolidated pointer-arm clearing); pending promotion to `main` and production deploy proof before archival.
**Severity:** P1
**Date:** 2026-06-30
**Confirmed:** 2026-06-30; root-cause citations re-verified against dev head `c1780187` on 2026-07-07; implementation citations updated against branch head on 2026-07-07
**Component:** Practice / Question Answering / Accessibility (Quick Practice + Tutor mode + Exam mode)

---

## Summary

Answer choices render as real, same-named native `<input type="radio">` elements grouped in one `<fieldset>`, which is correct, accessible markup. Before the fix, selecting a choice (`onChange`) unconditionally recorded that selection in Quick Practice, Tutor mode, and Exam mode — with Quick Practice/Tutor also immediately grading and locking it. Native radio groups move focus **and** fire `onChange` on every arrow-key press, so a keyboard-only or screen-reader user who arrowed between choices — the standard, expected way to browse a focused radio group — recorded (and in Quick Practice/Tutor, submitted and got graded on) whichever choice the arrow landed on. There was no way to preview choices via arrow keys without this happening.

Exam mode blocks the *immediate grading call* on arrow-key selection, but does **not** block the underlying selection from being recorded and later persisted as the graded draft answer. *(Disposition, 2026-07-07: this exam-mode behavior was evaluated and accepted as correct standard form semantics — the selection is visibly checked, freely changeable, and graded only at finalize behind the review screen. See [BS-064](../brainstorming/bs-064-radio-choice-modality-split.md). Fix scope is Quick Practice/Tutor commit behavior only.)*

## Reachability

Reachable by any keyboard-only or screen-reader user (Tab into the answer-choice fieldset, then press an arrow key) in:
- Quick Practice (`/app/practice/quick`) — immediate visible symptom (submits and locks),
- Tutor mode within a full session (`/app/practice/[sessionId]`) — same immediate visible symptom, and
- Exam mode within a full session — a different, silent symptom: no immediate grading/lock, but the arrow-key-selected choice becomes the question's saved draft answer on navigation, and is what gets graded at finalization.

## Reproduction

**Quick Practice / Tutor:**
1. Start a Quick Practice session (or a Tutor-mode session) and reach a question with 2+ answer choices.
2. Using only the keyboard, Tab into the answer-choice group (focus lands on the radio per native semantics — typically the first choice, or the previously selected one).
3. Press `ArrowDown` (or `ArrowUp`) once.

Expected: focus moves to the next choice so the user can read it before deciding; nothing is submitted yet.

Actual: the browser's native radio-group behavior both moves focus **and** checks the newly focused radio, firing `onChange` — which this app wires to an immediate answer commit in these two modes. The choice the arrow happened to land on is submitted and graded, and the entire group is then disabled (locked), before the user ever intended to answer.

**Exam mode:**
1. Start an Exam-mode session and reach a question with 2+ answer choices.
2. Tab into the answer-choice group, then press an arrow key to browse choices (no submission UI is shown, so there is no visible sign anything happened).
3. Navigate to the next question (or otherwise let the session's draft-save run) without deliberately re-selecting the intended choice.

Expected: browsing choices with arrow keys before deciding does not change what gets recorded as the answer.

Actual: the arrow-key-selected choice is now the question's `selectedChoiceId`, which is what the exam's autosave-on-navigation mechanism persists as the draft answer and what `FinalizeExamAnswersUseCase` grades at the end of the exam — silently, with no indication to the user that their answer changed.

## Root Cause

The choices are a genuine native radio group (correct accessible markup, not the bug). [`ChoiceButton`](<../../components/question/choice-button.tsx#L113-L126>) renders a visually hidden but keyboard-operable `<input type="radio">`, and [`QuestionCard`](<../../components/question/question-card.tsx#L42-L77>) gives every sibling choice one shared `name` inside a single `<fieldset>`. Native radios are therefore free to move focus and update selection with arrow keys.

The pre-fix bug was that the application treated every radio `change` as a deliberate answer commit in Quick Practice and Tutor mode. Once `commitChoice` resolved, the server-graded `correctChoiceId` flowed back into `QuestionCard`, which disables the group via [`disabled={disabled || correctChoiceId !== null}`](<../../components/question/question-card.tsx#L72>) — so the accidental selection locked immediately.

Exam mode did not immediately grade: [`usePracticeSessionQuestionFlow`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts#L485-L490>) still selects the choice first, then returns before commit when the session mode is exam. The 2026-07-07 product decision accepts this as standard form-draft semantics because the checked choice is visible, mutable, and graded only after Review & Submit.

## Impact

A keyboard-only or screen-reader user cannot safely browse answer choices using the standard radio-group keyboard pattern (arrow keys) in any of the three practice modes, without the browsed-to choice being recorded as their answer. In Quick Practice/Tutor this is at least immediately visible (the group locks); in Exam mode it is silent and can persist to the final graded answer with no feedback at all — arguably the more serious variant, since it is the highest-stakes mode and the change is undetectable in the moment.

The doc's initial assessment considered this P2 on the theory that sighted keyboard users could "tab directly to their intended choice" as a workaround. That workaround is not realistic: a native radio group has exactly **one** roving tab-stop for the entire group (the checked radio, or the first one if none is checked yet) — Tab cannot land on an arbitrary choice. Reaching any choice other than that single tab-stop requires arrow keys, and before the fix, in Quick Practice/Tutor the very first arrow press already fired the commit before the user reached their intended choice. This is graded **P1** on the Quick Practice/Tutor behavior alone: a keyboard-only/AT user could not reliably record their intended answer using the standard interaction pattern for this widget, and the first arrow press graded and locked the question with no recovery path. (Exam mode's draft-follows-selection behavior, documented above for completeness, was accepted as standard form semantics by the 2026-07-07 product decision — see Implemented Fix — and no longer contributes to this grade.)

No impact on mouse users, who only ever click their intended choice directly and never trigger arrow-key focus movement within the group.

## Implemented Fix

**Product decision (owner, 2026-07-07; recorded in [BS-064](../brainstorming/bs-064-radio-choice-modality-split.md)):** Quick Practice/Tutor's click-a-choice-get-instant-feedback flow is a deliberate product feature and must be preserved exactly — no mandatory extra Submit click for pointer users. Exam mode's select-as-draft model is likewise correct as shipped (visibly checked, freely changeable, graded only at finalize behind the review screen — standard form semantics) and is **out of scope for this fix**. The defect fixed here is precisely: **in Quick Practice and Tutor mode, arrow-key browsing must never commit/grade — selection may follow focus per native radio semantics, but grading requires deliberate activation.**

Empirical ground truth (probed 2026-07-07 in this repo's own vitest Chromium harness, once through React handlers and once with raw native DOM listeners, no React): arrow-key movement between sibling radios fires `click`, `input`, and `change` on the newly checked radio — the browser implements arrow selection as a simulated click — while a pointer click fires `pointerdown` and then `click`/`input`/`change`. So `click`-vs-`change` distinguishes nothing: click/change handlers alone **cannot** discriminate a deliberate pointer activation from arrow-key browsing. What does discriminate is the Pointer Events layer — `pointerdown` is spec-guaranteed (and empirically confirmed in the same probes) never to fire from keyboard interaction. The recorded mechanism therefore rides pointer events.

Final implementation against this branch head:

- [`ChoiceButton`](<../../components/question/choice-button.tsx#L36-L64>) owns the transient pointer arm. The choice control wrapper captures `pointerdown` ([`choice-button.tsx#L77-L92`](<../../components/question/choice-button.tsx#L77-L92>)) because the actual radio is `sr-only`; the next radio `change` consumes the arm and reports either `pointer` or `non-pointer` origin ([`choice-button.tsx#L113-L123`](<../../components/question/choice-button.tsx#L113-L123>)). Arrow/Space keydown clears any stale pointer arm before native radio selection can occur; pointer cancel/leave and click-capture cleanup clear pointer arms that do not produce a radio change.
- [`QuestionCard`](<../../components/question/question-card.tsx#L64-L73>) threads that origin to the flow hook. It also treats `Enter` in the answer-choice fieldset as explicit commit for the selected-uncommitted state ([`question-card.tsx#L42-L50`](<../../components/question/question-card.tsx#L42-L50>)). Space stays on the native radio-selection path and does not commit.
- Quick Practice [`onSelectChoice`](<../../app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts#L194-L202>) always updates the selected choice, but returns before `commitChoice` for non-pointer origin. Tutor mode does the same after preserving the existing exam guard ([`use-practice-session-question-flow.ts#L482-L490`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts#L482-L490>)).
- [`PracticeView`](<../../app/(app)/app/practice/components/practice-view.tsx#L335-L336>) derives the selected-uncommitted state for non-exam questions, renders a rounded `<Button>` `Submit` in the existing Tutor/Quick action bar only for that state ([`practice-view.tsx#L182-L190`](<../../app/(app)/app/practice/components/practice-view.tsx#L182-L190>)), and passes the same submit handler into the question surface for Enter commit ([`practice-view.tsx#L548-L565`](<../../app/(app)/app/practice/components/practice-view.tsx#L548-L565>)).
- Exam mode behavior is unchanged: selection still updates the visible draft and the existing exam guard keeps blocking immediate grading.

Known limitation, by design: a deliberate activation synthesized without Pointer Events (for example `element.click()` in tests or some AT/browser combinations) is classified as non-pointer. That path selects the choice and exposes Submit instead of silently grading. This is the asymmetric safety property: misclassification can add a visible two-step, but cannot silently commit the wrong choice.

Event ordering (`pointerdown` → `click`/`input`/`change`) and the transient flag's disarm timing are pinned by real-browser tests (`*.browser.spec.tsx`), not assumed: a pointer click on an unchecked radio fires the full sequence exactly once, so the commit path stays idempotent behind the existing in-flight guards, and the armed flag is consumed/cleared so that a subsequent keyboard event can never ride a stale arm.

Rejected alternatives:
- **Explicit Submit step for all input modalities in Quick Practice/Tutor (the question-page pattern applied wholesale).** Rejected by the product decision above: instant click-feedback is a deliberate feature of these modes, and forcing a second click on every pointer user would trade a keyboard-only defect for universal friction when a Pointer-Events-based discriminator (`pointerdown` arms the commit; keyboard interaction never fires pointer events) preserves instant click feedback cleanly.
- **Replace the native radio inputs with a custom `role="radiogroup"`/`role="radio"` widget with roving tabindex.** Would not fix this: the W3C WAI-ARIA Authoring Practices Guide's [Radio Group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) specifies, for a plain (non-toolbar) radiogroup, that "Right Arrow and Down Arrow: move focus to the next radio button in the group, uncheck the previously focused button, and check the newly focused button" — identical behavior to native `<input type="radio">`. The APG's "selection does not follow focus" exception applies only to a radiogroup nested inside `role="toolbar"`, a narrow, inapplicable carve-out here. Swapping widgets would reproduce the identical defect via ARIA instead of fixing it — the markup is not the defect, the commit-on-selection wiring is.
- **Intercept and suppress arrow-key events on the radios.** Would fight the native/ARIA-specified behavior for a standard widget and likely produce worse, inconsistent keyboard behavior across browsers/screen readers than decoupling "select" from "submit."

## Regression Tests

The existing hook-level probe tests (`use-practice-question-answer-flow.browser.spec.tsx` and `use-practice-session-question-flow-click-commit.browser.spec.tsx`) call `onSelectChoice` directly from buttons or hook handles — they contain no real sibling `<input type="radio">` interaction and cannot exercise this defect. The existing `practice-view.browser.spec.tsx` does render real radios, but `PracticeView` itself only receives an `onSelectChoice` callback; it cannot observe whether that callback immediately becomes a server submit unless the test harness wires it that way. A regression test needs real sibling radio markup wired to the relevant flow-level commit/draft behavior, e.g.:

```tsx
it('does not submit an answer when arrow-key navigation changes the focused choice', async () => {
  const submitAnswerFn = vi.fn();
  const screen = await render(<QuickPracticeRadioFlowProbe submitAnswerFn={submitAnswerFn} />);

  const firstRadio = screen.getByRole('radio', { name: /choice a/i });
  await firstRadio.element().focus();
  await userEvent.keyboard('{ArrowDown}');

  // Arrowing to preview the next choice must NOT submit/grade it.
  expect(submitAnswerFn).not.toHaveBeenCalled();
});
```

This coverage now lives in [`practice-view-radio-modality.browser.spec.tsx`](<../../app/(app)/app/practice/components/practice-view-radio-modality.browser.spec.tsx>). It renders real sibling radios through `PracticeView` and the real Quick/Tutor/Exam flow hooks. The matrix pins: ArrowDown selects without committing in Quick Practice and Tutor, Enter and the visible Submit affordance commit exactly once, pointer and label-wrapper clicks commit immediately and exactly once, programmatic `element.click()` selects without committing, Space stays on the non-commit radio path, the Submit affordance appears/disappears with selected-uncommitted state, and Exam still updates the visible draft without immediate grading.

## Related

- FE-046 (`aria-pressed` on bookmark/mark-for-review toggles) and FE-055 (question-navigator landmark/`aria-current`/`aria-controls`) are unrelated, already-shipped a11y fixes on adjacent controls — verified intact and not regressed by this finding.
- `question-page-client.tsx`/`use-question-page-model.ts` already implement a separate select/submit flow for the standalone question page; BUG-274 applies the same safety principle without removing Tutor/Quick pointer instant commit.
- Pre-fix, no test anywhere in the repo (`grep -r "ArrowDown\|ArrowUp\|ArrowLeft\|ArrowRight"` across every `*.spec.tsx`/`*.test.tsx`) exercised keyboard arrow-key interaction across sibling radios — all existing coverage used `.click()` only, which is why this shipped unnoticed.
