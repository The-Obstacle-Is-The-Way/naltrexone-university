# DEBT-309: FilterChip Hover Border Affordance — Add Border Brightening on Hover

**Priority:** P3
**Created:** 2026-03-13
**Status:** Open
**Promoted from:** [BS-050](../brainstorming/bs-050-practice-chip-hover-affordance.md)

---

## Problem

Unselected `FilterChip` hover feedback is barely perceptible. The only hover signal is a 3-percentage-point fill opacity change (`bg-foreground/[0.07]` → `hover:bg-foreground/[0.10]`), with no border change at all. In both dark and light mode, users cannot clearly tell which chip they are hovering over.

This is a regression relative to other pill-shaped interactive elements in the app. The Button `outline` variant (used by the Bookmarks page Remove pill) already includes `dark:hover:border-foreground/70` — a 30-point border opacity jump that is immediately noticeable. `FilterChip` was never given this treatment because DEBT-294 focused on fill depth and cursor, not border affordance.

**Who is affected:** All users on the Practice page when selecting topics, substances, or treatments.
**How often:** Every session start.

---

## Solution

Add hover border brightening to the unselected `FilterChip` state, in both dark and light mode. Keep the existing fill hover as a secondary signal.

### 1. FilterChip: add hover border classes

**File:** `components/ui/filter-chip.tsx` (line 28)

**Before (unselected):**
```
border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.10] dark:border-foreground/40
```

**After (unselected):**
```
border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.10] hover:border-foreground/70 dark:border-foreground/40 dark:hover:border-foreground/70
```

Two additions:
1. `hover:border-foreground/70` — light-mode border brightens from 45% → 70% on hover (+25pp)
2. `dark:hover:border-foreground/70` — dark-mode border brightens from 40% → 70% on hover (+30pp)

This mirrors the Button `outline` variant's dark-mode hover border behavior (`dark:hover:border-foreground/70` on `button.tsx:19`) and extends it to light mode as well.

### Hover signal summary (after fix)

| Signal | Rest | Hover | Delta |
|--------|------|-------|-------|
| **Fill (both modes)** | `foreground/[0.07]` | `foreground/[0.10]` | +3pp (secondary) |
| **Border (light)** | `foreground/45` | `foreground/70` | +25pp (primary) |
| **Border (dark)** | `foreground/40` | `foreground/70` | +30pp (primary) |

Both signals reinforce each other: the edge lights up as the primary cue, the fill deepens as a subtle secondary cue.

### Why both signals for chips?

The Bookmarks Remove pill works well with mainly border-driven hover because it is a standalone action button — there is no ambiguity about which element is hovered. Practice chips are **toggleable selectors in a dense group** — the hover needs to clearly isolate which specific chip the cursor is over. Dual signals (border + fill) provide stronger differentiation.

---

## WCAG Compliance

The hover border values do not affect resting compliance. They only add a stronger border on hover, which improves perceptibility.

| Check | Token | Value | Pass |
|-------|-------|-------|------|
| Hover border vs chip fill (dark) | `foreground/70` vs `bg-foreground/[0.10]` | Well above 3:1 | Yes |
| Hover border vs chip fill (light) | `foreground/70` vs `bg-foreground/[0.10]` | Well above 3:1 | Yes |
| Rest border (unchanged, dark) | `foreground/40` | ~3.40:1 vs container | Yes (SC 1.4.11) |
| Rest border (unchanged, light) | `foreground/45` | ~3.15:1 vs container | Yes (SC 1.4.11) |
| Text contrast (unchanged) | `text-foreground` | 11.93:1 dark, 15.54:1 light | Yes (AA) |

No resting state values change. All existing compliance is preserved.

---

## Scope

### Production code

| File | Change |
|------|--------|
| `components/ui/filter-chip.tsx:28` | Add `hover:border-foreground/70 dark:hover:border-foreground/70` to unselected class string |

### Tests

| File | Change |
|------|--------|
| `components/ui/filter-chip.test.tsx` | Add assertions: `hover:border-foreground/70` and `dark:hover:border-foreground/70` present in unselected state |

### Doc updates

| File | Change |
|------|--------|
| `docs/frontend/pattern-registry.md` (I-4 section, line 330) | Add hover border tokens to unselected class string |
| `docs/frontend/pattern-registry.md` (hover summary table, line 1343) | Update I-4 hover column to include border tokens |
| `docs/frontend/pages/practice.md` (line 151) | Add hover border tokens to unselected FilterChip row |
| `docs/frontend/pages/practice.md` (line 248) | Update unselected hover row to mention border change |
| `docs/frontend/contrast-policy.md` (line 55) | Note that hover border is now part of the FilterChip hover signal |

---

## What This Does NOT Change

1. **Selected FilterChip** — `bg-primary text-primary-foreground border-primary` is high contrast. No hover treatment added in this pass (tracked as open question in BS-050).
2. **FilterChip rest border** — `border-foreground/45` (light) and `dark:border-foreground/40` (dark) stay unchanged. Only hover border changes.
3. **FilterChip fill tokens** — Rest (`/[0.07]`) and hover (`/[0.10]`) stay unchanged.
4. **Button outline variant** — Already has `dark:hover:border-foreground/70`. No changes needed there.
5. **SegmentedControl** — Different component, different surface context. Not affected.
6. **Bookmark Remove pill** — Already has the pattern. Not affected.

---

## Resulting Foreground-Opacity Ramp (Unselected Chip)

```
Container:     bg-foreground/5           (surface)
Chip rest:     bg-foreground/[0.07]      border-foreground/45  dark:border-foreground/40
Chip hover:    bg-foreground/[0.10]      border-foreground/70  dark:border-foreground/70
Chip selected: bg-primary                border-primary
```

Each step is perceptually distinct and monotonic for both fill and border.
