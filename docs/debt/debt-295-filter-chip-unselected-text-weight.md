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

The text only reaches full weight on hover (`hover:text-accent-foreground`), which is too late — users must already know the chip is interactive before they hover. On mobile, hover doesn't exist at all — there is no discovery path. The resting state must communicate "button" at a glance.

### The hierarchy collision

Our own helper text ("Leave empty to include all topics.") also uses `text-foreground/60`. This means chip labels — interactive button labels — sit at the **same visual hierarchy** as passive captions. Users see gray text on gray chips and process them as informational, not actionable.

Live inspection confirms the colors are identical — the only differentiator is typography: chip labels are `14px / font-weight 500` while helper text is `12px / font-weight 400`. That subtle size/weight gap is not enough to overcome identical color when users scan at a glance.

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

- **M3** is the most muted of the three, but even its `on-surface-variant` is ~79-85% brightness in dark mode (`#cac4d0` vs full `on-surface` `#e6e0e9`). That's far above our 60%.
- **Apple** uses `secondaryLabel` at 60% opacity — but exclusively for captions and metadata, never for control labels. Toggle controls use full `label` (100%).
- **shadcn** toggle components use full `foreground` at rest. No opacity reduction. Their own docs wrap toggle demos in `dark:text-neutral-300` (~83% brightness), confirming the floor is well above 60%.

**Industry consensus:** Interactive control labels in dark mode cluster between **80-93% brightness**. Our 60% is well below every major system's floor.

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

Live inspection confirms the selected state computes to `rgb(237,237,237)` background with `rgb(9,9,9)` text — a complete inversion from the unselected state. The visual distance between "white text on dark chip" (Approach B) and "dark text on white chip" (selected) is enormous. The differentiation comes from the **container fill flip**, not from text dimming.

Even with full foreground text on both states, the fill + border carry the distinction. This is exactly how Apple and shadcn handle it — and it works because the background contrast is emphatically different.

### Internal consistency

Other interactive controls in this codebase use full-weight text:
- **SegmentedControl inactive buttons**: `text-muted-foreground` (semantic token, ~51.5% lightness — but on a solid `bg-muted` surface, not a tonal fill)
- **"Start session" button**: full `text-primary-foreground`
- **Section headers** ("Topic", "Substance"): full `text-foreground`

FilterChip is the only interactive control that dims its label to 60%. It should match the rest of the UI.

**Will full foreground overwhelm the card?** No. The SegmentedControl labels ("Unanswered", "Incorrect", "Bookmarked") already sit near full foreground brightness and don't read as heavy. Filter chips have smaller text (14px vs the segmented control's larger sizing), a constrained pill shape, and live inside a tonal container that visually contains them. Full foreground text on chips will not exceed the weight of the segmented controls above.

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

## Chrome Agent Visual Audit (2026-03-09)

A Claude Chrome agent performed a live inspection of the practice page on the deployed production build, extracting computed colors and evaluating all three options. Key findings:

### Hierarchy collision — confirmed via computed colors

The agent extracted computed colors and confirmed that chip text and helper text resolve to **the exact same color** — both are `text-foreground/60`. The only differentiator is typography (14px/500 vs 12px/400), which is insufficient at a glance. The agent described this as "the real smoking gun against 60%."

### Selected-state differentiation — no collapse risk

The agent clicked chips and verified the selected state computes to `rgb(237,237,237)` background with `rgb(9,9,9)` text — a complete inversion. The visual distance between "white text on dark chip" (Approach B) and "dark text on white chip" (selected) was described as "enormous." The differentiation comes from the container fill flip, not from text dimming.

### Hover-only brightening — confirmed too late

The hover jump from 60% → `accent-foreground` is dramatic *once discovered*, but requires prior knowledge of interactivity. On mobile, hover doesn't exist. The agent recommended removing `hover:text-accent-foreground` entirely and letting the background fill change be the sole hover signal — matching Apple and shadcn's pattern.

### Design system cross-reference

The agent independently verified M3's `on-surface-variant` at `#CAC4D0` (~79% brightness) and found shadcn docs using `dark:text-neutral-300` (~83%) for toggle demos. Both sit well above 60%. The agent noted the industry consensus clusters at **80-93% brightness** for interactive control labels in dark mode.

### Recommendation alignment

The agent independently recommended **Option B** (full `text-foreground`) over Option C (80%), citing: our system has no semantic token for 80% foreground; `text-foreground` is a first-class token already used by all other interactive labels on the card; and chips have smaller text (14px) in constrained pill shapes inside tonal containers, so full foreground will not overwhelm the card.

### Border token note

The agent suggested softening the border to `border-foreground/25`. This was evaluated and **rejected** — per DEBT-294's SC 1.4.11 analysis, 25% opacity yields ~2.12:1 (dark) / ~1.79:1 (light), both below the 3.0:1 minimum for required UI boundaries. The existing `border-foreground/45` / `dark:border-foreground/40` stays.
