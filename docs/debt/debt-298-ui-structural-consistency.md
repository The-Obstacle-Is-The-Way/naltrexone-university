# DEBT-298: UI Structural Consistency Audit

**Priority:** P3
**Created:** 2026-03-10
**Status:** Open
**Source:** Chrome Claude visual audit of Practice page + codebase-wide investigation
**Related:** DEBT-297 (practice starter card-level fixes)

---

## Context

A visual audit of the Practice page surfaced several structural inconsistencies. Codebase investigation confirmed these patterns are not isolated to one page — they repeat across dashboard, history, bookmarks, and practice session views.

None of these break functionality. They are maintenance and accessibility improvements that compound over time if left unaddressed.

---

## Issue 1: Mixed Label Semantics — `<label>` vs `<div>` for Field Labels

### Problem

Some field labels use semantic `<label htmlFor="...">` elements (correct), while adjacent labels in the same component use `<div>` (non-semantic). The `<label>` elements also lack a `block` class, so they default to `display: inline`, creating subtle spacing differences from their `<div>` siblings.

### Inventory

| File | Line(s) | Element | Notes |
|------|---------|---------|-------|
| `practice-session-starter.tsx` | 131 | `<label>` | Questions — inline, no `block` class |
| `practice-session-starter.tsx` | 118, 150, 167 | `<div>` | Mode, Status, Difficulty — block by default |
| `history-questions-tab.tsx` | 193, 228, 268, 317 | `<label>` | Result, Difficulty, Tag, Sort — inline, no `block` class |
| `session-summary-view.tsx` | 72 | `<div>` | "Question breakdown" — non-semantic |

### Proposed fix

- Use `<label htmlFor="...">` when a label is associated with a specific input/control
- Use `<div>` (or `<h3>`) for section titles that label a group rather than a single control
- Always add the `block` class to `<label>` elements for consistent spacing with `<div>` siblings

### Risk

None. Semantic markup improvement only.

---

## Issue 2: Inconsistent Label-to-Control Spacing Patterns

### Problem

Within the same component, some field groups use `<div className="space-y-2">` wrapping both label and control, while siblings use a bare `<div>` with `<div className="mt-2">` around the control. Both produce ~8px spacing, but the inconsistent markup makes refactoring fragile.

### Inventory

| File | Fields | Pattern |
|------|--------|---------|
| `practice-session-starter.tsx` | Mode, Questions | `space-y-2` parent wrapper |
| `practice-session-starter.tsx` | Status, Difficulty | `mt-2` on control wrapper |
| `history-questions-tab.tsx` | Result, Difficulty, Tag, Sort | `space-y-2` (consistent within this file) |

### Proposed fix

Standardize on `space-y-2` parent wrapper for all label + control pairs. It is already the majority pattern.

### Risk

None. Output is visually identical.

---

## Issue 3: Card Titles Use `<div>` Instead of Heading Elements

### Problem

Most Card components use `<div className="text-sm font-medium text-foreground">` for their titles instead of `<h2>` or `<h3>`. This creates a flat document outline — screen reader users navigating by heading skip all cards.

### Inventory

| File | Line | Current | Content |
|------|------|---------|---------|
| `practice-session-starter.tsx` | 106 | `<div>` | "Start a session" |
| `dashboard/page.tsx` | 106 | `<div>` | "Ready to practice?" |
| `dashboard/page.tsx` | 123 | `<div>` | "Recent sessions" |
| `session-summary-view.tsx` | 72 | `<div>` | "Question breakdown" |
| `exam-review-view.tsx` | 38 | `<h2>` | "Question navigator" (correct) |

### Proposed fix

- Card primary titles → `<h2>` with `text-base font-semibold` (visually distinct from field labels)
- Card sub-section titles → `<h3>` if needed
- `exam-review-view.tsx` is already correct — use as the reference pattern

### Risk

Low. Need to verify heading hierarchy doesn't create duplicate levels.

---

## Issue 4: Touch Targets Below 44px on Interactive Controls

### Problem

Multiple interactive control types have inconsistent heights, all below the 44px WCAG 2.5.5 (AAA) / Apple / Google recommended minimum:

| Component | Vertical padding | Effective height |
|-----------|-----------------|-----------------|
| `SegmentedControl` button | `py-2` (8px) | ~32px |
| `FilterChip` button | `py-1.5` (6px) | ~28px |
| `Button` (default) | `h-9 py-2` | 36px |

### Scope concern

These are shared components used across the entire app. Any height change affects every page. This requires a deliberate design decision, not a drive-by fix.

### Proposed approach

- Decide on a minimum touch target height (36px for AA, 44px for AAA)
- Audit which components fall short
- Bump padding in the shared style constants (`tab-switch-styles.ts`, `filter-chip.tsx`, `button.tsx`)
- May require visual regression review across all pages

### Risk

Medium. Changing shared component heights has a wide blast radius. Should be done as a focused effort with visual regression testing.

---

## Issue 5: Flex `items-center` with Differently-Sized Children

### Problem

Several flex containers use `items-center` when child elements have noticeably different heights, causing label misalignment.

### Inventory

| File | Line | Container | Children | Issue |
|------|------|-----------|----------|-------|
| `practice-session-starter.tsx` | 116 | `sm:flex-row sm:items-center` | Mode block (~74px) + Questions block (~57px) | Labels sit at different vertical positions |
| `dashboard/page.tsx` | 104 | `sm:flex-row sm:items-center` | Multi-line text + 36px button | Text block and button don't align naturally |
| `dashboard/page.tsx` | 156 | `flex items-center` | 20px badge + 12px text | Minor but visible misalignment |

### Counter-example (correct pattern)

`choice-button.tsx` line 58 uses `items-start` with a fixed-height circle + variable-height markdown — correct approach for disparate heights.

### Proposed fix

- Use `items-start` (or `items-baseline`) when children have different intrinsic heights
- Reserve `items-center` for cases where children are the same height

### Risk

Low. Local layout changes only. Should verify visually per instance.

---

## Acceptance Criteria

- [ ] All field labels use semantically appropriate elements (`<label>` for inputs, `<div>`/heading for sections)
- [ ] All `<label>` elements include `block` class for consistent display
- [ ] Label-to-control spacing standardized on `space-y-2` wrapper pattern
- [ ] Card titles use heading elements (`<h2>`/`<h3>`) instead of `<div>`
- [ ] Touch target minimum height decided and applied to shared components
- [ ] Flex containers use appropriate alignment for disparate child heights
- [ ] Visual regression check across dashboard, practice, history, bookmarks pages

---

## What This Does NOT Change

- Component functionality or API behavior
- Color scheme or theming
- Practice session starter card specifics (tracked in DEBT-297)
- Filter chip visual styling (resolved in DEBT-295)
- Server-side rendering or data fetching
