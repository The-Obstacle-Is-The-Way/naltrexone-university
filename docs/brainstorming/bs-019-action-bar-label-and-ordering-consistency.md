# BS-019: Action Bar Label and Ordering Consistency

**Date:** 2026-02-17
**Triggered by:** Live UI audit — visual comparison of bottom action bars across Practice, Quick Practice, and History Review views
**Scope:** Bottom action bar label, ordering, boundary behavior, and navigation consistency across Practice, Quick Practice, and review contexts (History Session + History Individual)
**Related:** [BS-018](../_archive/brainstorming/bs-018-question-view-ux-unification.md), [SPEC-030](../_archive/specs/spec-030-question-view-ux-unification.md), [Design Principles §2](../frontend/design-principles.md)

---

## The Problem

SPEC-030 unified the *structural* layout (added Previous to Practice, moved sequential nav to Zone 2 bottom bar, fixed Tutor state persistence). But the *label style* and *button ordering* between Practice, Quick Practice, and History Review still diverge:

### Current State

**Practice mode (Tutor/Exam)** (`practice-view.tsx:248-307`):
```
← Previous | Submit | Next Question | Bookmark
 arrow         text     TEXT (no arrow)   text
```

**Quick Practice** (`quick-practice-client.tsx` → reuses `PracticeView`, no `onPreviousQuestion` prop):
```
Submit | Next Question | Bookmark
 text     TEXT (no arrow)   text
```

**History Session Review** (`question-page-client.tsx:221-281`):
```
← Previous | Next → | Try Again | Back to History
 arrow        ARROW     text        text
```

**History Individual Review** (`question-page-client.tsx`, no `sessionId`):
```
Submit
 text
```
or, when a previous attempt exists:
```
Try Again | Back to History
 text          text
```

### Inconsistency 1: Label Style

| Button | Practice | Quick Practice | History Review |
|--------|----------|----------------|----------------|
| Previous | `← Previous` (arrow) | *absent* | `← Previous` (arrow) |
| Next | `Next Question` (text, no arrow) | `Next Question` (text, no arrow) | `Next →` (arrow) |

Previous is consistent where it appears (both use `←` arrow prefix). Next is not — Practice and Quick Practice use a verbose text label while History uses a compact arrow suffix. The asymmetry is visually jarring when switching between contexts.

### Inconsistency 2: Button Ordering

| Context | Order | Pattern |
|---------|-------|---------|
| Practice | `← Previous` → `Submit` → `Next Question` → `Bookmark` | Next is **after** primary action |
| Quick Practice | `Submit` → `Next Question` → `Bookmark` | Next is **after** primary action (no Previous) |
| History | `← Previous` → `Next →` → `Try Again` → `Back to History` | Next is **before** primary action |

In Practice and Quick Practice, the user reads left-to-right: (Previous,) then the primary action (Submit), then Next. In History, it's: Previous, then Next, then the primary action (Try Again). The primary action shifts position.

### Inconsistency 3: Quick Practice — No Previous (By Design)

Quick Practice is intentionally **stateless and ad hoc** — the user grabs one question, answers it, and moves on. There is no session context to navigate within, so `← Previous` is absent. If a user wants to revisit a past question, they use the History tab.

This is a deliberate design choice, not a gap. Quick Practice's button *set* is correctly different from session-based modes (Practice, History). However, its *label style* should still align — if session-based modes adopt `Next →`, Quick Practice should too.

### Inconsistency 4: First-Question Previous — Hide vs Disable

Three different approaches to handling Previous on the first question:

| Context | First-Question Previous Behavior |
|---------|----------------------------------|
| Practice (Tutor/Exam) | **Present but disabled** (opacity 0.5, in DOM) |
| Quick Practice | **Absent** (not in DOM — by design, no session) |
| History Review Q1 | **Absent** (not in DOM) |

Practice shows a grayed-out Previous on Q1, signaling "this button exists, you're just at the start." History hides it entirely. The user learns two different mental models for the same boundary condition.

### Inconsistency 5: Last-Question Next — Enabled vs Hidden

| Context | Last-Question Next Behavior |
|---------|----------------------------|
| Practice (Tutor/Exam) | **Present and enabled** (clicking loads next question or shows "no more questions") |
| Quick Practice | N/A (single-question mode) |
| History Review last Q | **Absent** (hidden from DOM) |

In Practice, Next stays clickable on the last question — the system handles the edge case downstream. In History, the button disappears. This means the action bar changes shape at the boundary in History but not in Practice.

### Inconsistency 6: Bookmark Absent from History Review

| Context | Bookmark Available? |
|---------|-------------------|
| Practice (Tutor/Exam) | Yes |
| Quick Practice | Yes |
| History Review | **No** |

Users can bookmark questions during practice but cannot bookmark while reviewing past attempts in History. If a user encounters a question they want to revisit and they're in History Review, they have no way to flag it. This is a functional gap, not just a cosmetic one.

### Inconsistency 7: Submit Post-Submit Behavior

| Context | After Submitting |
|---------|-----------------|
| Practice (Tutor/Exam) | Submit stays in DOM, **disabled** (opacity 0.5) |
| Quick Practice | Submit stays in DOM, **disabled** (opacity 0.5) |
| History (answered Q) | Submit is **replaced** with `Try Again` (different button) |
| History (unanswered Q) | Shows `Submit` (same as Practice) |

Practice disables Submit after use; History swaps it for a different button. The context justifies some difference (re-answering a historical attempt vs. submitting live), but the action bar visually mutates in History in a way it doesn't in Practice.

### Inconsistency 8: Back Navigation Placement + Element Types

| Context | Back Navigation | Location | Element |
|---------|----------------|----------|---------|
| Practice (Tutor) | `End session` | Top-right header | `<button>` |
| Practice (Exam) | `Review answers` | Top-right header | `<button>` |
| Quick Practice | `Back to Practice` | Top-right header | `<a>` link |
| History Review | `Back to History` | **Top-right header + bottom action bar** (bottom shown when `sessionNavigation || submitResult`) | `<a>` link in both locations |

History currently duplicates back navigation in review contexts (header + bottom bar), while Practice and Quick Practice expose a single top-right escape action.

Element semantics also differ by interaction model: History's sequential nav + back actions are route links (`<a>` via `Button asChild`), while Practice's sequential nav uses callback buttons (`<button>`).

### Additional Inconsistency 9: Mobile Action-Bar Layout Model

| Context | Container class | Mobile behavior |
|---------|-----------------|-----------------|
| Practice / Quick Practice | `flex flex-wrap items-center gap-3` | Buttons wrap within a horizontal flow |
| History Review / Exam Review Stage / Session Summary | `flex flex-col gap-3 sm:flex-row` | Buttons stack vertically on small screens |

Button order is conceptually similar, but the mobile layout model itself differs (wrap vs stack), so cross-context muscle memory is weaker on narrow viewports.

### Why This Matters

Users who practice questions (Practice mode) and later review them (History) are the same people doing the same cognitive task — navigating a question list. When the same "Next" button has a different name and a different position relative to the action button, it creates friction. The user's muscle memory from Practice doesn't transfer to History.

---

## Root Cause

BS-018's proposed design direction (§ "Unified Bottom Action Bar") specified `Next →` with arrows for all contexts, but the SPEC-030 implementation preserved the pre-existing "Next Question" label in `practice-view.tsx`. The ordering was inherited from two separate development timelines:

- Practice's bottom bar (SPEC-013/020) was built first with `[Submit] [Next Question]`
- History Review's bottom bar (SPEC-027/030) was built later with `[Next →] [Try Again]`

Neither spec reconciled the label style or button ordering with the other.

Quick Practice was added separately, reusing `PracticeView` without passing `onPreviousQuestion`. It inherited Practice's "Next Question" label by default — consistent with Practice, but inconsistent with History.

---

## Severity Assessment

| Issue | Severity | Who's Affected | How Often |
|-------|----------|----------------|-----------|
| "Next Question" vs "Next →" label mismatch | Low-Medium | Anyone switching between Practice/Quick Practice and History Review | Every session |
| Next before/after primary action ordering | Low-Medium | Same population | Every session |
| First-Q Previous: hide vs disable | Low | Users on first question | Start of every session |
| Last-Q Next: enabled vs hidden | Low-Medium | Users on last question | End of every session |
| Bookmark absent from History Review | **Medium** | Users reviewing past attempts who want to flag questions | Variable — depends on workflow |
| Submit disabled vs replaced with Try Again | Low | Users comparing Practice and History flows | Every History session |
| Back-navigation duplication in History (header + action bar) | Low | Users in review contexts | Every review session |
| `<a>` vs `<button>` element type split for sequential/back nav | Low | Screen reader / keyboard users | Every review/practice session |
| Mobile action-bar layout mismatch (wrap vs stack) | Low | Mobile users switching contexts | Frequent |

These are not correctness bugs — all views still work. But they undermine the product's sense of being *one coherent system*. The bookmark gap in History Review remains the highest-impact finding because it's functional, not just visual. For a study tool where users build habits through repetition, consistent button placement, labels, and action availability reduce cognitive load.

---

## Proposed Design Direction

### Option A: Standardize Next to Right of Primary Action (Arrow Style)

Adopt arrow labels for both Previous and Next. Place Next consistently to the RIGHT of the primary action (Submit/Try Again), matching the natural reading flow: go back, do the thing, go forward.

**Practice (before submit):**
```
← Previous | Submit | Next → | Bookmark
```

**Practice (after submit, Tutor):**
```
← Previous | Next → | Bookmark
```

**Quick Practice (before submit):**
```
Submit | Next → | Bookmark
```

**History Session Review (answered):**
```
← Previous | Try Again | Next → | Back to History
```

**Rationale:** In Practice, Next is already to the right of Submit. Mirroring that in History (Next to the right of Try Again) creates a consistent mental model: "left = back, center = act, right = forward." Quick Practice follows the same pattern minus Previous (ad hoc mode — no session to navigate).

### Option B: Standardize Sequential Nav as Outermost Pair

Cluster Previous and Next as bookends, with action buttons in the center. This follows a "sandwich" layout common in media players and multi-step wizards.

**Practice (before submit):**
```
← Previous | Submit | Bookmark | Next →
```

**Quick Practice (before submit):**
```
Submit | Bookmark | Next →
```

**History Session Review (answered):**
```
← Previous | Try Again | Back to History | Next →
```

**Rationale:** Previous and Next are navigation; Submit/Try Again/Bookmark are actions. Separating the two categories makes the mental model clearer. However, this moves Next away from its current position in both views — more disruptive.

### Option C: Sequential Nav First, Then Actions (Current History Pattern)

Keep history's current ordering and apply it to Practice too:

**Practice (before submit):**
```
← Previous | Next → | Submit | Bookmark
```

**Quick Practice (before submit):**
```
Next → | Submit | Bookmark
```

**History Session Review (answered):**
```
← Previous | Next → | Try Again | Back to History
```

**Rationale:** Navigation (where am I going?) comes first; actions (what am I doing?) come second. This is the current History pattern and matches the design principles doc's abstract ordering: `sequential → primary action → secondary → back link`. However, it conflicts with Practice's current muscle memory.

---

## Open Questions

1. **Which option feels right?** Option A mirrors Practice's existing pattern (Next after primary action). Option C mirrors History's existing pattern (Next before primary action). Option B is the most disruptive but most principled.

2. **"Try Again" — is the label right?** In History Review, "Try Again" re-attempts the same question. In Practice, the equivalent is just "Submit" again (after clearing). Should these labels converge? Or does the context difference (reviewing a historical attempt vs. practicing live) justify different labels?

3. **Should "Next Question" (verbose) exist anywhere?** The arrow style (`Next →`) is compact and visually symmetric with `← Previous`. Is there ever a reason to prefer the verbose label?

4. **Does this warrant a spec or a quick fix?** Label/order alignment is still a small change (3 primary files: `practice-view.tsx`, `quick-practice-client.tsx`, `question-page-client.tsx`). If we also standardize mobile layout patterns, scope expands to `exam-review-view.tsx` and `session-summary-view.tsx`.

5. **Quick Practice post-submit state?** After submitting in Quick Practice, does the action bar change (e.g., does Submit disable/hide, does "Next Question" become more prominent)? Should the post-submit state be audited as part of this work? *(Answered by Chrome agent audit: Submit stays in DOM but disabled, same as Tutor.)*

6. **Should Bookmark be added to History Review?** Users can bookmark during Practice but not while reviewing in History. If a user encounters a tricky question during review, they have no way to flag it for later. Is this an intentional scope limitation or an oversight?

7. **First/last question boundary: hide or disable?** Practice disables Previous on Q1 (visible but grayed out). History hides it entirely. Should we standardize? Disabled-but-visible signals "this exists, you're just at the start." Hidden keeps the UI clean. Pick one.

8. **Should History keep duplicate back navigation (header + bottom)?** `question-page-client.tsx` now renders back in both places for review contexts (`sessionNavigation || submitResult`). Should we keep both, or standardize to one location across contexts?

9. **`<a>` vs `<button>` for nav buttons?** History uses `<a>` links for Previous/Next (route navigations). Practice uses `<button>` callbacks (state transitions). Both look identical. Should we standardize visuals only, or enforce one semantic model?

10. **Should mobile action bars standardize on wrap or stack?** Practice/Quick use horizontal wrapping; History/Exam Review/Summary use vertical stacking at small widths. Pick one responsive pattern for all bottom action bars?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-17 | Document created | Live UI audit revealed label and ordering inconsistency between Practice and History Review bottom bars |
| 2026-02-17 | Added Quick Practice to audit scope | Quick Practice was missing from original analysis. Uses same `PracticeView` component (inherits "Next Question" label) but intentionally omits Previous — ad hoc mode has no session to navigate |
| 2026-02-17 | Quick Practice: no Previous by design | Quick Practice is stateless/ad hoc — user answers one question and moves on. If they want to revisit, they use History. Adding Previous would imply a session context that doesn't exist |
| 2026-02-17 | Chrome agent full UI audit completed | Systematic walkthrough of all 19 action bar states across Quick Practice, Tutor, Exam, and History Review. Confirmed original 3 inconsistencies and surfaced 5 additional: first/last Q boundary handling, bookmark absent from History, Submit vs Try Again swap, back-nav placement, and `<a>` vs `<button>` element types |
| 2026-02-17 | Source-code audit completed and corrected | Verified every cited path/line against current code. Corrected stale claim about History back-nav location (now header + conditional bottom), added missing History Individual Review action-bar states, corrected disabled-state notes for unanswered History states, and recorded mobile layout-model divergence |

---

## Verified Code Paths

| What | File | Lines | Current |
|------|------|-------|---------|
| Practice "Next Question" button | `app/(app)/app/practice/components/practice-view.tsx` | 274-282 | Text label, no arrow, after Submit |
| Quick Practice client (reuses PracticeView) | `app/(app)/app/practice/quick/quick-practice-client.tsx` | 69-117 | Passes `onNextQuestion` but not `onPreviousQuestion` |
| PracticeView Previous conditional | `app/(app)/app/practice/components/practice-view.tsx` | 249-263 | Renders `← Previous` only when `onPreviousQuestion` is provided |
| Session runner Previous wiring | `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` | 66-87, 215-219 | Computes `previousQuestionId`; passes `onPreviousQuestion` + `hasPreviousQuestion` into `PracticeView` |
| History "Next →" link | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 236-249 | Arrow label, positioned before Submit/Try Again |
| History Submit/Try Again switch | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 251-276 | `Submit` when unanswered; `Try Again` when `submitResult` exists |
| History header back link | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 147-152 | Back link is always in header |
| History bottom back link | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 278-281 | Additional back link rendered when `sessionNavigation || submitResult` |
| Exam Review Stage action bar | `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | 186-191 | Bottom action bar contains `Submit exam` |
| Session Summary action bar | `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | 95-104 | Bottom action bar contains 3 navigation actions |
| Design principles ordering reference | `docs/frontend/design-principles.md` | 56-58 | High-level ordering still states `sequential → primary → secondary → back` |
| Design principles context-row drift | `docs/frontend/design-principles.md` | 70 | `History Session Review (unanswered)` row omits `Back to History`; current code includes it |
| BS-018 proposed unified bar | `docs/_archive/brainstorming/bs-018-question-view-ux-unification.md` | 116-122 | Proposed `Next →` everywhere, but implementation retained "Next Question" in Practice |

---

## Audit Scope Coverage

- Bottom action bars exist in four implementation files: `practice-view.tsx`, `question-page-client.tsx`, `exam-review-view.tsx`, and `session-summary-view.tsx`.
- Missing from the original BS-019 scope: **History Individual Review** (no `sessionId`), which has distinct bottom-bar states. Added to Appendix rows 29-31.
- `rg` scan across `app/(app)/app/practice`, `app/(app)/app/questions`, and `app/(app)/app/history` found no additional bottom action bar implementations beyond the four files above.

---

## Related Documentation

- [BS-018 Concern 3](../_archive/brainstorming/bs-018-question-view-ux-unification.md) — Action bar inconsistency (high-level)
- [Design Principles §2](../frontend/design-principles.md) — Action bar composition ordering
- [SPEC-030](../_archive/specs/spec-030-question-view-ux-unification.md) — Implemented structural unification; did not reconcile labels/ordering

---

## Appendix: Full Action Bar State Matrix (Source Code Audit)

Code-verified matrix of currently reachable action-bar states as of 2026-02-17.

| # | Mode + State | Buttons (left → right) | Arrows | Disabled? |
|---|-------------|----------------------|--------|-----------|
| 1 | Quick Practice / Pre-submit (no answer selected) | Submit · Next Question · Bookmark | None | Submit disabled |
| 2 | Quick Practice / Pre-submit (answer selected) | Submit · Next Question · Bookmark | None | All enabled |
| 3 | Quick Practice / Post-submit (correct) | Submit · Next Question · Bookmark | None | Submit disabled |
| 4 | Quick Practice / Post-submit (incorrect) | Submit · Next Question · Bookmark | None | Submit disabled |
| 5 | Quick Practice / Bookmarked toggle | Submit · Next Question · Remove bookmark | None | Submit state-dependent |
| 6 | Tutor / Q1 pre-submit (no answer selected) | ← Previous · Submit · Next Question · Bookmark | ← only | Previous disabled, Submit disabled |
| 7 | Tutor / Q1 pre-submit (answer selected) | ← Previous · Submit · Next Question · Bookmark | ← only | Previous disabled |
| 8 | Tutor / Q1 post-submit | ← Previous · Submit · Next Question · Bookmark | ← only | Previous disabled, Submit disabled |
| 9 | Tutor / Middle Q pre-submit (no answer selected) | ← Previous · Submit · Next Question · Bookmark | ← only | Submit disabled |
| 10 | Tutor / Middle Q pre-submit (answer selected) | ← Previous · Submit · Next Question · Bookmark | ← only | All enabled |
| 11 | Tutor / Middle Q post-submit | ← Previous · Submit · Next Question · Bookmark | ← only | Submit disabled |
| 12 | Tutor / Last Q pre-submit (no answer selected) | ← Previous · Submit · Next Question · Bookmark | ← only | Submit disabled |
| 13 | Tutor / Last Q pre-submit (answer selected) | ← Previous · Submit · Next Question · Bookmark | ← only | All enabled |
| 14 | Tutor / Last Q post-submit | ← Previous · Submit · Next Question · Bookmark | ← only | Submit disabled |
| 15 | Exam / Q1 pre-submit (no answer selected) | ← Previous · Submit · Next Question · Bookmark · Mark for review | ← only | Previous disabled, Submit disabled |
| 16 | Exam / Q1 pre-submit (answer selected) | ← Previous · Submit · Next Question · Bookmark · Mark for review | ← only | Previous disabled |
| 17 | Exam / Middle Q pre-submit (no answer selected) | ← Previous · Submit · Next Question · Bookmark · Mark for review | ← only | Submit disabled |
| 18 | Exam / Middle Q pre-submit (answer selected) | ← Previous · Submit · Next Question · Bookmark · Mark for review | ← only | All enabled |
| 19 | Exam / Last Q pre-submit (no answer selected) | ← Previous · Submit · Next Question · Bookmark · Mark for review | ← only | Submit disabled |
| 20 | Exam / Last Q pre-submit (answer selected) | ← Previous · Submit · Next Question · Bookmark · Mark for review | ← only | All enabled |
| 21 | Exam / Mark for review toggled | ← Previous · Submit · Next Question · Bookmark · Unmark review | ← only | Submit state-dependent |
| 22 | Exam / Review Questions page | Submit exam | None | Submit exam disabled while pending |
| 23 | History Session Review / Q1 answered | Next → · Try Again · Back to History | → only | Try Again disabled only while pending |
| 24 | History Session Review / Q1 unanswered | Next → · Submit · Back to History | → only | Submit disabled until choice selected |
| 25 | History Session Review / Middle Q answered | ← Previous · Next → · Try Again · Back to History | ← and → | Try Again disabled only while pending |
| 26 | History Session Review / Middle Q unanswered | ← Previous · Next → · Submit · Back to History | ← and → | Submit disabled until choice selected |
| 27 | History Session Review / Last Q answered | ← Previous · Try Again · Back to History | ← only | Try Again disabled only while pending |
| 28 | History Session Review / Last Q unanswered | ← Previous · Submit · Back to History | ← only | Submit disabled until choice selected |
| 29 | History Individual Review / Answered | Try Again · Back to History | None | Try Again disabled only while pending |
| 30 | History Individual Review / Unanswered (no choice selected) | Submit | None | Submit disabled |
| 31 | History Individual Review / Unanswered (choice selected) | Submit | None | Submit enabled |
| 32 | Session Summary (Tutor & Exam) | Back to Dashboard · View in History · Start another session | None | — |

Notes:
- `QuestionView` always renders a top-right header back link. Bottom-bar back appears only when `sessionNavigation || submitResult`.
- Exam auto-advances after submit when not on the last question, so non-last exam post-submit action-bar states are transient.
