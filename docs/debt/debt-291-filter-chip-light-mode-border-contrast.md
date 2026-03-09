# DEBT-291: FilterChip Light Mode Border Contrast

**Priority:** P3
**Created:** 2026-03-09
**Status:** Resolved
**Resolved:** 2026-03-09

---

## Problem

Unselected FilterChip borders are effectively invisible in light mode. The chip uses `border-border` as its light mode border token, which provides ~1.10:1 contrast against the parent `bg-foreground/5` tonal fill surface — far below the 3:1 minimum required by SC 1.4.11 for non-text boundaries.

**File:** `components/ui/filter-chip.tsx:28`

**Current unselected classes:**
```
border-border bg-transparent text-foreground/60 hover:bg-foreground/[0.08] hover:text-accent-foreground dark:border-foreground/40
```

The `dark:border-foreground/40` override provides ~3.1:1 in dark mode — that's compliant. But in light mode, the component falls back to `border-border` with no equivalent override, and the default `--border` token is too close in lightness to the surrounding surfaces.

### Pre-existing, not a DEBT-290 regression

Before DEBT-290, chips used `border-border bg-background` — the border vs white (`bg-background`) was ~1.23:1, equally below 3:1. This issue has existed since the FilterChip was created. DEBT-290 made it more noticeable because:

1. The filter containers lost their own borders (less visual noise overall → chip border absence is more conspicuous)
2. The chip fill changed from `bg-background` to `bg-transparent` (negligible visual difference in light mode, but the intent shift emphasizes that the border is the chip's identifying boundary)

### Computed values

| Token | HSL | Computed | Context |
|-------|-----|---------|---------|
| `--border` (light) | `214.3 31.8% 91.4%` | #E2E8F0 | Chip border in light mode |
| `--foreground` (light) | `222.2 84% 4.9%` | #020817 | Base for tonal fill |
| `bg-foreground/5` on white | — | #F2F3F3 | Tonal fill container (practice filters) |
| `bg-card` (light) | `0 0% 100%` | #FFFFFF | Card surface |

| Comparison | Contrast | Passes 3:1? |
|------------|----------|-------------|
| `border-border` (#E2E8F0) vs `bg-foreground/5` (#F2F3F3) | ~1.10:1 | No |
| `border-border` (#E2E8F0) vs `bg-card` (#FFFFFF) | ~1.23:1 | No |
| `dark:border-foreground/40` (#707070) vs `bg-foreground/5` (#1D1D1D) | ~3.40:1 | Yes |

The dark mode override works. The light mode base token does not.

---

## Design Context

The chip border is a **required boundary** per SC 1.4.11 — it defines the clickable target area for a toggle control. This was established in DEBT-290:

> **Keep the chip border.** Unlike dashboard row fills (supplementary), the chip border **is** a required boundary per SC 1.4.11. It defines the clickable target area for a toggle control.

A required boundary must meet 3:1 against the adjacent surface. In light mode, it currently provides ~1.10:1.

### The dark mode approach

In dark mode, the chip uses `dark:border-foreground/40` — a foreground-based opacity token rather than the `--border` semantic token. This was introduced in DEBT-279 specifically to meet the 3:1 threshold in dark mode. The same principle should be applied to light mode.

### Foreground-based border in light mode

The foreground in light mode is #020817 (dark navy). At various opacities on the tonal fill surface (#F2F3F3):

| Token | Effective color | Contrast vs #F2F3F3 | Passes 3:1? | Visual weight |
|-------|----------------|---------------------|-------------|---------------|
| `border-foreground/20` | ~#C2C4C7 | ~1.57:1 | No | Too subtle |
| `border-foreground/30` | ~#AAACB1 | ~2.04:1 | No | Still insufficient |
| `border-foreground/40` | ~#92959B | ~2.70:1 | No | Approaching but fails |
| `border-foreground/45` | ~#868990 | ~3.15:1 | Yes | Minimum compliant |
| `border-foreground/50` | ~#7A7E85 | ~3.67:1 | Yes | Heavier safety margin |

`border-foreground/45` is the minimum opacity that clears 3:1 in light mode. `/50` remains available if visual QA decides the lighter compliant option is still too quiet.

---

## Potential Approaches

### Approach A: Symmetric foreground override

Add a light mode border override at the minimum compliant opacity.

```
border-foreground/45 bg-transparent text-foreground/60 hover:bg-foreground/[0.08] hover:text-accent-foreground dark:border-foreground/40
```

Replace the base `border-border` with `border-foreground/45`. The `dark:` override at `/40` still applies in dark mode. Light mode gets the minimum compliant foreground-based border instead of the too-light semantic border token.

**Tradeoff:** `/50` in light mode is visually heavier than `/40` in dark mode. This asymmetry may look slightly different between themes, but the 3:1 threshold requires higher opacity in light mode because the foreground color (#020817) is composited against a near-white surface.

### Approach B: Theme-specific overrides at different opacities

Use separate light and dark overrides to tune each independently.

```
border-foreground/45 dark:border-foreground/40 bg-transparent ...
```

This requires finding the exact light mode opacity that feels right visually while clearing 3:1. `/45` gives ~3.15:1 (passes), while `/50` gives ~3.67:1 (heavier safety margin).

### Approach C: Replace border-border with a new semantic token

Create a `--chip-border` token defined differently in light and dark. This is more infrastructure but allows precise control per theme.

**Tradeoff:** Adds complexity for a single component. Foreground-based opacity is simpler and consistent with the dark mode approach already in use.

---

## Scope

### Production code

| File | Change |
|------|--------|
| `components/ui/filter-chip.tsx:28` | Replace `border-border` with a light-mode-compliant border token |

### Test updates

| File | Change |
|------|--------|
| `components/ui/filter-chip.test.tsx` | Update border token assertions |

### Doc updates

| File | Change |
|------|--------|
| `docs/frontend/pattern-registry.md` | Update I-4 (Filter Chip) unselected border token |
| `docs/frontend/pages/practice.md` | Update FilterChip token table if border token changes |
| `docs/debt/index.md` | Move DEBT-291 to Resolved when implemented |

---

## What This Does NOT Change

1. **Dark mode chip border** — `dark:border-foreground/40` at ~3.1:1 is compliant and stays.
2. **Selected chip** — `border-primary bg-primary text-primary-foreground` is high contrast in both themes.
3. **Filter container tonal fill** — `bg-foreground/5` is a supplementary fill, not a required boundary. No change.
4. **Chip text or hover tokens** — `text-foreground/60` and `hover:bg-foreground/[0.08]` are unaffected.

---

## Chrome Agent Audit Evidence (2026-03-09)

A Chrome-based visual audit on the deployed practice page confirmed the light mode border issue:

> "In light mode, chip borders are `rgb(226, 232, 240)` over white, giving only about **1.23:1** — this is extremely low. The borders are barely visible in light mode. They read more as a whisper of structure than a clear boundary, and on some monitors they'll disappear entirely."

Against the current DEBT-290 tonal-fill parent (`bg-foreground/5` on white → `#F2F3F3`), the same `border-border` token is even quieter at ~`1.10:1`.

The agent also confirmed that dark mode borders work correctly:

> "In dark mode, chip borders are `rgba(237, 237, 237, 0.4)` over an `rgb(18, 18, 18)` card, compositing to roughly `rgb(106, 106, 106)`. This yields a contrast ratio of about **3.46:1** against the card — acceptable for a non-text graphical element."

Additional confirmed findings:
- Chip text (`text-foreground/60`) passes AA in both themes: ~5.99:1 dark on the tonal-fill parent, ~5.18:1 light on the tonal-fill parent
- Selected chip states are "emphatically" distinguishable with dramatic contrast flip
- Hover states register (text opacity change is the more noticeable effect; background fill is subtle)

---

## Outcome

Implemented on 2026-03-09 using Approach B. The shipped unselected FilterChip classes are:

```
border-foreground/45 bg-transparent text-foreground/60 hover:bg-foreground/[0.08] hover:text-accent-foreground dark:border-foreground/40
```

This keeps the existing compliant dark-mode override, raises the light-mode base border above the 3:1 SC 1.4.11 minimum on the DEBT-290 tonal-fill parent, and leaves selected chips, text tokens, and hover/fill behavior unchanged.
