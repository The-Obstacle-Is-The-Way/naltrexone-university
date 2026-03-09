# BS-046: Filter Chip Fill Depth + Summary Hover Removal

**Date:** 2026-03-09
**Triggered by:** Visual review of DEBT-290/291/292 shipped state — chips look flat/invisible against container, summary hover looks bad
**Scope:** Two issues: (1) unselected filter chips need a subtle fill to differentiate from container; (2) summary hover effect is redundant with chevron and visually distracting
**Related:** [DEBT-290](../debt/debt-290-practice-filter-tonal-fill-elevation.md), [DEBT-291](../debt/debt-291-filter-chip-light-mode-border-contrast.md), [DEBT-292](../debt/debt-292-filter-section-disclosure-indicator.md), [BS-044](./bs-044-dark-mode-border-weight-tiering.md)

---

## Problem 1: Chips Have No Fill Depth

### What's wrong

Unselected filter chips use `bg-transparent`, inheriting the parent container's `bg-foreground/5` tonal fill. The chips are visually indistinguishable from the container surface — they look like text with outlines floating on a flat plane, not like interactive controls with their own surface.

The border alone (`border-foreground/45` / `dark:border-foreground/40`) defines the chip boundary, but without any fill differentiation the chips lack the "tangible object" feel that makes them scannable and inviting to click.

### How we got here

DEBT-290 changed chips from `bg-background` (which "punched through" the tonal container, creating a jarring white hole in dark mode) to `bg-transparent`. This fixed the punch-out problem but created the opposite extreme — chips now have zero depth against their parent. The fix was correct for the punch-out bug, but it overcorrected.

### What the industry does

**Material Design 3** uses `surface-variant` as the unselected filter chip container color — a subtle but perceptible fill that sits between the parent surface and full card-level elevation. The chip is not transparent and not card-colored; it occupies its own surface step.

Key principle: **chips are interactive controls, not labels.** Interactive controls need their own surface identity to communicate "I am a thing you can press."

### The constraint

The fill must be:
- **Lighter than the container** in dark mode (lift up, not punch down)
- **Subtler than `bg-background`/`bg-card`** (that was the original punch-out problem)
- **Monotonic with the foreground-based opacity scale** established by DEBT-290
- **WCAG compliant** — border must still meet SC 1.4.11 3:1 against the new fill, text must still meet SC 1.4.3 4.5:1

### Candidate fills (dark mode, parent = `bg-foreground/5` ≈ #1D1D1D on card #121212)

| Token | Computed (dark) | Lift vs parent | Feel |
|-------|----------------|---------------|------|
| `bg-foreground/[0.08]` | ~#282828 | +1.1 steps | Very subtle, might not be enough |
| `bg-foreground/10` | ~#2B2B2B | +1.2 steps | Gentle lift, closest to M3 surface-variant |
| `bg-foreground/[0.12]` | ~#2F2F2F | +1.3 steps | Noticeable, could work |
| `bg-foreground/15` | ~#343434 | +1.5 steps | Possibly too much, starts looking like its own card |

The hover state is currently `hover:bg-foreground/[0.08]`. If the rest fill becomes `/[0.08]`, the hover needs to step up (e.g., `/[0.12]` or `/[0.15]`).

### Light mode consideration

In light mode, foreground is ~#090909. Foreground-opacity fills darken the surface rather than lighten it:

| Token | Computed (light, parent ≈ #F3F3F3) | Effect |
|-------|-------------------------------------|--------|
| `bg-foreground/[0.03]` | ~#EDEDED | Very subtle darkening |
| `bg-foreground/[0.05]` | ~#E8E8E8 | Gentle, visible lift |
| `bg-foreground/[0.08]` | ~#E0E0E0 | Noticeable, chip clearly has its own surface |

Light mode chips might look fine with the same token as dark mode (foreground-opacity scales naturally adapt), but this needs visual verification.

### Open question

Should the chip fill be the same token in both themes, or should it use a `dark:` override? The foreground-opacity approach should scale naturally (foreground is light in dark mode, dark in light mode), but the perceptual result may differ.

---

## Problem 2: Summary Hover Effect Looks Bad

### What's wrong

DEBT-292 added `hover:bg-foreground/[0.03]` to `<summary>` as part of the disclosure affordance (Approach C = chevron + hover). In practice, the hover effect creates a barely-perceptible tinted rectangle over the "Topic" / "Substance" / "Treatment" label area that looks unfinished and distracting — like a rendering glitch rather than intentional interaction feedback.

### Why the chevron alone is sufficient

The chevron (`ChevronDown` with `group-open:rotate-180`) is a universally recognized disclosure indicator. It communicates:
- "This section is expandable" (at rest)
- "This section is expanded" (rotated 180°)
- "Click here to toggle" (implied by the above)

The summary hover was added as belt-and-suspenders, but it's the wrong kind of feedback for this control. Hover backgrounds work well on list rows and menu items (large rectangular hit targets). On a `<summary>` inside a tonal container, the hover fill competes with the container's own fill and creates visual noise.

### Proposed fix

Remove `hover:bg-foreground/[0.03]` from the `<summary>` className. Keep everything else from DEBT-292 (chevron, `group`, `transition-transform`, `group-open:rotate-180`).

The cursor is already `cursor-pointer`, which provides hover feedback. The chevron provides affordance. No additional hover fill is needed.

---

## Severity

**Problem 1 (chip fill):** Medium. The chips work functionally but feel flat. Users can identify them by their borders and text, but the lack of surface differentiation makes the filter sections feel like a wall of text rather than a set of interactive pills. This is a polish issue, not a blocker.

**Problem 2 (summary hover):** Low-Medium. It's cosmetically annoying but doesn't break anything. Easy fix — single class removal.

---

## Open Questions

1. **Which foreground-opacity step for chip fill?** Need visual testing of `/[0.08]`, `/10`, and `/[0.12]` in both themes. The answer is "whichever looks like a tangible pill without looking like a card."

2. **Does chip fill change affect hover/selected contrast?** The hover (`hover:bg-foreground/[0.08]`) needs to step up if the rest fill is also `/[0.08]`. Selected state (`bg-primary`) is high-contrast enough to be unaffected.

3. **Should the chip fill be a new shared token or inline?** If other components (e.g., future tag displays) need the same treatment, a token makes sense. If it's practice-page-only, inline is fine. Currently `FilterChip` is shared, so this affects all usages.

4. **Should summary hover removal be a separate DEBT or bundled with chip fill?** It's a one-line deletion, so bundling is probably cleaner.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-09 | Created BS-046 | Visual review found chips too flat and summary hover distracting after DEBT-290/291/292 shipped |
