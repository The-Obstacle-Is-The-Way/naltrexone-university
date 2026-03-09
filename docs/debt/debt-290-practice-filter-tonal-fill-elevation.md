# DEBT-290: Practice Filter Container Tonal Fill Elevation

**Priority:** P3
**Created:** 2026-03-08
**Status:** Open

---

## Problem

The practice page's Topic/Substance/Treatment filter containers use the same bordered nested-card pattern that was removed from the dashboard in [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md):

```tsx
<details className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:border-foreground/40">
```

**File:** `app/(app)/app/practice/components/practice-session-starter.tsx:213`

This creates the same visual problem DEBT-289 fixed: `dark:border-foreground/40` at ~3.46:1 is louder than the parent card's `border-border` (~1.24:1 vs card), making the child containers' borders dominate the parent. The result is a "wireframe" aesthetic where every collapsible section is outlined with high-contrast strokes.

### The chip complication

Unlike the dashboard (where nested rows contain only read-only badge pills), the practice filter containers hold interactive `FilterChip` components. Unselected chips currently use `bg-background` — the darkest surface in the stack (~#09090b). If the container gets the tonal fill treatment (`bg-foreground/5` ≈ #1D1D1D), unselected chips would be **darker than their parent surface**, punching through the tonal fill like dark holes. This is the punch-out problem.

### Current surface hierarchy (practice page)

```
bg-background (#09090b, Layer 0 — page)
  └─ Card bg-card (#121212, Layer 1 — "Start a session")
       └─ <details> border-border/60 bg-muted/20 dark:border-foreground/40 (Layer 2 — filter container)
            └─ FilterChip bg-background (#09090b) + border (Layer 3 — unselected chip)
            └─ FilterChip bg-primary (#EDEDED) (Layer 3 — selected chip)
```

The unselected chip fill (`bg-background`, Layer 0) is **two layers below** its parent container (Layer 2). This is already a subtle hierarchy violation — chips at rest are darker than even the page background behind the card. It works today only because the container's border visually contains the chips. Without the border, the darkness becomes conspicuous.

---

## Design Reference

DEBT-289 established the tonal fill elevation approach for the dashboard:

| Element | Before (bordered) | After (tonal fill) |
|---------|-------------------|---------------------|
| Dashboard rows | `border border-border/60 bg-muted/20 dark:border-foreground/40` | `bg-foreground/5` (no border) |
| Dashboard badge pills | `border-border/60 dark:border-foreground/40` | `bg-foreground/[0.06] border-0 text-foreground/60` |

The pattern registry already signals this is a reuse candidate:

> **I-1 Dashboard variant — Reuse candidate:** This variant is suitable for any nested-card list pattern where the parent card wraps multiple interactive rows. Practice question lists and similar surfaces should adopt this variant rather than the bordered default when rows appear inside a Card container.

The structural parallel is exact:

| | Dashboard | Practice |
|---|-----------|----------|
| Container | Card (bg-card) | Card (bg-card) |
| Nested element | I-1 row (tonal fill) | S-2 container (currently bordered) |
| Content inside | M-1 badge pill (fill-only) | I-4 FilterChip (border + bg-background) |

---

## Proposed Solution

### Filter containers: borderless tonal fill

Remove the border, apply the same tonal fill as dashboard rows.

**Before:**
```
rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:border-foreground/40
```

**After:**
```
rounded-xl bg-foreground/5 px-4 py-3
```

The container is identifiable without the border through:
1. The `<summary>` text ("Topic", "Substance", "Treatment") with label + count
2. Cursor change on the summary (pointer)
3. The open/close disclosure behavior
4. Focus-visible ring on keyboard navigation
5. The tonal fill shape itself (rounded rectangle)

The border is **not** a required boundary per SC 1.4.11 — it is supplementary. The same reasoning applies as in DEBT-289: identification relies on text content, interactive cues, and layout, not the border.

### FilterChip: transparent fill, keep border

Change the unselected chip's fill from `bg-background` to `transparent`. The chip inherits the parent's tonal fill, eliminating the punch-out.

**File:** `components/ui/filter-chip.tsx`

**Before (unselected):**
```
border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-accent-foreground dark:border-foreground/40
```

**After (unselected):**
```
border-border bg-transparent text-muted-foreground hover:bg-foreground/[0.08] hover:text-accent-foreground dark:border-foreground/40
```

**Selected:** Unchanged (`border-primary bg-primary text-primary-foreground`).

Key decisions:

1. **Keep the chip border.** Unlike dashboard row fills (supplementary), the chip border **is** a required boundary per SC 1.4.11. It defines the clickable target area for a toggle control. `dark:border-foreground/40` at ~3.46:1 vs the tonal fill surface passes the 3:1 non-text minimum.

2. **Transparent, not tonal fill.** Chips should not have their own `bg-foreground/X` fill because: (a) they already have a border providing the shape, and (b) adding tonal fill to an element inside a tonal fill container creates a double-fill that thickens the visual weight without adding information.

3. **Hover token change.** `hover:bg-muted/50` was designed for page-background or card-background contexts. On a `bg-foreground/5` parent, it causes the same hover inversion that DEBT-289 documented (muted-based hover is darker than foreground-based rest fill in dark mode). `hover:bg-foreground/[0.08]` uses the same foreground scale, guaranteeing monotonic brightening.

### Resulting surface hierarchy

```
bg-background (#09090b, Layer 0 — page)
  └─ Card bg-card (#121212, Layer 1)
       └─ Filter section bg-foreground/5 (#1D1D1D, Layer 2)    ← tonal fill, no border
            └─ Chip transparent (inherits #1D1D1D) + border    ← border provides shape
            └─ Chip bg-primary (#EDEDED)                       ← selected, high contrast
```

Each layer steps monotonically lighter: #09090b → #121212 → #1D1D1D. No punch-out. No hierarchy violations.

---

## Computed Values

### Filter container fill

Same as DEBT-289 — `bg-foreground/5` on `bg-card` (#121212):

| Fill token | Effective color | RGB | WCAG ratio vs card | Note |
|------------|----------------|-----|-------------------|------|
| **`bg-foreground/5`** | **#1D1D1D** | **rgb(29)** | **1.11:1** | Gentle — matches dashboard |

### Chip border on tonal fill surface

| Border token | Effective color | WCAG ratio vs bg-foreground/5 (#1D1D1D) | Passes 3:1? |
|-------------|----------------|------------------------------------------|-------------|
| `dark:border-foreground/40` | #6A6A6A | ~3.1:1 | Yes (borderline — still passes) |

Note: The chip border ratio vs the tonal fill parent (#1D1D1D) is slightly lower than vs the card (#121212, where it's ~3.46:1) because the background is lighter. At ~3.1:1 it still passes SC 1.4.11's 3:1 threshold. If future visual QA finds this too subtle, `border-foreground/45` (~3.5:1) is available as a step-up without changing the design approach.

### Chip hover fill

| State | Dark mode (on tonal fill #1D1D1D) | Light mode | Direction |
|-------|-----------------------------------|-----------|-----------|
| Rest (transparent) | Inherits #1D1D1D | Inherits parent | — |
| Hover `bg-foreground/[0.08]` | ~rgb(36) #242424 | ~rgb(235) | Brightens (dark) / Deepens (light) |

---

## Scope

### Production code

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-session-starter.tsx:213` | Filter `<details>`: remove `border border-border/60 dark:border-foreground/40`, change `bg-muted/20` → `bg-foreground/5` |
| `components/ui/filter-chip.tsx:28` | Unselected: `bg-background` → `bg-transparent`, `hover:bg-muted/50` → `hover:bg-foreground/[0.08]` |

### Pattern registry updates

| Pattern ID | Change |
|------------|--------|
| S-2 (Muted Row) | Add practice variant using borderless tonal fill for filter containers |
| I-4 (Filter Chip) | Update unselected fill from `bg-background` to `bg-transparent`, update hover token |

### Contrast policy updates

Add FilterChip unselected fill to "Classified supplementary fills" table in `docs/frontend/contrast-policy.md`.

### Test updates

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-session-starter.test.tsx` | Update any class-based assertions for filter container border removal |
| `components/ui/filter-chip.test.tsx` | Update assertions for `bg-transparent` and hover token |

### Doc updates

| File | Change |
|------|--------|
| `docs/frontend/pages/quick-practice.md` | Update scope note referencing practice starter filter sections |
| `docs/frontend/contrast-policy.md` | Add chip-on-tonal-fill entry |
| `docs/frontend/pattern-registry.md` | Update S-2 and I-4 entries |
| `docs/debt/index.md` | Add DEBT-290 to active index |

---

## What This Does NOT Change

1. **SegmentedControl** (Mode/Status/Difficulty) — These sit directly on the Card surface (Layer 1), not inside a tonal fill container. Their `border-border bg-muted` treatment is the established I-5 pattern. No change.

2. **Selected FilterChip** — `bg-primary text-primary-foreground` is high contrast against any background. No change needed.

3. **FilterChip border** — The `dark:border-foreground/40` border stays. It is a required boundary for chip identification (unlike dashboard row fills, which are supplementary). The border defines the clickable target area.

4. **Dashboard patterns** — DEBT-289 is resolved. No re-work.

5. **History page rows** — Different context (rows on page background, not inside Card containers). Not in scope.

---

## Open Questions

1. **FilterChip `bg-transparent` on non-tonal surfaces.** The FilterChip component is shared — changing `bg-background` to `bg-transparent` affects it everywhere it's used. Currently the only consumers are the practice starter's filter sections (inside `<details>` containers). If FilterChip is ever used directly on a Card surface without a tonal fill parent, `transparent` would inherit `bg-card` (#121212) rather than `bg-background` (#09090b) — a 3.5 lightness-point difference that is imperceptible. This is safe.

2. **Light mode visual check.** `bg-foreground/5` in light mode uses `foreground` ≈ #020817 (dark navy) at 5% opacity on white: rgb(242, 243, 243). This should produce a clean cool-gray tint for the filter containers. Validate visually after implementation.

---

## Recommendation

Implement the solution as described. The changes are minimal (two files, class-swaps only), follow the established DEBT-289 pattern, and resolve the last remaining instance of heavy bordered nesting inside a Card on the practice page.

The I-1 dashboard variant's pattern registry entry already recommends this exact reuse. This change makes the practice page consistent with the dashboard's tonal fill approach.
