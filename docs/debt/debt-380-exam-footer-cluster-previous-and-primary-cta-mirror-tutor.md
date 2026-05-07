# DEBT-380: Exam Footer — Cluster Previous + Primary CTA Together, Mirror Tutor's Left-Cluster Pattern

**Priority:** P3 (layout-only refactor in a single component; behavior unchanged)
**Created:** 2026-05-07
**Source:** Visual grading walkthrough on 2026-05-07 after DEBT-378 + DEBT-379 shipped to `main` at `578dffb8`. Side-by-side comparison of tutor mode post-feedback (`[Previous, Next]` clustered left, `[Bookmark]` right via `sm:ml-auto`) and exam mode (`[Previous]` alone left, `[Next]` / `[Review & Submit]` orphaned right via `sm:ml-auto`). User's first-principles read: tutor's clustered-nav pattern is the better cross-mode shape; exam's split nav reads as a broken pair across a wide gap. DEBT-379 promoted exam's primary CTA to the right slot under "right slot owns the eye-anchor" theory, but DEBT-379's own spec admitted the rationale was unmeasured (*"supporting rationale, not measured user-error proof"*). With both modes now shipped and visually graded, the unmeasured argument loses to the measured cross-mode disharmony.
**Related:** [DEBT-379 Exam action bar — primary CTA to right slot, Mark for review to header (archived, partially superseded by this debt)](../_archive/debt/debt-379-exam-action-bar-promote-primary-cta-to-right-slot.md), [DEBT-378 Tutor — drop Submit button (choice click commits) (archived)](../_archive/debt/debt-378-tutor-drop-submit-button-choice-click-commits.md), [DEBT-365 Exam flow affordance and label consistency (archived)](../_archive/debt/debt-365-exam-flow-affordance-and-label-consistency.md), [DEBT-361 Exam last-question Next label (archived)](../_archive/debt/debt-361-exam-last-question-next-label.md), [DEBT-330 Post-exam review action bar bookmark placement (archived)](../_archive/debt/debt-330-review-action-bar-bookmark-placement.md), [Pattern Registry](../frontend/pattern-registry.md), [Frontend Standards](../frontend/standards.md), [Practice Page Docs](../frontend/pages/practice.md)

**Status:** Open. No production code change yet. This debt **partially supersedes DEBT-379**: it reverts DEBT-379's footer right-slot promotion of the exam primary CTA while preserving DEBT-379's header-rail relocation of `Mark for review`. The supersession is intentional and design-driven, not a mistake — DEBT-379's right-slot promotion was a defensible call against pre-shipped state, but post-ship visual grading vs. tutor mode showed that cross-mode harmony beats the unmeasured eye-anchor argument.

---

## Context

Today's exam footer (`app/(app)/app/practice/components/practice-view.tsx:206-271`, `ExamActionBar`):

| Question | Left (`exam-action-primary-group`) | Right (`exam-action-cta-group`, `sm:ml-auto`) |
|----------|------------------------------------|------------------------------------------------|
| Q1 | _suppressed_ (no Previous) | filled `[Next]` |
| Q2 | outline `[Previous]` | filled `[Next]` |
| Q3 | outline `[Previous]` | filled `[Review & Submit]` (`aria-describedby` "Opens review and submit.") |

Today's tutor footer (`practice-view.tsx:102-191`, `TutorActionBar`) — for cross-mode comparison:

| State | Left (`tutor-action-primary-group`) | Right (`tutor-action-secondary-group`, `sm:ml-auto`) |
|-------|--------------------------------------|------------------------------------------------------|
| Q1 pre-feedback | _none_ | _none_ (choice cards are primary) |
| Q1 post-feedback | filled `[Next]` | outline `[Bookmark]` |
| Q2/Q3 pre-feedback | outline `[Previous]` | _none_ |
| Q2 post-feedback | outline `[Previous]`, filled `[Next]` | outline `[Bookmark]` |
| Q3 post-feedback | outline `[Previous]`, filled `[End session]` | outline `[Bookmark]` |

The asymmetry is concrete: tutor renders `[Previous, Next]` and `[Previous, End session]` as a single navigation cluster in the left group; exam splits navigation across the row with `Previous` alone left and `Next` / `Review & Submit` right via `sm:ml-auto`.

Mark for review continues to live in the exam header rail (`data-testid="question-header-actions"`) per DEBT-379 — that part is correct and stays.

---

## Why This Is Debt

### Cross-mode disharmony

Tutor and exam are sibling modes rendered through the same `PracticeView` shell. Their footers reading as different shapes for the same task — sequential question navigation — creates user-visible inconsistency. DEBT-379's spec acknowledged this risk obliquely: *"Once DEBT-378 ships … tutor and exam have the SAME structure: navigation left, metadata right."* But DEBT-379 then went the OPPOSITE direction in exam, splitting nav left/right while tutor kept nav clustered. The "SAME structure" prediction did not survive DEBT-379.

### The split breaks the navigation pair

`Previous` and `Next` are conceptually one control (the question stepper). Visually splitting them across a wide footer with an `ml-auto` gap forces the user's eye to jump between two zones to perform one cognitive operation. Tutor mode keeps them adjacent. Exam mode now does not.

### DEBT-379's eye-anchor rationale was explicitly unmeasured

Quoting DEBT-379's own Why-This-Is-Debt section: *"This is supporting rationale, not measured user-error proof: we do not currently have analytics showing students click Mark for review when they meant Next. The concrete evidence is the user's design walkthrough and visual discomfort with the right-edge metadata slot in the active exam footer."*

DEBT-379 was right to fix the right-edge-metadata problem (Mark for review was in the right slot competing for eye-anchor with Next). It moved Mark for review to the header rail, which solved the metadata-right-slot problem. But it then went one step further and promoted the primary CTA to the now-vacant right slot, which created a new problem: nav split. The first move (header relocation) was correct. The second move (right-slot promotion) is what this debt undoes.

### Exam's right-slot occupant after DEBT-380 is "nothing," and that's fine

Tutor pre-feedback already establishes the precedent: the footer has only a left cluster, no `sm:ml-auto` right group. The footer doesn't feel broken in tutor pre-feedback because the screen reads as "one cluster of navigation." Exam mode after DEBT-380 will look the same: left cluster only, no right group. Mark for review continues to anchor the exam header rail; the footer is purely navigation.

### The DEBT-361 `aria-describedby` invariant must continue to travel

Q3's `Review & Submit` button has a hidden description span linked via `aria-describedby` resolving to `"Opens review and submit."` That linkage was preserved through DEBT-379's restructure (the span moved with the button into `ctaGroup`). DEBT-380 must preserve it again: the span travels with the button into the unified left cluster.

---

## Options

### Option A — Single left cluster, no right group (recommended)

```text
Q1: [Next filled]
Q2: [Previous outline] [Next filled]
Q3: [Previous outline] [Review & Submit filled]
```

Layout: render only `data-testid="exam-action-primary-group"` containing both Previous (when applicable) and the forward/terminal CTA. Drop the `exam-action-cta-group` testid entirely. No `sm:ml-auto` group in exam mode.

**Pros:**
- Mirrors tutor's `tutor-action-primary-group` clustering pattern exactly.
- Smallest production diff (collapse two groups into one).
- Q1 still suppresses Previous; the cluster is `[Next]`-only on Q1 (still cleanly left-aligned, no orphaning).
- Cross-mode harmony: both modes have a single left cluster + optional metadata right (tutor has Bookmark; exam has nothing because Mark for review moved to header).

**Cons:**
- Reverts DEBT-379's right-slot eye-anchor positioning. Honest accounting: DEBT-379 was P3 layout-only, and its right-slot rationale was unmeasured; design iteration is expected at P3.
- The `exam-action-cta-group` testid that DEBT-379 introduced becomes dead. Removing it means tests written against it must move to `exam-action-primary-group` selectors.

### Option B — Single left cluster, plus a right slot for some future affordance

Speculative. No concrete affordance in scope. Ruled out per `feedback_no_speculative_debt`: don't reserve real estate for hypothetical future buttons.

### Option C — Keep DEBT-379's split

Status quo. Ruled out by the user's visual grade and the cross-mode disharmony argument above.

### Recommendation

**Option A.** Smallest production diff, restores cross-mode harmony, preserves DEBT-379's correct decision (Mark for review in header rail), reverts only DEBT-379's incorrect decision (CTA in right slot).

---

## The Refactor (Option A)

### Exam footer — final spec

| Question position | Left cluster (`exam-action-primary-group`) | Right group |
|-------------------|---------------------------------------------|-------------|
| Q1 | filled `[Next]` (single button, cluster contains only the CTA) | _none_ |
| Q2 | outline `[Previous]`, filled `[Next]` | _none_ |
| Q3 | outline `[Previous]`, filled `[Review & Submit]` (preserves `aria-describedby` "Opens review and submit.") | _none_ |

`exam-action-cta-group` testid is removed. All exam footer buttons live inside `exam-action-primary-group`.

### Header rail — unchanged from DEBT-379

The exam header rail (`data-testid="question-header-actions"`) continues to render the `Mark for review` / `Unmark review` toggle exactly as DEBT-379 shipped it. `aria-pressed`, disabled state (`isMarkingForReview || isPending || loadState.status === 'loading'`), label flip, and the back-link fallback gating widened in DEBT-379 (`(!isExamMode && !props.onEndSession) || (isExamMode && !props.onToggleMarkForReview)`) all stay byte-identical.

### Tutor mode — unchanged

`TutorActionBar` is not touched. Tutor footer matrix and tutor header rail remain byte-identical to DEBT-378's shipped state. Quick Practice (which inherits `TutorActionBar`) is also untouched.

---

## Production Diff

### File: `app/(app)/app/practice/components/practice-view.tsx`

**`ExamActionBar` (lines 206-271):** restructure.

Removals:
- Lines 238-263 — entire `ctaGroup` block. Move its inner contents (Next/Review & Submit button, hidden description span) into the left `navigationGroup`.

Changes:
- Lines 220-236 — `navigationGroup` becomes the single render group. Conditions:
  - Always render the `data-testid="exam-action-primary-group"` div when there is at least one button to show (i.e., always — Q1 still has `[Next]`).
  - Render `Previous` first when `props.onPreviousQuestion && props.hasPreviousQuestion`. Suppress on Q1.
  - Render the forward/terminal CTA (Next or Review & Submit) immediately after Previous (or as the only child on Q1). Preserve the `aria-describedby` linkage and the hidden description span on Q3.
- Lines 265-270 — return becomes `<>{navigationGroup}</>` (no separate ctaGroup).

Selector cleanup:
- Keep `data-testid="exam-action-primary-group"` for the unified cluster.
- Delete `data-testid="exam-action-cta-group"` (no separate right group).

The DEBT-361 hidden description span (`useId()` → `nextActionDescriptionId`) and the button's `aria-describedby` link must remain co-located inside the same cluster. The simplest implementation: keep the span and button adjacent in the JSX tree under `exam-action-primary-group`.

### Other files

`PracticeView` callsite (`practice-view.tsx:333-344`): no prop changes. `ExamActionBarProps` type does not change shape (it doesn't currently expose anything specific to the right slot).

`practice-session-page-view.tsx`, `quick-practice-client.tsx`: no changes. Quick Practice does not render `ExamActionBar`.

### Summary of production changes

| File | Lines (approx) | Change type |
|------|----------------|-------------|
| `practice-view.tsx` `ExamActionBar` | 206-271 | Collapse two groups into one; delete `exam-action-cta-group` testid |
| Total | ~30-50 lines touched | Net negative LOC (one group deletion) |

Choice button, QuestionCard, controllers, repositories, use cases, hooks: zero changes.

---

## Test Diff

### Unit tests

**`practice-view-exam-actions.test.tsx`:**

Currently the tests assert specific group membership. After DEBT-380, the assertions need to move from `exam-action-cta-group` to `exam-action-primary-group`.

Tests to rewrite (line ranges from current HEAD `578dffb8`):

- `'renders first-question exam footer with only the right-slot Next CTA'` — rename to `'renders first-question exam footer with only the Next CTA in the unified left cluster'`. Assertions change from:
  - `expect(primaryGroup).toBeNull()` → `expect(getButtonLabels(primaryGroup)).toEqual(['Next'])`
  - `expect(getButtonLabels(ctaGroup)).toEqual(['Next'])` → DELETE (no ctaGroup)
  - `expect(getButtonLabels(actionBar)).toEqual(['Next'])` — KEEP
  - `expect(actionBar?.textContent).not.toContain('Mark for review')` — KEEP
  - Add: `expect(doc.querySelector('[data-testid="exam-action-cta-group"]')).toBeNull()` (negative assertion that the testid is gone)

- `'renders final-question exam footer with Previous left and Review & Submit right'` — rename and rewrite:
  - `expect(getButtonLabels(primaryGroup)).toEqual(['Previous'])` → `expect(getButtonLabels(primaryGroup)).toEqual(['Previous', 'Review & Submit'])`
  - `expect(getButtonLabels(ctaGroup)).toEqual(['Review & Submit'])` → DELETE
  - `expect(getButtonLabels(actionBar)).toEqual(['Previous', 'Review & Submit'])` — KEEP

- `'groups active-exam Previous separately from the right-slot CTA and removes the secondary footer group'` — rewrite to reflect single-cluster:
  - `expect(getButtonLabels(primaryGroup)).toEqual(['Previous'])` → `expect(getButtonLabels(primaryGroup)).toEqual(['Previous', 'Next'])`
  - `expect(getButtonLabels(ctaGroup)).toEqual(['Next'])` → DELETE
  - `expect(secondaryGroup).toBeNull()` — KEEP (regression guard)
  - `expect(getButtonLabels(headerActions)).toEqual(['Mark for review'])` — KEEP (header unchanged)
  - Add: `expect(doc.querySelector('[data-testid="exam-action-cta-group"]')).toBeNull()`

- `'describes the last-question Review & Submit action for assistive tech'` — update to scope the find to `exam-action-primary-group` instead of `exam-action-cta-group`. The hidden description span and `aria-describedby` linkage MUST still resolve to `"Opens review and submit."`

- `'keeps Next as the non-final exam CTA even when hasNextQuestion is false'` — selector update `exam-action-cta-group` → `exam-action-primary-group`.

- All disabled-state and aria-pressed tests for the header `Mark for review` button — UNCHANGED (header rail not touched).

- Tutor regression guards — UNCHANGED (tutor not touched).

**`practice-view-navigation.test.tsx`:**

- UNCHANGED. This remains the load-bearing tutor footer matrix coverage for Q1/Q2/Q3 pre/post-feedback states.

**`practice-view-layout.test.tsx`:**

- The DEBT-379 regression test `'renders the fallback back link when exam mode has no mark-for-review action'` — UNCHANGED (header rail not touched).
- The DEBT-379 test `'renders a scoped exam header action rail before the question area'` — UNCHANGED.

### Browser specs

**`practice-view.browser.spec.tsx`:**

- Tests scoped to `exam-action-cta-group` (the `Review & Submit` click test around line 642) — update selector to `exam-action-primary-group`.
- Tests scoped to `question-header-actions` (Mark for review click, disabled state) — UNCHANGED.
- Tests scoped to `bottom-action-bar` for global presence — UNCHANGED.

### Integration tests

None expected. No use-case-layer change.

### E2E tests

**`tests/e2e/practice.spec.ts`:**

- Exam walkthrough already scopes Mark for review to `question-header-actions` (DEBT-379) — UNCHANGED.
- No `exam-action-cta-group` references exist in this file at `578dffb8`; existing bottom-action-bar scoped `Review & Submit` assertions remain valid.

### Test count summary

| Test type | Files affected | Assertions changed (estimate) |
|-----------|----------------|-------------------------------|
| Unit | 1 (`practice-view-exam-actions.test.tsx`) | 8-15 |
| Browser | 1 (`practice-view.browser.spec.tsx`) | 2-4 |
| Layout | 0 (header-rail tests untouched) | 0 |
| Integration | 0 | 0 |
| E2E | 0 | 0 |
| **Total** | **2-3 files** | **~10-20 assertions** |

Smaller surface than DEBT-379.

---

## Design Doc Diff

### `docs/frontend/pattern-registry.md`

- **Active Exam Action Bar entry** (added by DEBT-379, see lines around the "Active Exam Action Bar" section): rewrite the matrix to show a single left cluster on every question. Remove references to `exam-action-cta-group` and `sm:ml-auto`. Add a sentence: *"All active exam footer buttons live in `data-testid=\"exam-action-primary-group\"`; there is no footer right group. Mark for review continues to live in the question header rail per DEBT-379."*
- **Header Rail / Persistent Header Actions entry** (added by DEBT-379): UNCHANGED.

### `docs/frontend/standards.md`

- Active practice action bars table — rewrite the three exam rows to drop `sm:ml-auto` and put both Previous and the CTA in the left cluster.
- The existing prose *"In exam mode, the primary CTA always sits in the footer right slot. The footer never contains `Mark for review`; the header action rail owns the Mark/Unmark toggle with `aria-pressed` state."* — rewrite to: *"In exam mode, the footer renders a single left cluster containing Previous (when applicable) and the forward/terminal CTA (`Next` / `Review & Submit`). The footer never contains `Mark for review`; the header action rail owns the Mark/Unmark toggle with `aria-pressed` state."*

### `docs/frontend/pages/practice.md`

- Active Session Action Bar exam matrix table — rewrite to drop `sm:ml-auto` and unify into the left cluster.
- Header Rail subsection — UNCHANGED.

### Archived debt docs

Do NOT edit archived DEBT-379 / DEBT-378 / DEBT-365 / DEBT-330 docs. The supersession of DEBT-379's right-slot promotion is recorded in this DEBT-380 doc and (post-merge) in this doc's archived `## Resolution` section. Archived docs stay as historical record of what was true at their time.

---

## Edge Cases & Implementation Notes

### Q1 with only `[Next]` in the cluster

Today's footer renders an empty primary group on Q1 (suppressed) and `[Next]` alone in the right group. After DEBT-380, Q1 renders only the unified primary group with `[Next]` as its single child. This is functionally identical to tutor's "Q1 post-feedback shows only `[Next]`" pattern. The flex layout already handles single-child cases — no new alignment work needed.

### `aria-describedby` linkage on Q3

The hidden description span and the button's `aria-describedby` attribute must remain in the same render tree. Both currently live in `ctaGroup`; the refactor moves both into the unified `navigationGroup`. The id constant (`nextActionDescriptionId` from `useId()`) is local to the component and continues to resolve.

### Mobile responsive

`flex flex-wrap` on `exam-action-primary-group` allows wrapping at narrow breakpoints. Single-cluster layout is actually friendlier to mobile than the split layout, because there's no `sm:ml-auto` push that creates a wide gap on intermediate breakpoints.

### Tab order

Single-cluster nav makes tab order simpler. After DEBT-380 the order is: navigator pills → header `Mark for review` → question stem → choice buttons → footer `Previous` → footer CTA. This is more linear than the DEBT-379 split where tab moved from `Previous` (left) across the gap to the CTA (right).

### Visual hierarchy

The forward/terminal CTA continues to use `variant="default"` (filled). Previous continues to use `variant="outline"`. The hierarchy is the same; only their adjacency changes.

### Will the footer feel "empty" with no right group?

Tutor's pre-feedback footer is the precedent: when there's no metadata to render, the footer is left-cluster only. Visual grade did not flag tutor's pre-feedback state as broken. Exam's footer post-DEBT-380 will mirror that pattern.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| DEBT-379's `exam-action-cta-group` testid is referenced by tests; deleting it breaks them | Mechanically update every reference per the Test Diff section. CR will catch any missed reference. |
| `aria-describedby` linkage breaks during JSX restructure | Hidden span and the button stay co-located in the same cluster. A unit test asserts the linked span's text content survives the move. |
| Future debt re-promotes the CTA to the right slot, churning these tests again | Acceptable risk. Design iteration at P3 is expected; testid stability is not the priority over visual rightness. If the right-slot pattern re-emerges with measured evidence, the tests can be updated again. |
| Quick Practice somehow inherits the broken split | Quick Practice renders the non-exam `PracticeView` branch, so it uses `TutorActionBar` rather than `ExamActionBar`. No change needed; `practice-view-exam-actions.test.tsx` keeps tutor header/footer smoke guards, and `practice-view-navigation.test.tsx` remains the load-bearing full tutor footer matrix regression suite. |
| User expectation that the right slot exists in exam mode after DEBT-379 was just shipped | This debt's existence acknowledges the change. Post-merge archive ritual updates `pattern-registry.md` and `standards.md` so future readers see the unified pattern as canonical. |

---

## Acceptance Criteria

Production:

- `app/(app)/app/practice/components/practice-view.tsx`:
  - `ExamActionBar` renders a single `data-testid="exam-action-primary-group"` div containing Previous (when applicable) and the forward/terminal CTA.
  - `data-testid="exam-action-cta-group"` is removed entirely.
  - No `sm:ml-auto` class in `ExamActionBar`'s rendered output.
  - Q1: cluster contains `[Next]` only.
  - Q2: cluster contains `[Previous]` + `[Next]`.
  - Q3: cluster contains `[Previous]` + `[Review & Submit]` and preserves the `aria-describedby` link to a hidden span containing `"Opens review and submit."`.
  - Header rail JSX byte-identical to DEBT-379's shipped state.
  - `TutorActionBar`: zero changes.

Tests:

- All exam Q1/Q2/Q3 footer assertions updated to expect a unified left cluster.
- `exam-action-cta-group` testid asserted absent (negative assertion).
- Q3 `aria-describedby` link still resolves to the `"Opens review and submit."` span.
- Tutor regression guards: byte-identical, still green. `practice-view-exam-actions.test.tsx` keeps the tutor header and one post-feedback footer smoke guard, while `practice-view-navigation.test.tsx` remains the load-bearing full tutor footer matrix coverage.
- Quick Practice regression: not directly tested in this PR (untouched), but Quick Practice continues through the non-exam `PracticeView` branch and therefore the unchanged `TutorActionBar`.

Docs:

- Pattern Registry Active Exam Action Bar entry rewritten for unified cluster.
- Standards.md exam rows rewritten; right-slot prose updated to single-cluster prose.
- pages/practice.md exam Action Bar subsection rewritten.
- This DEBT-380 doc moves to `_archive/debt/` post-merge with `## Resolution` section.
- Debt index updated.

Quality gates:

- Local full gate green (typecheck, lint, unit, browser, integration, build, E2E).
- CodeRabbit explicit `APPROVED` on the latest PR head.
- Visual QA on active exam states: Q1, Q2, Q3 desktop and mobile; include marked and unmarked header states. Tutor and Quick Practice visual states re-graded to confirm zero unintended drift.

---

## Out of Scope

- **Tutor mode changes** — DEBT-378 owns tutor; DEBT-379 left it unchanged; DEBT-380 leaves it unchanged. Tutor's footer matrix is the canonical pattern this debt aligns exam to.
- **Quick Practice changes** — Quick Practice renders `TutorActionBar`, so it inherits tutor's pattern automatically. No quick-practice file is touched.
- **Mark for review relocation** — DEBT-379 already moved it to the header rail. DEBT-380 does not move it back to the footer or anywhere else.
- **Bookmark vs. Mark for review unification** — DEBT-379 explicitly deferred this as a future product decision; DEBT-380 inherits that deferral.
- **Adding a new right-slot affordance to exam footer** — speculative per `feedback_no_speculative_debt`. If a future need emerges with measured evidence, file separately.
- **Renaming `exam-action-primary-group`** — the testid stays; only its membership broadens.
- **Choice button or QuestionCard changes** — not touched.
- **Re-grading DEBT-379's header-rail relocation** — DEBT-379's header decision is correct and stays.

---

## Implementation Verification Checklist

1. Confirm current `ExamActionBar` shape at `practice-view.tsx:206-271` before editing: two render groups (`navigationGroup` lines 220-236, `ctaGroup` lines 238-263), `sm:ml-auto` on the right group, separate testids.

2. Confirm the DEBT-361 hidden description span and `aria-describedby` linkage live inside `ctaGroup` today (lines 243-256). Both must travel together into the unified cluster.

3. Confirm `TutorActionBar` clustering at `practice-view.tsx:120-161` is the pattern to mirror: single `flex flex-wrap items-center gap-3` div with `tutor-action-primary-group` containing all nav buttons. DEBT-380's exam refactor should produce structurally analogous JSX.

4. Confirm header rail JSX at `practice-view.tsx:380-415` is unchanged in this debt — DO NOT modify the header-rail block.

5. Confirm callers of `PracticeView` do not pass anything that depends on `exam-action-cta-group` existing. `PracticeView` callsite for `ExamActionBar` is at `practice-view.tsx:333-344`. `practice-session-page-view.tsx` and `quick-practice-client.tsx` do not reference the cta-group testid.

6. Confirm test files mechanically (per `feedback_verify_doc_citations_mechanically`) before claiming readiness:
   - `practice-view-exam-actions.test.tsx` — list every reference to `exam-action-cta-group`. Update all of them.
   - `practice-view-layout.test.tsx` — verify only header-rail assertions exist, leave them untouched.
   - `practice-view.browser.spec.tsx` — list every reference to `exam-action-cta-group`. Update all of them.
   - `tests/e2e/practice.spec.ts` — verify there are no references to `exam-action-cta-group`; keep existing bottom-action-bar scoped `Review & Submit` assertions.

7. Run tutor regression tests after every edit to prove `TutorActionBar` shape is byte-identical.

8. Visual QA after typecheck + tests: capture exam Q1/Q2/Q3 desktop + mobile, marked + unmarked header states. Compare against tutor screenshots from DEBT-378 era to confirm cross-mode harmony.
