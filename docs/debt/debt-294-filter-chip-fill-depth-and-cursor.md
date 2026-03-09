# DEBT-294: Filter Chip Fill Depth, Cursor, and Summary Hover Removal

**Priority:** P3
**Created:** 2026-03-09
**Status:** Open
**Promoted from:** [BS-046](../_archive/brainstorming/bs-046-filter-chip-fill-depth-and-summary-hover.md)

---

## Problem

Two polish issues in the practice page filter sections shipped with DEBT-290/291/292:

1. **Chips have no fill depth.** Unselected filter chips use `bg-transparent`, inheriting the parent container's `bg-foreground/5` tonal fill. They look like labels floating on a flat plane, not interactive toggle buttons. The border alone defines the chip boundary — there's no surface differentiation communicating "this is a thing you can press."

2. **Chips lack pointer cursor.** Browsers default `<button>` to `cursor: default`. The chips don't have `cursor-pointer`, so hovering doesn't signal interactivity.

3. **Summary hover is invisible noise.** DEBT-292 added `hover:bg-foreground/[0.03]` to `<summary>` elements. At 3% opacity change on a 5% surface, this is below perceptual threshold — it reads as a rendering glitch, not interaction feedback. The chevron + `cursor-pointer` already provide sufficient disclosure affordance.

---

## Design System Basis

Three major systems converge on 7-10% foreground opacity for interactive element resting fills on tonal surfaces:

| System | Resting fill | Hover fill | Delta |
|--------|-------------|-----------|-------|
| Radix step 3 → 4 | ~7.1% | ~10.6% | +3.5pp |
| Apple quaternary → tertiary | ~8.5% | ~11% | +2.5pp |
| M3 surface-container-low → high | tone 6 | tone 12 | +6 tonal steps |

`bg-foreground/[0.07]` hits the low end of that range, appropriate because our chips also have borders — they don't need fill alone for identification.

Full design system evidence (M3 tonal scale, Radix color steps, Apple system fills) is preserved in the archived [BS-046](../_archive/brainstorming/bs-046-filter-chip-fill-depth-and-summary-hover.md).

---

## Solution

### 1. FilterChip: fill + hover + cursor

**File:** `components/ui/filter-chip.tsx` (line 28)

**Before (unselected):**
```
border-foreground/45 bg-transparent text-foreground/60 hover:bg-foreground/[0.08] hover:text-accent-foreground dark:border-foreground/40
```

**After (unselected):**
```
border-foreground/45 bg-foreground/[0.07] text-foreground/60 hover:bg-foreground/[0.10] hover:text-accent-foreground dark:border-foreground/40 cursor-pointer
```

Three changes:
1. `bg-transparent` → `bg-foreground/[0.07]` — rest fill at Radix step 3
2. `hover:bg-foreground/[0.08]` → `hover:bg-foreground/[0.10]` — hover fill at Radix step 4 (+3pp delta)
3. Add `cursor-pointer` — signal interactivity on hover

**Selected state:** Unchanged (`border-primary bg-primary text-primary-foreground`).

### 2. Summary hover: remove

**File:** `app/(app)/app/practice/components/practice-session-starter.tsx` (line 216)

**Before:**
```
flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-foreground/[0.03] focus-visible:ring-ring/50 focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden
```

**After:**
```
flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors focus-visible:ring-ring/50 focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden
```

One deletion: remove `hover:bg-foreground/[0.03]`. The chevron + cursor-pointer provide sufficient affordance.

### Resulting foreground-opacity ramp

```
Container:  bg-foreground/5      (surface)
Chip rest:  bg-foreground/[0.07]  (interactive element — Radix step 3)
Chip hover: bg-foreground/[0.10]  (hover state — Radix step 4)
Chip selected: bg-primary          (high-contrast active)
```

Each step is perceptually distinct. Monotonic. No collisions.

---

## Computed Values

### Chip rest fill (`bg-foreground/[0.07]`)

| Property | Dark | Light |
|----------|------|-------|
| Effective color | ~#2C2C2C | ~#E1E3E4 |
| Delta from container (#1D1D1D / #F2F3F3) | +15 RGB | −17 RGB |
| Text contrast (foreground/60) | ~5.34:1 ✓ | ~4.91:1 ✓ |
| Border contrast (vs container) | ~3.12:1 ✓ | ✓ |

### Chip hover fill (`bg-foreground/[0.10]`)

| Property | Dark | Light |
|----------|------|-------|
| Text contrast (accent-foreground) | ~11.2:1 ✓ | ~14.8:1 ✓ |

### WCAG compliance summary

| Check | Value | Pass |
|-------|-------|------|
| Chip text (foreground/60) vs rest fill (dark) | 5.34:1 | ✓ AA |
| Chip text (foreground/60) vs rest fill (light) | 4.91:1 | ✓ AA |
| Chip border vs container (dark) | 3.12:1 | ✓ SC 1.4.11 |
| Hover text (accent-foreground) vs hover fill (dark) | 11.2:1 | ✓ AA |
| Selected text (primary-foreground) vs selected fill | ~17:1 | ✓ AA |

---

## Scope

### Production code

| File | Change |
|------|--------|
| `components/ui/filter-chip.tsx:28` | Unselected: `bg-transparent` → `bg-foreground/[0.07]`, `hover:bg-foreground/[0.08]` → `hover:bg-foreground/[0.10]`, add `cursor-pointer` |
| `app/(app)/app/practice/components/practice-session-starter.tsx:216` | Remove `hover:bg-foreground/[0.03]` from summary |

### Tests

| File | Change |
|------|--------|
| `components/ui/filter-chip.test.tsx` | Update assertions: `bg-transparent` → `bg-foreground/[0.07]`, `hover:bg-foreground/[0.08]` → `hover:bg-foreground/[0.10]`, add `cursor-pointer` check |
| `app/(app)/app/practice/components/practice-session-starter.test.tsx` | Update summary hover assertion if it exists (remove `hover:bg-foreground/[0.03]` expectation) |

### Doc updates

| File | Change |
|------|--------|
| `docs/frontend/pages/practice.md` | Update FilterChip token table (lines 147-152, 240-250) |
| `docs/frontend/pattern-registry.md` | Update I-4 (Filter Chip) unselected classes |
| `docs/frontend/contrast-policy.md` | Add FilterChip rest fill to "Classified supplementary fills" |

---

## What This Does NOT Change

1. **Selected FilterChip** — `bg-primary text-primary-foreground` is high contrast. No change.
2. **FilterChip border** — `dark:border-foreground/40` stays. It is a required SC 1.4.11 boundary. The Chrome audit suggested softening to 25-30%, but that would drop below 3:1 minimum (~1.7:1 at 25%). Rejected.
3. **SegmentedControl** — Different component, different surface context. No change.
4. **Filter container fill** — `bg-foreground/5` on `<details>` stays as shipped by DEBT-290.
5. **Filter helper/count text** — `text-foreground/60` stays as shipped by DEBT-290. Already AA-compliant.
