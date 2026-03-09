# DEBT-290: Practice Filter Container Tonal Fill Elevation

**Priority:** P3
**Created:** 2026-03-08
**Status:** Resolved
**Resolved:** 2026-03-09

---

## Problem

The practice page's Topic/Substance/Treatment filter containers use the same bordered nested-card pattern that was removed from the dashboard in [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md):

```tsx
<details className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:border-foreground/40">
```

**File:** `app/(app)/app/practice/components/practice-session-starter.tsx:213`

This creates the same visual problem DEBT-289 fixed: `dark:border-foreground/40` at ~3.46:1 is louder than the parent card's `border-border` (~1.24:1 vs card), making the child containers' borders dominate the parent. The result is a "wireframe" aesthetic where every collapsible section is outlined with high-contrast strokes.

### The chip complication

Unlike the dashboard (where nested rows contain only read-only badge pills), the practice filter containers hold interactive `FilterChip` components. Unselected chips currently use `bg-background` — the darkest surface in the stack (`#090909`). If the container gets the tonal fill treatment (`bg-foreground/5` ≈ `#1D1D1D`), unselected chips would be **darker than their parent surface**, punching through the tonal fill like dark holes. This is the punch-out problem.

### Current surface hierarchy (practice page)

```
bg-background (#090909, Layer 0 — page)
  └─ Card bg-card (#121212, Layer 1 — "Start a session")
       └─ <details> border-border/60 bg-muted/20 dark:border-foreground/40 (Layer 2 — filter container)
            └─ FilterChip bg-background (#090909) + border (Layer 3 — unselected chip)
            └─ FilterChip bg-primary (#EDEDED) (Layer 3 — selected chip)
```

The unselected chip fill (`bg-background`, Layer 0) is **two layers below** its parent container (Layer 2). This is already a subtle hierarchy violation — chips at rest visually drop all the way back to the page-background tone instead of staying within the card's nested surface ladder. It works today only because the container's border visually contains the chips. Without the border, the darkness becomes conspicuous.

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

## Implemented Solution

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

**Collapsed-state guardrail:** If visual QA later finds the closed `<details>` rows too quiet after border removal, the follow-up should strengthen the `<summary>` affordance (for example, a chevron or summary-only hover treatment), not reintroduce heavy container borders or weaken chip boundaries.

### FilterChip: transparent fill, keep border

Change the unselected chip's fill from `bg-background` to `transparent`. The chip inherits the parent's tonal fill, eliminating the punch-out.

**File:** `components/ui/filter-chip.tsx`

**Before (unselected):**
```
border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-accent-foreground dark:border-foreground/40
```

**After (unselected):**
```
border-border bg-transparent text-foreground/60 hover:bg-foreground/[0.08] hover:text-accent-foreground dark:border-foreground/40
```

**Selected:** Unchanged (`border-primary bg-primary text-primary-foreground`).

Key decisions:

1. **Keep the chip border.** Unlike dashboard row fills (supplementary), the chip border **is** a required boundary per SC 1.4.11. It defines the clickable target area for a toggle control. `dark:border-foreground/40` is still ~3.1:1 against the tonal fill surface, so it clears the 3:1 non-text minimum.

2. **Transparent, not tonal fill.** Chips should not have their own `bg-foreground/X` fill because: (a) they already have a border providing the shape, and (b) adding tonal fill to an element inside a tonal fill container creates a double-fill that thickens the visual weight without adding information.

3. **Hover token change.** `hover:bg-muted/50` was designed for page-background or card-background contexts. On a `bg-foreground/5` parent, it causes the same hover inversion that DEBT-289 documented (muted-based hover is darker than foreground-based rest fill in dark mode). `hover:bg-foreground/[0.08]` uses the same foreground scale, guaranteeing monotonic brightening.

4. **Promote unselected chip text.** `text-muted-foreground` is acceptable on the current `bg-background` chip fill, but once the chip becomes transparent on `bg-foreground/5`, it drops to ~`4.45:1` in dark mode and narrowly fails normal-text AA. `text-foreground/60` restores comfortable margin at ~`6.07:1` while still reading as secondary metadata rather than primary content.

### Filter container metadata: promote secondary copy

The filter-container metadata currently uses `text-muted-foreground` in two places:

- the selected-count text in `<summary>` — `app/(app)/app/practice/components/practice-session-starter.tsx:217`
- the helper copy below the chips — `app/(app)/app/practice/components/practice-session-starter.tsx:235`

Both currently sit on the bordered `bg-muted/20` container and are acceptable there. But after the container switches to `bg-foreground/5`, they would sit on `#1D1D1D`, where `text-muted-foreground` drops to ~`4.45:1` and narrowly fails normal-text AA.

**Before:**
```
text-muted-foreground
```

**After:**
```
text-foreground/60
```

This keeps the count/helper copy visibly subordinate to the main summary label while restoring AA margin on the tonal fill surface.

### Resulting surface hierarchy

```
bg-background (#090909, Layer 0 — page)
  └─ Card bg-card (#121212, Layer 1)
       └─ Filter section bg-foreground/5 (#1D1D1D, Layer 2)    ← tonal fill, no border
            └─ Chip transparent (inherits #1D1D1D) + border    ← border provides shape
            └─ Chip bg-primary (#EDEDED)                       ← selected, high contrast
```

Each layer steps monotonically lighter: #090909 → #121212 → #1D1D1D. No punch-out. No hierarchy violations.

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

### Chip text on tonal fill surface

| Text token | Effective color | WCAG ratio vs bg-foreground/5 (#1D1D1D) | Passes 4.5:1? |
|-----------|----------------|------------------------------------------|---------------|
| `text-muted-foreground` | #838383 | ~4.45:1 | No |
| **`text-foreground/60`** | **#9B9B9B** | **~6.07:1** | **Yes** |

### Container secondary metadata on tonal fill surface

| Text token | Applies to | WCAG ratio vs bg-foreground/5 (#1D1D1D) | Passes 4.5:1? |
|-----------|------------|------------------------------------------|---------------|
| `text-muted-foreground` | Summary count, helper copy | ~4.45:1 | No |
| **`text-foreground/60`** | **Summary count, helper copy** | **~6.07:1** | **Yes** |

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
| `app/(app)/app/practice/components/practice-session-starter.tsx:217` | Summary count: `text-muted-foreground` → `text-foreground/60` |
| `app/(app)/app/practice/components/practice-session-starter.tsx:235` | Helper copy: `text-muted-foreground` → `text-foreground/60` |
| `components/ui/filter-chip.tsx:28` | Unselected: `bg-background` → `bg-transparent`, `text-muted-foreground` → `text-foreground/60`, `hover:bg-muted/50` → `hover:bg-foreground/[0.08]` |

### Pattern registry updates

| Pattern ID | Change |
|------------|--------|
| S-2 (Muted Row) | Add practice variant using borderless tonal fill for filter containers |
| I-4 (Filter Chip) | Update unselected fill from `bg-background` to `bg-transparent`, promote unselected text to `text-foreground/60`, update hover token |

### Contrast policy updates

Add the practice filter containers to "Classified supplementary fills" in `docs/frontend/contrast-policy.md`. No separate FilterChip fill entry is needed because the unselected chip becomes transparent and the chip border remains the required boundary.

### Test updates

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-session-starter.test.tsx` | Update any class-based assertions for filter container border removal and the summary/helper text token change |
| `components/ui/filter-chip.test.tsx` | Update assertions for `bg-transparent`, `text-foreground/60`, and the new hover token |

### Doc updates

| File | Change |
|------|--------|
| `docs/frontend/contrast-policy.md` | Add practice filter-container supplementary-fill entry |
| `docs/frontend/pattern-registry.md` | Update S-2 and I-4 entries |
| `docs/frontend/pages/practice.md` | Update the shipped surface hierarchy, token tables, and resolution map |
| `docs/debt/index.md` | Move DEBT-290 from Active to Resolved |

---

## What This Does NOT Change

1. **SegmentedControl** (Mode/Status/Difficulty) — These sit directly on the Card surface (Layer 1), not inside a tonal fill container. Their `border-border bg-muted` treatment is the established I-5 pattern. No change.

2. **Selected FilterChip** — `bg-primary text-primary-foreground` is high contrast against any background. No change needed.

3. **FilterChip border** — The `dark:border-foreground/40` border stays. It is a required boundary for chip identification (unlike dashboard row fills, which are supplementary). The border defines the clickable target area.

4. **Dashboard patterns** — DEBT-289 is resolved. No re-work.

5. **History page rows** — Different context (rows on page background, not inside Card containers). Not in scope.

---

## Post-Implementation Notes

1. **FilterChip transparent fill + brighter text on non-tonal surfaces.** The FilterChip component is shared — changing `bg-background` to `bg-transparent` and `text-muted-foreground` to `text-foreground/60` affects every future consumer. Currently the only consumer is the practice starter's filter sections (inside `<details>` containers). If FilterChip is later used directly on a Card surface without a tonal-fill parent, `transparent` would inherit `bg-card` (#121212) rather than `bg-background` (#090909), and `text-foreground/60` would still clear AA comfortably. This is safe.

2. **Light mode visual check.** `bg-foreground/5` in light mode uses `foreground` ≈ #020817 (dark navy) at 5% opacity on white: rgb(242, 243, 243). This should produce a clean cool-gray tint for the filter containers. Validate visually after implementation. **Confirmed 2026-03-09:** Tonal fill produces a clean cool-gray tint. However, `border-border` (#E2E8F0) on chips is ~1.23:1 against the surface — effectively invisible. Tracked as [DEBT-291](./debt-291-filter-chip-light-mode-border-contrast.md).

3. **Collapsed-state affordance visual check.** After border removal, confirm the closed `Topic` / `Substance` / `Treatment` rows still read as expandable via summary text, count text, cursor, tonal fill, and keyboard focus ring alone. If that feels too quiet, the next move is a summary affordance enhancement, not a rollback to heavy container borders. **Confirmed 2026-03-09:** Chrome visual audit found this too quiet — "Without a visual cue for expandability, first-time users may not realize these sections are interactive." A chevron disclosure indicator is the recommended fix. Tracked as [DEBT-292](./debt-292-filter-section-disclosure-indicator.md).

---

## Outcome

Implemented on 2026-03-09. The shipped changes follow the established DEBT-289 tonal-fill pattern, preserve the FilterChip border as the required boundary, and remove the last remaining heavy bordered nesting inside the practice starter card.

The I-1 dashboard variant's pattern registry entry already recommends this exact reuse. This change makes the practice page consistent with the dashboard's tonal fill approach.
