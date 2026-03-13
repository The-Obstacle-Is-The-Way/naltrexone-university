# BS-050: Practice Page Chip Hover Affordance — Border Highlight + Contrast Lift

**Date:** 2026-03-13
**Triggered by:** Visual review of the Practice page topic/substance/treatment filter chips. On hover, the contrast change is barely perceptible in both dark and light mode (7% → 10% foreground opacity). Meanwhile, the Bookmarks page Remove pill (outline Button variant) gains a noticeably brighter border on hover in dark mode (`dark:hover:border-foreground/70`) alongside a stronger fill change, creating a much clearer hover signal. The practice chips lack this border-level feedback entirely.
**Scope:** Improve hover affordance on unselected `FilterChip` components used in the Practice Session Starter, so users can clearly see which chip they're about to click.
**Related:** [BS-044](./bs-044-dark-mode-border-weight-tiering.md) (dark-mode border tiering), [BS-046 (archived)](../_archive/brainstorming/bs-046-filter-chip-fill-depth-and-summary-hover.md) (prior chip fill depth work), [DEBT-294](../_archive/debt/debt-294-filter-chip-fill-depth-and-cursor.md) (chip fill + cursor fix), [BS-051](./bs-051-bookmark-pill-hover-pattern-investigation.md) (bookmark pill investigation)

---

## The Problem

### Current state

The `FilterChip` component (`components/ui/filter-chip.tsx`) styles its unselected hover state with a **background opacity change only**:

```
Rest:  bg-foreground/[0.07]   border-foreground/45   dark:border-foreground/40
Hover: bg-foreground/[0.10]   (no border change)     (no border change)
```

That's a 3-percentage-point opacity bump on a translucent fill. In practice — especially in dark mode — this is nearly invisible. The user can barely tell they're hovering over a chip.

### What the Bookmarks Remove pill does differently

The Bookmarks page uses `Button variant="outline"` with `rounded-full` for its Remove pill. Its dark-mode outline variant includes:

```
Rest:  dark:border-foreground/40   dark:bg-input/30
Hover: dark:hover:border-foreground/70   dark:hover:bg-input/50
```

The border jumps from **40% → 70%** on hover — a 30-point increase that is immediately noticeable. The edge of the pill "lights up" on hover. This is the pattern the practice chips are missing.

### Screenshots (from user)

| Mode | Observation |
|------|-------------|
| Dark mode (practice chips) | Hovering over "Co-occurring Disorders" — nearly indistinguishable from rest state |
| Light mode (practice chips) | Same issue — hover is subtle to the point of being invisible |
| Dark mode (bookmark Remove pill) | Clearer hover because the pill border brightens strongly and the overall hover stack is more pronounced than the practice chips |

---

## Root Cause Analysis

The `FilterChip` hover treatment was last updated in DEBT-294 (BS-046 follow-up). That change:
- Added `bg-foreground/[0.07]` rest fill (was transparent)
- Bumped hover from `/[0.08]` to `/[0.10]`
- Added `cursor-pointer`

The improvement was meaningful at the time (transparent → filled), but the **hover delta** is still only 3 opacity points on a translucent fill. No border change was added because the focus was on fill depth, not border affordance.

Meanwhile, the Button `outline` variant already has the `dark:hover:border-foreground/70` pattern — it just was never ported to FilterChip.

---

## Severity Assessment

**Low severity, high annoyance.** The chips are still clickable and `cursor-pointer` provides some signal. But for a toggleable chip selector, the hover state should clearly communicate "you're about to toggle this." The current state fails that.

- **Who is affected:** All users on the Practice page
- **How often:** Every session start when selecting topics/substances/treatments
- **Light mode too:** The issue exists in both modes, though it's more pronounced in dark mode

---

## Proposed Fix (Sketch)

### Change 1: Add border brightening on hover (both modes)

Add hover border classes to the unselected chip:

```diff
- 'border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.10] dark:border-foreground/40'
+ 'border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.10] hover:border-foreground/70 dark:border-foreground/40 dark:hover:border-foreground/70'
```

This mirrors the Button outline variant's dark-mode border hover behavior and extends it to light mode as well.

### Change 2: Keep the fill contrast lift

The `hover:bg-foreground/[0.10]` stays. Combined with the border brightening, the two signals reinforce each other:
- Border edge lights up (primary signal)
- Fill slightly deepens (secondary signal)

### Why both signals?

The Bookmarks Remove pill works well with a border-forward hover treatment because it's a single action button — the user knows what it does. Practice chips are **toggleable selectors** in a group — the hover needs to clearly indicate which specific chip the cursor is over. Dual signals (border + fill) provide stronger differentiation in a dense chip group.

---

## Open Questions

1. **Light-mode border hover value?** `hover:border-foreground/70` might be too strong in light mode (where 45% is already fairly visible). Should light mode use a softer step like `hover:border-foreground/60`?

2. **Should the selected chip also get a hover effect?** Currently selected chips (`border-primary bg-primary text-primary-foreground`) have no hover treatment at all. Should they get a slight `hover:bg-primary/90` to indicate they can be toggled off?

3. **Does this interact with BS-044 border tiering?** FilterChip is classified as T1 (interactive) in BS-044's tiering model, so stronger borders on hover align with the tiering philosophy. But if BS-044 ever softens resting borders on chips, the hover delta would become even more dramatic (which might be a good thing).

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-13 | Created BS-050 | Hover affordance on practice chips is barely perceptible; bookmark Remove pill demonstrates the border-brightening pattern that should be adopted |
