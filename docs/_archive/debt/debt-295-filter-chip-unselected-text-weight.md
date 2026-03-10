# DEBT-295: Filter Chip Unselected Text Weight

**Priority:** P3
**Created:** 2026-03-09
**Status:** Resolved
**Resolved:** 2026-03-09
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
| Dark  | ~`#A0A0A0` (60% of `#EDEDED` on `#2C2C2C`) | Gray on dark gray — reads as caption, not button label |
| Light | ~`#5B6069` (60% of `#020817` on `#E1E3E4`) | Medium gray on light gray — slightly better but still muted |

The text only reaches full weight on hover (`hover:text-accent-foreground`), which is too late — users must already know the chip is interactive before they hover. On mobile, hover doesn't exist at all — there is no discovery path. The resting state must communicate "button" at a glance.

### The hierarchy collision

Our own helper text ("Leave empty to include all topics.") also uses `text-foreground/60`. This means chip labels — interactive button labels — sit at the **same visual hierarchy** as passive captions. Users see gray text on gray chips and process them as informational, not actionable.

Live inspection confirms the colors are identical — the only differentiator is typography: chip labels are `14px / font-weight 500` while helper text is `12px / font-weight 400`. That subtle size/weight gap is not enough to overcome identical color when users scan at a glance.

### WCAG status

Both themes pass AA at 60% (dark 5.34:1, light 4.91:1 from DEBT-294 audit). At 100%, contrast will increase significantly — well above AA. This is not a compliance issue. It is a **design hierarchy** issue.

---

## Design System Evidence

### What the major systems actually do

Research into the source code and specifications of Material Web (M3), Apple's semantic text system, and shadcn reveals:

| System | Unselected chip/toggle label | Method | Source |
|--------|------------------------------|--------|--------|
| **Material Web (M3)** | `on-surface` | Semantic text token, not opacity | Official filter-chip tokens (`--md-filter-chip-label-text-color`) |
| **Apple semantic text colors** | Primary content uses `label` / `Color.primary`; subordinate content uses `secondaryLabel` / `Color.secondary` | Semantic role split, not a filter-chip-specific opacity scale | UIKit / SwiftUI semantic text colors |
| **shadcn Toggle** | Inherited/full rest text | No rest-state dimming token on the outline toggle variant | Official `toggle.tsx` |

**Key finding: the verified sources do not support a 60%-opacity chip label.**

- **Material Web** is stronger than the earlier draft claimed: the official filter-chip label token is `on-surface`, not `on-surface-variant`. If we want to align with actual M3 component code, that points toward full-strength primary text, not an 80% compromise.
- **Apple** does not publish a filter-chip token table we can map 1:1 here, but its semantic text system still separates primary labels from secondary metadata. Our current chip label is styled like the latter.
- **shadcn** outline toggles do not dim their labels at rest. They rely on the control surface and state fill, not opacity-dimmed label text, to communicate affordance.

**Safer conclusion:** the sources we can verify all land materially above our current 60%, and two of them (Material Web and shadcn) point directly to full-weight/inherited label text.

### What 60% maps to in each system

| System | 60% opacity equivalent | Used for |
|--------|----------------------|----------|
| Material Web | Below the official filter-chip label token (`on-surface`) | N/A — not used for filter-chip labels |
| Apple | Closer to `secondaryLabel` / `Color.secondary` than `label` / `Color.primary` | Captions, metadata, subordinate copy |
| shadcn | Closer to subdued descriptive text than the outline toggle rest state | Helper text, descriptions |

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

Even with full foreground text on both states, the fill + border carry the distinction. This matches the Material Web and shadcn evidence better than the current 60% implementation because the background contrast is doing the state work.

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
1. `text-foreground/60` → `text-foreground` — full weight, matching the official Material Web filter-chip label token direction and the shadcn outline-toggle rest state
2. Remove `hover:text-accent-foreground` — at full foreground, the extra hover text change adds little value. In dark mode, `foreground` and `accent-foreground` are identical (`0 0% 93%`). In light mode, `accent-foreground` is actually slightly lower-contrast than `foreground` on the hover fill. The hover fill change (`bg-foreground/[0.07]` → `bg-foreground/[0.10]`) becomes the sole hover signal, which is cleaner.
3. No other changes — fill, border, selected state all stay as-is.

With Approach B, chip label contrast rises to approximately **11.93:1** in dark mode and **15.54:1** in light mode against the unselected chip fill.

### Why not Approach A (`text-foreground/80`)?

80% is aesthetically defensible as a local compromise, but:
- It's a compromise that doesn't fully solve the hierarchy collision with helper text at 60%
- The hover text transition from 80% to `accent-foreground` is still barely perceptible
- The verified source implementations point toward full-strength/inherited label text, not an 80% intermediate token
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

The agent's direction was still useful, but the exact M3 claim has been corrected in this spec. Official Material Web filter-chip labels use `on-surface`, not `on-surface-variant`. The broader conclusion remains the same: the verified reference implementations do not support leaving interactive chip text at the same 60% opacity used for helper copy.

### Recommendation alignment

The agent independently recommended **Option B** (full `text-foreground`) over Option C (80%), citing: our system has no semantic token for 80% foreground; `text-foreground` is a first-class token already used by all other interactive labels on the card; and chips have smaller text (14px) in constrained pill shapes inside tonal containers, so full foreground will not overwhelm the card.

### Border token note

The agent suggested softening the border to `border-foreground/25`. This was evaluated and **rejected** — against the current tonal parent, 25% opacity yields approximately **2.52:1** in dark mode and **2.05:1** in light mode, both below the 3.0:1 minimum for required UI boundaries under SC 1.4.11. The existing `border-foreground/45` / `dark:border-foreground/40` stays.

---

## Outcome

Approach B shipped as specified.

- `components/ui/filter-chip.tsx` now uses `text-foreground` for unselected chip labels.
- `hover:text-accent-foreground` was removed; hover feedback now comes from the fill ramp alone.
- The selected chip state, chip boundary tokens, and helper-text hierarchy remain unchanged.
- Practice docs, the pattern registry, the contrast policy, and the debt register were synced to the shipped state.
