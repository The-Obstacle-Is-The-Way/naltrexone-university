# DEBT-378: Drop Submit Button In Tutor Mode — Choice Click Commits The Answer

**Priority:** P2 (significant behavior change with broad test surface)
**Created:** 2026-05-04
**Source:** Manual UX walkthrough of tutor session (Q1, Q2, Q3 of a 3-question session) on 2026-05-04, follow-up first-principles design pass with Claude Design variants V1/V2/V3, and final V4 redesign converged after weighing friction-vs-deliberation trade-offs against board-prep convention and learning-app UX literature
**Related:** [DEBT-375 Tutor session action bar — no terminal CTA on last question (archived)](../_archive/debt/debt-375-tutor-session-action-bar-no-terminal-cta-on-last-question.md), [DEBT-372 Post-exam review summary button label divergence (archived)](../_archive/debt/debt-372-post-exam-review-summary-button-label-divergence.md), [DEBT-365 Exam flow affordance and label consistency (archived)](../_archive/debt/debt-365-exam-flow-affordance-and-label-consistency.md), [DEBT-363 Exam shell scroll model and dual-CTA disambiguation (archived)](../_archive/debt/debt-363-exam-shell-scroll-model-and-dual-cta.md), [DEBT-379 Exam action bar — promote primary CTA to right slot](./debt-379-exam-action-bar-promote-primary-cta-to-right-slot.md), [Pattern Registry](../frontend/pattern-registry.md), [Frontend Standards](../frontend/standards.md), [Practice Page Docs](../frontend/pages/practice.md)

**Status:** Open. Doc-first; no code change yet. This document supersedes the original DEBT-378 scoping (label-only "End session vs View Summary" unification), which has been subsumed by the broader click-to-commit redesign.

---

## Context

Today's tutor flow requires two clicks to commit an answer:

1. User reads the question and four choices
2. User clicks an answer choice — `selectedChoiceId` updates, no commit, no feedback
3. User clicks the **Submit** button at footer left-of-center — answer commits via `submitAnswerForQuestion()` use case, `submitResult` populates, feedback panel renders, choice rows lock to their committed state
4. User reads feedback, clicks **Next** (or **View Summary** on Q3) to advance, or **Bookmark** in the post-feedback secondary action group

The relevant rendering code is at `app/(app)/app/practice/components/practice-view.tsx:140-149`:

```tsx
{!props.submitResult ? (
  <Button
    type="button"
    className="rounded-full"
    disabled={!props.canSubmit || isActionBarDisabled}
    onClick={props.onSubmit}
  >
    {props.isSubmittingAnswer ? 'Submitting…' : 'Submit'}
  </Button>
) : null}
```

Submit also gates an outline pre-feedback `Next` button at `practice-view.tsx:166-174` that lets users skip a question without committing. Pre-feedback footer order on Q2/Q3 is therefore `[Previous] [Submit] [Next/View Summary]`.

The exam mode footer has no Submit equivalent because exam-mode answers commit at session end (the per-question Next handler stages the choice for end-of-session grading). Exam Q1 footer is `[Next]` left | `[Mark for review]` right; Q2 is `[Previous][Next]` left | `[Mark for review]` right; Q3 is `[Previous][Review & Submit]` left | `[Mark for review]` right. Navigation clusters left; metadata pushes right via `sm:ml-auto`.

The geometric divergence is what surfaced this debt: tutor interleaves Submit between Previous and Next, breaking the navigation cluster that exam preserves. The user-reported friction is more concrete though: clicking through every question requires two distinct actions when one would suffice in a learning context where feedback is the goal.

---

## Why This Is Debt

### Friction is concrete, deliberation is theoretical

Every tutor question requires two clicks to reach feedback. The first click states an intent ("I think it's B"). The second click submits that intent for grading. The justification for the second click is **deliberation** — letting the user re-read all four options after picking one and change their mind before committing.

The deliberation benefit is real but rare. Tutor users typically read all four options *before* picking one (the reading happens before the click, not between the two clicks). Once they've selected, second-guessing is uncommon. Charging every user a click on every question to subsidize a rare event is the wrong ratio.

The friction, by contrast, is paid every question, every session, by every user. Over a 50-question tutor session, that's 50 redundant clicks. The cost compounds.

### Convention check: what does the broader UX literature say?

Web search (2026-05-04) on learning-app UX patterns surfaced two relevant findings:

1. Click-to-commit is the dominant pattern in modern educational apps (Quizlet, Brilliant, Khan Academy practice, etc.). Two-step submit is more associated with form submission than with quiz interactions, and carries form-submission friction baggage.
2. The literal label "Submit" is independently flagged as vague and form-flavored in learning contexts — it doesn't tell the learner *what* they're submitting *to* or *what happens next*. This is one of the most-criticized button labels in instructional UX.

Sources: [kaiserkreativ.co — Better Alternatives to the "Submit" Button](https://www.kaiserkreativ.co/elearning-design-boost/better-alternatives-to-the-submit-button), [Web Designer Depot — Friction in User Engagement](https://webdesignerdepot.com/are-we-over-simplifying-ux-the-role-of-friction-in-user-engagement/).

Board-prep platforms (UWorld, AMBOSS) historically use two-step submit because they simulate USMLE exam UI, where the convention is established. But our tutor mode is *not* a simulation surface — it is the learning surface. Tutor and exam have explicitly different value propositions per DEBT-375 first-principles. The tutor flow should optimize for learning friction, not for exam-simulation fidelity.

### Misclick risk is acceptable in a tutor learning context

The strongest counterargument to dropping Submit is misclick risk. If clicking an answer commits it, an accidental click locks in a wrong answer. In an exam context this is catastrophic (the wrong answer feeds grading). In a tutor context the cost is much lower:

- Tutor mode is for learning. A misclick → wrong answer → user reads the explanation → user still learns. The session is not graded.
- Misclick frequency on desktop is low (the four answer rows have generous padding per Pattern Registry I-3 and live in clearly separated card containers).
- Touch-target hit areas can be sized for thumb-tap reliability (out of scope for this debt; covered separately if needed).

The user explicitly accepted this trade-off: "There's a risk that a user accidentally clicks the wrong answer, but that's fine. That happens all the time." For a learning surface, that's a defensible product call.

### Geometric harmony is a downstream benefit, not the primary motivation

Once Submit is removed, the tutor footer naturally collapses to `[Previous][Next]` clustered left | `[Bookmark]` right post-feedback — exactly mirroring exam's `[Previous][Next]` clustered left | `[Mark for review]` right. The primary motivation for the refactor is friction reduction; harmony with exam is a free downstream win.

### Cross-surface vocabulary settles at "End session"

With Submit gone, the Q3 terminal CTA in the tutor footer becomes the only label that needs choosing. Aligned with the persistent header `End session` (which DEBT-375 preserved on first-principles grounds for tutor's bail-cheap value), the footer terminal becomes `End session` as well. This produces an intentional same-label duplicate on Q3 — exactly the pattern DEBT-372 already established as acceptable on the post-exam review surface (two `View Summary` buttons on the final reviewed question), so the precedent is set.

The cross-surface vocabulary rule becomes:
- Active session (tutor or exam): `End session` for any CTA that ends the active session, regardless of whether it's a header bail or footer natural-completion
- Post-exam review: `View Summary` for any CTA that routes to the Session Summary screen (per DEBT-372)
- These map to the user's mental model: in-session vs post-session

---

## The Refactor

### Tutor footer — final spec

| Question position | Pre-feedback footer | Post-feedback footer | Header (always) |
|-------------------|--------------------|--------------------|----|
| Q1 | _empty_ (no buttons; only the four choice cards) | `[Next]` filled, left | `End session` |
| Q2 | `[Previous]` outline, left | `[Previous]` outline, `[Next]` filled, left cluster | `End session` |
| Q3 | `[Previous]` outline, left | `[Previous]` outline, `[End session]` filled, left cluster | `End session` (intentional duplicate) |

Post-feedback secondary group: `[Bookmark]` outline, `sm:ml-auto` right. Renders only when `submitResult` exists (already today's behavior; carries forward unchanged).

Notes on the spec:
- Pre-feedback Q1 is intentionally empty in the footer. The user's only available action is "click an answer." This is honest: there is no Previous (they're on Q1), no Submit (clicking commits), no skip-Next (the question navigator pills handle non-sequential jumps). One job, one surface.
- Pre-feedback Q2/Q3 has only `[Previous]`. Same reasoning: the only forward action is clicking an answer. Previous is preserved because backward navigation is non-trivial (state-laden) and the pill is the most discoverable way.
- Post-feedback Next/End-session position: clustered with Previous on the left, mirroring exam's footer. Filled variant signals primary action.
- Header `End session` persists across all three questions. On Q3 it duplicates the footer terminal CTA — both call the same `onEndSession` handler. Same handler, same destination, same label. No semantic ambiguity.

### Choice click commits the answer

Today the choice button click chain is:
1. `ChoiceButton` `<input type="radio" onChange={() => onClick()}>` (`components/question/choice-button.tsx:1-79`)
2. → `QuestionCard` `onClick={() => onSelectChoice(choice.id)}` (`components/question/question-card.tsx:59`)
3. → `useQuestionFlowCore.onSelectChoice()` (`use-question-flow-core.ts:252-264`)
4. → `setSelectedChoiceId(choiceId)` — pure state change, no commit

Submit click chain (separate, today):
1. Submit button `onClick={props.onSubmit}` (`practice-view.tsx:145`)
2. → `usePracticeQuestionAnswerFlow.onSubmit` (`use-practice-question-answer-flow.ts:139-175`)
3. → `runSubmitAnswerFlow()` (`shared/question-flow-actions.ts`) → controller → use case

After refactor, the chains merge **in tutor mode only**:
1. `ChoiceButton` onChange fires
2. → `QuestionCard` `onClick={() => onSelectChoice(choice.id)}`
3. → `useQuestionFlowCore.onSelectChoice()` — sets `selectedChoiceId` AND, in tutor mode, immediately invokes the submit flow
4. → `submitAnswerForQuestion()` runs to completion → `submitResult` populates → feedback renders

The mode-specific branching lives at `useQuestionFlowCore.onSelectChoice()` because that's the single owner of the selection-vs-commit semantic. The choice button itself stays mode-agnostic (it just reports clicks). Exam mode `onSelectChoice` continues to do select-only.

This places the click-to-commit invariant at the right architectural layer: the **flow hook** that already orchestrates submission is the same module that gets the new wiring. The shared primitive (`ChoiceButton`) and the shared composite (`QuestionCard`) stay intact. No prop drilling of mode flags into the primitives.

### State machine simplification

The following derived state and props become dead weight in tutor scope and can be removed:

- `canSubmit` (computed at `practice-page-logic.ts:34-47`, threaded through `practice-view.tsx:37, 100, 109, 144, 384`) — gates the Submit button. After refactor, the Submit button is gone. The same conditions are still relevant (must have a selected choice, must not be already-answered, must not be loading) but they now gate the choice-button click via the existing `isAnswerLocked` derivation at `practice-view.tsx:322-326`.
- `isSubmittingAnswer` (computed at `practice-view.tsx:326-330`) — drives the `'Submitting…'` button label. After refactor, no Submit button label exists. The pending state is still relevant (it must lock the choice cards during the network roundtrip to prevent double-commit), but it's already covered by `isAnswerLocked`'s `props.isPending` clause.
- `'Submitting…'` literal — gone from production code.
- Pre-feedback outline `Next` button (`practice-view.tsx:166-174`) — gone. Skip-without-committing is no longer possible; the question navigator pills are the only non-sequential navigation affordance, which is sufficient.

`canSubmit` and `isSubmittingAnswer` remain meaningful in **exam scope** (exam still has Submit-equivalent semantics around the Review & Submit button on Q3, and `isPending` matters for navigation pacing). The refactor scopes the removal to tutor only.

### Loading and double-commit protection

Today's `isAnswerLocked` derivation already disables all four choice buttons when `props.isAnswered || props.submitResult !== null`, plus the `props.isPending || props.loadState.status === 'loading'` clause prevents clicks during the submit roundtrip. This guard is at `practice-view.tsx:322-326` and `QuestionCard` propagates the disabled state to all four `ChoiceButton`s.

After refactor, the same guard prevents double-commit: the moment a choice click triggers the submit flow, `isPending` flips true, all four choice buttons go disabled, no second click can race. When the response lands, `submitResult` populates, feedback renders, choice buttons stay disabled (locked to committed state). No new race condition introduced.

The visual-loading window (between click and feedback render) is short. We do not need a spinner on the clicked choice button — the existing `isPending` disabled treatment is enough. If profiling later shows a perceptible gap, we can add subtle inline progress treatment in a follow-up; out of scope for this debt.

### Keyboard interactions

`ChoiceButton` uses a native `<input type="radio">` wrapped in a `<label>`. Space and Enter on the focused radio fire `onChange`, which calls the same `onClick` prop the mouse path uses. After refactor, keyboard commit is automatic — no special handling needed.

Focus management after commit: out of scope; current behavior preserved.

---

## Production Diff

### File 1: `app/(app)/app/practice/components/practice-view.tsx`

**Lines 112-205 (entire `TutorActionBar` function):** restructure to the new spec.

Key removals:
- Lines 140-149 — Submit button JSX
- Lines 166-174 — pre-feedback outline `Next` button branch
- Lines 144 — `disabled={!props.canSubmit || isActionBarDisabled}` clause (Submit is gone)

Key changes:
- Lines 151-175 (`isLastQuestion` branch) — simplify. Pre-feedback Q3 renders nothing in the primary group's terminal slot. Post-feedback Q3 renders `End session` filled. Label literal changes from `'View Summary'` to `'End session'`.
- Pre-feedback Q1 primary group renders only the empty container (no buttons). The container itself can be conditionally suppressed when empty to avoid emitting a zero-child flex row.

**Lines 92-110 (`TutorActionBarProps`):** remove `canSubmit`, `onSubmit`, `isSubmittingAnswer` from the picked prop set. They are no longer consumed by the action bar.

**Lines 326-330 (`isSubmittingAnswer` derivation):** delete.

**Lines 380-410 (TutorActionBar invocation in the parent JSX):** drop `canSubmit`, `onSubmit`, `isSubmittingAnswer` from the spread.

**Lines 300-340 (`PracticeView` function — choice click handling):** verify that the existing `onSelectChoice` prop is the one that gets the new commit semantic. The wiring change happens inside `useQuestionFlowCore` (next file), not here.

### File 2: `app/(app)/app/practice/shared/use-question-flow-core.ts`

**Lines 252-264 (`onSelectChoice` callback):** add a tutor-mode branch that, after `selectChoiceIfAllowed` succeeds, immediately invokes the submit flow. The hook needs awareness of mode (`isExamMode`); if not currently in scope, lift it from caller props.

```ts
const onSelectChoice = useCallback(
  (choiceId: string) => {
    if (!question) return;
    const changed = selectChoiceIfAllowed(
      { isAnswered, submitResult },
      setSelectedChoiceId,
      choiceId,
    );
    if (!changed) return;
    if (!isExamMode) {
      // Tutor mode: choice click commits immediately
      runSubmitAnswerFlow({ choiceId });
    }
  },
  [isAnswered, question, submitResult, setSelectedChoiceId, isExamMode, runSubmitAnswerFlow],
);
```

The exact name and wiring of `runSubmitAnswerFlow` here depends on what `useQuestionFlowCore` already has access to. If submission today goes through a separate hook (`usePracticeQuestionAnswerFlow`), the cleanest move is to colocate the flow into `useQuestionFlowCore` or to thread the submit handler in via props.

This is the single most architecturally meaningful change in the refactor. Implementation should preserve the current testability of the flow — the submit invocation must be observable in tests via the existing fakes (`FakeAttemptRepository`, etc.).

### File 3: `app/(app)/app/practice/practice-page-logic.ts`

**Lines 34-47 (`canSubmitAnswer`):** retain — exam mode still uses it. No change.

**Lines 113-150 (`submitAnswerForQuestion`):** retain — the submit flow itself doesn't change, only its trigger. No change.

### File 4: `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts`

**Lines 139-175 (`onSubmit` callback):** the callback is no longer wired to a Submit button JSX, but the underlying flow stays. Determine whether the hook is still consumed elsewhere (e.g., exam mode might use it through a different code path); if not, the hook can be retired or absorbed into `useQuestionFlowCore`. Audit needed.

### File 5: `components/question/choice-button.tsx` and `components/question/question-card.tsx`

**No JSX or behavior change.** The primitive stays mode-agnostic. The `onClick` prop continues to thread up to `onSelectChoice`, which is the layer where mode-specific behavior diverges.

### File 6: `app/(app)/app/practice/quick-practice/quick-practice-client.tsx`

If this surface uses tutor-mode practice flow, the same `canSubmit`/`isSubmittingAnswer` props that are removed from `TutorActionBar` must also be removed from this caller. Verify and update. If quick-practice has its own action bar that doesn't share the tutor footer, leave alone.

### Summary of production changes

| File | Lines (approx) | Change type |
|------|----------------|-------------|
| `practice-view.tsx` | 112-205, 326-330, 380-410, 92-110 | Major restructure of TutorActionBar; prop set narrowed; derived state pruned |
| `use-question-flow-core.ts` | 252-264 | Add tutor-mode commit-on-select branch; add `isExamMode` awareness |
| `use-practice-question-answer-flow.ts` | 139-175 | Audit — possibly retire if no longer consumed by JSX |
| `quick-practice-client.tsx` | (varies) | Drop dead props if applicable |
| Total | ~150-250 lines touched | Net negative LOC (deletion-heavy) |

Choice button primitive, QuestionCard composite, controller layer, repository layer, use-case layer: **zero changes**. The refactor is scoped to the orchestration hook and the action bar.

---

## Test Diff

This is a substantial test-suite refactor. Every tutor test that follows the pattern "click answer → click Submit → assert feedback" compresses to "click answer → assert feedback." Every test that asserts `'Submit'`, `'Submitting…'`, `canSubmit`, or pre-feedback Next button must update.

### Unit tests (Vitest, jsdom)

**`practice-view-navigation.test.tsx`:**
- Line 178 — assertion for empty Q3 terminal slot when `onEndSession` missing — **KEEP** (still valid post-refactor; spacer behavior unchanged)
- Line 227-230 — `'renders an outline View Summary button in the primary group before final tutor submission'` — **REWRITE**: pre-feedback Q3 footer has no terminal CTA; the test should assert the primary group contains only `[Previous]` (or no Previous on Q1)
- Line 334 — `'keeps tutor action bar ordering as Previous, Submit, Next before feedback'` — **DELETE** entirely; replace with a new test asserting pre-feedback Q2 primary group is `['Previous']` only
- Add new tests:
  - Pre-feedback Q1: primary group renders no buttons
  - Pre-feedback Q2: primary group renders `['Previous']`
  - Pre-feedback Q3: primary group renders `['Previous']`
  - Post-feedback Q3: primary group renders `['Previous', 'End session']`, `End session` is filled (`data-variant="default"`)
  - Q3: footer `End session` and header `End session` both exist on the page; both wired to `onEndSession` (same handler, intentional duplicate)
  - Negative assertion: pre-feedback footer never contains a button labeled `'Submit'` in tutor scope
  - Negative assertion: pre-feedback footer never contains a button labeled `'Next'` in tutor scope (only post-feedback)

**`practice-view-answer-feedback.test.tsx`:**
- Line 49 — `'renders submit pending copy without rendering question-loading text'` — **DELETE** (no `'Submitting…'` state exists post-refactor); preserve the question-loading-text portion as a separate assertion if not redundant
- Line 76 — `'keeps Submit visible and Next outlined before submission'` — **DELETE**; add `'choice cards are clickable and the footer is empty/Previous-only before any commit'`
- Line 78-84 — `nextButton` not undefined, `data-variant="outline"` — **DELETE**
- Line 120-127 — `'hides Submit and promotes Next to primary after submission'` — **REWRITE** as `'renders Next as primary action after answer commits'` (Submit is no longer in the picture, but the post-feedback assertion stays)
- Add new tests:
  - Click on a choice button triggers the submit flow (assert via fake repository: an attempt was recorded)
  - Click during `isPending` does not double-commit (assert single attempt recorded after rapid double-click)
  - Click on a locked choice (post-feedback) does nothing
  - Keyboard Space/Enter on a focused choice radio commits the answer

**`practice-view-layout.test.tsx`:**
- Update any layout structure assertions that reference Submit's position. Most layout tests check group boundaries via `data-testid`; those stay valid.
- Audit `toHaveLength(N)` assertions on action bar children — counts shrink in pre-feedback states.

**`practice-view-exam-actions.test.tsx`:** **NO CHANGE FROM THIS DEBT.** Exam mode is not affected. (DEBT-379 has its own test diff.)

### Browser specs (Vitest browser mode, Chromium)

**`practice-view.browser.spec.tsx`:**
- Line 91-120 — exam controls test, asserts no Submit button in exam — **KEEP** (still valid; exam never had Submit, still doesn't)
- Line 184-260 — tutor feedback rendering test — **RESTRUCTURE**: today's flow clicks Submit. New flow asserts feedback renders directly after the choice click.
- Add: tutor Q3 last-question routing test — clicking the footer `End session` calls `onEndSession`; clicking the header `End session` calls the same handler.

**`practice-view-notification.browser.spec.tsx`:**
- Audit any Submit-button-related fixtures. The notification spec likely scopes around bookmark/feedback flows; minor cleanup expected.

**`practice-session-page-view-active-question.browser.spec.tsx`:**
- Tests asserting header `End session` persistence across questions — **KEEP** (header behavior unchanged).
- Tests asserting `Submit` button in active question footer — **DELETE/REWRITE**.

**`practice-session-page-view-question-navigation.browser.spec.tsx`:**
- Lines 386-457 — last tutor question navigation test asserting `View Summary` calls `onEndSession` not `onNextQuestion` — **REWRITE** with the `End session` literal in the assertion.

### Integration tests

**`tests/integration/*.integration.test.ts`:** none expected to assert footer button structure directly. Integration tests focus on the persistence layer (repositories, use cases). Confirm via grep, but the choice-click-commits semantic should pass through transparently because the use-case invocation contract is unchanged.

### E2E tests (Playwright)

**`tests/e2e/practice.spec.ts`:**
- Tutor walkthrough flow: each question step today is `select choice → click Submit → assert feedback → click Next`. Compress to `click choice → assert feedback → click Next`.
- Q3 last-question step: today clicks `View Summary`. Update to click `End session` (footer position).
- Add: assertion that on Q3, the footer `End session` and the header `End session` are both present and both clickable; clicking either ends the session (either is a valid path; no preference required).
- Estimated diff: ~30-50 line changes, mostly deletion of Submit click steps.

### Test count summary

| Test type | Files affected | Assertions changed (estimate) |
|-----------|----------------|-------------------------------|
| Unit | 3-4 | 25-40 |
| Browser | 3-4 | 15-25 |
| Integration | 0 | 0 |
| E2E | 1 | 8-15 |
| **Total** | **7-9 files** | **~50-80 assertions** |

A pre-implementation audit pass should produce an exact list with file:line citations so the implementation god prompt has precise edit blocks.

---

## Design Doc Diff

### `docs/frontend/pattern-registry.md`

- **I-3 (Choice Button) entry:** add a "Behavior" subsection. Today's entry covers visual states; add: "In tutor mode, the choice click commits the answer (invokes the submit flow). In exam mode, the choice click selects without committing (commit deferred to session end). The primitive is mode-agnostic; mode-specific behavior is wired at `useQuestionFlowCore.onSelectChoice`."
- **End session entry:** add "Used in tutor mode header (always present) and tutor mode footer terminal CTA on the last question (intentional same-label duplicate; both wired to `onEndSession`)."
- **Pre-feedback Next pattern:** if a registry entry exists for this affordance, mark deprecated and remove from tutor scope.
- **Submit button:** if a registry entry exists for the tutor Submit button, mark removed.

### `docs/frontend/standards.md`

- **Action bar / Button placement table:** update tutor row(s) to reflect new structure (no Submit, `[Previous][Next/End session]` cluster left, `[Bookmark]` `sm:ml-auto` right).
- **Primary CTA position section:** add "In tutor mode, the choice cards themselves act as the primary action pre-feedback; the footer carries only navigation. In exam mode, the footer right slot carries the primary CTA (per DEBT-379, queued)."

### `docs/frontend/pages/practice.md`

- **Action Bar subsection:** rewrite for tutor — pre-feedback states (empty or Previous-only), post-feedback states (Previous + Next/End-session left cluster, Bookmark `sm:ml-auto` right), header `End session` always-on. Note the intentional Q3 same-label duplicate.
- **Choice Click Semantics subsection (new):** explain the tutor-vs-exam divergence at the orchestration layer.
- Source-line anchors throughout the doc may drift; update as part of the implementation pass.

### `docs/frontend/contrast-policy.md`

No changes expected. Choice button (I-3) contrast targets are independent of click semantics.

### `docs/_archive/debt/debt-375-...md`

No content change; DEBT-375's first-principles framing (header `End session` for tutor's bail-cheap value) is preserved by this refactor. The header continues to render across all three questions; the footer terminal CTA on Q3 simply joins it with the same label.

---

## Edge Cases & Implementation Notes

### Skip-without-answering on Q1/Q2

Today, pre-feedback `Next` lets users advance without selecting an answer. After refactor, this affordance is removed. Skip is still possible via the question navigator pills at the top of the practice surface (clicking pill 2 jumps to Q2 from Q1, etc.), which is the architectural source of truth for non-sequential navigation. The question navigator pills are visible across all states (pre-feedback, post-feedback, Q1, Q2, Q3) and provide the same affordance.

The product question is whether removing the footer pre-feedback Next is a regression for users who relied on it as their primary skip path. Two arguments against the regression framing:

1. The pill row is more discoverable than a footer button (always visible, never hidden by feedback panel scroll, locationally stable).
2. Skip-without-answering is a relatively uncommon flow; the dominant tutor flow is read → answer → feedback → next.

If post-implementation user signal shows the pill is insufficient, a follow-up debt could re-introduce a Skip affordance — but it should be a labeled Skip button, not a duplicate Next, to preserve the "Next means after-feedback" semantic.

### Selection-then-back-then-return scenario

Today: user selects choice A on Q2, clicks Previous to Q1, returns to Q2 (via pill or other means). The selection persists (state in `selectedChoiceId` ref). User can then click Submit or change to choice B, then Submit.

After refactor: the moment the user clicks choice A on Q2, the answer commits. Going back to Q1 and returning shows Q2 with the committed answer locked and feedback rendered. There is no uncommitted-state-to-restore scenario; it can't exist.

This is a behavioral simplification, not a regression. The user mental model goes from "tentative selection that survives navigation" to "committed answer that survives navigation," which is more honest.

### Browser-tab-close on uncommitted state

Today: if the user selects choice A and closes the tab without clicking Submit, the selection is lost (only in React state, no persistence layer write).

After refactor: no uncommitted state exists. The first interaction with a choice persists via the use-case invocation. Browser close has no different effect than today on already-committed answers (already persistent). Tab-close edge case is therefore strictly improved (no risk of "I picked it but it didn't save").

### Accessibility

- `<input type="radio">` semantics are preserved. Screen readers continue to announce "radio button, X of 4" on focus.
- Live region announcements when feedback renders: today's behavior is preserved (the feedback panel uses `aria-live` per existing pattern; no change).
- Focus management after commit: today's behavior is preserved (focus stays where the user clicked; feedback panel scrolls into view if below fold).
- Keyboard support: Space/Enter on a focused choice commits in tutor mode (the same `onChange → onClick → onSelectChoice` chain that mouse uses). No special handling required.
- The `aria-describedby` annotation that DEBT-361 added for exam Q3 last-question semantic clarity is independent of this debt.

### Telemetry

If any analytics event fires on Submit click in tutor flow today (search at controller layer recommended; not visible in UI layer code per investigation), the event must be re-homed to the choice-click commit path. Verify during implementation. If the event is `practice.answer.submitted`, the new emission point is the same — the use case invocation hasn't changed, only its trigger.

### Performance

The choice click → feedback render roundtrip should be the same duration as today's choice-then-Submit roundtrip (the network call is the dominant cost; we're just removing an intermediate user action). No new performance risk.

If profiling reveals a perceptible click-to-feedback gap, follow-up debt can add a subtle inline spinner or skeleton on the clicked choice; out of scope for this debt.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Users on board-prep apps muscle-memoried to two-step submit experience tutor as "too fast" / "rushing" | Ship behind a soft launch — instrument session abandonment rate post-refactor and revert if it spikes. The cost of being wrong is recoverable with a re-revert (test work in opposite direction). |
| Misclick wrong answer with no undo | Accepted by user. Documented in this doc. Mitigation is the explanation panel — misclicks become "learn from why I was wrong" moments. |
| Test-suite drift during implementation (refactoring 50-80 assertions across 7-9 files is a real surface) | The implementation god prompt should be explicit per-file with exact edit blocks; the audit pass before implementation should produce exact file:line citations. CR will catch residual drift. |
| `useQuestionFlowCore` mode-awareness wiring breaks exam mode by accident | Branch must be `if (!isExamMode)` not `if (isTutorMode)` — fail-safe defaults to existing exam behavior. Add a test asserting exam-mode choice click does NOT commit. |
| Skip-without-answering removal frustrates users who used pre-feedback Next as their primary forward affordance | Question navigator pills provide the same function; if user signal post-launch shows friction, follow-up debt for an explicit Skip button. |
| `useQuestionFlowCore` and `usePracticeQuestionAnswerFlow` may have non-obvious coupling that complicates the wiring | Audit pass before implementation must verify that either (a) the submit flow is callable from `useQuestionFlowCore` directly, or (b) the submit handler can be threaded in via props/closure. The architecture allows either; pick the cleaner one based on what the audit finds. |
| Pre-feedback empty footer on Q1 looks "broken" to users | Empty primary group container should not render a zero-child flex row (suppress the wrapper when empty). Visual QA must confirm the page reads as intentional, not broken. |
| Quick-practice surface or other tutor consumers breaks because they share `TutorActionBar` props | Audit `TutorActionBar` consumers exhaustively before changing the prop shape. If quick-practice uses different props, scope this debt to the active-session surface only. |

---

## Acceptance Criteria

Production:

- `app/(app)/app/practice/components/practice-view.tsx`:
  - Submit button JSX deleted (no literal `'Submit'` or `'Submitting…'` remains in tutor scope)
  - Pre-feedback `Next` button JSX deleted from `TutorActionBar`
  - `TutorActionBarProps` no longer picks `canSubmit`, `onSubmit`, `isSubmittingAnswer`
  - `isSubmittingAnswer` derivation removed
  - Q3 footer terminal CTA literal is `'End session'` (not `'View Summary'`)
  - Empty primary-group container suppressed when no buttons render
- `app/(app)/app/practice/shared/use-question-flow-core.ts`:
  - `onSelectChoice` invokes the submit flow when in tutor mode
  - `isExamMode` is wired in
  - Exam-mode `onSelectChoice` behavior unchanged (no commit on click)
- Choice button primitive (`components/question/choice-button.tsx`) and QuestionCard composite: zero changes
- Quick-practice client: drops any dead props that resulted from the action-bar prop narrowing
- Repository, controller, use-case layers: zero changes

Tests:

- All Submit button assertions deleted or rewritten per the test diff above
- New tests added:
  - Tutor: clicking a choice commits the answer (assert via fake)
  - Tutor: clicking during `isPending` does not double-commit
  - Tutor: keyboard Space/Enter on focused choice commits
  - Tutor: pre-feedback Q1 primary group has no children
  - Tutor: pre-feedback Q2 primary group is `['Previous']`
  - Tutor: pre-feedback Q3 primary group is `['Previous']`
  - Tutor: post-feedback Q3 primary group is `['Previous', 'End session']` with `End session` `data-variant="default"`
  - Tutor: Q3 has two `End session` buttons (header + footer), both call `onEndSession`
  - Exam: clicking a choice does NOT commit (preserves today's behavior)
- Negative assertions:
  - Tutor footer never contains a button named `'Submit'`
  - Tutor footer never contains the literal `'Submitting…'`
  - Tutor pre-feedback footer never contains a button named `'Next'`
  - Tutor footer never contains a button named `'View Summary'`
- E2E `tests/e2e/practice.spec.ts` tutor walkthrough flow updated to single-click-commit shape

Docs:

- Pattern Registry I-3 gains "Behavior" subsection explaining mode-dependent semantic
- Pattern Registry End session entry notes header + footer Q3 duplicate
- Standards.md action-bar tables updated for new tutor structure
- pages/practice.md Action Bar section rewritten with new tutor states
- pages/practice.md gains "Choice Click Semantics" subsection
- This DEBT-378 doc moves to `_archive/debt/` with Resolution section completed (file inventory, gate counts, CR status)
- Debt index updated (DEBT-378 → Resolved table)

Quality gates:

- Local full gate green (typecheck, lint, unit, browser, integration, build, E2E)
- CodeRabbit explicit `APPROVED` on the latest head
- Zero stale `'Submit'` / `'Submitting…'` / `'View Summary'` references in tutor scope
- Visual QA on tutor Q1/Q2/Q3 pre/post-feedback states (six screens) with screenshots attached to PR

---

## Out of Scope

- **Exam mode** — DEBT-379 is the separate ticket for exam right-slot promotion and Mark-for-review repositioning. This debt does not change exam mode in any way.
- **Bookmark in header rail** — Claude Design V3 proposed moving Bookmark from the post-feedback secondary group to the header rail. We are explicitly NOT doing that in this debt; Bookmark stays in the secondary group post-feedback. If header-rail unification is desired later, file separately.
- **Skip button** — no explicit Skip affordance is added. Question navigator pills are the only non-sequential navigation. If post-launch signal shows friction, follow-up debt.
- **Choice button visual design** — the primitive doesn't change. No new variant, no icon, no spinner. If the click-commit gap is perceptible in profiling, that's a follow-up debt.
- **Telemetry instrumentation** — verify and re-home the existing Submit-click event if any; do not add new events as part of this debt.
- **Touch-target hit-area review** — assumed adequate per existing I-3 padding. If misclick rates are high post-launch, file separately.
- **Renaming `submitResult` / `onSubmit` etc. internally** — the variable names retain their current spelling for diff size and audit clarity. A future rename pass could align identifiers to the new "commit on select" semantic if desired; out of scope here.
- **`usePracticeQuestionAnswerFlow` consolidation into `useQuestionFlowCore`** — if the audit finds these hooks can be unified cleanly post-refactor, that's a P3 follow-up; out of scope here unless trivial.

---

## Open Questions for Audit

1. Where exactly should the tutor-mode commit-on-select branch live — inside `useQuestionFlowCore.onSelectChoice` (option A), or in a thin wrapper hook that consumes both `useQuestionFlowCore` and `usePracticeQuestionAnswerFlow` (option B)? The audit should pick based on what produces the smallest test surface.

2. Does any current consumer of `usePracticeQuestionAnswerFlow.onSubmit` outside `practice-view.tsx` exist? (e.g., quick-practice, embedded preview, admin tooling). Audit must enumerate.

3. Is there a Submit-related telemetry event today that needs re-homing? Audit must search the controller layer for `track*` / analytics emissions tied to the submit-answer flow.

4. Does the question navigator pill row remain fully clickable in all tutor states pre-refactor? If yes, it carries the skip semantic post-refactor without code change. If a state disables pills (e.g., during loading), audit must surface so we can decide whether the disable should remain.

5. Should we add a 200ms perceptual buffer between choice click and feedback render to feel less abrupt, or is the existing async flow's natural latency sufficient? Recommend: do not add artificial delay; ship and measure.

6. Confirm `ChoiceButton`'s `<input type="radio">` semantics are preserved when click commits — specifically that `aria-checked` remains accurate and screen-reader users understand the state transition.

7. Should `canSubmit` and `isSubmittingAnswer` be removed from `practice-page-logic.ts` entirely, or kept for exam-mode use? Audit must verify usage.

8. Is there value in renaming `submitResult` to something like `feedbackResult` to match the new mental model? (Likely no — out of scope per scope discipline — but flag for future cleanup.)
