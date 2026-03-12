# DEBT-298: UI Structural Consistency Audit

**Priority:** P3
**Created:** 2026-03-10
**Status:** Open
**Source:** Chrome Claude visual audit of Practice page + codebase-wide investigation
**Related:** DEBT-297 (practice starter card-level fixes)

---

## Context

A visual audit of the Practice page surfaced several structural inconsistencies. Follow-up codebase spot-checks confirmed some of these patterns recur in the dashboard, history questions tab, and practice session review views. Not every issue repeats everywhere; each item below lists only the files actually verified.

None of these break functionality. They are maintenance and accessibility improvements that compound over time if left unaddressed.

---

## Issue 1: Inconsistent Label-to-Control Spacing Patterns

### Problem

Within the same component, some field groups use `<div className="space-y-2">` wrapping both label and control, while siblings use a bare `<div>` with `<div className="mt-2">` around the control. Both produce ~8px spacing today, but the inconsistent markup makes refactoring fragile.

### Inventory

| File | Fields | Pattern |
|------|--------|---------|
| `practice-session-starter.tsx` | Mode, Questions | `space-y-2` parent wrapper |
| `practice-session-starter.tsx` | Status, Difficulty | `mt-2` on control wrapper |
| `history-questions-tab.tsx` | Result, Difficulty, Tag, Sort | `space-y-2` (reference pattern; internally consistent) |

### Proposed fix

Standardize on `space-y-2` parent wrapper for all label + control pairs. It is already the majority pattern.

### Risk

None. Output is visually identical.

---

## Issue 2: Card Titles Use `<div>` Instead of Heading Elements

### Problem

Several Card components still use `<div className="text-sm font-medium text-foreground">` for their titles instead of `<h2>` or `<h3>`. This creates a flatter document outline than necessary — screen reader users navigating by heading skip those cards.

Partial progress since the initial audit: `practice-session-starter.tsx` now uses a real `<h2>` for "Start a session". The inventory below reflects the remaining open cases only.

### Inventory

| File | Line | Current | Content |
|------|------|---------|---------|
| `dashboard/page.tsx` | 106 | `<div>` | "Ready to practice?" |
| `dashboard/page.tsx` | 123 | `<div>` | "Recent sessions" |
| `dashboard/page.tsx` | 187 | `<div>` | "Recent activity" |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | 72 | `<div>` | "Question breakdown" |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | 38 | `<h2>` | "Question navigator" (correct semantic reference) |

### Proposed fix

- Card titles should use real heading elements first (`<h2>` or `<h3>` depending on page outline)
- Promote typography to `text-base font-semibold` only where the current title is visually competing with field labels or sibling helper copy
- `exam-review-view.tsx` is already correct as the semantic reference pattern for card headings

### Risk

Low. Need to verify heading hierarchy doesn't create duplicate levels.

---

## Issue 3: Touch Targets Below 44px on Interactive Controls — DECIDED: Accepted

**Decision (2026-03-12):** Current sizes are explicitly accepted. Documented in [Frontend Standards §11 — Touch target sizes](../frontend/standards.md#touch-target-sizes).

| Component | Current effective height | Status |
|-----------|------------------------|--------|
| `SegmentedControl` button | ~36px (`py-2`) | Accepted |
| `FilterChip` button | ~34px (`py-1.5` + border) | Accepted |
| `Button` (default) | 36px (`h-9`) | Accepted |

**Rationale:** The 44px guideline is WCAG AAA (aspirational), not AA (required). This is a desktop-first educational app. Bumping shared components has a wide blast radius for marginal mobile ergonomics gain.

**Future reconsideration:** If mobile usage grows, consider responsive padding (e.g., larger `py` on mobile breakpoints, standard `py` on `sm:` and up) so mobile gets larger tap targets without affecting desktop layout. This would be a targeted per-component change, not a blanket height increase.

---

## Issue 4: Flex `items-center` with Differently-Sized Children

### Problem

Several flex containers use `items-center` when child elements have noticeably different heights, causing label misalignment.

### Inventory

| File | Line | Container | Children | Issue |
|------|------|-----------|----------|-------|
| `practice-session-starter.tsx` | 116 | `sm:flex-row sm:items-center` | Taller Mode block + shorter Questions block | Labels sit at different vertical positions at the `sm:` breakpoint |
| `dashboard/page.tsx` | 104 | `sm:flex-row sm:items-center` | Multi-line text + 36px button | Text block and button don't align naturally |

### Counter-example (correct pattern)

`components/question/choice-button.tsx` line 58 uses `items-start` with a fixed-height circle + variable-height markdown — correct approach for disparate heights.

### Proposed fix

- Use `items-start` (or `items-baseline`) when children have different intrinsic heights
- Reserve `items-center` for cases where children are the same height

### Risk

Low. Local layout changes only. Should verify visually per instance.

---

## Standards References

All four issues now have canonical standards documented in [Frontend Standards](../frontend/standards.md):

- **Issue 1** → §5 Spacing & Layout — "Label-to-control spacing"
- **Issue 2** → §4 Typography — "Card title elements"
- **Issue 3** → §11 Accessibility — "Touch target sizes"
- **Issue 4** → §5 Spacing & Layout — "Flex alignment with mixed-height children"

## Acceptance Criteria

- [ ] Label-to-control spacing standardized on `space-y-2` wrapper pattern (Issue 1)
- [ ] Card titles use heading elements (`<h2>`/`<h3>`) instead of `<div>` (Issue 2)
- [x] Touch target minimum height policy decided — accepted at current sizes (Issue 3, decided 2026-03-12)
- [ ] Flex containers use appropriate alignment for disparate child heights (Issue 4)
- [ ] Visual regression check across the verified affected pages

---

## What This Does NOT Change

- Component functionality or API behavior
- Color scheme or theming
- Practice session starter card specifics (tracked in DEBT-297)
- Filter chip visual styling (resolved in DEBT-295)
- Server-side rendering or data fetching
