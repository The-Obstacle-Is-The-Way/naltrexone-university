# DEBT-269: History Breakdown UX Redesign (BS-036 Implementation)

**Status:** Resolved (2026-03-01)
**Priority:** P2
**Date:** 2026-03-01
**Owner:** Frontend
**Related:** [BS-036](../brainstorming/bs-036-history-breakdown-ux-redesign.md), [SPEC-038](../specs/spec-038-history-ux-remediation.md), [BS-035](../brainstorming/bs-035-card-hover-and-gray-consistency-audit.md)

---

## Description

The history page breakdown expansion has five UX issues identified in BS-036:

1. **Inverted dark-mode layering** — Inner container (`bg-background/60` → ~2.1% effective) renders darker than outer card (`bg-muted/20` → ~4.9% effective), creating a visual "hole" instead of proper depth hierarchy.
2. **Redundant "Review session" button** — Three paths navigate to the same destination (question 1 in review mode). The button dominates a question-level context with a session-level action.
3. **Unstyled breakdown list** — `SessionBreakdownList` renders as bare text with no row separation, padding, or hover affordance. 20+ questions read as a wall of text.
4. **Missing disclosure accessibility** — "View/Hide breakdown" toggle lacks `aria-expanded` and `aria-controls`. Screen readers cannot communicate toggle state.
5. **Interaction semantics gap** — `<li>` uses `tabIndex={0}` + `onKeyDown` while containing nested `<Link>` and `<Button>` elements, creating ambiguous keyboard navigation.

## Why this is debt (not a one-line fix)

The issues span two files, affect both light and dark mode, touch shared components used in multiple contexts, and require coordinated changes to surface styling, button removal, list structure, accessibility attributes, and interaction semantics. Piecemeal fixes risk inconsistency.

## Required change set

### 1. Flatten inner container surface

**File:** `history-sessions-tab.tsx:253`

```tsx
// Before (inverted depth)
<div className="mt-3 -mx-1 space-y-2 rounded-lg border border-border/30 bg-background/60 p-3">

// After (flat, divider only)
<div className="mt-3 pt-3 border-t border-border/30">
```

Remove `bg-background/60`, `border border-border/30`, `rounded-lg`, `-mx-1`, `p-3`. Replace with `border-t` separator only. The card's outer border provides containment.

- [x] Replace inner container classes
- [x] Add `id={`breakdown-${row.sessionId}`}` to panel
- [x] Add `role="region"` and `aria-label="Question breakdown"` to panel
- [x] Verify light mode and dark mode both render correctly

### 2. Remove "Review session" button

**File:** `history-sessions-tab.tsx:254-258`

Delete the entire `sessionReviewHref` conditional that renders the "Review session" `<Button>`.

- [x] Remove button JSX
- [x] Verify session summary link has clear hover/focus affordance (discoverability condition)
- [x] Verify row-level click handler still navigates correctly

### 3. Improve `SessionBreakdownList` row structure

**File:** `session-breakdown-list.tsx:20-58`

Move from bare text rows to structured rows with visual rhythm:

- [x] Add `divide-y divide-border/20` to the `<ul>` for row separation
- [x] Add `py-2` padding to each `<li>` for breathing room
- [x] Add `hover:bg-muted/20 -mx-2 px-2 rounded-md transition-colors` on clickable rows
- [x] Right-align status labels (`Correct`/`Incorrect`/`Unanswered`) with consistent placement
- [x] Verify changes work in both contexts: history breakdown and session summary view (`session-summary-view.tsx`)

### 4. Wire disclosure accessibility

**File:** `history-sessions-tab.tsx:239-249`

On the "View/Hide breakdown" button:
- [x] Add `aria-expanded={isSelected}`
- [x] Add `aria-controls={`breakdown-${row.sessionId}`}`

On the expanded panel (from item 1):
- [x] `id`, `role="region"`, `aria-label` (covered in item 1)

### 5. Simplify interaction semantics

**File:** `history-sessions-tab.tsx:177-211`

The current `<li tabIndex={0} onKeyDown={...}>` pattern with nested `<Link tabIndex={-1}>` and `<Button>` creates ambiguous keyboard behavior.

- [x] Prefer a single explicit summary `<Link>` as the primary session-level navigation target (remove `tabIndex`/`onKeyDown` from `<li>`)
- [x] Keep "View/Hide breakdown" as a separate `<Button>` disclosure control
- [x] Keep question rows in `SessionBreakdownList` as explicit `<Link>` elements
- [x] Verify keyboard navigation flows correctly: Tab → summary link → breakdown button → (if expanded) question links

### 6. Add empty state

**File:** `session-breakdown-list.tsx` or `history-sessions-tab.tsx`

- [x] If breakdown loads with zero rows, show: "No questions available for this session."
- [x] Apply to both loading error and empty data states

## Acceptance criteria

- [x] Dark mode: no visible depth inversion in expanded breakdown
- [x] Light mode: clean flat expansion with subtle `border-t` separator
- [x] "Review session" button removed; session summary link remains interactive with clear affordance
- [x] Breakdown list has row separators, padding, and hover affordance on clickable rows
- [x] `aria-expanded` and `aria-controls` wired on disclosure toggle
- [x] Expanded panel has `id`, `role="region"`, `aria-label`
- [x] No `tabIndex` + `onKeyDown` on `<li>` — keyboard navigation uses explicit interactive elements only
- [x] Empty state displayed when breakdown has zero rows
- [x] `SessionBreakdownList` changes work in both history and session summary contexts
- [x] All existing tests pass (`pnpm test --run`)
- [x] New tests cover: disclosure a11y attributes, empty state, button removal

## What we are NOT doing

- **No inner scroll** — Let the card be as tall as needed. Revisit with desktop-only containment only if telemetry shows extreme overflow pain.
- **No second shade** — For this simple disclosure, one surface per card. A subtle second surface is only justified when expanded content is materially different in kind.
- **No de-emphasized "Review session" link** — Still redundant regardless of visual weight.

## Risks

| Risk | Mitigation |
|------|------------|
| `SessionBreakdownList` changes affect session summary context | Test both contexts explicitly |
| Removing row-level `tabIndex`/`onKeyDown` changes click behavior | Row-level `onClick` for pointer users is separate from keyboard model; verify both |
| Removing "Review session" reduces discoverability | Verify session summary link affordance is clear before/after |
