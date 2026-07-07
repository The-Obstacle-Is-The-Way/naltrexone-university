# BUG-274: Arrow-Key Navigation Between Answer Choices Auto-Submits and Locks an Unintended Choice

**Status:** Open
**Severity:** P1
**Date:** 2026-06-30
**Confirmed:** 2026-06-30; all citations re-verified against dev head `c1780187` on 2026-07-07
**Component:** Practice / Question Answering / Accessibility (Quick Practice + Tutor mode + Exam mode)

---

## Summary

Answer choices render as real, same-named native `<input type="radio">` elements grouped in one `<fieldset>`, which is correct, accessible markup. But selecting a choice (`onChange`) unconditionally records that selection in Quick Practice, Tutor mode, and Exam mode — with Quick Practice/Tutor also immediately grading and locking it. Native radio groups move focus **and** fire `onChange` on every arrow-key press, so a keyboard-only or screen-reader user who arrows between choices — the standard, expected way to browse a focused radio group — records (and in Quick Practice/Tutor, submits and gets graded on) whichever choice the arrow lands on. There is no way to preview choices via arrow keys without this happening, and for a sighted keyboard user there is no reliable escape hatch either (see Impact).

Exam mode blocks the *immediate grading call* on arrow-key selection, but does **not** block the underlying selection from being recorded and later persisted as the graded draft answer — so exam mode has its own, silent variant of this defect rather than being exempt from it (see Root Cause). *(Disposition, 2026-07-07: this exam-mode variant was evaluated and accepted as correct standard form semantics — the selection is visibly checked, freely changeable, and graded only at finalize behind the review screen. See the product decision in Proposed Fix. Fix scope is Quick Practice/Tutor only.)*

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

The choices are a genuine native radio group (correct accessible markup, not the bug):

- [`choice-button.tsx`](<../../components/question/choice-button.tsx#L51-L59>) renders `<input type="radio" name={name} value={label} checked={selected} onChange={() => onClick()} disabled={disabled} className="sr-only">` — `sr-only` only visually hides the input (clip/absolute-position), it remains focusable and keyboard-operable.
- [`question-card.tsx`](<../../components/question/question-card.tsx#L31-L63>) generates one shared `choiceGroupName` via `useId()` and passes it as `name` to every `ChoiceButton` in the `<fieldset>`, forming one true native radio group.
- [`question-card.tsx`](<../../components/question/question-card.tsx#L58>) sets `disabled={disabled || correctChoiceId !== null}` — once a `correctChoiceId` is known (i.e., the answer has been graded), every choice in the group becomes permanently disabled for that question. This is what "locks" the choice in Quick Practice/Tutor.

The `onChange`/`onClick` callback is wired to an **unconditional selection** in all three modes, with grading conditionally attached:

- [`use-practice-question-answer-flow.ts`](<../../app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts#L190-L198>) (Quick Practice, via `usePracticeQuestionFlow` → `usePracticeQuestionAnswerFlow`): `onSelectChoice` calls `selectChoice(choiceId)` then unconditionally `void commitChoice(choiceId)` — no mode check at all.
- [`use-practice-session-question-flow.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts#L477-L488>) (full session, Tutor + Exam modes): `onSelectChoice` calls `selectChoice(choiceId)` **unconditionally at line 481**, and only *afterward*, at line 483, checks `if (question?.session?.mode === 'exam') return;` before reaching `void commitChoice(choiceId)` at line 485. **The mode check guards only the grading call, not the selection itself.**

For Quick Practice/Tutor, once `commitChoice` resolves, the server-graded `correctChoiceId` flows back into `QuestionCard` (e.g. [`practice-view.tsx#L310-L313`](<../../app/(app)/app/practice/components/practice-view.tsx#L310-L313>) derives it from `props.submitResult?.correctChoiceId` outside exam mode), which disables the whole group per the line cited above — so the accidental selection cannot be corrected by arrowing again.

For Exam mode, the arrow-key-updated `selectedChoiceId` is not immediately graded, but it is not discarded either: it is exactly the value the session's existing autosave-on-navigation mechanism (`saveCurrentExamDraft`, defined in [`use-practice-session-question-flow.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts#L232-L296>), which passes the live `selectedChoiceId` into `maybeSaveDraftBeforeNavigation` in [`app/(app)/app/practice/shared/question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L232-L306>)) persists as the question's draft answer when the user moves to another question, and [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L218) grades directly from `state.draftSelectedChoiceId` at session end — so there is no code-level distinction between "the user deliberately clicked this choice" and "an arrow key happened to land here last." A separate `allowExamCommit`/`isReviewQuestionActive` mechanism ([`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L492-L496>)) exists for the distinct flow of explicitly reopening one specific question from the exam's pre-finalize review screen, but it does not gate or protect the primary scenario described here (arrow-key browsing during normal forward navigation through the exam).

## Impact

A keyboard-only or screen-reader user cannot safely browse answer choices using the standard radio-group keyboard pattern (arrow keys) in any of the three practice modes, without the browsed-to choice being recorded as their answer. In Quick Practice/Tutor this is at least immediately visible (the group locks); in Exam mode it is silent and can persist to the final graded answer with no feedback at all — arguably the more serious variant, since it is the highest-stakes mode and the change is undetectable in the moment.

The doc's initial assessment considered this P2 on the theory that sighted keyboard users could "tab directly to their intended choice" as a workaround. That workaround is not realistic: a native radio group has exactly **one** roving tab-stop for the entire group (the checked radio, or the first one if none is checked yet) — Tab cannot land on an arbitrary choice. Reaching any choice other than that single tab-stop requires arrow keys, and in Quick Practice/Tutor the very first arrow press already fires the commit before the user reaches their intended choice. This is graded **P1** on the Quick Practice/Tutor behavior alone: a keyboard-only/AT user cannot reliably record their intended answer using the standard interaction pattern for this widget, and the first arrow press grades and locks the question with no recovery path. (Exam mode's draft-follows-selection behavior, documented above for completeness, was accepted as standard form semantics by the 2026-07-07 product decision — see Proposed Fix — and no longer contributes to this grade.)

No impact on mouse users, who only ever click their intended choice directly and never trigger arrow-key focus movement within the group.

## Proposed Fix

**Product decision (owner, 2026-07-07):** Quick Practice/Tutor's click-a-choice-get-instant-feedback flow is a deliberate product feature and must be preserved exactly — no mandatory extra Submit click for pointer users. Exam mode's select-as-draft model is likewise correct as shipped (visibly checked, freely changeable, graded only at finalize behind the review screen — standard form semantics) and is **out of scope for this fix**. The defect to fix is precisely: **in Quick Practice and Tutor mode, arrow-key browsing must never commit/grade — selection may follow focus per native radio semantics, but grading requires deliberate activation.**

Empirical ground truth (probed 2026-07-07 in this repo's own vitest Chromium harness, once through React handlers and once with raw native DOM listeners, no React): arrow-key movement between sibling radios fires `click`, `input`, and `change` on the newly checked radio — the browser implements arrow selection as a simulated click — while a pointer click fires `pointerdown` and then `click`/`input`/`change`. So `click`-vs-`change` distinguishes nothing: click/change handlers alone **cannot** discriminate a deliberate pointer activation from arrow-key browsing. What does discriminate is the Pointer Events layer — `pointerdown` is spec-guaranteed (and empirically confirmed in the same probes) never to fire from keyboard interaction. The recorded mechanism therefore rides pointer events. Concretely:

- `ChoiceButton` ([`choice-button.tsx`](<../../components/question/choice-button.tsx#L51-L59>)) arms a transient flag on `pointerdown` on the choice control; the selection event (`onChange`) arriving with the flag armed reports **pointer activation**, and arriving unarmed reports **keyboard/AT selection**. `QuestionCard` threads both intents through.
- Quick Practice ([`use-practice-question-answer-flow.ts#L190-L198`](<../../app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts#L190-L198>)) and Tutor mode ([`use-practice-session-question-flow.ts#L477-L488`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts#L477-L488>)): keyboard/AT selection → `selectChoice` only (highlight, no lock, no grade); pointer activation → `selectChoice` + guarded `commitChoice`. Every pointer user keeps today's instant feedback.
- Because "selected but not yet committed" becomes a persistent, keyboard-reachable state in Quick/Tutor, the UI must render a visible Submit affordance in exactly that state — reusing the shipped question-page pattern and `<Button>` mandate ([`question-page-client.tsx#L414-L427`](<../../app/(app)/app/questions/[slug]/question-page-client.tsx#L414-L427>)) — so the keyboard commit path is discoverable rather than memorized (Enter on the focused choice, or the affordance itself, commits). Pointer users effectively never see it: their click activates immediately. Asymmetric-safe by construction: if any environment delivers a deliberate activation without pointer events (some AT-simulated clicks), it lands in this visible select-then-Submit two-step — never in a silent commit.
- Exam mode: behavior unchanged. Selection updates the draft exactly as today (the accepted standard semantics) and the existing exam guard keeps blocking immediate grading; the review-reopen `allowExamCommit` flow ([`use-practice-session-page-model.ts#L492-L496`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L492-L496>)) is untouched.
- The question page (`/app/questions/[slug]`) keeps its existing decoupling: activation there selects only, and its explicit Submit button remains the sole grading trigger ([`use-question-page-model.ts#L236-L244`](<../../app/(app)/app/questions/[slug]/hooks/use-question-page-model.ts#L236-L244>)) — no behavior change.

Event ordering (`pointerdown` → `click`/`input`/`change`) and the transient flag's disarm timing must be pinned by real-browser tests (`*.browser.spec.tsx`), not assumed: a pointer click on an unchecked radio fires the full sequence exactly once, so the commit path must stay idempotent behind the existing in-flight guards, and the armed flag must be consumed/cleared so that a subsequent keyboard event can never ride a stale arm.

Rejected alternatives:
- **Explicit Submit step for all input modalities in Quick Practice/Tutor (the question-page pattern applied wholesale).** Rejected by the product decision above: instant click-feedback is a deliberate feature of these modes, and forcing a second click on every pointer user would trade a keyboard-only defect for universal friction when a Pointer-Events-based discriminator (`pointerdown` arms the commit; keyboard interaction never fires pointer events) preserves instant click feedback cleanly.
- **Replace the native radio inputs with a custom `role="radiogroup"`/`role="radio"` widget with roving tabindex.** Would not fix this: the W3C WAI-ARIA Authoring Practices Guide's [Radio Group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) specifies, for a plain (non-toolbar) radiogroup, that "Right Arrow and Down Arrow: move focus to the next radio button in the group, uncheck the previously focused button, and check the newly focused button" — identical behavior to native `<input type="radio">`. The APG's "selection does not follow focus" exception applies only to a radiogroup nested inside `role="toolbar"`, a narrow, inapplicable carve-out here. Swapping widgets would reproduce the identical defect via ARIA instead of fixing it — the markup is not the defect, the commit-on-selection wiring is.
- **Intercept and suppress arrow-key events on the radios.** Would fight the native/ARIA-specified behavior for a standard widget and likely produce worse, inconsistent keyboard behavior across browsers/screen readers than decoupling "select" from "submit."

## Failing Test Sketch

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

Today this fails (or would fail if written) because `onChange` unconditionally calls `commitChoice` in Quick Practice/Tutor the instant arrow-key navigation lands on and checks a sibling radio. Companion tests must pin the rest of the decided contract (see Proposed Fix): a pointer click still commits immediately and exactly once (the preserved feature), Enter on the arrow-browsed choice (or the visible Submit affordance) commits it, the Submit affordance appears only in the selected-but-uncommitted state, and an Exam-mode test pins the *accepted* behavior — arrow-key selection still updates the visible draft and still never triggers an immediate commit.

## Related

- FE-046 (`aria-pressed` on bookmark/mark-for-review toggles) and FE-055 (question-navigator landmark/`aria-current`/`aria-controls`) are unrelated, already-shipped a11y fixes on adjacent controls — verified intact and not regressed by this finding.
- `question-page-client.tsx`/`use-question-page-model.ts` already implement the select/submit decoupling this fix should extend — use as the concrete precedent, not a hypothetical.
- No test anywhere in the repo (`grep -r "ArrowDown\|ArrowUp\|ArrowLeft\|ArrowRight"` across every `*.spec.tsx`/`*.test.tsx`) currently exercises keyboard arrow-key interaction across sibling radios — all existing coverage uses `.click()` only, which is why this shipped unnoticed.
