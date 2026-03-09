# DEBT-295: Filter Chip Unselected Text Weight

**Priority:** P3
**Created:** 2026-03-09
**Status:** Open

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

### WCAG status

Both themes pass AA (dark 5.34:1, light 4.91:1 from DEBT-294 audit), so this is not a compliance issue. It is a **design hierarchy** issue: the text opacity places the chips in "secondary info" territory rather than "interactive control" territory.

### Design system precedent

| System | Unselected chip label token | Opacity equivalent |
|--------|---------------------------|-------------------|
| Material Design 3 | `on-surface` (full color) | 100% |
| Radix Themes | Step 12 high-contrast text | ~87% |
| Apple HIG | Primary label for controls | 100% (secondary label at ~60% is for captions) |

All three systems use full or near-full foreground weight for enabled interactive control labels. The current 60% matches what these systems use for **non-interactive secondary text**.

---

## Design Context

### What works already

- DEBT-294's surface depth (`bg-foreground/[0.07]`) gives chips a visible resting surface
- The border at `foreground/45` (dark `foreground/40`) provides the SC 1.4.11 boundary
- The hover state transitions to full `accent-foreground` — feels responsive once discovered
- The selected state (`bg-primary text-primary-foreground`) is emphatic and clear

### The constraint from DEBT-294

DEBT-294 established the foreground-opacity ramp:

```
Container:  bg-foreground/5      (surface)
Chip rest:  bg-foreground/[0.07]  (interactive element — Radix step 3)
Chip hover: bg-foreground/[0.10]  (hover state — Radix step 4)
Chip selected: bg-primary          (high-contrast active)
```

Any text change must preserve this hierarchy. The unselected chip must remain visually subordinate to the selected chip, but should not be so quiet that it reads as passive.

### The key tension

Bumping text closer to 100% increases resting legibility but reduces the **delta** between unselected and selected text weight. The selected state differentiates primarily through its fill flip (`bg-primary`) and border color, not text alone — so there is room to strengthen unselected text without collapsing the states.

---

## Potential Approaches

### Approach A: Bump to `text-foreground/80`

```tsx
// Unselected:
'border-foreground/45 bg-foreground/[0.07] text-foreground/80 hover:bg-foreground/[0.10] hover:text-accent-foreground dark:border-foreground/40'
```

**Rationale:** 80% sits between the current 60% (helper text) and 100% (maximum). This is close to Radix step 12 (~87%). The hover still transitions to full `accent-foreground`, preserving a hover lift.

**Tradeoff:** Moderate improvement. May still feel slightly muted compared to full weight, but preserves clear unselected → selected text delta.

### Approach B: Bump to `text-foreground` (100%)

```tsx
// Unselected:
'border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.10] hover:text-accent-foreground dark:border-foreground/40'
```

**Rationale:** Matches M3 and Apple guidance — interactive control labels should be full weight. The selected vs. unselected distinction is carried entirely by fill + border, which is already emphatic (`bg-primary` + `border-primary`).

**Tradeoff:** Unselected and selected text are both at full foreground weight (just different colors: foreground vs. primary-foreground). The fill contrast must do all the work to distinguish states. In dark mode, the selected chip's `text-primary-foreground` (white) on `bg-primary` (dark blue/black) vs. unselected `text-foreground` (near-white) on `bg-foreground/[0.07]` (dark gray) — the fill color is the differentiator. This should be sufficient given the dramatic fill flip.

**Risk:** If the hover text was previously the "reward" for discovering the chip is interactive, making resting text equally strong removes that micro-interaction. However, discoverability at rest is more important than hover delight.

### Approach C: Bump to `text-foreground/80` + remove `hover:text-accent-foreground`

```tsx
// Unselected:
'border-foreground/45 bg-foreground/[0.07] text-foreground/80 hover:bg-foreground/[0.10] dark:border-foreground/40'
```

**Rationale:** If the text starts at 80%, the hover text transition to 100% is only a 20pp lift — barely perceptible. Removing the hover text change simplifies the class string and lets the hover fill change (`bg-foreground/[0.07]` → `bg-foreground/[0.10]`) be the sole hover signal.

**Tradeoff:** Loses the hover text brightening entirely. This is fine if the fill hover delta is perceptible alone.

---

## Scope

### Production code

| File | Change |
|------|--------|
| `components/ui/filter-chip.tsx:28` | Update unselected text opacity token |

### Test updates

| File | Change |
|------|--------|
| `components/ui/filter-chip.test.tsx` | Update text token assertion |

### Doc updates

| File | Change |
|------|--------|
| `docs/frontend/pages/practice.md` | Update FilterChip token table |
| `docs/frontend/pattern-registry.md` | Update I-4 unselected class string |
| `docs/frontend/contrast-policy.md` | Update chip text contrast ratio if changed |
| `docs/debt/index.md` | Move DEBT-295 to Resolved when implemented |

---

## What This Does NOT Change

1. **Selected FilterChip** — `bg-primary text-primary-foreground` is emphatic. No change.
2. **FilterChip border** — `border-foreground/45` / `dark:border-foreground/40` stays. SC 1.4.11 boundary.
3. **FilterChip rest fill** — `bg-foreground/[0.07]` stays as shipped by DEBT-294.
4. **FilterChip hover fill** — `hover:bg-foreground/[0.10]` stays.
5. **Summary label text** — `text-foreground` at 100% on `<summary>` elements. No change.
6. **Helper text** — `text-foreground/60` for "Leave empty to include all..." is correctly at helper-text hierarchy. No change.

---

## Chrome Agent Visual Evidence (2026-03-09)

Screenshots captured from production show:

- **Dark mode (before/after DEBT-294):** Chips now have visible surface depth from `bg-foreground/[0.07]`, but the text at 60% foreground still renders as gray-on-dark-gray, making the chips feel like passive labels rather than toggleable buttons
- **Light mode (full page):** Chips are slightly more legible due to wider overall contrast range, but the 60% text still sits at helper-text visual weight — compare to the section headers ("Topic", "Substance", "Treatment") which are at full foreground and immediately read as primary content
- **Selected chips (not shown in current screenshots):** When toggled, the flip to `bg-primary text-primary-foreground` is emphatic — the gap between unselected (muted gray) and selected (full contrast) is large enough that strengthening unselected text will not collapse this distinction
