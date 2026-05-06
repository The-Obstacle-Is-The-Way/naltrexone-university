# DEBT-379: Exam Action Bar — Promote Primary CTA To Right Slot, Reposition Mark For Review

**Priority:** P3 (layout-only refactor in a single component; behavior unchanged)
**Created:** 2026-05-04
**Source:** Same UX walkthrough that produced DEBT-378 (Claude Design V3 variant pass on 2026-05-04). The user's first-principles reading: exam's terminal / forward CTA should own the footer's far-right eye-anchor, while `Mark for review` should remain available but move out of the footer's primary-action slot. At discovery, the exam footer put `Next` / `Review & Submit` in the left navigation cluster with `Mark for review` pushed right via `sm:ml-auto`.
**Related:** [DEBT-378 Tutor — drop Submit button (choice click commits) (archived)](../_archive/debt/debt-378-tutor-drop-submit-button-choice-click-commits.md), [DEBT-365 Exam flow affordance and label consistency (archived)](../_archive/debt/debt-365-exam-flow-affordance-and-label-consistency.md), [DEBT-363 Exam shell scroll model and dual-CTA disambiguation (archived)](../_archive/debt/debt-363-exam-shell-scroll-model-and-dual-cta.md), [DEBT-361 Exam last-question Next label (archived)](../_archive/debt/debt-361-exam-last-question-next-label.md), [DEBT-330 Post-exam review action bar bookmark placement (archived)](../_archive/debt/debt-330-review-action-bar-bookmark-placement.md), [Pattern Registry](../frontend/pattern-registry.md), [Frontend Standards](../frontend/standards.md), [Practice Page Docs](../frontend/pages/practice.md)

**Status:** Open. Audit-refined 2026-05-04 against `e44b8380`; audit-corrected 2026-05-05 against `524c856e` after DEBT-378 landed. Implementation is in PR #307 against `dev`; final archive and Resolution text wait for the post-merge archive commit so the actual merge SHA can be cited. Visual re-grade evidence is captured under `artifacts/debt-379-visuals/`.

**Audit correction note (2026-05-05):** Current code has no header-rail assertions in `practice-view-layout.test.tsx`, and `docs/frontend/pattern-registry.md` has no dedicated exam action-bar or header-rail entries. Those tasks are **adds**, not updates. Existing deferred DEBT-379 rows in `docs/frontend/standards.md` and `docs/frontend/pages/practice.md` are updates.

---

## Context

Pre-implementation exam footer (`app/(app)/app/practice/components/practice-view.tsx:209-285`, `ExamActionBar`):

| Question | Primary group (left, `data-testid="exam-action-primary-group"`) | Secondary group (right, `sm:ml-auto`, `data-testid="exam-action-secondary-group"`) |
|----------|------------------------------------------------------------|----------------------------------------------------------------------------------|
| Q1 | `[Next]` filled | `[Mark for review]` outline |
| Q2 | `[Previous]` outline, `[Next]` filled | `[Mark for review]` outline |
| Q3 | `[Previous]` outline, `[Review & Submit]` filled | `[Mark for review]` outline |

`Next` / `Review & Submit` sat at the inside-right of the navigation cluster. `Mark for review` was pushed to the screen's right edge via `sm:ml-auto`.

Mark for review is a **metadata** action ("flag this question for me to revisit during review-and-submit"). It's not a primary CTA. It's not a navigation control. It's a per-question annotation. Its current right-edge position was shipped by DEBT-365 Concern 3A after borrowing DEBT-330's post-exam review grouping principle: navigation clustered left, metadata separated right. The decision was correct in isolation: nav and metadata are conceptually distinct, so they shouldn't visually mingle.

The unresolved question is: **which slot should the user's eye go to for the primary "act now" action?**

Modern form/dialog convention often puts the primary action at the end of the row. Refactoring UI's hierarchy guidance supports making the intended next action visually easier to find than secondary metadata. This is supporting rationale, not measured user-error proof: we do not currently have analytics showing students click Mark for review when they meant Next. The concrete evidence is the user's design walkthrough and visual discomfort with the right-edge metadata slot in the active exam footer.

The user's instinct in the V3 design pass was correct: the right slot should hold the "act now" CTA. The question this debt resolves is **what to do with Mark for review** when the right slot is reclaimed for the primary CTA, given the constraint that Mark for review must remain accessible on every exam question, including Q3.

---

## Why This Is Debt

### The right slot anchors the eye

In a footer with a left cluster and a right slot, the right slot can become the "action after reviewing" eye-anchor. When the right slot holds metadata (Mark for review) instead of the primary CTA (Next, Review & Submit), the layout asks the user to parse the whole row instead of following a simple end-of-row action pattern. That is the design concern this debt evaluates.

This is a hierarchy concern, not a proven behavioral bug. Keep the scope narrow: if the visual grade after DEBT-378 says exam still feels right with metadata right, this debt can be deferred without contradicting any shipped behavior.

### Cross-mode harmony

Once DEBT-378 ships (tutor drops Submit, footer becomes `[Previous][Next]` left cluster | `[Bookmark]` `sm:ml-auto` right post-feedback), tutor mode has the eye-anchor convention going *the other direction* than exam — except tutor doesn't have a primary CTA in the footer pre-feedback at all (the choice cards are the primary), and post-feedback the rightmost element is Bookmark (metadata).

Wait — that means **after DEBT-378**, tutor and exam have the SAME structure: navigation left, metadata right. The geometric harmony argument actually weakens once DEBT-378 ships, because both modes will have the same shape.

So the motivation for DEBT-379 is **not** "match tutor." DEBT-378 ships harmony. DEBT-379 is about **fixing exam mode itself** — relocating the primary CTA to the convention-correct slot, separately from tutor's redesign. If we shipped DEBT-378 alone, exam would still have the convention-incorrect right-slot-holds-metadata problem; this debt addresses that.

### Mark for review needs a home that doesn't compete with the primary CTA

Today, Mark for review is right-edge because that's where the metadata-secondary group lives. Once we promote the primary CTA to the right edge, Mark for review must go somewhere. Three honest options:

1. **Left of the primary CTA in the same row** — `[Previous]` left | `[Mark for review]` middle-right | `[Next/Review & Submit]` far-right. Tightens left cluster to just Previous; primary CTA owns the right edge; Mark for review sits adjacent to the primary CTA. Risk: visually adjacent to the primary, may compete or be misclicked.
2. **Header rail (icon button or short-label button)** — Mark for review moves out of the footer entirely and into the question header (above or beside the question stem). Frees the footer to be just navigation + primary CTA. Risk: discoverability — users may not look up to flag a question.
3. **Inline with the question stem** — Mark for review becomes an icon button anchored to the question card itself, similar to a bookmark icon on an article. Closest to the question content. Risk: visual clutter on the question card.

Three variants follow in the Options section. This document recommends Option B after the audit corrections below; implementation should not reopen the option set unless post-DEBT-378 visual grading rejects the header-rail direction.

### Mark for review is preserved on every question, including Q3

Hard constraint. Whatever placement is chosen, the affordance must render on Q1, Q2, and Q3. Q3 is the most important — students often want to flag a tough Q3 *while they're still on Q3*, before clicking through to Review & Submit. Removing it from Q3 would break the flagging workflow.

---

## Options

### Option A — Three-slot footer: Previous left, Mark for review middle-right, Primary CTA far-right

```
Q1: [empty]                  | [Mark for review]  | [Next filled]
Q2: [Previous]               | [Mark for review]  | [Next filled]
Q3: [Previous]               | [Mark for review]  | [Review & Submit filled]
```

Layout: `flex` with three slots. Previous on the left edge. Mark for review pushed via `sm:ml-auto` (or a flex grow spacer). Primary CTA on the right edge with its own `ml-3` (or similar) gap from Mark for review.

**Pros:**
- Primary CTA owns the right edge (convention-correct).
- Mark for review stays in the footer; no migration.
- Smallest production diff: only the order/spacing of the secondary group changes.

**Cons:**
- Two right-side affordances visually compete. Mark for review is outline, primary CTA is filled, so the hierarchy reads — but the gap between them must be generous (`ml-6` or larger if this fallback is ever chosen).
- Misclick risk on touch devices is real: Mark for review and Primary CTA are adjacent.
- Q1 has only one button (Next) but the footer must still left-justify Mark for review, so the empty Previous slot is felt as a layout gap. May or may not need a placeholder.

### Option B — Header rail: Mark for review moves to the question header

```
Footer:
  Q1: [empty]                                      | [Next filled]
  Q2: [Previous]                                   | [Next filled]
  Q3: [Previous]                                   | [Review & Submit filled]

Header (question card top, right side):
  Q1, Q2, Q3 (every question): [Mark for review icon button or short-label]
```

The exam header rail today has no buttons (DEBT-363 dropped the `Finish exam` header button). Adding Mark for review to the header creates parity with tutor's header rail (which has `End session`). Same architectural slot, same visual treatment.

**Pros:**
- Footer is purely navigation + primary CTA — clean three-zone layout (Previous, primary, nothing-else).
- Header rail is currently empty in exam mode; this gives it purpose.
- Conceptually correct: Mark for review is metadata about the current question, not navigation. Putting it adjacent to the question (header) is more honest than putting it adjacent to navigation (footer).
- Parallels tutor's header rail which holds `End session` (and may eventually hold Bookmark per future debt).

**Cons:**
- Discoverability: users have to look up to flag a question. The affordance may be less noticeable than a footer button because it moves out of the repeated action bar.
- Shipping a new button in the exam header is a slightly larger footprint than relocating in-footer.
- If users have learned the current right-edge Mark for review position, the change is a re-learn cost. (Counter: most users haven't learned it; the app is young.)

### Option C — Icon button anchored to the question card

```
Footer:
  Q1: [empty]                                      | [Next filled]
  Q2: [Previous]                                   | [Next filled]
  Q3: [Previous]                                   | [Review & Submit filled]

Question card top-right corner (every question):
  [bookmark/flag icon — toggles Mark for review state]
```

Icon button affixed to the question card itself, similar to a bookmark icon on a long-form article. Visual: a small flag/bookmark icon at top-right of the question stem.

**Pros:**
- Maximum closeness to the question content.
- Reinforces "this is metadata about THIS question, not about the session."
- Frees both footer and header from metadata responsibility.

**Cons:**
- Visual clutter on the question card (which today is clean except for the choice rows).
- Icon-only is less discoverable than a labeled button. We'd need a tooltip or aria-label, and screen-reader users still need a clear name.
- The icon must not be confused with a bookmark icon used on a different surface (post-exam review may have its own iconography).
- Larger production diff: touches the QuestionCard composite, which is shared with tutor mode.

### Recommendation

**Option B (header rail), pending post-DEBT-378 visual grade.** Reasons:

1. The exam header rail is currently empty — adding Mark for review fills a slot that has no other use.
2. Conceptually correct — metadata about the question lives adjacent to the question, not adjacent to navigation.
3. Parallels tutor's header rail; reduces cross-mode visual variance at the header level (both modes have a single-affordance header rail with mode-appropriate actions: tutor has `End session`, exam has `Mark for review`).
4. Discoverability concern is real but addressable with a short-label button (`Mark for review` text, not just an icon) and clear visual prominence.
5. Smallest cognitive load on the footer: footer becomes Previous on the left and the forward/terminal CTA on the right.

Option A (three-slot footer) is the safe-default if header-rail discoverability concerns prove decisive. Option C (icon on card) is the most ambitious; reject for this debt because it pushes the change into the QuestionCard composite, which is shared with tutor and would expand scope.

---

## The Refactor (assuming Option B)

### Exam footer — final spec

| Question position | Left group | Right CTA group (`sm:ml-auto`) |
|-------------------|------------|---------------------------------|
| Q1 | _suppressed_ | `[Next]` filled |
| Q2 | `[Previous]` outline | `[Next]` filled |
| Q3 | `[Previous]` outline | `[Review & Submit]` filled |

Mark for review moves out of the footer entirely.

### Exam header rail — final spec

A new button rendered on every exam question, positioned in the header rail at the right side (mirroring tutor's `End session` placement at `practice-view.tsx:402-413`). Add a stable selector to the header-action rail, e.g. `data-testid="question-header-actions"`, so tests can scope header-vs-footer assertions without class-token or position queries.

```tsx
const isHeaderActionDisabled =
  props.isPending || props.loadState.status === 'loading';

{props.onToggleMarkForReview && isExamMode ? (
  <Button
    type="button"
    variant="outline"
    className="rounded-full"
    aria-pressed={isMarkedForReview}
    disabled={props.isMarkingForReview || isHeaderActionDisabled}
    onClick={props.onToggleMarkForReview}
  >
    {isMarkedForReview ? 'Unmark review' : 'Mark for review'}
  </Button>
) : null}
```

Header rendering condition: `props.onToggleMarkForReview && isExamMode`. Tutor mode header keeps `End session` (no Mark for review since tutor doesn't have a `Mark for review` flow).

### `aria-describedby` on the Q3 primary CTA

The DEBT-361 annotation that connects the Q3 `Review & Submit` button to a hidden span with text `"Opens review and submit."` must continue to function after the move. The hidden span and the `aria-describedby` link travel with the button to its new right-slot position.

### Behavioral preservation

- Mark for review toggle behavior unchanged (calls `onToggleMarkForReview`, optimistic UI, etc.).
- `isMarkedForReview` state unchanged — same source, same semantics.
- The `aria-pressed` toggle state moves to the header button.
- Keyboard navigation order: tab order through the page should reach Mark for review after the navigator pills and before the question stem. Implementation must verify the natural DOM order after the move.

---

## Production Diff

### File 1: `app/(app)/app/practice/components/practice-view.tsx`

**`ExamActionBar` (lines 209-285):** restructure.

Removals:
- Lines 267-283 — entire secondary group containing Mark for review

Changes:
- Lines 223-260 — split left Previous group from right CTA group:
  - Render `Previous` in the left group only when it exists. Suppress the left group entirely on Q1 instead of rendering an empty flex row.
  - Render Next / Review & Submit in a separate right CTA group with `sm:ml-auto`.
  - Maintain the `isLastSessionQuestion` branching for Next ↔ Review & Submit label flip and the `aria-describedby` link.
- Update `data-testid` attributes:
  - Keep `exam-action-primary-group` for the left Previous group when rendered.
  - Add `exam-action-cta-group` for the right CTA group.
  - `exam-action-secondary-group` testid is deleted (no secondary group in the footer anymore).

**Header rail JSX (lines ~385-423):** add a new exam-mode Mark for review button.

Today lines 401-423 contain the header action rail: tutor mode renders `End session` at lines 402-413 when `props.onEndSession && !isExamMode`, and the fallback back link renders only when `!props.onEndSession`. Exam mode with `onEndSession` renders no header button today. Add a sibling exam-only `Mark for review` / `Unmark review` block in that rail, gated by `isExamMode && props.onToggleMarkForReview`. The header layout already has flex space for a single right-side button in each mode. Add `data-testid="question-header-actions"` to the rail wrapper for scoped assertions.

**Props:**
- `ExamActionBarProps` (lines 193-207) — drops `isMarkingForReview`, `isMarkedForReview`, `onToggleMarkForReview`.
- `PracticeViewProps` already has `isMarkingForReview?: boolean` and `onToggleMarkForReview?: () => void` at `practice-view.tsx:34,44`.
- `isMarkedForReview` is not a top-level prop; it is derived from `sessionInfo` at `practice-view.tsx:292` and should be reused by the header button.

### File 2: parent components / page views that pass props to `PracticeView`

Check for any caller that threads Mark-for-review props specifically to `ExamActionBar`. After the refactor, those props go to the page-level header rail instead. `PracticeViewProps` already has the required top-level `isMarkingForReview` and `onToggleMarkForReview`; the internal threading changes, not the external prop contract.

Files to verify:
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`
- `app/(app)/app/practice/quick/quick-practice-client.tsx` has no exam mode entry and no Mark-for-review flow; verify it remains untouched.

### Summary of production changes

| File | Lines (approx) | Change type |
|------|----------------|-------------|
| `practice-view.tsx` ExamActionBar | 209-285 | Restructure: drop secondary group, promote primary CTA to right slot |
| `practice-view.tsx` header rail | ~385-423 | Add exam-mode Mark for review button alongside tutor `End session` |
| Total | ~80-120 lines touched | Net flat or small positive (header gains > footer loses) |

Choice button, QuestionCard, controllers, repositories, use cases: zero changes.

---

## Test Diff

### Unit tests

**`practice-view-exam-actions.test.tsx`:**

- Lines 15-64 — Q1 exam action bar, asserts `['Next', 'Mark for review']` — **REWRITE**: Q1 footer asserts `['Next']` only; new test asserts header Mark for review exists.
- Lines 66-109 — Q3 exam action bar, asserts `['Previous', 'Review & Submit', 'Mark for review']` — **REWRITE**: Q3 footer asserts `['Previous', 'Review & Submit']`; new test asserts header Mark for review exists on Q3.
- Lines 111-162 — primary/secondary group separation — **REWRITE**: assert footer has no secondary group; assert header rail has the Mark for review button.
- Lines 164-206 — `aria-describedby` Q3 annotation — **KEEP** (annotation travels with the button to its new right-slot position; test should still pass with possible selector updates).
- Lines 208-249 — non-final exam question with `hasNextQuestion=false`, asserts `['Next', 'Mark for review']` — **REWRITE**: footer asserts `['Next']`; header asserts Mark for review exists.
- Lines 251-284 — no Submit in exam mode — **KEEP**.
- Lines 286-376 — draft-selection label stability, asserts footer `['Previous', 'Next', 'Mark for review']` — **REWRITE**: footer asserts `['Previous', 'Next']` for both states; header assertions cover Mark for review.

Add new tests:
- Header rail in exam mode renders `Mark for review` on Q1, Q2, Q3.
- Header rail in exam mode renders `Unmark review` when `sessionInfo.isMarkedForReview === true`.
- Header rail in tutor mode does NOT render `Mark for review` (tutor doesn't have this flow).
- Header rail in tutor mode continues to render `End session` (regression guard).
- Footer in exam mode does NOT render `Mark for review` (negative assertion).
- Mark for review `aria-pressed` toggles correctly when clicked from the header position.
- Mark for review disabled state respects `isMarkingForReview`, `props.isPending`, and `loadState.status === 'loading'`.
- Q3 primary CTA lives in `data-testid="exam-action-cta-group"` and preserves `data-variant="default"`.

**`practice-view-layout.test.tsx`:**

- Current file has no `exam-action-secondary-group`, `question-header-actions`, `Mark for review`, or header-rail assertions at `524c856e`.
- **ADD** focused layout assertions that the header action rail exposes `data-testid="question-header-actions"` and contains a single exam-mode Mark/Unmark button. Do not assert it appears alongside `End session`; exam mode has no header `End session`.
- Preserve the existing page layout assertions (top content, below-heading content, aria-live, question-panel wiring, terminal session action rendering).

### Browser specs

**`practice-view.browser.spec.tsx`:**

- Tests asserting Mark for review click behavior in the exam footer — **MOVE** the click target to the header rail.
- Lines 87-116 — Mark for review click behavior — move the click target to the header rail.
- Lines 118-176 — exam bottom action bar currently asserts global Mark for review visibility — update to prove the footer has no Mark button and the header rail has it.
- Lines 254-343 — loading disabled state for Mark for review — move the assertion to the header rail.
- Lines 573-623 — Review & Submit click in exam Q3 — verify the click still works after the right-slot move; selector should scope to `exam-action-cta-group` or the bottom action bar's CTA group.

### Integration tests

None expected. `Mark for review` toggling goes through the use-case layer, which doesn't change.

### E2E tests

**`tests/e2e/practice.spec.ts`:**

- Exam walkthrough: any step that clicks or scopes `Mark for review` to `bottom-action-bar` must update to the header rail. Current global visibility assertions may still pass, but add at least one scoped assertion proving `bottom-action-bar` no longer contains Mark for review and `question-header-actions` does.

### Test count summary

| Test type | Files affected | Assertions changed (estimate) |
|-----------|----------------|-------------------------------|
| Unit | 2 | 18-30 |
| Browser | 1-2 | 8-15 |
| Integration | 0 | 0 |
| E2E | 1 | 4-8 |
| **Total** | **4-5 files** | **~30-50 assertions** |

Smaller surface than DEBT-378.

---

## Design Doc Diff

### `docs/frontend/pattern-registry.md`

- **ADD** a dedicated active exam action-bar entry. No dedicated exam action-bar entry exists at `524c856e`; do not just append a sentence to an unrelated table row. The new entry must document Previous in the left group, `Next` / `Review & Submit` in `data-testid="exam-action-cta-group"` with `sm:ml-auto`, and no footer Mark-for-review button.
- **ADD** a dedicated question header rail / persistent header action entry. No dedicated header-rail pattern exists at `524c856e`; the only related references are the Button Variant Usage Guide around lines 539-553 and the generic responsive note around line 1225. The new entry must document tutor-mode `End session` and exam-mode `Mark for review` as mode-specific single-button header rail actions.
- **Mark for review entry:** if one is created during this work, document that active-exam placement is the question header rail, not the footer.

### `docs/frontend/standards.md`

- **Action bar / Button placement table:** exam row(s) updated. Do not generalize this to tutor; DEBT-378 keeps tutor post-feedback navigation clustered left with Bookmark right.
- **Primary CTA position section:** add the exam-specific rule: "In active exam mode, the footer right CTA group holds the forward/terminal action (`Next` / `Review & Submit`), while `Mark for review` lives in the question header rail. Tutor mode remains governed by DEBT-378: choice cards are the primary pre-feedback action, and post-feedback navigation remains left-clustered."

### `docs/frontend/pages/practice.md`

- **Action Bar subsection:** rewrite the exam table to reflect the new structure (Previous left, primary CTA right, Mark for review in header).
- **Header Rail subsection (new):** if not already present, add. Document tutor's `End session` and exam's `Mark for review`.

### Archived debt docs

Do not edit archived DEBT-330 / DEBT-365 during implementation. Capture the historical change in this DEBT-379 resolution section after merge, and update current frontend docs (`pattern-registry.md`, `standards.md`, `pages/practice.md`) as the living source of truth.

---

## Edge Cases & Implementation Notes

### Tab order after Mark for review moves to header

After the move, the keyboard tab order should be: navigator pills → header rail Mark for review → question stem → choice buttons → footer Previous → footer primary CTA. Verify this is the natural DOM order; avoid positive `tabIndex` unless there is no semantic alternative.

### Mobile responsive

The header rail on small viewports must have room for Mark for review without crowding. Today the rail is uncluttered in exam mode. Verify Mark for review fits at all breakpoints, and that it doesn't push the question title below the fold on the smallest supported viewport.

### Aria-pressed semantics

The toggle state moves with the button. `aria-pressed` continues to reflect `isMarkedForReview`. No screen-reader semantic change.

### Q1 footer with empty Previous slot

When Q1 renders, there's no Previous button. The footer becomes `[empty left] | [Next filled right]`. The flex layout must still left-justify the (empty) primary group and right-justify the primary CTA via `sm:ml-auto`. Confirm visual treatment doesn't produce an awkward gap.

### Visual hierarchy of header rail with two buttons

In tutor mode, the header rail carries only `End session`. After this refactor, exam mode's header rail carries only `Mark for review`. Both are single-button rails. Future debts could add more buttons (e.g., session timer, progress indicator) — design the rail to accommodate that without re-architecture.

### `aria-describedby` for Q3 primary CTA

The hidden span containing `"Opens review and submit."` must travel with the Q3 primary CTA. The id reference must remain valid after the JSX restructure.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Header rail discoverability — users may not find Mark for review in the header | Use a labeled button (`Mark for review` text, not icon-only). Visual QA on six exam states. Track click-through rate post-launch via existing telemetry; if rate drops vs pre-refactor baseline, file follow-up. |
| Mobile layout crowding in header rail at small viewports | Visual QA at breakpoints (sm/md/lg). If crowding emerges, stop and report; do not silently switch to icon-only because that changes discoverability and test expectations. |
| Keyboard tab order regression | Audit explicitly. The natural DOM order should put header before question stem before footer; verify and adjust if needed. |
| Test refactor drift across 4-5 files (~30-50 assertions) | Implementation god prompt should produce exact edit blocks per file. CR will catch residual drift. |
| Q1 footer with empty primary group visually feels broken | Suppress the empty `data-testid="exam-action-primary-group"` wrapper when no Previous button renders; only `exam-action-cta-group` should render on Q1. |
| `aria-describedby` linkage breaks during JSX restructure | Both the hidden span and the button stay in `ExamActionBar`. The `id` constant is local to the component. Restructure preserves linkage by keeping them in the same render tree. |

---

## Acceptance Criteria

Production:

- `app/(app)/app/practice/components/practice-view.tsx`:
  - `ExamActionBar` no longer renders a secondary group containing Mark for review.
  - Primary CTA (Next / Review & Submit) is rendered in a `sm:ml-auto` right slot.
  - Right CTA group has stable selector `data-testid="exam-action-cta-group"`.
  - Q1 suppresses the empty `exam-action-primary-group`; Q2/Q3 render it with `Previous`.
  - Q3 primary CTA's `aria-describedby` link to its hidden description span is preserved.
  - Header rail JSX gains an exam-mode-only Mark for review button (gated on `isExamMode && props.onToggleMarkForReview`).
  - Header action rail has stable selector `data-testid="question-header-actions"`.
- Tutor mode footer and tutor mode header: zero changes (DEBT-378 handles tutor; DEBT-379 leaves it alone).
- `aria-pressed` on the Mark for review button correctly reflects `isMarkedForReview`.
- Mark button label preserves current behavior: `Mark for review` when false, `Unmark review` when true.
- Disabled state on the Mark for review button respects `isMarkingForReview`, `props.isPending`, and `loadState.status === 'loading'`.

Tests:

- All exam Q1/Q2/Q3 footer assertions updated to expect right-slot primary CTA and absent Mark for review.
- All exam header rail assertions updated to expect Mark for review on Q1/Q2/Q3.
- Negative assertions:
  - Exam footer does NOT contain a button named `Mark for review`.
  - Tutor header does NOT contain a button named `Mark for review`.
  - Tutor footer is unchanged from DEBT-378's spec (regression guard).
- New positive assertions:
  - Q3 primary CTA's `aria-describedby` link still resolves to a span containing `"Opens review and submit."`
  - Exam Q1 footer right slot is `[Next]` filled.
  - Exam Q3 footer right slot is `[Review & Submit]` filled.
  - Exam marked state renders `Unmark review` in the header and `aria-pressed="true"`.
- E2E `tests/e2e/practice.spec.ts` exam flow updated to click Mark for review from the header position.

Docs:

- Pattern Registry exam action bar / header rail entries added.
- Standards.md primary-CTA-position consolidation rule documented.
- pages/practice.md exam Action Bar subsection rewritten.
- This DEBT-379 doc moves to `_archive/debt/` with Resolution section.
- Debt index updated.

Quality gates:

- Local full gate green (typecheck, lint, unit, browser, integration, build, E2E).
- CodeRabbit explicit `APPROVED`.
- Visual QA on active exam states: Q1, Q2, Q3 desktop and mobile; include marked and unmarked header states. There is no active-exam post-feedback state.

---

## Out of Scope

- **Tutor mode changes** — DEBT-378 owns tutor. This debt does not touch tutor footer or tutor header beyond preserving the existing `End session` block.
- **Question card changes** — `QuestionCard` and `ChoiceButton` are not touched. Mark for review does not become an icon on the card (Option C rejected).
- **Renaming `Mark for review`** — label stays as-is. If a future product decision unifies the label across surfaces (e.g., to `Flag question`), file separately.
- **Analytics/telemetry on Mark for review clicks** — verify the existing event still fires from the header position; do not add new instrumentation.
- **Keyboard shortcut for Mark for review** — out of scope; if added later, file separately.
- **Header rail expansion to include other affordances** — `End session` (tutor) and `Mark for review` (exam) are the only header rail buttons after this debt. Future debts may add more (timer, progress, etc.) but they are explicitly not in scope here.
- **Mobile-first responsive treatment** — assumed default Tailwind breakpoint behavior is sufficient. If breakpoint-specific issues emerge in visual QA, address inline; otherwise out of scope.

---

## Implementation Verification Checklist

1. Baseline confirmed before implementation: routed exam sessions had an empty header rail because `practice-view.tsx:401-423` rendered tutor `End session` only when `props.onEndSession && !isExamMode`; exam mode with `onEndSession` rendered no header button. The shipped refactor fills that rail with `Mark for review` / `Unmark review` when available, and falls back to the back link when no mode-specific header action exists.

2. Preserve existing Mark-for-review pending behavior. If `isMarkingForReview` flips true between click and server confirmation, the moved header button must disable exactly as the footer button did.

3. Verify `aria-describedby` on the Q3 primary CTA continues to resolve correctly after JSX restructure. Use a unit test that asserts the linked span's text content.

4. Do not add Mark for review to post-exam review. Mark for review is set during exam taking and consumed during Review & Submit; post-exam review surfaces remain out of scope.

5. Confirm no consumer of `ExamActionBarProps` or the parent `PracticeView` props assumes `exam-action-secondary-group` exists after the move. Update tests to use `exam-action-cta-group` / `question-header-actions`.

6. Suppress the empty primary group container in the footer when only the right slot has content (Q1).

7. Do not move Bookmark to the tutor header rail. DEBT-378 keeps Bookmark in the tutor post-feedback secondary group; header-rail unification is a separate future product decision.
