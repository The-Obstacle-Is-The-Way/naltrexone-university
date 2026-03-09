# DEBT-295: Filter Chip Unselected Text Weight

**Priority:** P3
**Created:** 2026-03-09
**Status:** Open
**Recommended:** Approach B (full `text-foreground`)

---

## Problem

Unselected filter chips use `text-foreground/60` — 60% foreground opacity. Despite DEBT-294 adding surface depth (`bg-foreground/[0.07]`) and `cursor-pointer`, the chips still feel visually flat because the **text** — the most prominent element — is at a hierarchy level typically reserved for helper text, captions, or secondary metadata, not interactive button labels.

**File:** `components/ui/filter-chip.tsx:28`

```tsx
'border-foreground/45 bg-foreground/[0.07] text-foreground/60 hover:bg-foreground/[0.10] hover:text-accent-foreground dark:border-foreground/40'
```

### Observed behavior

| Theme | Effective text color | Perception |
|-------|---------------------|------------|
| Dark  | ~`#8E8E8E` (60% of `#EDEDED` on `#2C2C2C`) | Gray on dark gray — reads as caption, not button label |
| Light | ~`#676B73` (60% of `#020817` on `#E1E3E4`) | Medium gray on light gray — slightly better but still muted |

The text only reaches full weight on hover (`hover:text-accent-foreground`), which is too late — users must already know the chip is interactive before they hover. The resting state must communicate "button" at a glance.

### The hierarchy collision

Our own helper text ("Leave empty to include all topics.") also uses `text-foreground/60`. This means chip labels — interactive button labels — sit at the **same visual hierarchy** as passive captions. Users see gray text on gray chips and process them as informational, not actionable.

### WCAG status

Both themes pass AA at 60% (dark 5.34:1, light 4.91:1 from DEBT-294 audit). At 100%, contrast will increase significantly — well above AA. This is not a compliance issue. It is a **design hierarchy** issue.

---

## Design System Evidence

### What the major systems actually do

Research into the source code and specifications of M3, Apple, and shadcn reveals:

| System | Unselected chip/toggle label | Method | Source |
|--------|------------------------------|--------|--------|
| **Material Design 3** | `on-surface-variant` (~80-85% brightness) | Distinct color token, NOT opacity | `_md-comp-filter-chip.scss` |
| **Apple HIG** | `label` (100% — pure white dark, black light) | Background carries state, not text dimming | UIKit semantic colors |
| **shadcn/Radix** | `foreground` (100%) | Inherits full foreground, no dimming | `toggle.tsx` base variant |

**Key finding: no system uses opacity-based dimming for interactive control text.**

- **M3** is the most muted of the three, but even its `on-surface-variant` is ~80-85% brightness in dark mode (`#cac4d0` vs full `on-surface` `#e6e0e9`). That's far above our 60%.
- **Apple** uses `secondaryLabel` at 60% opacity — but exclusively for captions and metadata, never for control labels. Toggle controls use full `label` (100%).
- **shadcn** toggle components use full `foreground` at rest. No opacity reduction.

### What 60% maps to in each system

| System | 60% opacity equivalent | Used for |
|--------|----------------------|----------|
| M3 | Below `on-surface-variant` | N/A — no control text this dim |
| Apple | `secondaryLabel` | Captions, timestamps, metadata |
| shadcn | `text-muted-foreground` | Helper text, descriptions |

Our 60% matches what these systems use for **non-interactive secondary text**. It does not match what any of them use for button or toggle labels.

---

## Design Context

### What works already

- DEBT-294's surface depth (`bg-foreground/[0.07]`) gives chips a visible resting surface
- The border at `foreground/45` (dark `foreground/40`) provides the SC 1.4.11 boundary
- The selected state (`bg-primary text-primary-foreground`) is emphatic and clear
- `cursor-pointer` signals interactivity on hover

### The selected-state differentiation question

The concern with full-weight unselected text: does it reduce the gap between selected and unselected states?

**No.** The selected state differentiates through **three simultaneous channels**:
1. Fill flip: `bg-foreground/[0.07]` → `bg-primary` (dramatic color shift)
2. Border flip: `border-foreground/45` → `border-primary`
3. Text color: `text-foreground` → `text-primary-foreground` (different hue on different surface)

Even with full foreground text on both states, the fill + border carry the distinction. This is exactly how Apple and shadcn handle it — and it works because the background contrast is emphatically different.

### Internal consistency

Other interactive controls in this codebase use full-weight text:
- **SegmentedControl inactive buttons**: `text-muted-foreground` (semantic token, ~51.5% lightness — but on a solid `bg-muted` surface, not a tonal fill)
- **"Start session" button**: full `text-primary-foreground`
- **Section headers** ("Topic", "Substance"): full `text-foreground`

FilterChip is the only interactive control that dims its label to 60%. It should match the rest of the UI.

---

## Recommended Solution: Approach B — Full `text-foreground`

### Before

```tsx
'border-foreground/45 bg-foreground/[0.07] text-foreground/60 hover:bg-foreground/[0.10] hover:text-accent-foreground dark:border-foreground/40'
```

### After

```tsx
'border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.10] dark:border-foreground/40'
```

Three changes:
1. `text-foreground/60` → `text-foreground` — full weight, matching Apple/shadcn and exceeding M3's ~80-85%
2. Remove `hover:text-accent-foreground` — at full foreground, the hover text transition is imperceptible (in dark mode, `foreground` and `accent-foreground` are identical: `0 0% 93%`; in light mode the difference is negligible). The hover fill change (`bg-foreground/[0.07]` → `bg-foreground/[0.10]`) becomes the sole hover signal, which is cleaner.
3. No other changes — fill, border, selected state all stay as-is.

### Why not Approach A (`text-foreground/80`)?

80% is defensible (close to M3's `on-surface-variant`), but:
- It's a compromise that doesn't fully solve the hierarchy collision with helper text at 60%
- The hover text transition from 80% to `accent-foreground` (~93-100%) is still barely perceptible
- Apple and shadcn — the two systems closest to our tech stack — both go full weight
- Simplicity: `text-foreground` is one token, no arbitrary value needed

### Resulting class string

```tsx
selected
  ? 'border-primary bg-primary text-primary-foreground'
  : 'border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.10] dark:border-foreground/40'
```

### Updated foreground-opacity ramp

```
Container:     bg-foreground/5       (surface)
Chip fill:     bg-foreground/[0.07]  (Radix step 3)
Chip text:     text-foreground        (full weight — button label hierarchy)
Chip hover:    bg-foreground/[0.10]  (Radix step 4)
Chip selected: bg-primary             (high-contrast active)
Helper text:   text-foreground/60     (caption hierarchy — unchanged)
```

The hierarchy is now clear: chip labels read as primary interactive content, helper text remains subordinate.

---

## Scope

### Production code

| File | Change |
|------|--------|
| `components/ui/filter-chip.tsx:28` | `text-foreground/60` → `text-foreground`, remove `hover:text-accent-foreground` |

### Test updates

| File | Change |
|------|--------|
| `components/ui/filter-chip.test.tsx` | Assert `text-foreground` present, `text-foreground/60` absent, `hover:text-accent-foreground` absent |

### Doc updates

| File | Change |
|------|--------|
| `docs/frontend/pages/practice.md` | Update FilterChip token table (text token column) |
| `docs/frontend/pattern-registry.md` | Update I-4 unselected class string |
| `docs/frontend/contrast-policy.md` | Update chip text contrast description (ratio will increase) |
| `docs/debt/index.md` | Move DEBT-295 to Resolved when implemented |

---

## What This Does NOT Change

1. **Selected FilterChip** — `bg-primary text-primary-foreground` is emphatic. No change.
2. **FilterChip border** — `border-foreground/45` / `dark:border-foreground/40` stays. SC 1.4.11 boundary.
3. **FilterChip rest fill** — `bg-foreground/[0.07]` stays as shipped by DEBT-294.
4. **FilterChip hover fill** — `hover:bg-foreground/[0.10]` stays.
5. **Summary label text** — `text-foreground` at 100% on `<summary>` elements. No change.
6. **Helper text** — `text-foreground/60` for "Leave empty to include all..." stays at helper-text hierarchy. This is the correct hierarchy for captions.

---

## Chrome Agent Visual Evidence (2026-03-09)

Screenshots captured from production show:

- **Dark mode:** Chips have visible surface depth from `bg-foreground/[0.07]`, but the text at 60% foreground renders as gray-on-dark-gray — the same visual weight as the helper text beneath the chips. Users see a wall of gray and process the chips as informational rather than actionable.
- **Light mode:** Slightly more legible due to wider overall contrast range, but the 60% text still sits at helper-text visual weight. Compare to the section headers ("Topic", "Substance", "Treatment") at full foreground — they immediately read as primary content while chip labels recede.
- **Selected chips:** The flip to `bg-primary text-primary-foreground` is emphatic. The gap between unselected and selected is large enough that strengthening unselected text to full foreground will not collapse this distinction — the fill and border carry the state differentiation.
