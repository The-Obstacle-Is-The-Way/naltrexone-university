# DEBT-375: Tutor Session Action Bar Has No Terminal CTA On Last Question

**Priority:** P2
**Created:** 2026-05-02
**Status:** Resolved 2026-05-02 ([PR #303](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/303), merge commit `46ee667f`).
**Source:** Manual UX walkthrough of tutor session flow, 2026-05-02 (paired Q1 → Q2 → Q3 screenshot review showing last-question footer dead-end forcing scroll-to-header to leave the session)
**Related:**

- [DEBT-363 Exam shell scroll model and dual-CTA disambiguation](./debt-363-exam-shell-scroll-model-and-dual-cta.md) — Concern 2 dropped the `Finish exam` header button in exam mode so the footer `Review & Submit` became the single primary CTA. Establishes the precedent for action-bar consolidation; this ticket extends the same idea to tutor mode without removing the tutor header (justified below in First-Principles Framing).
- [DEBT-365 Exam flow affordance and label consistency](./debt-365-exam-flow-affordance-and-label-consistency.md) — set the exam-flow footer grouping pattern this ticket parallels. DEBT-365 explicitly kept tutor mode out of scope; DEBT-375 applies the same navigation-primary / metadata-secondary discipline to tutor mode for the first time.
- [DEBT-372 Post-exam review summary button label divergence](./debt-372-post-exam-review-summary-button-label-divergence.md) — established `View Summary` as the canonical vocabulary for "go to the Session Summary screen". This ticket adopts that label for the new tutor terminal CTA.
- [DEBT-360 Action bar below fold](./debt-360-action-bar-below-fold.md) — provides the historical `[data-testid="bottom-action-bar"]` selector and footer-discoverability context. Its viewport-bounded shell was later reverted by DEBT-363; DEBT-375 renders inside the current document-flow footer.
- [DEBT-318 Tutor bookmark before answer](./debt-318-tutor-bookmark-before-answer.md) — established that Bookmark renders only after feedback is visible. This ticket preserves that policy.

**Audit verified:** 2026-05-02 against `7d154f96` (doc), independently re-verified post-merge against `46ee667f`.

---

## Resolution

Shipped Option α in [PR #303](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/303) (merge commit `46ee667f`, 2026-05-02). The tutor session footer now renders a `View Summary` terminal CTA on the last question instead of the invisible `ActionBarSpacer`, restructured into exam-parallel two-group layout: `tutor-action-primary-group` (`Previous · Submit · Next/View Summary`) and `tutor-action-secondary-group` (`sm:ml-auto`, `Bookmark` only). `View Summary` uses `variant="outline"` pre-submit and `variant="default"` post-submit, mirroring the existing `Next` pattern at `practice-view.tsx:151`. Header `End session` button preserved bit-for-bit on first-principles grounds — tutor's self-paced learning value prop justifies a persistent bail-cheap affordance that exam mode (post DEBT-363 Concern 2) deliberately doesn't have.

Production changes were intentionally limited to `app/(app)/app/practice/components/practice-view.tsx` (+36/-4): `TutorActionBarProps` extended with `'onEndSession'`, `TutorActionBar` body restructured into navigation + secondary group `<div>`s, terminal `ActionBarSpacer` branch replaced with a conditional `View Summary` button (preserving the `ActionBarSpacer` fallback when `onEndSession` is undefined for ad-hoc Quick Practice surfaces), and `onEndSession={props.onEndSession}` passed into `<TutorActionBar />`. Header (lines 391–413), `ExamActionBar` (lines 192–269), `ActionBarSpacer` definition (lines 88–90), `endSessionLabel` plumbing (`practice-session-page-view.tsx:267`), and the outer `bottom-action-bar` wrapper are unchanged.

Verification and review state:

- Local full gate green: `pnpm typecheck`, `pnpm lint` (19 expected warn-only `nursery/noExcessiveLinesPerFile` warnings on legacy oversized tests), `pnpm test --run` 302/302 files / 2,399 tests, `pnpm test:browser` 47/47 files / 242 tests, `pnpm test:integration` 16/16 files / 97 tests, `pnpm build`, and `pnpm test:e2e` 35/35.
- Tests updated across 5 files plus E2E (`practice-view-navigation.test.tsx`, `practice-view-answer-feedback.test.tsx`, `practice-view.browser.spec.tsx`, `practice-session-page-view-question-navigation.browser.spec.tsx`, `tests/e2e/practice.spec.ts`) with region-scoped queries via the new `data-testid`s; behavioral routing assertion (`onEndSession` called once AND `onNextQuestion` NOT called); variant-state assertions via `data-variant`; fallback coverage when `onEndSession` is undefined; no snapshot rewrites; no `.first()` / `.nth()` shortcuts; no internal `vi.mock()`.
- A11y preserved: secondary group is an unnamed `<div>` (no a11y noise when empty); `View Summary` is keyboard-reachable; `Bookmark` `aria-pressed` retained.
- CodeRabbit latest-head review on `653f2da6` returned explicit `APPROVED` with body `"No actionable comments were generated in the recent review."` Zero defended nits; no CR churn.
- TDD trail caveat: implementation bundled into a single commit (`653f2da6`); the red → green → refactor cycle was followed locally per the executing agent's report but is not preserved in published commit history. Acceptable per `.claude/rules/testing.md` (the TDD mandate requires the cycle, not commit-per-cycle); honest A− self-grade for cadence, A on artifact quality.
- Independent post-merge verification confirmed surgical production diff (+36/-4 across `practice-view.tsx`), test-routing fidelity, scoped selectors, header preservation, `ExamActionBar` preservation, and zero new regressions in NONE-impact test files. Active register reduces 4 → 3.

---

## Audit Notes

Deep source audit on `7d154f96` verified the central bug and implementation path:

- `ActionBarSpacer` is exactly `return <span aria-hidden="true" className="h-9 min-w-24" />;` at `practice-view.tsx:88-90`.
- `TutorActionBarProps` at `practice-view.tsx:92-109` does not currently include `onEndSession`; the implementation must add it to the existing `Pick<PracticeViewProps, ...>` union.
- The active tutor footer erases the terminal slot with `hasNextQuestion === false ? <ActionBarSpacer /> : <Button>Next</Button>` at `practice-view.tsx:146-158`.
- `PracticeSessionPageView` already passes `onEndSession={props.onEndSession}` into `PracticeView` at `practice-session-page-view.tsx:268`; the missing hop is only `PracticeView` → `TutorActionBar`.
- `PracticeViewProps.onEndSession?: () => void` at `practice-view.tsx:41`, so `onClick={props.onEndSession}` is type-correct after narrowing.
- DEBT-363 did drop the active exam `Finish exam` header button by gating it behind `!isExamMode`; DEBT-372 did standardize `View Summary` on the post-exam review summary-navigation path; DEBT-318 did establish post-feedback-only tutor Bookmark timing; DEBT-360 is historical context only after DEBT-363 reverted its viewport-bounded shell.

Corrections from the audit are already reflected in this document:

- DEBT-365 is cited as an **exam-flow footer grouping precedent**, not as an existing tutor/per-mode contract.
- DEBT-360 is cited as **historical bottom-action-bar context**, not as a still-active viewport-bounded shell.
- The new tutor terminal CTA must preserve the existing `Next` slot's visual hierarchy: `variant={props.submitResult ? 'default' : 'outline'}`. It must **not** become a second primary button beside `Submit` before the user submits the last answer.
- The out-of-scope question-navigator density citation points to the actual `QuestionNavigator` card at `exam-review-view.tsx:52-57`, invoked from `practice-session-page-view.tsx:229-236`.

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

`ActionBarSpacer` (`practice-view.tsx:88-90`) is an invisible fixed-size placeholder (`h-9`, `min-w-24`):

```tsx
function ActionBarSpacer() {
  return <span aria-hidden="true" className="h-9 min-w-24" />;
}
```

So on the last tutor question (`hasNextQuestion === false`), the slot where every other question shows `Next` instead renders nothing visible. There is no `View Summary`, no `Finish session`, no `Done` — nothing that advances the user to the Session Summary screen from the footer.

Walked through the screenshot evidence:

- **Q1 of 3, post-submit:** visible footer controls are `Next` (filled, primary) + `Bookmark`. Works.
- **Q2 of 3, pre-submit (answer selected):** visible footer controls are `Previous` + `Submit` + `Next`. Works.
- **Q3 of 3, pre-submit (answer selected):** visible footer controls are `Previous` + `Submit`. **`Next` slot is rendered as `ActionBarSpacer` — an empty invisible slot to its right.**
- **Q3 of 3, post-submit (feedback shown):** visible footer controls are `Previous` + `Bookmark`. **No terminal CTA. The user must scroll up to the header `End session` button to leave the session.**

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
- **Vocabulary already exists; just not used here.** `View Summary` was standardized in DEBT-372 as the canonical label for "go to Session Summary screen". The post-exam review surface still uses it in both the score-banner card and the final-question footer. Adopting the same label in tutor preserves cross-surface label consistency.

## First-Principles Framing

Tutor and exam modes have different value propositions, and their action-bar affordances should differ accordingly:

- **Exam mode = commitment.** The student sat down to test themselves across N questions. DEBT-363 Concern 2 deliberately removed the header `Finish exam` to force the natural path through `Next → Next → Review & Submit`. Bailing requires intent (top-nav back to Dashboard). This is correct: exam should make bailing slightly costly because uncommitted submissions corrupt the assessment signal.
- **Tutor mode = self-paced learning.** The student is here to learn one question at a time. Bailing at Q2 of 10 is a normal end-state, not a failure. A persistent header `End session` affordance has real value here — it lets students leave without friction when they're done absorbing what they wanted to absorb.

The header `End session` button in tutor mode is therefore **not a layout mistake**; it is the correct affordance for a self-paced learning surface. Removing it for the sake of exam-shaped symmetry would sacrifice tutor mode's bail-cheap principle for visual neatness.

The actual bug is narrower: the **footer is missing the natural completion CTA** on the last question. Header `End session` ("I'm done early, take me out") and footer `View Summary` ("I've finished the last question, take me to my results") serve different purposes and can coexist. The fix is to add the missing footer CTA, not to relocate the header bail.

This is not a contradiction of DEBT-372. DEBT-372 fixed two post-exam-review controls that were both summary-navigation affordances within the same review stage. In tutor mode, the persistent header `End session` is an always-available escape hatch on Q1 through QN, while the footer `View Summary` exists only in the terminal `Next` slot on Q-last. The two controls call the same handler, but their placement and timing communicate different user intent: bail now vs. finish the question sequence.

## Options

### Option α (recommended): Add `View Summary` last-question CTA + adopt exam's two-group footer template; keep header `End session` unchanged

Production change in `app/(app)/app/practice/components/practice-view.tsx`:

1. Extend `TutorActionBarProps` (currently `Pick<PracticeViewProps, ...>` at lines 92–109) to additionally pick `'onEndSession'`.
2. Restructure `TutorActionBar`'s body (lines 117–173) into two sibling groups, mirroring the exam pattern at lines 206–266:
   - **Primary navigation group** wrapped in `<div className="flex flex-wrap items-center gap-3" data-testid="tutor-action-primary-group">` containing `Previous`, `Submit` (when no `submitResult`), and the new `Next`/`View Summary` slot.
   - **Secondary group** wrapped in `<div className="flex flex-wrap items-center gap-3 sm:ml-auto" data-testid="tutor-action-secondary-group">` containing `Bookmark` (preserving the existing `hasBooleanCorrectness(submitResult)` gate from line 160 so post-feedback-only visibility is unchanged).
   - Render the secondary group as a stable sibling even when `Bookmark` is absent; it may be empty pre-feedback. This adds no accessible noise because the group is an unnamed `div`, and it keeps the footer template stable across tutor states.
3. Replace the `ActionBarSpacer` branch at lines 146–148 with a `View Summary` button when `hasNextQuestion === false` and `onEndSession` is defined. Preserve the current `Next` slot's variant hierarchy: outline before feedback, default after feedback. This avoids rendering two primary buttons (`Submit` and `View Summary`) side-by-side before the final answer is submitted.

```tsx
{props.hasNextQuestion === false ? (
  props.onEndSession ? (
    <Button
      type="button"
      variant={props.submitResult ? 'default' : 'outline'}
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

The `props.onEndSession ?` inner ternary preserves the spacer fallback for the legitimate edge case where `PracticeView` is rendered without an `onEndSession` handler (for example, ad-hoc Quick Practice). The shipped session route always passes `onEndSession` (`practice-session-page-view.tsx:268`), so the live tutor-session flow always renders the button.

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
| Q1 | pre-submit | `Submit · Next` (`Next` outline) | _empty_ |
| Q1 | post-submit | `Next` (default) | `Bookmark` |
| Q2 | pre-submit | `Previous · Submit · Next` (`Next` outline) | _empty_ |
| Q2 | post-submit | `Previous · Next` (default) | `Bookmark` |
| Q3 (last) | pre-submit | `Previous · Submit · View Summary` (`View Summary` outline) | _empty_ |
| Q3 (last) | post-submit | `Previous · View Summary` (`View Summary` default) | `Bookmark` |

`View Summary` is enabled regardless of submit state, consistent with the existing tutor-mode behavior of allowing `Next` clickability before submit on Q1 / Q2. It is not visually promoted to the primary/default variant until feedback exists. Whether tutor mode should allow pre-submit forward navigation at all is a separate, deliberately out-of-scope concern flagged below.

### Option β (rejected): Move `End session` into the footer as a persistent secondary control; drop the header button

This achieves layout symmetry with exam but sacrifices the bail-cheap affordance described in First-Principles Framing. Tutor footer would gain a third concept (navigate / commit / bail) and the header would lose the persistent escape. Self-paced learners who want to leave mid-session would see a busier footer in exchange for no functional gain.

### Option γ (rejected): Drop `End session` entirely; force mid-session bail through the top-nav

Maximum mirror of exam mode but removes tutor's bail-cheap value entirely. Students who want to leave at Q3 of 10 would have to navigate via the top-nav `Dashboard` link, which reads as "leave the entire app section" rather than "leave this session". Loss of intent fidelity.

## Recommendation

**Option α.** Minimal-scope production diff that fixes the actual bug (missing terminal CTA), aligns the tutor footer structurally with exam, and preserves the deliberately tutor-specific persistent header bail.

## Production Diff Spec

Single production file: `app/(app)/app/practice/components/practice-view.tsx`. Expected diff is small: extend the tutor props pick, restructure the tutor footer body into two groups, replace the terminal spacer branch with the `View Summary` button, and pass `onEndSession` through. Do not touch any other production file.

1. **`TutorActionBarProps` (lines 92–109):** add `'onEndSession'` to the `Pick<PracticeViewProps, ...>` union.
2. **`TutorActionBar` body (lines 111–174):** restructure into navigation + secondary groups as specified above. Replace the conditional `ActionBarSpacer` branch with the `View Summary` button (preserving spacer fallback when `onEndSession` is undefined).
3. **`PracticeView` `actionBar` JSX (lines 350–367):** pass `onEndSession={props.onEndSession}` into the `<TutorActionBar />` instantiation.
4. **No other production files touched.**

Header (`practice-view.tsx:391-413`), `ExamActionBar` (lines 192–269), `ActionBarSpacer` (lines 88–90), `endSessionLabel` plumbing (`practice-session-page-view.tsx:267`), and the `bottom-action-bar` outer container are **unchanged**.

## Test Impact

The audit agent should grep these files and verify which assertions need to change. Estimated scope (verify before committing):

| File | Likely impact |
|------|---------------|
| `app/(app)/app/practice/components/practice-view-navigation.test.tsx` | **HIGH.** Direct tutor action-bar contract. Update `hides Next when hasNextQuestion is false` to the new fallback split: without `onEndSession`, no `View Summary`; with `onEndSession`, last-question `View Summary` appears. Add pre-submit and post-submit label-order assertions for `Previous · Submit · View Summary` and `Previous · View Summary · Bookmark` (or primary/secondary group scoped equivalents). Assert pre-submit `View Summary` has `data-variant="outline"` and post-submit has `data-variant="default"`. |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | **MEDIUM/HIGH.** Broad interactive coverage. Add a focused browser test that renders a last tutor question with `onEndSession`, clicks bottom-bar `View Summary`, and verifies `onEndSession` fires. Add group-data-testid visibility/containment coverage for `tutor-action-primary-group` and `tutor-action-secondary-group`. |
| `app/(app)/app/practice/components/practice-view-answer-feedback.test.tsx` | **MEDIUM.** Existing last-tutor-question fixture at lines 132–177 currently only asserts `Review answers` absence. Update it to assert the post-submit `View Summary` terminal CTA and preserve the negative `Review answers` assertion. |
| `app/(app)/app/practice/components/practice-view-layout.test.tsx` | **NONE.** No active tutor footer fixture; the empty-state `Finish exam` test is out of scope. Do not churn this file unless the implementation accidentally affects empty-state behavior. |
| `app/(app)/app/practice/components/practice-view-exam-actions.test.tsx` | **NONE.** Exam-only. Should be unchanged; existing exam grouping and `Review & Submit` contracts are guardrails against accidental regression. |
| `app/(app)/app/practice/components/practice-view-bookmarks.test.tsx` | **LOW.** Not in the original table, but it verifies post-feedback tutor Bookmark timing from DEBT-318. Usually no change needed; if tests are added for the new secondary group, assert Bookmark remains hidden pre-feedback and remains the only secondary-group button post-feedback. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-active-question.browser.spec.tsx` | **LOW.** Active tutor header `End session` assertion only. Header is unchanged; this file should continue to pass untouched. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-question-navigation.browser.spec.tsx` | **HIGH.** Existing last-tutor-question test asserts `Next` is absent at lines 386–457. Update/add coverage so the last available tutor question renders bottom-bar `View Summary` when `onEndSession` is wired and clicking it calls `onEndSession` rather than `onNextQuestion`. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-review-stage.browser.spec.tsx` | **LOW.** Review/error-stage `End session`, not active tutor footer. Verify untouched. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-results.browser.spec.tsx` | **NONE.** Results/post-exam summary surfaces only. Verify untouched. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-focus-restoration.browser.spec.tsx` | **NONE.** Exam navigation/focus coverage only. Do not add tutor terminal coverage here unless implementation changes focus restoration semantics (it should not). |
| `app/(app)/app/practice/[sessionId]/page.test.tsx` | **LOW.** Static shell asserts `End session` at line 116 and has no tutor last-question fixture. Header is unchanged; add no assertion unless a real last-tutor-question fixture already exists or is introduced for another reason. |
| `tests/e2e/practice.spec.ts` | **MEDIUM.** The first tutor E2E currently ends via the header `End session` after Q1. Preserve that header escape test if desired, but add or adjust a tutor-flow path that walks to Q-last and clicks bottom-bar `View Summary` as the terminal action. The long-feedback tutor scroll test can remain focused on document-flow footer visibility unless it is expanded to cover Q-last. |

Test discipline reminders:

- **Fakes over mocks.** Use existing fakes from `src/application/test-helpers/fakes/`. No `vi.mock()` of internal modules.
- **`renderToStaticMarkup` + `// @vitest-environment jsdom`** for `*.test.tsx` static-HTML coverage.
- **`vitest-browser-react`** for `*.browser.spec.tsx`. `{ spy: true }` if any controller mocking is needed (see DEBT-368).
- **Region-scoped queries.** Use `[data-testid="tutor-action-primary-group"]` / `[data-testid="tutor-action-secondary-group"]` / `[data-testid="bottom-action-bar"]` to scope assertions inside the action bar.
- **Stable selectors.** `getByRole('button', { name: 'View Summary' })` over class-token assertions.
- **Variant assertions are behavioral here.** It is acceptable to assert `data-variant="outline"` before submit and `data-variant="default"` after submit because `Button` exposes `data-variant` as a stable component contract and this ticket explicitly preserves primary-action hierarchy.
- No snapshot rewrites. No `.first()` / `.nth()` shortcuts.

## Verification

Local pre-push gate (must run before push, not just before PR):

```bash
pnpm db:test:up
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:migrate
SEED_INCLUDE_PLACEHOLDERS=true DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:seed
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
  - **Pre-submit `Next` clickability in tutor mode.** The current `TutorActionBar` allows clicking `Next` before submitting on Q1 / Q2 (`practice-view.tsx:146-158`; the button is disabled only by loading/pending state, not by `submitResult`). DEBT-375 intentionally preserves that behavior for the new terminal slot by rendering pre-submit `View Summary` as an outline button. Whether tutor mode should force feedback before forward navigation is a real concern, but it is distinct — file as DEBT-376 if the user wants it tracked.
  - **Question Navigator card vertical density.** The top `QuestionNavigator` card consumes substantial vertical real estate (`exam-review-view.tsx:52-57`, invoked from `practice-session-page-view.tsx:229-236`). Distinct surface — file as DEBT-377 if the user wants it tracked.
  - **`Finish exam` dead-prop label** (`practice-session-page-view.tsx:267`). The exam-mode branch of `endSessionLabel` is unreachable in shipped flow because the header button is `!isExamMode`-gated. Cosmetic cruft, not a bug. Out of scope for DEBT-375; can be cleaned up alongside any future exam-header touch.
  - **Header layout refactor.** The tutor `End session` header button is preserved by design per First-Principles Framing.

## Acceptance

- Footer renders a terminal `View Summary` button on the last tutor question in both pre-submit and post-submit states, calling `onEndSession`.
- Pre-submit `View Summary` uses `variant="outline"` so `Submit` remains the sole primary/default action. Post-submit `View Summary` uses `variant="default"` so the terminal completion action becomes primary after feedback is visible.
- `TutorActionBar` body splits into two sibling group `<div>`s with `data-testid="tutor-action-primary-group"` and `data-testid="tutor-action-secondary-group"`, mirroring the exam pattern.
- `Bookmark` is the only member of the secondary group, gated on `hasBooleanCorrectness(submitResult)`.
- `PracticeView` rendered without `onEndSession` still falls back to `ActionBarSpacer` on the last non-exam question; Quick Practice / ad-hoc surfaces do not grow a dead `View Summary` button.
- Header `End session` button (`practice-view.tsx:391-413`) is bit-for-bit unchanged.
- `ExamActionBar` is bit-for-bit unchanged.
- All affected tests updated with stable, semantic assertions; no snapshot rewrites; no class-token assertions for purely presentational styles.
- CodeRabbit latest-head review on the implementation PR returns explicit `APPROVED` (not stale `CHANGES_REQUESTED` artifact).
- Full local gate green (typecheck + lint + unit + browser + integration + build, plus E2E if local environment supports it).
