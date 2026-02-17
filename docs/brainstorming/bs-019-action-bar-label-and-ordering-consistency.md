# BS-019: Action Bar Label and Ordering Consistency

**Date:** 2026-02-17
**Triggered by:** Live UI audit — visual comparison of bottom action bars across Practice and History Review views
**Scope:** The "Next" button has different labels and different positioning relative to the primary action across Practice and History Review, creating a disjointed UX
**Related:** [BS-018](../_archive/brainstorming/bs-018-question-view-ux-unification.md), [SPEC-030](../_archive/specs/spec-030-question-view-ux-unification.md), [Design Principles §2](../frontend/design-principles.md)

---

## The Problem

SPEC-030 unified the *structural* layout (added Previous to Practice, moved sequential nav to Zone 2 bottom bar, fixed Tutor state persistence). But the *label style* and *button ordering* between Practice and History Review still diverge:

### Current State

**Practice mode** (`practice-view.tsx:248-307`):
```
← Previous | Submit | Next Question | Bookmark
 arrow         text     TEXT (no arrow)   text
```

**History Session Review** (`question-page-client.tsx:221-276`):
```
← Previous | Next → | Try Again | Back to History
 arrow        ARROW     text        text
```

### Inconsistency 1: Label Style

| Button | Practice | History Review |
|--------|----------|----------------|
| Previous | `← Previous` (arrow) | `← Previous` (arrow) |
| Next | `Next Question` (text, no arrow) | `Next →` (arrow) |

Previous is consistent (both use `←` arrow prefix). Next is not — Practice uses a verbose text label while History uses a compact arrow suffix. The asymmetry is visually jarring when switching between contexts.

### Inconsistency 2: Button Ordering

| Context | Order | Pattern |
|---------|-------|---------|
| Practice | `← Previous` → `Submit` → `Next Question` → `Bookmark` | Next is **after** primary action |
| History | `← Previous` → `Next →` → `Try Again` → `Back to History` | Next is **before** primary action |

In Practice, the user reads left-to-right: Previous, then the primary action (Submit), then Next. In History, it's: Previous, then Next, then the primary action (Try Again). The primary action shifts position.

### Why This Matters

Users who practice questions (Practice mode) and later review them (History) are the same people doing the same cognitive task — navigating a question list. When the same "Next" button has a different name and a different position relative to the action button, it creates friction. The user's muscle memory from Practice doesn't transfer to History.

---

## Root Cause

BS-018's proposed design direction (§ "Unified Bottom Action Bar") specified `Next →` with arrows for all contexts, but the SPEC-030 implementation preserved the pre-existing "Next Question" label in `practice-view.tsx`. The ordering was inherited from two separate development timelines:

- Practice's bottom bar (SPEC-013/020) was built first with `[Submit] [Next Question]`
- History Review's bottom bar (SPEC-027/030) was built later with `[Next →] [Try Again]`

Neither spec reconciled the label style or button ordering with the other.

---

## Severity Assessment

| Issue | Severity | Who's Affected | How Often |
|-------|----------|----------------|-----------|
| "Next Question" vs "Next →" label mismatch | Low-Medium | Anyone switching between Practice and History Review | Every session |
| Next before/after primary action ordering | Low-Medium | Same population | Every session |

These are not bugs — both views work correctly. But they undermine the product's sense of being *one coherent system*. For a study tool where users build habits through repetition, consistent button placement and labels reduce cognitive load.

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

**History Session Review (answered):**
```
← Previous | Try Again | Next → | Back to History
```

**Rationale:** In Practice, Next is already to the right of Submit. Mirroring that in History (Next to the right of Try Again) creates a consistent mental model: "left = back, center = act, right = forward."

### Option B: Standardize Sequential Nav as Outermost Pair

Cluster Previous and Next as bookends, with action buttons in the center. This follows a "sandwich" layout common in media players and multi-step wizards.

**Practice (before submit):**
```
← Previous | Submit | Bookmark | Next →
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

4. **Does this warrant a spec or a quick fix?** The change is 2 files, ~10 lines total. It could be implemented directly or folded into a SPEC-030 follow-up.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-17 | Document created | Live UI audit revealed label and ordering inconsistency between Practice and History Review bottom bars |

---

## Verified Code Paths

| What | File | Lines | Current |
|------|------|-------|---------|
| Practice "Next Question" button | `app/(app)/app/practice/components/practice-view.tsx` | 274-282 | Text label, no arrow, after Submit |
| History "Next →" link | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 236-249 | Arrow label, before Try Again |
| History "Try Again" button | Same file | 266-276 | After "Next →" |
| Design principles ordering | `docs/frontend/design-principles.md` | 56-58 | `[← Previous] [Submit / Next →] [Bookmark / Mark for review] [Back link]` |
| BS-018 proposed unified bar | `docs/brainstorming/bs-018-question-view-ux-unification.md` | 116-122 | Proposed `Next →` everywhere, but SPEC-030 implementation kept "Next Question" |

---

## Related Documentation

- [BS-018 Concern 3](../_archive/brainstorming/bs-018-question-view-ux-unification.md) — Action bar inconsistency (high-level)
- [Design Principles §2](../frontend/design-principles.md) — Action bar composition ordering
- [SPEC-030](../_archive/specs/spec-030-question-view-ux-unification.md) — Implemented structural unification; did not reconcile labels/ordering
