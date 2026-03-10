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

### Inventory

| File | Line | Current | Content |
|------|------|---------|---------|
| `practice-session-starter.tsx` | 106 | `<div>` | "Start a session" |
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

## Issue 3: Touch Targets Below 44px on Interactive Controls

### Problem

Multiple interactive control types are below the 44px WCAG 2.1 SC 2.5.5 (AAA) / Apple / Google recommended minimum. This is not an AA failure in the current codebase, but it is a real platform-guideline / ergonomics gap.

| Component | Vertical padding | Effective height |
|-----------|-----------------|-----------------|
| `SegmentedControl` button | `py-2` (8px) | ~36px |
| `FilterChip` button | `py-1.5` (6px) + `border` (2px) | ~34px |
| `Button` (default) | `h-9 py-2` | 36px |

### Scope concern

These are shared components used across the entire app. Any height change affects every page. This requires a deliberate design decision, not a drive-by fix.

### Proposed approach

- Decide whether the project wants to adopt 44px as a frontend standard, or explicitly accept the current sub-44px shared control heights
- Audit which components fall short
- Bump padding in the shared style constants (`tab-switch-styles.ts`, `filter-chip.tsx`, `button.tsx`)
- May require visual regression review across all pages

### Risk

Medium. Changing shared component heights has a wide blast radius. Should be done as a focused effort with visual regression testing.

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

`choice-button.tsx` line 58 uses `items-start` with a fixed-height circle + variable-height markdown — correct approach for disparate heights.

### Proposed fix

- Use `items-start` (or `items-baseline`) when children have different intrinsic heights
- Reserve `items-center` for cases where children are the same height

### Risk

Low. Local layout changes only. Should verify visually per instance.

---

## Acceptance Criteria

- [ ] Label-to-control spacing standardized on `space-y-2` wrapper pattern
- [ ] Card titles use heading elements (`<h2>`/`<h3>`) instead of `<div>`
- [ ] Touch target minimum height policy decided and applied to shared components
- [ ] Flex containers use appropriate alignment for disparate child heights
- [ ] Visual regression check across the verified affected pages

---

## What This Does NOT Change

- Component functionality or API behavior
- Color scheme or theming
- Practice session starter card specifics (tracked in DEBT-297)
- Filter chip visual styling (resolved in DEBT-295)
- Server-side rendering or data fetching
