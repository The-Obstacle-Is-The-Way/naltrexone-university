# DEBT-375: Tutor Session Action Bar Has No Terminal CTA On Last Question

**Priority:** P2
**Created:** 2026-05-02
**Status:** Active
**Source:** Manual UX walkthrough of tutor session flow, 2026-05-02 (paired Q1 → Q2 → Q3 screenshot review showing last-question footer dead-end forcing scroll-to-header to leave the session)
**Related:**

- [DEBT-363 Exam shell scroll model and dual-CTA disambiguation](../_archive/debt/debt-363-exam-shell-scroll-model-and-dual-cta.md) — Concern 2 dropped the `Finish exam` header button in exam mode so the footer `Review & Submit` became the single primary CTA. Establishes the precedent for action-bar consolidation; this ticket extends the same idea to tutor mode without removing the tutor header (justified below in First-Principles Framing).
- [DEBT-365 Exam flow affordance and label consistency](../_archive/debt/debt-365-exam-flow-affordance-and-label-consistency.md) — set the per-mode action-bar contract this ticket parallels.
- [DEBT-372 Post-exam review summary button label divergence](../_archive/debt/debt-372-post-exam-review-summary-button-label-divergence.md) — established `View Summary` as the canonical vocabulary for "go to the Session Summary screen". This ticket adopts that label for the new tutor terminal CTA.
- [DEBT-360 Action bar below fold](../_archive/debt/debt-360-action-bar-below-fold.md) — provides the `[data-testid="bottom-action-bar"]` container and viewport-bounded shell this ticket renders inside.
- [DEBT-318 Tutor bookmark before answer](../_archive/debt/debt-318-tutor-bookmark-before-answer.md) — established that Bookmark renders only after feedback is visible. This ticket preserves that policy.

**Audit verified:** _pending_ — to be filled after second-opinion audit pass against the doc's claims.

---

## Context

`app/(app)/app/practice/components/practice-view.tsx` exports a single `PracticeView` shared between tutor and exam modes. The view branches on `sessionInfo.mode` at line 274:

```tsx
const isExamMode = sessionInfo?.mode === 'exam';
```

It renders one of two action-bar bodies inside a single bottom container at lines 331–369:

```tsx
const actionBar = props.question ? (
  <div
    className="flex flex-wrap items-center gap-3"
    data-testid="bottom-action-bar"
  >
    {isExamMode ? (
      <ExamActionBar ... />
    ) : (
      <TutorActionBar ... />
    )}
  </div>
) : null;
```

### The bug: `TutorActionBar` renders an invisible spacer where the last-question CTA should be

`TutorActionBar` is defined at `practice-view.tsx:111-174`. The Next-button slot at lines 146–158 reads:

```tsx
{props.hasNextQuestion === false ? (
  <ActionBarSpacer />
) : (
  <Button
    type="button"
    variant={props.submitResult ? 'default' : 'outline'}
    className="rounded-full"
    disabled={isActionBarDisabled}
    onClick={props.onNextQuestion}
  >
    Next
  </Button>
)}
```

`ActionBarSpacer` (`practice-view.tsx:88-90`) is an invisible 9-row × 24-col placeholder:

```tsx
function ActionBarSpacer() {
  return <span aria-hidden="true" className="h-9 min-w-24" />;
}
```

So on the last tutor question (`hasNextQuestion === false`), the slot where every other question shows `Next` instead renders nothing visible. There is no `View Summary`, no `Finish session`, no `Done` — nothing that advances the user to the Session Summary screen from the footer.

Walked through the screenshot evidence:

- **Q1 of 3, post-submit:** footer shows `Next` (filled, primary) + `Bookmark`. Works.
- **Q2 of 3, pre-submit (answer selected):** footer shows `Previous` + `Submit` + `Next`. Works.
- **Q3 of 3, pre-submit (answer selected):** footer shows `Previous` + `Submit`. **`Next` slot is rendered as `ActionBarSpacer` — empty visible row to its right.**
- **Q3 of 3, post-submit (feedback shown):** footer shows `Previous` + `Bookmark`. **No terminal CTA. The user must scroll up to the header `End session` button to leave the session.**

### How exam mode handles the same situation

`ExamActionBar` at `practice-view.tsx:192-269` does not have this gap. On the last question, it relabels the navigation button instead of erasing it (lines 240–242):

```tsx
{props.isLastSessionQuestion && props.onEndSession
  ? 'Review & Submit'
  : 'Next'}
```

…with `onMiddleAction` flipping to `props.onEndSession` on the last question (lines 202–205). The exam footer is never empty.

`ExamActionBar` also splits its controls into two visible groups via sibling `<div>`s with `sm:ml-auto` for right-alignment (lines 206–266):

- **Primary navigation group** (`data-testid="exam-action-primary-group"`): Previous + Next/Review&Submit
- **Secondary group** (`data-testid="exam-action-secondary-group"`, `sm:ml-auto`): Mark for review

`TutorActionBar` does not split — every button is a flat sibling under the outer `bottom-action-bar` flex container. There is no right-aligned secondary slot, so the post-submit `Bookmark` button hugs the left edge next to navigation rather than visually subordinating to the right.

### Why the header `End session` button is tutor-only

Lines 391–413 of `practice-view.tsx` render the header right-side button:

```tsx
<div className="flex items-center gap-3">
  {props.onEndSession && !isExamMode ? (
    <Button
      type="button"
      variant="outline"
      className="rounded-full"
      disabled={
        props.isPending || props.loadState.status === 'loading'
      }
      onClick={props.onEndSession}
    >
      {endSessionLabel}
    </Button>
  ) : !props.onEndSession ? (
    <Button asChild variant="link" className={headerActionLinkClasses}>
      <Link href={backLink.href}>{backLink.label}</Link>
    </Button>
  ) : null}
</div>
```

The `!isExamMode` guard means the header button renders **only in tutor mode** (with `endSessionLabel` defaulting to `'End session'` at line 281). Exam mode renders `null` here. That asymmetry is intentional and shipped via DEBT-363 Concern 2.

`practice-session-page-view.tsx:267` passes `endSessionLabel={mode === 'exam' ? 'Finish exam' : 'End session'}`. Note that the `Finish exam` branch is effectively dead because the header button is gated by `!isExamMode`; the only place `Finish exam` could surface is the empty-state branch of `practice-view.tsx:467-483`. This dead label is observed and intentionally **out of scope** for DEBT-375.

## Why This Is Debt

- **Functional dead-end on the last tutor question.** The natural completion path of a tutor session — answer Q-last, read the explanation, leave — has no footer affordance. The user must either spot the header `End session` and scroll up or guess that "Bookmark" is somehow related. Every other question has a primary forward button in this slot. This is the kind of UX bug that fails first-time users silently.
- **Layout asymmetry vs. exam.** Exam shipped a two-group footer (primary navigation left, secondary controls `sm:ml-auto` right). Tutor shipped a single flat row that hugs the left, leaving the right half of the action bar empty pre-submit and squishing Bookmark next to navigation post-submit. Across modes the action bar should follow one structural template even when the per-mode controls differ.
- **`Bookmark` is mis-grouped with navigation.** Bookmark is a secondary cross-session control (per DEBT-318), not a primary navigation control. It belongs in the right-aligned secondary slot — the tutor analog of exam's `Mark for review` slot — not interleaved with `Previous` / `Next`.
- **Vocabulary already exists; just not used here.** `View Summary` was standardized in DEBT-372 as the canonical label for "go to Session Summary screen". The post-exam review surface already uses it. Adopting the same label in tutor preserves cross-surface label consistency.

## First-Principles Framing

Tutor and exam modes have different value propositions, and their action-bar affordances should differ accordingly:

- **Exam mode = commitment.** The student sat down to test themselves across N questions. DEBT-363 Concern 2 deliberately removed the header `Finish exam` to force the natural path through `Next → Next → Review & Submit`. Bailing requires intent (top-nav back to Dashboard). This is correct: exam should make bailing slightly costly because uncommitted submissions corrupt the assessment signal.
- **Tutor mode = self-paced learning.** The student is here to learn one question at a time. Bailing at Q2 of 10 is a normal end-state, not a failure. A persistent header `End session` affordance has real value here — it lets students leave without friction when they're done absorbing what they wanted to absorb.

The header `End session` button in tutor mode is therefore **not a layout mistake**; it is the correct affordance for a self-paced learning surface. Removing it for the sake of exam-shaped symmetry would sacrifice tutor mode's bail-cheap principle for visual neatness.

The actual bug is narrower: the **footer is missing the natural completion CTA** on the last question. Header `End session` ("I'm done early, take me out") and footer `View Summary` ("I've finished the last question, take me to my results") serve different purposes and can coexist. The fix is to add the missing footer CTA, not to relocate the header bail.

## Options

### Option α (recommended): Add `View Summary` last-question CTA + adopt exam's two-group footer template; keep header `End session` unchanged

Production change in `app/(app)/app/practice/components/practice-view.tsx`:

1. Extend `TutorActionBarProps` (currently `Pick<PracticeViewProps, ...>` at lines 92–109) to additionally pick `'onEndSession'`.
2. Restructure `TutorActionBar`'s body (lines 117–173) into two sibling groups, mirroring the exam pattern at lines 206–266:
   - **Primary navigation group** wrapped in `<div className="flex flex-wrap items-center gap-3" data-testid="tutor-action-primary-group">` containing `Previous`, `Submit` (when no `submitResult`), and the new `Next`/`View Summary` slot.
   - **Secondary group** wrapped in `<div className="flex flex-wrap items-center gap-3 sm:ml-auto" data-testid="tutor-action-secondary-group">` containing `Bookmark` (preserving the existing `hasBooleanCorrectness(submitResult)` gate from line 160 so post-feedback-only visibility is unchanged).
3. Replace the `ActionBarSpacer` branch at lines 146–148 with a `View Summary` button when `hasNextQuestion === false` and `onEndSession` is defined:

```tsx
{props.hasNextQuestion === false ? (
  props.onEndSession ? (
    <Button
      type="button"
      className="rounded-full"
      disabled={isActionBarDisabled}
      onClick={props.onEndSession}
    >
      View Summary
    </Button>
  ) : (
    <ActionBarSpacer />
  )
) : (
  <Button ...>Next</Button>
)}
```

The `props.onEndSession ?` inner ternary preserves the spacer fallback for the legitimate edge case where `PracticeView` is rendered without an `onEndSession` handler (e.g. ad-hoc Quick Practice surfaces). The shipped `practice-session-page-view.tsx` always passes `onEndSession`, so the live tutor-session flow always renders the button.

4. Pass the new prop in the `PracticeView` body where `TutorActionBar` is rendered (lines 351–366):

```tsx
<TutorActionBar
  ...
  onEndSession={props.onEndSession}
/>
```

5. **No change to lines 391–413.** The header `End session` button is preserved by design.
6. **No change to `ExamActionBar`.** Exam already has the correct shape.

Resulting per-state footer for a 3-question tutor session:

| Question | State | Primary group (left) | Secondary group (right, `sm:ml-auto`) |
|----------|-------|----------------------|---------------------------------------|
| Q1 | pre-submit | `Submit · Next` | _empty_ |
| Q1 | post-submit | `Next` | `Bookmark` |
| Q2 | pre-submit | `Previous · Submit · Next` | _empty_ |
| Q2 | post-submit | `Previous · Next` | `Bookmark` |
| Q3 (last) | pre-submit | `Previous · Submit · View Summary` | _empty_ |
| Q3 (last) | post-submit | `Previous · View Summary` | `Bookmark` |

`View Summary` is enabled regardless of submit state, consistent with the existing tutor-mode behavior of allowing `Next` clickability before submit on Q1 / Q2 (a separate, deliberately out-of-scope concern flagged below).

### Option β (rejected): Move `End session` into the footer as a persistent secondary control; drop the header button

This achieves layout symmetry with exam but sacrifices the bail-cheap affordance described in First-Principles Framing. Tutor footer would gain a third concept (navigate / commit / bail) and the header would lose the persistent escape. Self-paced learners who want to leave mid-session would see a busier footer in exchange for no functional gain.

### Option γ (rejected): Drop `End session` entirely; force mid-session bail through the top-nav

Maximum mirror of exam mode but removes tutor's bail-cheap value entirely. Students who want to leave at Q3 of 10 would have to navigate via the top-nav `Dashboard` link, which reads as "leave the entire app section" rather than "leave this session". Loss of intent fidelity.

## Recommendation

**Option α.** Minimal-scope production diff that fixes the actual bug (missing terminal CTA), aligns the tutor footer structurally with exam, and preserves the deliberately tutor-specific persistent header bail.

## Production Diff Spec

Single file: `app/(app)/app/practice/components/practice-view.tsx`. Net additions ~30 LOC, deletions ~5 LOC.

1. **`TutorActionBarProps` (lines 92–109):** add `'onEndSession'` to the `Pick<PracticeViewProps, ...>` union.
2. **`TutorActionBar` body (lines 111–174):** restructure into navigation + secondary groups as specified above. Replace the conditional `ActionBarSpacer` branch with the `View Summary` button (preserving spacer fallback when `onEndSession` is undefined).
3. **`PracticeView` `actionBar` JSX (lines 350–367):** pass `onEndSession={props.onEndSession}` into the `<TutorActionBar />` instantiation.
4. **No other production files touched.**

Header (`practice-view.tsx:391-413`), `ExamActionBar` (lines 192–269), `ActionBarSpacer` (lines 88–90), `endSessionLabel` plumbing (`practice-session-page-view.tsx:267`), and the `bottom-action-bar` outer container are **unchanged**.

## Test Impact

The audit agent should grep these files and verify which assertions need to change. Estimated scope (verify before committing):

| File | Likely impact |
|------|---------------|
| `app/(app)/app/practice/components/practice-view-navigation.test.tsx` | Tutor navigation tests likely assert Previous/Submit/Next visibility per question position; add `View Summary` visibility on last question, both states. |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | Broad surface coverage. Likely needs new last-question `View Summary` test plus group-data-testid coverage. |
| `app/(app)/app/practice/components/practice-view-answer-feedback.test.tsx` | Feedback rendering — verify Bookmark grouping change does not break feedback assertions. |
| `app/(app)/app/practice/components/practice-view-layout.test.tsx` | Layout-level assertions; possibly affected by the new sibling-div structure. |
| `app/(app)/app/practice/components/practice-view-exam-actions.test.tsx` | Exam-only; should be unaffected (no exam structural change) — verify no cross-mode assumptions. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-active-question.browser.spec.tsx` | Already asserts `End session` header button visibility (lines 133, 137, 177). Header is unchanged so these should still pass; verify. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-question-navigation.browser.spec.tsx` | Q→Q navigation tests; likely add a "last tutor question shows View Summary" case. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-review-stage.browser.spec.tsx` | Already asserts `End session` button at lines 423, 456 — these are in the review/error stage, not the active-question footer; verify untouched. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-results.browser.spec.tsx` | Exam results — verify untouched. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-focus-restoration.browser.spec.tsx` | Focus tests across navigation; verify the new last-question button is reachable via expected focus order. |
| `app/(app)/app/practice/[sessionId]/page.test.tsx` | Static HTML render; line 116 asserts `End session` substring — header is unchanged so this should pass. Add `View Summary` substring assertion if a tutor last-question fixture is exercised. |
| `tests/e2e/practice.spec.ts` | E2E. If the tutor flow walks Q1 → Q-last, add a `View Summary` button click as the terminal action instead of the header `End session` (or augment, not replace, depending on the existing flow's intent). |

Test discipline reminders:

- **Fakes over mocks.** Use existing fakes from `src/application/test-helpers/fakes/`. No `vi.mock()` of internal modules.
- **`renderToStaticMarkup` + `// @vitest-environment jsdom`** for `*.test.tsx` static-HTML coverage.
- **`vitest-browser-react`** for `*.browser.spec.tsx`. `{ spy: true }` if any controller mocking is needed (see DEBT-368).
- **Region-scoped queries.** Use `[data-testid="tutor-action-primary-group"]` / `[data-testid="tutor-action-secondary-group"]` / `[data-testid="bottom-action-bar"]` to scope assertions inside the action bar.
- **Stable selectors.** `getByRole('button', { name: 'View Summary' })` over class-token assertions.
- No snapshot rewrites. No `.first()` / `.nth()` shortcuts.

## Verification

Local pre-push gate (must run before push, not just before PR):

```bash
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
```

If the authenticated billing E2E environment is available locally, also run:

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null
pnpm test:e2e
```

Grep verification after implementation:

```bash
# Should return at least one production hit (the new button) and corresponding test assertions.
rg "View Summary" app/\(app\)/app/practice/components/practice-view.tsx

# Should still return zero — last-question slot must no longer be a spacer when onEndSession is wired.
# Inspect the diff manually rather than grep, since ActionBarSpacer remains as a fallback for ad-hoc surfaces.

# Should return the existing exam-action group test ids plus the new tutor ones.
rg "tutor-action-primary-group|tutor-action-secondary-group" -g '*.tsx'
```

## Constraints

- **Doc-first cadence.** This doc lands on `dev` first and is reviewed via the audit pass referenced in the god prompt below. Implementation branches off `dev` only after the audit returns clean and the user grades the doc.
- **Stop before merge.** The implementing agent must STOP after the implementation PR is CR-clean and await explicit user grade before merging. No autonomous merge.
- **Out of scope (deliberately):**
  - **Pre-submit `Next` clickability in tutor mode.** The current `TutorActionBar` allows clicking `Next` before submitting on Q1 / Q2 (line 151 renders `Next` regardless of `submitResult` when `hasNextQuestion === true`), letting users skip per-question feedback that is the value prop of tutor mode. Real concern, distinct surface — file as DEBT-376 if the user wants it tracked.
  - **Question Navigator card vertical density.** The top `QuestionNavigator` card consumes substantial vertical real-estate (`practice-session-page-view.tsx:230-236`). Distinct surface — file as DEBT-377 if the user wants it tracked.
  - **`Finish exam` dead-prop label** (`practice-session-page-view.tsx:267`). The exam-mode branch of `endSessionLabel` is unreachable in shipped flow because the header button is `!isExamMode`-gated. Cosmetic cruft, not a bug. Out of scope for DEBT-375; can be cleaned up alongside any future exam-header touch.
  - **Header layout refactor.** The tutor `End session` header button is preserved by design per First-Principles Framing.

## Acceptance

- Footer renders a primary `View Summary` button on the last tutor question in both pre-submit and post-submit states, calling `onEndSession`.
- `TutorActionBar` body splits into two sibling group `<div>`s with `data-testid="tutor-action-primary-group"` and `data-testid="tutor-action-secondary-group"`, mirroring the exam pattern.
- `Bookmark` is the only member of the secondary group, gated on `hasBooleanCorrectness(submitResult)`.
- Header `End session` button (`practice-view.tsx:391-413`) is bit-for-bit unchanged.
- `ExamActionBar` is bit-for-bit unchanged.
- All affected tests updated with stable, semantic assertions; no snapshot rewrites; no class-token assertions for purely presentational styles.
- CodeRabbit latest-head review on the implementation PR returns explicit `APPROVED` (not stale `CHANGES_REQUESTED` artifact).
- Full local gate green (typecheck + lint + unit + browser + integration + build, plus E2E if local environment supports it).
