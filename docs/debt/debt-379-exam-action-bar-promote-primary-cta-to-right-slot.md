# DEBT-379: Exam Action Bar — Promote Primary CTA To Right Slot, Reposition Mark For Review

**Priority:** P3 (layout-only refactor in a single component; behavior unchanged)
**Created:** 2026-05-04
**Source:** Same UX walkthrough that produced DEBT-378 (Claude Design V3 variant pass on 2026-05-04). The user's first-principles reading: the right-edge slot should hold the "act-now" CTA in both modes, mirroring modern web convention. Today's exam footer puts `Next` / `Review & Submit` in the left navigation cluster with `Mark for review` pushed right via `sm:ml-auto`.
**Related:** [DEBT-378 Tutor — drop Submit button (choice click commits)](./debt-378-tutor-drop-submit-button-choice-click-commits.md), [DEBT-365 Exam flow affordance and label consistency (archived)](../_archive/debt/debt-365-exam-flow-affordance-and-label-consistency.md), [DEBT-363 Exam shell scroll model and dual-CTA disambiguation (archived)](../_archive/debt/debt-363-exam-shell-scroll-model-and-dual-cta.md), [DEBT-361 Exam last-question Next label (archived)](../_archive/debt/debt-361-exam-last-question-next-label.md), [DEBT-330 Action bar grouping (Navigation-primary / Metadata-secondary)](../_archive/debt/debt-330-action-bar-grouping.md), [Pattern Registry](../frontend/pattern-registry.md), [Frontend Standards](../frontend/standards.md), [Practice Page Docs](../frontend/pages/practice.md)

**Status:** Open. Doc-first; no code change yet. Sequenced after DEBT-378 to keep one debt per shipping cycle.

---

## Context

Today's exam footer (`app/(app)/app/practice/components/practice-view.tsx:223-300`, `ExamActionBar`):

| Question | Primary group (left, `data-testid="exam-action-primary-group"`) | Secondary group (right, `sm:ml-auto`, `data-testid="exam-action-secondary-group"`) |
|----------|------------------------------------------------------------|----------------------------------------------------------------------------------|
| Q1 | `[Next]` filled | `[Mark for review]` outline |
| Q2 | `[Previous]` outline, `[Next]` filled | `[Mark for review]` outline |
| Q3 | `[Previous]` outline, `[Review & Submit]` filled | `[Mark for review]` outline |

`Next` / `Review & Submit` sits at the inside-right of the navigation cluster. `Mark for review` is pushed to the screen's right edge via `sm:ml-auto`.

Mark for review is a **metadata** action ("flag this question for me to revisit during review-and-submit"). It's not a primary CTA. It's not a navigation control. It's a per-question annotation. Its current right-edge position was decided by DEBT-330 (Navigation-primary / Metadata-secondary) and reaffirmed by DEBT-365 Concern 3A. The decision was correct in isolation: nav and metadata are conceptually distinct, so they shouldn't visually mingle.

The unresolved question is: **which slot should the user's eye go to for the primary "act now" action?**

Modern web convention says far-right. Refactoring UI says the primary action belongs at the end of the row because Western reading flow ends there and the eye lands on the action at completion of the read. Apple HIG, Material 3, and most production form/dialog design follow this. Today's exam footer puts the metadata at the right edge and the primary action one slot inside — which is exactly inverse to that convention.

The user's instinct in the V3 design pass was correct: the right slot should hold the "act now" CTA. The question this debt resolves is **what to do with Mark for review** when the right slot is reclaimed for the primary CTA, given the constraint that Mark for review must remain accessible on every exam question, including Q3.

---

## Why This Is Debt

### The right slot anchors the eye

In a footer with a left cluster and a right slot, users learn that the right slot is "the action to perform after reviewing." They develop a fast scanning pattern: read the screen, glance bottom-right, click. When the right slot holds metadata (Mark for review) instead of the primary CTA (Next, Review & Submit), users either:
1. Click the wrong button (Mark for review when they meant Next) and are confused
2. Slow down and visually parse the entire footer to find the primary action

Either outcome is friction. The slot affordance pattern is one of the cheapest reads-per-second wins available, and we're spending it on metadata instead of action.

### Cross-mode harmony

Once DEBT-378 ships (tutor drops Submit, footer becomes `[Previous][Next]` left cluster | `[Bookmark]` `sm:ml-auto` right post-feedback), tutor mode has the eye-anchor convention going *the other direction* than exam — except tutor doesn't have a primary CTA in the footer pre-feedback at all (the choice cards are the primary), and post-feedback the rightmost element is Bookmark (metadata).

Wait — that means **after DEBT-378**, tutor and exam have the SAME structure: navigation left, metadata right. The geometric harmony argument actually weakens once DEBT-378 ships, because both modes will have the same shape.

So the motivation for DEBT-379 is **not** "match tutor." DEBT-378 ships harmony. DEBT-379 is about **fixing exam mode itself** — relocating the primary CTA to the convention-correct slot, separately from tutor's redesign. If we shipped DEBT-378 alone, exam would still have the convention-incorrect right-slot-holds-metadata problem; this debt addresses that.

### Mark for review needs a home that doesn't compete with the primary CTA

Today, Mark for review is right-edge because that's where the metadata-secondary group lives. Once we promote the primary CTA to the right edge, Mark for review must go somewhere. Three honest options:

1. **Left of the primary CTA in the same row** — `[Previous]` left | `[Mark for review]` middle-right | `[Next/Review & Submit]` far-right. Tightens left cluster to just Previous; primary CTA owns the right edge; Mark for review sits adjacent to the primary CTA. Risk: visually adjacent to the primary, may compete or be misclicked.
2. **Header rail (icon button or short-label button)** — Mark for review moves out of the footer entirely and into the question header (above or beside the question stem). Frees the footer to be just navigation + primary CTA. Risk: discoverability — users may not look up to flag a question.
3. **Inline with the question stem** — Mark for review becomes an icon button anchored to the question card itself, similar to a bookmark icon on an article. Closest to the question content. Risk: visual clutter on the question card.

This debt does not yet pick between these. Three variants follow in the Options section. The audit pass and Claude Design canvas should weigh in.

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
- Two right-side affordances visually compete. Mark for review is outline, primary CTA is filled, so the hierarchy reads — but the gap between them must be generous (likely `ml-6` or larger).
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
- Discoverability: users have to look up to flag a question. Eye-tracking research generally shows users dwell more on primary content than on header chrome; the affordance may be missed.
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

**Option B (header rail).** Reasons:

1. The exam header rail is currently empty — adding Mark for review fills a slot that has no other use.
2. Conceptually correct — metadata about the question lives adjacent to the question, not adjacent to navigation.
3. Parallels tutor's header rail; reduces cross-mode visual variance at the header level (both modes have a single-affordance header rail with mode-appropriate actions: tutor has `End session`, exam has `Mark for review`).
4. Discoverability concern is real but addressable with a short-label button (`Mark for review` text, not just an icon) and clear visual prominence.
5. Smallest cognitive load on the footer: footer becomes pure navigation + primary CTA, the simplest possible structure.

Option A (three-slot footer) is the safe-default if header-rail discoverability concerns prove decisive. Option C (icon on card) is the most ambitious; reject for this debt because it pushes the change into the QuestionCard composite, which is shared with tutor and would expand scope.

---

## The Refactor (assuming Option B)

### Exam footer — final spec

| Question position | Primary group (left cluster) | Right slot (`sm:ml-auto`) |
|-------------------|------------------------------|---------------------------|
| Q1 | _empty_ | `[Next]` filled |
| Q2 | `[Previous]` outline | `[Next]` filled |
| Q3 | `[Previous]` outline | `[Review & Submit]` filled |

Mark for review moves out of the footer entirely.

### Exam header rail — final spec

A new button rendered on every exam question, positioned in the header rail at the right side (mirroring tutor's `End session` placement at `practice-view.tsx:424-435`):

```tsx
{props.onToggleMarkForReview && isExamMode ? (
  <Button
    type="button"
    variant="outline"
    className="rounded-full"
    aria-pressed={props.isMarkedForReview}
    disabled={props.isMarkingForReview || isHeaderActionDisabled}
    onClick={props.onToggleMarkForReview}
  >
    Mark for review
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
- Keyboard navigation order: tab order through the page should reach Mark for review at a sensible position (probably right after the navigator pills, before the question stem). Audit must confirm tab order is sensible after the move.

---

## Production Diff

### File 1: `app/(app)/app/practice/components/practice-view.tsx`

**`ExamActionBar` (lines 223-300):** restructure.

Removals:
- Lines 281-296 — entire secondary group containing Mark for review

Changes:
- Lines 237-275 — restructure primary group:
  - Move Previous to the bare left edge (no change in semantic, but layout simplifies).
  - Move Next / Review & Submit to a separate right slot via `sm:ml-auto` (or a flex-grow spacer between Previous and the primary CTA).
  - Maintain the `isLastSessionQuestion` branching for Next ↔ Review & Submit label flip and the `aria-describedby` link.
- Update `data-testid` attributes:
  - `exam-action-primary-group` may be repurposed to hold only Previous (or split into `exam-action-previous` and `exam-action-primary` testids if cleaner).
  - `exam-action-secondary-group` testid is deleted (no secondary group in the footer anymore).

**Header rail JSX (lines ~400-435):** add a new exam-mode Mark for review button.

Today line 424-435 is the tutor-only `End session` block. Add a sibling exam-only `Mark for review` block alongside it, gated by `isExamMode && props.onToggleMarkForReview`. The header layout already has flex space for additional buttons.

**Props:**
- `ExamActionBarProps` (lines 207-221) — drops `isMarkingForReview`, `isMarkedForReview`, `onToggleMarkForReview` (these move to the header rail's prop set).
- `PracticeView` props at the top of the file gain (or already have) `isMarkingForReview`, `isMarkedForReview`, `onToggleMarkForReview` at the top level — confirm via audit.
- The header rail JSX needs access to the same Mark for review props the footer used to. Likely already accessible via the parent prop set; audit to confirm.

### File 2: parent components / page views that pass props to `PracticeView`

Audit for any caller that threads Mark-for-review props specifically to the `ExamActionBar`. After the refactor, those props go to the page-level header rail instead. The shape of `PracticeView`'s top-level props likely doesn't change, but the internal threading does.

Files to verify:
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`
- `app/(app)/app/practice/quick-practice/quick-practice-client.tsx` (if it has an exam mode entry)

### Summary of production changes

| File | Lines (approx) | Change type |
|------|----------------|-------------|
| `practice-view.tsx` ExamActionBar | 223-300 | Restructure: drop secondary group, promote primary CTA to right slot |
| `practice-view.tsx` header rail | ~400-435 | Add exam-mode Mark for review button alongside tutor `End session` |
| Total | ~80-120 lines touched | Net flat or small positive (header gains > footer loses) |

Choice button, QuestionCard, controllers, repositories, use cases: zero changes.

---

## Test Diff

### Unit tests

**`practice-view-exam-actions.test.tsx`:**

- Lines 15-66 — Q1 exam action bar, asserts `['Next', 'Mark for review']` — **REWRITE**: Q1 footer asserts `['Next']` only; new test asserts header Mark for review exists.
- Lines 68-113 — Q3 exam action bar, asserts `['Previous', 'Review & Submit', 'Mark for review']` — **REWRITE**: Q3 footer asserts `['Previous', 'Review & Submit']`; new test asserts header Mark for review exists on Q3.
- Lines 115-168 — primary/secondary group separation — **REWRITE**: assert footer has no secondary group; assert header rail has the Mark for review button.
- Lines 170-214 — `aria-describedby` Q3 annotation — **KEEP** (annotation travels with the button to its new right-slot position; test should still pass with possible selector updates).

Add new tests:
- Header rail in exam mode renders `Mark for review` on Q1, Q2, Q3.
- Header rail in tutor mode does NOT render `Mark for review` (tutor doesn't have this flow).
- Header rail in tutor mode continues to render `End session` (regression guard).
- Footer in exam mode does NOT render `Mark for review` (negative assertion).
- Mark for review `aria-pressed` toggles correctly when clicked from the header position.
- Mark for review disabled state respects `isMarkingForReview` and `isHeaderActionDisabled`.
- Q3 primary CTA in exam footer is right-aligned (assert via `data-testid` or position assertion).

**`practice-view-layout.test.tsx`:**

- Audit for any layout structure assertions referencing `exam-action-secondary-group` — update to reflect the absence of that group post-refactor.
- Layout assertions on the question header rail — update to expect a second button (Mark for review) alongside the existing `End session` block in exam mode.

### Browser specs

**`practice-view.browser.spec.tsx`:**

- Tests asserting Mark for review click behavior in the exam footer — **MOVE** the click target to the header rail.
- Lines 595-648 (Review & Submit click in exam Q3) — verify the click still works after the right-slot move; selector may change but behavior is identical.

### Integration tests

None expected. `Mark for review` toggling goes through the use-case layer, which doesn't change.

### E2E tests

**`tests/e2e/practice.spec.ts`:**

- Exam walkthrough: any step that clicks `Mark for review` from a footer position must update to click it from the header position. Estimated 2-4 line changes.

### Test count summary

| Test type | Files affected | Assertions changed (estimate) |
|-----------|----------------|-------------------------------|
| Unit | 2 | 15-25 |
| Browser | 1-2 | 5-10 |
| Integration | 0 | 0 |
| E2E | 1 | 2-4 |
| **Total** | **4-5 files** | **~20-40 assertions** |

Smaller surface than DEBT-378.

---

## Design Doc Diff

### `docs/frontend/pattern-registry.md`

- **Exam action bar entry** (search for E-something or look in the action-bar section): update structure to reflect the right-slot promotion.
- **Mark for review entry:** if registered, update placement note.
- **Header rail / persistent header pattern:** update to include exam-mode Mark for review alongside tutor-mode `End session`.

### `docs/frontend/standards.md`

- **Action bar / Button placement table:** exam row(s) updated. Right slot is the primary CTA across both modes (tutor post-feedback and exam always).
- **Primary CTA position section:** consolidate the rule: "In exam mode, the right slot of the footer holds the primary action. In tutor mode post-feedback, the right slot holds the primary navigation/terminal CTA. The right slot is the eye-anchor for 'act now' across the app."

### `docs/frontend/pages/practice.md`

- **Action Bar subsection:** rewrite the exam table to reflect the new structure (Previous left, primary CTA right, Mark for review in header).
- **Header Rail subsection (new):** if not already present, add. Document tutor's `End session` and exam's `Mark for review`.

### `docs/_archive/debt/debt-330-...md` and `docs/_archive/debt/debt-365-...md`

Both docs articulated the Navigation-primary / Metadata-secondary footer split. After this refactor, that split lives partially in the header (metadata) and partially in the footer (navigation + primary CTA). Add a forward-pointer note: "Updated by DEBT-379 — Mark for review migrated to the header rail; primary CTA promoted to footer right slot."

---

## Edge Cases & Implementation Notes

### Tab order after Mark for review moves to header

After the move, the keyboard tab order should be: navigator pills → header rail Mark for review → question stem → choice buttons → footer Previous → footer primary CTA. Audit must verify this is the natural DOM order or wire it explicitly with `tabIndex` adjustments.

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
| Mobile layout crowding in header rail at small viewports | Visual QA at breakpoints (sm/md/lg). If crowding emerges, fall back to a label-with-icon or icon-only treatment scoped to small viewports. |
| Keyboard tab order regression | Audit explicitly. The natural DOM order should put header before question stem before footer; verify and adjust if needed. |
| Test refactor drift across 4-5 files (~20-40 assertions) | Implementation god prompt should produce exact edit blocks per file. CR will catch residual drift. |
| Q1 footer with empty primary group visually feels broken | Suppress the empty `data-testid="exam-action-primary-group"` wrapper when no buttons render, or leave it as an empty flex slot — visual QA decides. |
| `aria-describedby` linkage breaks during JSX restructure | Both the hidden span and the button stay in `ExamActionBar`. The `id` constant is local to the component. Restructure preserves linkage by keeping them in the same render tree. |

---

## Acceptance Criteria

Production:

- `app/(app)/app/practice/components/practice-view.tsx`:
  - `ExamActionBar` no longer renders a secondary group containing Mark for review.
  - Primary CTA (Next / Review & Submit) is rendered in a `sm:ml-auto` right slot.
  - Q3 primary CTA's `aria-describedby` link to its hidden description span is preserved.
  - Header rail JSX gains an exam-mode-only Mark for review button (gated on `isExamMode && props.onToggleMarkForReview`).
- Tutor mode footer and tutor mode header: zero changes (DEBT-378 handles tutor; DEBT-379 leaves it alone).
- `aria-pressed` on the Mark for review button correctly reflects `isMarkedForReview`.
- Disabled state on the Mark for review button respects existing pending/loading clauses.

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
- E2E `tests/e2e/practice.spec.ts` exam flow updated to click Mark for review from the header position.

Docs:

- Pattern Registry exam action bar / header rail entries updated.
- Standards.md primary-CTA-position consolidation rule documented.
- pages/practice.md exam Action Bar subsection rewritten.
- This DEBT-379 doc moves to `_archive/debt/` with Resolution section.
- Debt index updated.

Quality gates:

- Local full gate green (typecheck, lint, unit, browser, integration, build, E2E).
- CodeRabbit explicit `APPROVED`.
- Visual QA on six exam states (Q1, Q2, Q3 × pre/post — though exam doesn't have post-feedback states; confirm) with screenshots attached to PR.

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

## Open Questions for Audit

1. Confirm the exam header rail is currently empty (DEBT-363 dropped the `Finish exam` button). If any other content lives there, the Mark for review placement may need revision.

2. Is `Mark for review` toggling sometimes-pending (i.e., does `isMarkingForReview` flip true between click and server confirmation)? If yes, the header rail button must show a pending visual; audit the existing behavior and preserve it.

3. Verify `aria-describedby` on the Q3 primary CTA continues to resolve correctly after JSX restructure. Use a unit test that asserts the linked span's text content.

4. If the exam header rail gains Mark for review, should the post-exam review surface also gain a Mark for review (or read-only equivalent)? Currently Mark for review is set during exam taking and consumed during Review & Submit. The post-exam review surface displays the marked state but doesn't toggle. Confirm scope boundary — this debt does not touch post-exam review.

5. Does any consumer of `ExamActionBarProps` or the parent `PracticeView` props assume the secondary group exists? Audit prop flow comprehensively.

6. Should we also explicitly suppress the empty primary group container in the footer when only the right slot has content (Q1)? Or is an empty flex left edge fine? Visual QA decides.

7. Is there value in moving Bookmark (post-feedback in tutor, per DEBT-378's spec) to the tutor header rail to perfectly mirror exam's header rail in shape? This is explicitly out of scope of this debt — but flag for future consideration if cross-mode header-rail unification becomes a priority.
