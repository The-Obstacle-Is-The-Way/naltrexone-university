# BS-019: Action Bar Label and Ordering Consistency

**Date:** 2026-02-17
**Triggered by:** Live UI audit — visual comparison of bottom action bars across Practice, Quick Practice, and History Review views
**Scope:** The "Next" button has different labels and different positioning relative to the primary action across Practice, Quick Practice, and History Review, creating a disjointed UX
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

**History Session Review** (`question-page-client.tsx:221-276`):
```
← Previous | Next → | Try Again | Back to History
 arrow        ARROW     text        text
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

### Inconsistency 8: "Back to ___" Placement and Element Types

| Context | Back Navigation | Location | Element |
|---------|----------------|----------|---------|
| Practice (Tutor) | `End session` | Top-right header | `<button>` |
| Practice (Exam) | `Review answers` | Top-right header | `<button>` |
| Quick Practice | `Back to Practice` | Top-right header | `<a>` link |
| History Review | `Back to History` | **Bottom action bar** | `<a>` ghost link (muted text, no border) |

History puts its back-navigation in the action bar alongside action buttons. All other modes put it in the header. This means History's action bar has a mixed concern (navigation + actions + escape hatch) while Practice's action bar is purely actions + navigation.

Additionally, History's nav buttons (`← Previous`, `Next →`, `Back to History`) are `<a>` link elements, while Practice's are `<button>` elements. Same visual appearance, different semantics — this affects keyboard navigation and accessibility.

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
| "Back to ___" in action bar vs header | Low | All users | Every session |
| `<a>` vs `<button>` element type mismatch | Low | Screen reader / keyboard users | Every History session |

These are not bugs — all views work correctly. But they undermine the product's sense of being *one coherent system*. The bookmark gap in History Review is the most impactful finding — it's a functional limitation, not just cosmetic. For a study tool where users build habits through repetition, consistent button placement, labels, and available actions reduce cognitive load.

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

4. **Does this warrant a spec or a quick fix?** The change is 3 files (Practice, Quick Practice, History), ~15 lines total. It could be implemented directly or folded into a SPEC-030 follow-up.

5. **Quick Practice post-submit state?** After submitting in Quick Practice, does the action bar change (e.g., does Submit disable/hide, does "Next Question" become more prominent)? Should the post-submit state be audited as part of this work? *(Answered by Chrome agent audit: Submit stays in DOM but disabled, same as Tutor.)*

6. **Should Bookmark be added to History Review?** Users can bookmark during Practice but not while reviewing in History. If a user encounters a tricky question during review, they have no way to flag it for later. Is this an intentional scope limitation or an oversight?

7. **First/last question boundary: hide or disable?** Practice disables Previous on Q1 (visible but grayed out). History hides it entirely. Should we standardize? Disabled-but-visible signals "this exists, you're just at the start." Hidden keeps the UI clean. Pick one.

8. **Should "Back to History" move out of the action bar?** Every other mode puts back-navigation in the top-right header. History puts it in the bottom action bar as a ghost link. Should History match the others, or should all modes move their back-nav into the action bar for consistency?

9. **`<a>` vs `<button>` for nav buttons?** History uses `<a>` links for Previous/Next (they're actual route navigations). Practice uses `<button>` (they trigger JS callbacks). Both look identical. Should we standardize the element type, or is the semantic difference correct (route change vs. state change)?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-17 | Document created | Live UI audit revealed label and ordering inconsistency between Practice and History Review bottom bars |
| 2026-02-17 | Added Quick Practice to audit scope | Quick Practice was missing from original analysis. Uses same `PracticeView` component (inherits "Next Question" label) but intentionally omits Previous — ad hoc mode has no session to navigate |
| 2026-02-17 | Quick Practice: no Previous by design | Quick Practice is stateless/ad hoc — user answers one question and moves on. If they want to revisit, they use History. Adding Previous would imply a session context that doesn't exist |
| 2026-02-17 | Chrome agent full UI audit completed | Systematic walkthrough of all 19 action bar states across Quick Practice, Tutor, Exam, and History Review. Confirmed original 3 inconsistencies and surfaced 5 additional: first/last Q boundary handling, bookmark absent from History, Submit vs Try Again swap, back-nav placement, and `<a>` vs `<button>` element types |

---

## Verified Code Paths

| What | File | Lines | Current |
|------|------|-------|---------|
| Practice "Next Question" button | `app/(app)/app/practice/components/practice-view.tsx` | 274-282 | Text label, no arrow, after Submit |
| Quick Practice client (reuses PracticeView) | `app/(app)/app/practice/quick/quick-practice-client.tsx` | 69-118 | Passes `onNextQuestion` but NOT `onPreviousQuestion` — Previous absent by design |
| PracticeView Previous conditional | `app/(app)/app/practice/components/practice-view.tsx` | 249-263 | Renders `← Previous` only if `onPreviousQuestion` prop is provided |
| History "Next →" link | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 236-249 | Arrow label, before Try Again |
| History "Try Again" button | Same file | 266-276 | After "Next →" |
| Design principles ordering | `docs/frontend/design-principles.md` | 56-58 | `[← Previous] [Submit / Next →] [Bookmark / Mark for review] [Back link]` |
| BS-018 proposed unified bar | `docs/brainstorming/bs-018-question-view-ux-unification.md` | 116-122 | Proposed `Next →` everywhere, but SPEC-030 implementation kept "Next Question" |

---

## Related Documentation

- [BS-018 Concern 3](../_archive/brainstorming/bs-018-question-view-ux-unification.md) — Action bar inconsistency (high-level)
- [Design Principles §2](../frontend/design-principles.md) — Action bar composition ordering
- [SPEC-030](../_archive/specs/spec-030-question-view-ux-unification.md) — Implemented structural unification; did not reconcile labels/ordering

---

## Appendix: Full Action Bar State Matrix (Chrome Agent Audit)

Complete audit of every action bar state, captured via systematic browser walkthrough on 2026-02-17.

| # | Mode + State | Buttons (left → right) | Arrows | Disabled? |
|---|-------------|----------------------|--------|-----------|
| 1 | Quick Practice / Pre-submit (no answer) | Submit · Next Question · Bookmark | None | Submit disabled |
| 2 | Quick Practice / Pre-submit (answer selected) | Submit · Next Question · Bookmark | None | All enabled |
| 3 | Quick Practice / Post-submit (correct) | Submit · Next Question · Bookmark | None | Submit disabled |
| 4 | Quick Practice / Post-submit (incorrect) | Submit · Next Question · Bookmark | None | Submit disabled |
| 5 | Quick Practice / Bookmarked toggle | Submit · Next Question · Remove bookmark | None | — |
| 6 | Tutor / Q1 pre-submit (no answer) | ← Previous · Submit · Next Question · Bookmark | ← only | Previous disabled, Submit disabled |
| 7 | Tutor / Q1 post-submit | ← Previous · Submit · Next Question · Bookmark | ← only | Previous disabled, Submit disabled |
| 8 | Tutor / Middle Q pre-submit | ← Previous · Submit · Next Question · Bookmark | ← only | Submit disabled |
| 9 | Tutor / Last Q pre-submit | ← Previous · Submit · Next Question · Bookmark | ← only | Submit disabled |
| 10 | Exam / Q1 pre-submit | ← Previous · Submit · Next Question · Bookmark · Mark for review | ← only | Previous disabled, Submit disabled |
| 11 | Exam / Middle Q | ← Previous · Submit · Next Question · Bookmark · Mark for review | ← only | Submit disabled |
| 12 | Exam / Last Q | ← Previous · Submit · Next Question · Bookmark · Mark for review | ← only | Submit disabled |
| 13 | Exam / Mark for review toggled | … · Unmark review | — | — |
| 14 | Exam / Review Questions page | Submit exam | None | — |
| 15 | History / Q1 (answered) | Next → · Try Again · Back to History | → only | None |
| 16 | History / Middle Q (answered) | ← Previous · Next → · Try Again · Back to History | ← and → | None |
| 17 | History / Middle Q (unanswered) | ← Previous · Next → · Submit · Back to History | ← and → | None |
| 18 | History / Last Q (unanswered) | ← Previous · Submit · Back to History | ← only | None |
| 19 | Session Summary (Tutor & Exam) | Back to Dashboard · View in History · Start another session | None | — |
