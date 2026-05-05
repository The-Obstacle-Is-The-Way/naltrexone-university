# DEBT-378: Drop Submit Button In Tutor Mode — Choice Click Commits The Answer

**Priority:** P2 (significant behavior change with broad test surface)
**Created:** 2026-05-04
**Source:** Manual UX walkthrough of tutor session (Q1, Q2, Q3 of a 3-question session) on 2026-05-04, follow-up first-principles design pass with Claude Design variants V1/V2/V3, and final V4 redesign converged after weighing friction-vs-deliberation trade-offs against board-prep convention and learning-app UX literature
**Related:** [DEBT-375 Tutor session action bar — no terminal CTA on last question (archived)](../_archive/debt/debt-375-tutor-session-action-bar-no-terminal-cta-on-last-question.md), [DEBT-372 Post-exam review summary button label divergence (archived)](../_archive/debt/debt-372-post-exam-review-summary-button-label-divergence.md), [DEBT-365 Exam flow affordance and label consistency (archived)](../_archive/debt/debt-365-exam-flow-affordance-and-label-consistency.md), [DEBT-363 Exam shell scroll model and dual-CTA disambiguation (archived)](../_archive/debt/debt-363-exam-shell-scroll-model-and-dual-cta.md), [DEBT-379 Exam action bar — promote primary CTA to right slot](./debt-379-exam-action-bar-promote-primary-cta-to-right-slot.md), [Pattern Registry](../frontend/pattern-registry.md), [Frontend Standards](../frontend/standards.md), [Practice Page Docs](../frontend/pages/practice.md)

**Status:** Open. Audit-refined 2026-05-04 against `e44b8380`; no code change yet. This document supersedes the original DEBT-378 scoping (label-only "End session vs View Summary" unification), which has been subsumed by the broader click-to-commit redesign.

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

UX literature and product-pattern review (2026-05-04) surfaced two relevant findings. Treat these as supporting context, not the load-bearing proof; the load-bearing evidence is the user-observed two-click tutor friction above.

1. Click-to-commit is common in learning-app quiz interactions. Two-step submit is more associated with form submission than with rapid practice flows, and carries form-submission friction baggage.
2. The literal label "Submit" is independently flagged as vague and form-flavored in learning contexts — it doesn't tell the learner *what* they're submitting *to* or *what happens next*. This supports removing the tutor-only `Submit` button once the choice card itself becomes the commit surface.

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

With Submit gone, the Q3 terminal CTA in the tutor footer becomes the only label that needs choosing. Aligned with the persistent header `End session` (which DEBT-375 preserved on first-principles grounds for tutor's low-friction exit value), the footer terminal becomes `End session` as well. This produces an intentional same-label duplicate on Q3 — exactly the pattern DEBT-372 already established as acceptable on the post-exam review surface (two `View Summary` buttons on the final reviewed question), so the precedent is set.

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

After refactor, the chains merge **in non-exam learning flows only**:
1. `ChoiceButton` onChange fires
2. → `QuestionCard` `onClick={() => onSelectChoice(choice.id)}`
3. → a wrapper-level `onSelectChoice(choice.id)` selects the choice and, for tutor / Quick Practice, immediately invokes the submit flow with that same `choiceId`
4. → `submitAnswerForQuestion({ selectedChoiceId: choiceId, ... })` runs to completion → `submitResult` populates → feedback renders

The mode-specific branching does **not** live inside `useQuestionFlowCore`. Audit against `e44b8380` found that `UseQuestionFlowCoreInput` only accepts `isMounted` (`use-question-flow-core.ts:21-23`), while the submit path needs question, selected choice, idempotency key, loaded timestamp, submit function, request sequencing, and load/result setters. Pushing all of that into the core hook would make the shared selection primitive own submission orchestration and would create a broad architectural merge point.

The correct layer is the **flow wrapper hook that already owns submission dependencies**:

- Active session path: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts` wraps the shared selection result. If `sessionMode === 'exam'`, choice click remains select-only. If `sessionMode !== 'exam'`, the same click commits by passing the clicked `choiceId` explicitly into the session `submitAnswerForQuestion` path.
- Ad-hoc / Quick Practice path: `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts` wraps the shared selection result and always commits the clicked `choiceId` because Quick Practice has no exam mode.
- Shared selection core: `app/(app)/app/practice/shared/use-question-flow-core.ts` remains mode-agnostic. It may change `onSelectChoice` from `void` to `boolean` so wrappers know whether selection actually changed. It must not import or call `runSubmitAnswerFlow`.

Do **not** call the existing no-argument `onSubmit()` immediately after `setSelectedChoiceId(choiceId)`. React state updates are async, so that path can read the previous `selectedChoiceId`. The commit path must pass the clicked `choiceId` explicitly to `submitAnswerForQuestion`.

### State machine simplification

The following derived state and props become dead weight in tutor scope and can be removed:

- `canSubmit` at the `PracticeView` / `TutorActionBar` UI boundary — gates only the Submit button. After refactor, no footer Submit button exists. `canSubmitAnswer()` itself (`practice-page-logic.ts:34-47`) can remain as a hook-level readiness helper if the wrapper submit path still uses it; it is not exam-specific.
- `isSubmittingAnswer` (computed at `practice-view.tsx:326-330`) — drives the `'Submitting…'` button label. After refactor, no Submit button label exists. The pending state is still relevant (it must lock the choice cards during the network roundtrip to prevent double-commit), but it is already applied through the choice-card disabled expression at `practice-view.tsx:522-526`.
- `'Submitting…'` literal — gone from production code.
- Pre-feedback outline `Next` button (`practice-view.tsx:166-174`) — gone. In active tutor sessions, skip-without-committing moves to the question navigator pills. In Quick Practice, there is no skip path before answering because the surface is ad-hoc and single-question.

The current `PracticeViewProps` includes `canSubmit` and `onSubmit` at `practice-view.tsx:37,47`; those props are UI Submit plumbing and should be removed from `PracticeView` / `PracticeSessionPageView` / `QuickPracticeClient`. Hook/controller outputs may keep `canSubmit` / `onSubmit` as programmatic compatibility for probes and internal submit-path tests during this debt; do not rename or purge hook-level submit identifiers in the same pass.

### Loading and double-commit protection

Today's `isAnswerLocked` derivation disables all four choice buttons when `props.isAnswered || props.submitResult !== null` (`practice-view.tsx:322`). The separate choice-card disabled expression adds `props.isPending || props.loadState.status === 'loading'` at `practice-view.tsx:522-526`, preventing clicks during the submit roundtrip. `QuestionCard` propagates the disabled state to all four `ChoiceButton`s.

After refactor, the same guard prevents double-commit: the moment a choice click triggers the submit flow, `isPending` flips true, all four choice buttons go disabled, no second click can race. When the response lands, `submitResult` populates, feedback renders, choice buttons stay disabled (locked to committed state). No new race condition introduced.

The visual-loading window (between click and feedback render) is short. We do not need a spinner on the clicked choice button — the existing `isPending` disabled treatment is enough. If profiling later shows a perceptible gap, we can add subtle inline progress treatment in a follow-up; out of scope for this debt.

### Keyboard interactions

`ChoiceButton` uses a native `<input type="radio">` wrapped in a `<label>`. Pointer activation and Space on a focused radio fire `onChange`, which calls the same `onClick` prop the mouse path uses. Enter is not guaranteed to activate a native radio across browsers, so do not add an Enter-commit test unless the implementation adds explicit `onKeyDown` handling.

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

**Lines 16-53 (`PracticeViewProps`):** remove `canSubmit` and `onSubmit`. After Submit removal those props are no longer read by `PracticeView`; keeping them on the view contract would preserve dead UI plumbing.

**Lines 380-410 (TutorActionBar invocation in the parent JSX):** drop `canSubmit`, `onSubmit`, `isSubmittingAnswer` from the prop block.

**Lines 300-340 (`PracticeView` function — choice click handling):** `PracticeView` continues to pass `props.onSelectChoice` into `QuestionSurfaceBody`. The commit semantic is already encoded before the prop reaches the view.

### File 2: `app/(app)/app/practice/shared/use-question-flow-core.ts`

**Lines 31-57 (`UseQuestionFlowCoreOutput`) and 252-264 (`onSelectChoice` callback):** keep the core hook mode-agnostic. Change `onSelectChoice` to return `boolean`:

```ts
const onSelectChoice = useCallback(
  (choiceId: string): boolean => {
    if (!question) return false;
    const changed = selectChoiceIfAllowed(
      { isAnswered, submitResult },
      setSelectedChoiceId,
      choiceId,
    );
    return changed;
  },
  [isAnswered, question, submitResult, setSelectedChoiceId],
);
```

Do not add `isExamMode`, `runSubmitAnswerFlow`, controller dependencies, or submit callbacks to this hook.

### File 3: `app/(app)/app/practice/practice-page-logic.ts`

**Lines 34-47 (`canSubmitAnswer`):** retain if still used by the wrapper submit path or hook tests. It is not an exam-mode helper; it is a generic submit-readiness helper.

**Lines 113-150 (`submitAnswerForQuestion`):** retain — the submit flow itself doesn't change, only its trigger. No change.

### File 4: `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts`

Ad-hoc / Quick Practice path. This hook currently consumes `useQuestionFlowCore` at `use-practice-question-answer-flow.ts:85` and defines `onSubmit` at `:139-175`.

Add a `commitChoice(choiceId: string)` helper that calls `submitAnswerForQuestion` with `selectedChoiceId: choiceId` instead of reading the selected choice from React state after `setSelectedChoiceId`.

Wrap the core selection callback:

```ts
const onSelectChoice = useCallback(
  (choiceId: string) => {
    const changed = selectChoice(choiceId);
    if (!changed) return;
    void commitChoice(choiceId);
  },
  [commitChoice, selectChoice],
);
```

The existing no-argument `onSubmit` may remain on the hook output as programmatic compatibility and may call `commitChoice(selectedChoiceId)` internally. It is no longer wired to `PracticeView` UI.

### File 5: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts`

Active session path. This hook currently returns core `onSelectChoice` unchanged at `use-practice-session-question-flow.ts:396` and defines session `onSubmit` at `:332-377`.

Add a `commitChoice(choiceId: string)` helper that calls the session `submitAnswerForQuestion` with `selectedChoiceId: choiceId`.

Wrap selection with mode branching:

```ts
const onSelectChoice = useCallback(
  (choiceId: string) => {
    const changed = selectChoice(choiceId);
    if (!changed) return;
    if (sessionMode === 'exam') return;
    void commitChoice(choiceId);
  },
  [commitChoice, selectChoice, sessionMode],
);
```

Exam mode must remain select-only. Tutor mode commits immediately. The existing no-argument `onSubmit` may remain on the hook output for programmatic compatibility and may call `commitChoice(selectedChoiceId)` internally.

### File 6: `components/question/choice-button.tsx` and `components/question/question-card.tsx`

**No JSX or behavior change.** The primitive stays mode-agnostic. The `onClick` prop continues to thread up to `onSelectChoice`, which is the layer where mode-specific behavior diverges.

### File 7: `app/(app)/app/practice/hooks/use-practice-question-flow.ts`

Wrapper for ad-hoc / Quick Practice. It composes `usePracticeQuestionAnswerFlow` at `use-practice-question-flow.ts:47-52` and returns the merged answer/bookmark output at `:59-62`.

No UI-specific change is required here unless TypeScript forces the wrapper output type to narrow after `PracticeViewProps` drops `canSubmit` / `onSubmit`. If the hook keeps those output fields for programmatic compatibility, this wrapper can keep forwarding them.

### File 8: `app/(app)/app/practice/quick/quick-practice-client.tsx`

Quick Practice calls `usePracticeQuestionFlow` at `quick-practice-client.tsx:65-67` and passes `canSubmit` / `onSubmit` into `PracticeView` at `:113,120-122`. Because Quick Practice shares `PracticeView` and has no separate action bar, it is in scope. Drop those UI props; click-to-commit comes from the ad-hoc answer-flow wrapper underneath `usePracticeQuestionFlow`.

### File 9: `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`

Drop `canSubmit` / `onSubmit` from `PracticeSessionPageViewProps` (`practice-session-page-view.tsx:46,56`) and from the `PracticeView` prop block (`:266,274`) because `PracticeViewProps` removes them. The controller may continue returning `canSubmit` / `onSubmit`; JSX spread in `practice-session-page-client.tsx:35` tolerates extra controller output properties, and hook/controller tests may still exercise the programmatic submit callback.

### Summary of production changes

| File | Lines (approx) | Change type |
|------|----------------|-------------|
| `practice-view.tsx` | 16-53, 92-205, 326-330, 380-410 | Major restructure of TutorActionBar; UI Submit prop path removed; derived state pruned |
| `use-question-flow-core.ts` | 31-57, 252-264 | Keep selection core mode-agnostic; make `onSelectChoice` return `boolean` |
| `use-practice-question-answer-flow.ts` | 85, 139-175 | Add explicit-choice commit wrapper for ad-hoc / Quick Practice |
| `use-practice-session-question-flow.ts` | 332-397 | Add explicit-choice commit wrapper; tutor commits, exam remains select-only |
| `use-practice-question-flow.ts` | 47-62 | Keep wrapper shape unless output type narrowing is forced |
| `quick/quick-practice-client.tsx` | 113, 120-122 | Drop dead UI props |
| `practice-session-page-view.tsx` | 46, 56, 266, 274 | Drop UI props from view contract and `PracticeView` invocation |
| Total | ~150-250 lines touched | Net negative LOC (deletion-heavy) |

Choice button primitive, QuestionCard composite, controller layer, repository layer, use-case layer: **zero behavior changes**. The refactor is scoped to wrapper hooks and the action bar. Controller output may retain programmatic `onSubmit` compatibility; do not rename or purge controller output unless implementation proves it is trivial and all probes are updated.

---

## Test Diff

This is a substantial test-suite refactor. Every tutor test that follows the pattern "click answer → click Submit → assert feedback" compresses to "click answer → assert feedback." Every test that asserts `'Submit'`, `'Submitting…'`, `canSubmit`, or pre-feedback Next button must update.

Audit note at `e44b8380`: this is broader than the first draft suggested. A grep for `Submit` / `canSubmit` / `onSubmit` finds direct references in `practice-view` unit/browser tests, session-page view tests, page shell tests, Quick Practice tests, E2E helper code, and multiple E2E specs. The implementation prompt must produce exact edit blocks from fresh grep output; do not assume only the files below change.

### Unit tests (Vitest, jsdom)

**`practice-view-navigation.test.tsx`:**
- Lines 178-181 — current "no `onEndSession` on last tutor question" assertion expects `['Previous', 'Submit']` plus no `Next` / `View Summary` — **REWRITE** to expect `['Previous']` only, with no `Next`, no `Submit`, and no `End session` because there is no terminal handler
- Lines 184-234 — `'renders an outline View Summary button in the primary group before final tutor submission'` — **REWRITE**: pre-feedback Q3 footer has no terminal CTA; the test should assert the primary group contains only `['Previous']`
- Lines 236-293 — `'promotes View Summary after final tutor feedback and keeps Bookmark in the secondary group'` — **REWRITE** to `End session`: primary group `['Previous', 'End session']`, secondary group `['Bookmark']`, `End session` `data-variant="default"`
- Lines 295-335 — `'keeps tutor action bar ordering as Previous, Submit, Next before feedback'` — **DELETE** entirely; replace with a new test asserting pre-feedback Q2 primary group is `['Previous']` only
- Add new tests:
  - Pre-feedback Q1: primary group renders no buttons
  - Pre-feedback Q2: primary group renders `['Previous']`
  - Pre-feedback Q3: primary group renders `['Previous']`
  - Post-feedback Q3: primary group renders `['Previous', 'End session']`, `End session` is filled (`data-variant="default"`)
  - Q3: footer `End session` and header `End session` both exist on the page; both wired to `onEndSession` (same handler, intentional duplicate)
  - Negative assertion: pre-feedback footer never contains a button labeled `'Submit'` in tutor scope
  - Negative assertion: pre-feedback footer never contains a button labeled `'Next'` in tutor scope (only post-feedback)

**`practice-view-answer-feedback.test.tsx`:**
- Lines 16-51 — `'renders submit pending copy without rendering question-loading text'` — **DELETE** (no `'Submitting…'` state exists post-refactor); preserve the question-loading-text portion as a separate assertion if not redundant
- Lines 53-85 — `'keeps Submit visible and Next outlined before submission'` — **DELETE**; add `'choice cards are clickable and the footer is empty/Previous-only before any commit'`
- Lines 75-84 — `submitButton` present plus `nextButton` outline assertions — **DELETE**
- Lines 87-130 — `'hides Submit and promotes Next to primary after submission'` — **REWRITE** as `'renders Next as primary action after answer commits'` (Submit is no longer in the picture, but the post-feedback assertion stays)
- Add new tests:
  - Click on a choice button triggers the submit flow (assert via fake repository: an attempt was recorded)
  - Click during `isPending` does not double-commit (assert single attempt recorded after rapid double-click)
  - Click on a locked choice (post-feedback) does nothing
  - Keyboard Space on a focused choice radio commits the answer. Do not assert Enter unless explicit Enter handling is added.

**`practice-view-layout.test.tsx`:**
- Update render fixtures because `PracticeViewProps` drops `canSubmit` / `onSubmit`.
- Audit `toHaveLength(N)` assertions on action bar children — counts shrink in pre-feedback states.

**Other `PracticeView` colocated tests:**
- `practice-view-bookmarks.test.tsx` — mostly bookmark behavior, but render fixtures pass `canSubmit` / `onSubmit`; update props.
- `practice-view-exam-actions.test.tsx` — exam behavior stays unchanged, but render fixtures pass `canSubmit` / `onSubmit`; update props only. Do not change exam assertions for this debt.

**Page shell tests:**
- `app/(app)/app/practice/page.test.tsx` — static PracticeView mock fixtures pass `canSubmit` / `onSubmit`; update.
- `app/(app)/app/practice/[sessionId]/page.test.tsx` — static PracticeSessionPageView / PracticeView fixtures pass `canSubmit` / `onSubmit`; update. The existing assertion that contains `'Submitting…'` must be deleted or rewritten because that literal leaves production.

### Browser specs (Vitest browser mode, Chromium)

**`practice-view.browser.spec.tsx`:**
- Line 91-120 — exam controls test, asserts no Submit button in exam — **KEEP** (still valid; exam never had Submit, still doesn't)
- Line 184-260 — tutor feedback bottom-bar static render — **KEEP SHAPE / UPDATE PROPS**: this test directly renders a post-feedback fixture and does not click Submit. It should still assert `Previous`, `Next`, and `Bookmark` after feedback; remove `canSubmit` / `onSubmit` fixture props.
- Lines 262-355 — pending/disabled mutation controls — **REWRITE** tutor half: no Submit button exists to disable; assert choice cards are disabled during pending and exam Mark-for-review behavior remains unchanged.
- Lines 649-714 — tutor last-question `View Summary` routing — **REWRITE** to `End session` and preserve the "calls `onEndSession`, not `onNextQuestion`" behavioral assertion.
- Add: tutor Q3 last-question routing test — clicking the footer `End session` calls `onEndSession`; clicking the header `End session` calls the same handler.

**`practice-view-notification.browser.spec.tsx`:**
- Search for Submit-related fixtures and update any active tutor / Quick Practice cases. Do not change bookmark/feedback notification assertions unless they depend on removed props.

**`practice-session-page-view-active-question.browser.spec.tsx`:**
- Tests asserting header `End session` persistence across questions — **KEEP** (header behavior unchanged).
- Tests asserting `Submit` button in active question footer — **DELETE/REWRITE**.

**`practice-session-page-view-question-navigation.browser.spec.tsx`:**
- Lines 386-457 — last tutor question navigation test asserting `View Summary` calls `onEndSession` not `onNextQuestion` — **REWRITE** with the `End session` literal in the assertion.

**Hook browser/unit tests:**
- `use-question-flow-core.browser.spec.tsx` — add assertions that `onSelectChoice` returns `true` only when selection changed and `false` when blocked by missing question, answered state, or existing submit result.
- `use-practice-question-answer-flow.browser.spec.tsx` — rewrite select-then-submit path so choice click commits in ad-hoc practice; keep a programmatic `onSubmit` compatibility assertion only if the hook still exposes it.
- `use-practice-session-question-flow.test.tsx` and related session controller probes — update expected output shape if `canSubmit` / `onSubmit` is no longer surfaced to the view; keep hook-level compatibility tests if those callbacks remain.

### Integration tests

**`tests/integration/*.integration.test.ts`:** none expected to assert footer button structure directly. Integration tests focus on the persistence layer (repositories, use cases). Confirm via grep, but the choice-click-commits semantic should pass through transparently because the use-case invocation contract is unchanged.

### E2E tests (Playwright)

**`tests/e2e/practice.spec.ts`:**
- Tutor walkthrough flow: each question step today is `select choice → click Submit → assert feedback → click Next`. Compress to `click choice → assert feedback → click Next`.
- Q3 last-question step: today clicks `View Summary`. Update to click `End session` (footer position).
- Add: assertion that on Q3, the footer `End session` and the header `End session` are both present and both clickable; clicking either ends the session (either is a valid path; no preference required).
- Estimated diff: ~30-50 line changes, mostly deletion of Submit click steps.

Other E2E files with current `Submit` clicks at `e44b8380`:
- `tests/e2e/review-mode-audit.spec.ts` — contains tutor/quick practice Submit interactions and no-Submit assertions for review surfaces. Rewrite only the active tutor/quick Submit clicks; preserve review-surface no-Submit assertions.
- `tests/e2e/session-review-navigation.spec.ts` — active tutor Submit clicks become choice-click commits.
- `tests/e2e/subscribe-and-practice.spec.ts` — first-practice Submit click becomes choice-click commit.
- `tests/e2e/helpers/question.ts` — shared helper must stop clicking Submit for tutor/quick practice, or expose mode-specific helpers so exam/review flows keep their current semantics.

### Test count summary

| Test type | Files affected | Assertions changed (estimate) |
|-----------|----------------|-------------------------------|
| Unit | 5-7 | 35-55 |
| Browser | 5-7 | 20-35 |
| Integration | 0 | 0 |
| E2E | 4-5 | 15-30 |
| **Total** | **12-18 files** | **~70-120 assertions** |

The implementation prompt should refresh grep output and produce exact file:line edit blocks before coding.

---

## Design Doc Diff

### `docs/frontend/pattern-registry.md`

- **I-3 (Choice Button) entry:** add a "Behavior" subsection. Today's entry covers visual states; add: "In tutor mode and Quick Practice, the choice click commits the answer (invokes the submit flow). In exam mode, the choice click selects without committing (commit deferred to session end). The primitive and `useQuestionFlowCore` remain mode-agnostic; mode-specific behavior is wired in `usePracticeQuestionAnswerFlow` and `usePracticeSessionQuestionFlow`."
- **End session entry:** add "Used in tutor mode header (always present) and tutor mode footer terminal CTA on the last question (intentional same-label duplicate; both wired to `onEndSession`)."
- **Pre-feedback Next pattern:** if a registry entry exists for this affordance, mark deprecated and remove from tutor scope.
- **Submit button:** if a registry entry exists for the tutor Submit button, mark removed.

### `docs/frontend/standards.md`

- **Action bar / Button placement table:** update tutor row(s) to reflect new structure (no Submit, `[Previous][Next/End session]` cluster left, `[Bookmark]` `sm:ml-auto` right).
- **Primary CTA position section:** add "In tutor mode and Quick Practice, the choice cards themselves act as the primary action pre-feedback; the footer carries only backward navigation before feedback and sequential navigation after feedback. Exam right-slot CTA promotion is separate DEBT-379 and must not be described as shipped until that debt lands."

### `docs/frontend/pages/practice.md`

- **Action Bar subsection:** rewrite for tutor — pre-feedback states (empty or Previous-only), post-feedback states (Previous + Next/End-session left cluster, Bookmark `sm:ml-auto` right), header `End session` always-on. Note the intentional Q3 same-label duplicate.
- **Choice Click Semantics subsection (new):** explain the tutor-vs-exam divergence at the orchestration layer.
- Source-line anchors throughout the doc may drift; update as part of the implementation pass.

### `docs/frontend/contrast-policy.md`

No changes expected. Choice button (I-3) contrast targets are independent of click semantics.

### `docs/_archive/debt/debt-375-...md`

No content change; DEBT-375's first-principles framing (header `End session` for tutor's low-friction exit value) is preserved by this refactor. The header continues to render across all three questions; the footer terminal CTA on Q3 simply joins it with the same label.

---

## Edge Cases & Implementation Notes

### Skip-without-answering on Q1/Q2

Today, pre-feedback `Next` lets users advance without selecting an answer. After refactor, this affordance is removed from active tutor sessions. Skip is still possible in active sessions via the question navigator pills at the top of the practice surface (clicking pill 2 jumps to Q2 from Q1, etc.), which is the architectural source of truth for non-sequential navigation. The navigator buttons render from `QuestionNavigator` and are disabled only when `row.isAvailable` is false (`exam-review-view.tsx:88-99`); current-question pills remain clickable but carry `aria-current="step"`.

Quick Practice has no question navigator. That is acceptable because Quick Practice is an ad-hoc single-question flow: the forward path is click answer → feedback → Next.

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
- Keyboard support: Space on a focused choice commits in tutor mode through the native radio `onChange → onClick → onSelectChoice` chain. Enter is not guaranteed for native radios; do not claim or test Enter unless explicit key handling is added.
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
| Users on board-prep apps muscle-memoried to two-step submit experience tutor as "too fast" / "rushing" | Ship normally with visual/manual QA and watch support/user feedback. Do not add new telemetry in this debt; if existing answer-submit telemetry exists, re-home it to the choice-click commit path. |
| Misclick wrong answer with no undo | Accepted by user. Documented in this doc. Mitigation is the explanation panel — misclicks become "learn from why I was wrong" moments. |
| Test-suite drift during implementation (refactoring ~70-120 assertions across 12-18 files is a real surface) | The implementation prompt should be explicit per-file with exact edit blocks generated from fresh grep output. CR will catch residual drift. |
| Wrapper-hook mode branching breaks exam mode by accident | Branch in `usePracticeSessionQuestionFlow` must be `if (sessionMode === 'exam') return` after selection succeeds. Add a test asserting exam-mode choice click does NOT commit. |
| Skip-without-answering removal frustrates users who used pre-feedback Next as their primary forward affordance | Question navigator pills provide the same function; if user signal post-launch shows friction, follow-up debt for an explicit Skip button. |
| Stale selected-choice state if implementation calls no-arg `onSubmit()` right after selection | Never do that. Commit helpers must accept `choiceId` explicitly and pass it as `selectedChoiceId` to `submitAnswerForQuestion`. |
| Pre-feedback empty footer on Q1 looks "broken" to users | Empty primary group container should not render a zero-child flex row (suppress the wrapper when empty). Visual QA must confirm the page reads as intentional, not broken. |
| Quick Practice breaks because it shares `PracticeView` but has no question navigator | Quick Practice is explicitly in scope. Its ad-hoc wrapper hook must click-commit, and its pre-feedback footer intentionally has no Submit/Next. |

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
  - `onSelectChoice` remains mode-agnostic and does not import/call submit logic
  - `onSelectChoice` returns `true` only when selection changed and `false` when selection was blocked
- `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts`:
  - Ad-hoc / Quick Practice choice click commits by passing the clicked `choiceId` explicitly into `submitAnswerForQuestion`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts`:
  - Tutor-mode choice click commits by passing the clicked `choiceId` explicitly into the session submit path
  - Exam-mode choice click remains select-only and does not call submit
- Choice button primitive (`components/question/choice-button.tsx`) and QuestionCard composite: zero changes
- `PracticeViewProps`, `PracticeSessionPageViewProps`, and `QuickPracticeClient`: drop `canSubmit` / `onSubmit` UI props
- Repository, controller, use-case layers: zero changes

Tests:

- All Submit button assertions deleted or rewritten per the test diff above
- New tests added:
  - Tutor: clicking a choice commits the answer (assert via fake)
  - Tutor: clicking during `isPending` does not double-commit
  - Tutor: keyboard Space on focused choice commits; Enter only if explicit Enter handling is added
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
- Zero stale `'Submit'` / `'Submitting…'` / `'View Summary'` UI literals in tutor scope. Hook/controller identifiers named `onSubmit`, `submitResult`, or `submitAnswerForQuestion` may remain if they still describe the internal persistence action.
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
- **`usePracticeQuestionAnswerFlow` consolidation into `useQuestionFlowCore`** — out of scope. This debt deliberately keeps `useQuestionFlowCore` mode-agnostic and performs commit orchestration in wrapper hooks.

---

## Implementation Verification Checklist

1. Confirm the explicit-choice wrapper shape: `useQuestionFlowCore.onSelectChoice` returns `boolean`; `usePracticeQuestionAnswerFlow` and `usePracticeSessionQuestionFlow` call `commitChoice(choiceId)` only when that return value is `true`.

2. Preserve hook/controller compatibility unless removal is trivial: `PracticeView` UI stops receiving `canSubmit` / `onSubmit`, but hook/controller outputs may keep them for probes and direct tests. Do not rename `submitResult` / `onSubmit` in this debt.

3. Search for Submit-related telemetry before coding. At `e44b8380`, a broad static grep did not find an obvious UI-layer analytics event tied to Submit; re-home any real event discovered during implementation to the choice-click commit path.

4. Preserve question navigator clickability in active tutor states. Current code disables only unavailable rows; preserve that unless a test proves a loading/pending state needs temporary disablement.

5. Do not add an artificial delay between choice click and feedback render. Ship the natural async transition; add a progress treatment only in a follow-up if visual QA shows a perceptible gap.

6. Confirm `ChoiceButton`'s `<input type="radio">` semantics are preserved when click commits — specifically that checked state remains accurate and screen-reader users get either current feedback live-region behavior or an equivalent pending/feedback announcement.

7. Verify no active tutor or Quick Practice UI still renders `Submit`, `Submitting…`, pre-feedback footer `Next`, or footer `View Summary` after implementation. Use grep plus role-based tests.

8. Do not rename `submitResult` to `feedbackResult` in this debt. If the new mental model makes the old name painful after implementation, file a separate cleanup.
