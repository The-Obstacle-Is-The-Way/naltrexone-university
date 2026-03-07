# DEBT-278: Verdict Badge Solid Compact Pill

**Priority:** P2
**Created:** 2026-03-05
**Source:** Visual review of feedback card UX
**Scope:** Single-component styling change in `feedback.tsx` verdict badge

---

## Problem

The verdict badge ("Correct" / "Incorrect") at the top of the feedback card has two issues:

```tsx
// feedback.tsx:126-134 (current)
<span
  className={cn(
    'inline-flex rounded-full px-3 py-1 text-sm font-semibold',
    isCorrect && 'bg-success/15 text-success',
    !isCorrect && 'bg-destructive/15 text-destructive',
  )}
>
  {isCorrect ? 'Correct' : 'Incorrect'}
</span>
```

**Issues:**

1. **Color-on-color readability** — Green text on a green-tinted background (and red on red) produces low contrast. The verdict is the most important piece of information on the feedback card, but the monochromatic color scheme makes the text blend into its background. The current styling **fails WCAG AA** (4.5:1 for `text-sm`) in 3 of 4 theme/color combinations (see contrast table below).

2. **Accidental full-width stretch** — The badge appears full-width because `<Card>` has `flex flex-col` (card.tsx:10) which stretches flex items by default via `align-items: stretch`. The `inline-flex` class signals compact sizing intent, but the flex-col parent overrides it. The result is a pill that stretches edge-to-edge within the card — visually heavy and disproportionate for a short label like "Correct".

---

## Options Considered

All contrast ratios computed from actual token values in `globals.css` using WCAG 2.1 relative luminance formula. WCAG AA requires 4.5:1 for normal text (`text-sm` = 14px).

| Option | Description | Light Success | Light Destructive | Dark Success | Dark Destructive | Result |
|--------|------------|---------------|-------------------|--------------|------------------|--------|
| **Current** | `bg-*/15` + `text-*` (colored text on tint) | 4.13:1 FAIL | 3.78:1 FAIL | 5.70:1 PASS | 3.51:1 FAIL | **3/4 FAIL** |
| **A** | `bg-*/15` + `text-*-foreground` (white text on tint) | 1.23:1 FAIL | 1.23:1 FAIL | 14.52:1 PASS | 14.41:1 PASS | **2/4 FAIL** |
| **B** | `bg-*` solid + `text-*-foreground` (white text, full-width) | 5.07:1 PASS | 4.64:1 PASS | 2.55:1 FAIL | 4.10:1 FAIL | **2/4 FAIL** |
| **C** | `bg-*` solid + `text-*-foreground` (white text, compact) | 5.07:1 PASS | 4.64:1 PASS | 2.55:1 FAIL | 4.10:1 FAIL | **2/4 FAIL** |
| **D** | `bg-*` + `dark:bg-*/60` + `text-*-foreground` (button pattern, compact) | 5.07:1 PASS | 4.64:1 PASS | 5.55:1 PASS | 7.75:1 PASS | **0/4 FAIL** |

**Option D selected** — the only option that passes WCAG AA across all four combinations. Follows the proven `dark:bg-*/60` pattern already used in `button.tsx:15-17`.

**Rejection reasons:**

- **A**: White text on 15% tint is invisible in light mode (white on near-white = 1.23:1).
- **B/C**: Solid `bg-success` in dark mode (HSL 142 70% 42%) is too bright for white text — only 2.55:1 contrast. B also has the full-width problem.
- **D wins**: In dark mode, 60% opacity lets the dark card background (`--card: 0 0% 7%`) bleed through, darkening the green/red enough for white text to pop. In light mode, solid color provides strong contrast.

---

## Solution

Solid-color compact pill with white text, using the existing `button.tsx` dark-mode override pattern (`dark:bg-*/60`).

### Before / After

| Property | Before | After |
|----------|--------|-------|
| Correct background | `bg-success/15` | `bg-success dark:bg-success/60` |
| Correct text | `text-success` (green) | `text-success-foreground` (white) |
| Incorrect background | `bg-destructive/15` | `bg-destructive dark:bg-destructive/60` |
| Incorrect text | `text-destructive` (red) | `text-destructive-foreground` (white) |
| Width | Full-width (accidental stretch) | Compact via `self-start` |
| Display | `inline-flex` | `inline-flex self-start` |
| Shape | `rounded-full` | `rounded-full` — unchanged |
| Padding | `px-3 py-1` | `px-3 py-1` — unchanged |
| Font | `text-sm font-semibold` | `text-sm font-semibold` — unchanged |

### Target Code

```tsx
// feedback.tsx — verdict badge
<span
  className={cn(
    'inline-flex self-start rounded-full px-3 py-1 text-sm font-semibold',
    isCorrect && 'bg-success text-success-foreground dark:bg-success/60',
    !isCorrect && 'bg-destructive text-destructive-foreground dark:bg-destructive/60',
  )}
>
  {isCorrect ? 'Correct' : 'Incorrect'}
</span>
```

### Why `dark:bg-*/60`

Solid `bg-success` in dark mode (HSL 142 70% 42%) is too bright — white text on it yields only 2.55:1 contrast (WCAG AA requires 4.5:1). At 60% opacity, the dark card background (`--card: 0 0% 7%`) bleeds through, darkening the green/red and increasing contrast with white text. This is the same pattern used by `button.tsx:15-17` for its destructive and success variants.

### Why `self-start`

The `<Card>` component renders as `flex flex-col` (card.tsx:10). In a flex-col container, `align-items: stretch` is the default — all children expand to full width. Adding `self-start` on the badge overrides this for just the badge, letting it shrink to its content width while remaining left-aligned. This is the minimal, targeted fix.

### Color Token Values (from `globals.css`)

| Token | Light Mode | Dark Mode |
|-------|-----------|-----------|
| `--success` | `142 72% 29%` | `142 70% 42%` |
| `--success-foreground` | `0 0% 100%` (white) | `0 0% 98%` (near-white) |
| `--destructive` | `0 84.2% 48%` | `0 72% 51%` |
| `--destructive-foreground` | `210 40% 98%` (near-white) | `0 0% 93%` (near-white) |
| `--card` | `0 0% 100%` (white) | `0 0% 7%` (near-black) |

---

## Design Rationale

| Decision | Rationale |
|----------|-----------|
| Solid background with `dark:bg-*/60` | Solid backgrounds give `*-foreground` tokens strong contrast in light mode (5.07:1, 4.64:1). In dark mode, 60% opacity lets the dark card background darken the color, boosting contrast to 5.55:1 and 7.75:1. Follows the proven `button.tsx` pattern already shipping in the codebase. |
| White text via `*-foreground` tokens | Using `success-foreground` / `destructive-foreground` tokens (not hardcoded `text-white`) ensures theme correctness and matches the `button.tsx` success variant convention. |
| Compact via `self-start` | A one-word label stretched to full card width looks disproportionate. `self-start` addresses the root cause (`align-items: stretch` from flex-col parent) without changing the Card's layout for other children. |
| Keep `rounded-full` | Creates the capsule "pill" shape at compact width. Matches existing button and badge patterns. |

---

## Affected Tests

Two test files assert the current badge styling and must be updated:

### 1. `components/question/Feedback.test.tsx` — "renders a neutral status card with a verdict badge"

```tsx
// Current assertions (must change):
expect(verdictBadge?.getAttribute('class')).toContain('bg-success/15');
expect(verdictBadge?.getAttribute('class')).toContain('text-success');

// Updated assertions:
expect(verdictBadge?.getAttribute('class')).toContain('bg-success');
expect(verdictBadge?.getAttribute('class')).toContain('text-success-foreground');
expect(verdictBadge?.getAttribute('class')).toContain('self-start');
```

Also add explicit incorrect-branch coverage so the destructive verdict badge asserts the same compact-pill contract:

```tsx
expect(verdictBadge?.getAttribute('class')).toContain('bg-destructive');
expect(verdictBadge?.getAttribute('class')).toContain('text-destructive-foreground');
expect(verdictBadge?.getAttribute('class')).toContain('self-start');
```

### 2. `components/theme-token-regression.test.tsx`

```tsx
// Current assertions (must change):
expect(feedbackHtml).toContain('bg-success/15');
expect(feedbackHtml).toContain('bg-destructive/15');

// Updated assertions:
expect(feedbackHtml).toContain('bg-success');
expect(feedbackHtml).toContain('bg-destructive');
```

Note: `toContain('bg-success')` will match the rendered class string containing `bg-success text-success-foreground dark:bg-success/60`. It also substring-matches `bg-success/5` from the section cards — but that's acceptable for a token-usage regression test (it verifies semantic tokens are used, not hardcoded colors like `emerald-` or `red-`).

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Correct answer → verdict badge | Solid green compact pill, white text, "Correct" |
| T2 | Incorrect answer → verdict badge | Solid red compact pill, white text, "Incorrect" |
| T3 | Light mode contrast | Success: 5.07:1 PASS, Destructive: 4.64:1 PASS |
| T4 | Dark mode contrast | Success: 5.55:1 PASS, Destructive: 7.75:1 PASS |
| T5 | Pill width | Badge carries `self-start` and hugs text content instead of stretching full card width |
| T6 | All other feedback card elements unchanged | Section cards, choice explanations, reference section, layout ordering all preserved |
| T7 | Manual: visual check both themes | Verify pill looks intentional and proportional in both light and dark modes |

---

## Scope Boundary

This debt doc covers ONLY the verdict badge styling. It does NOT cover:
- Section card containment colors (already handled by DEBT-276)
- Clinical pearl callout styling (already handled by DEBT-277)
- Any structural changes to the feedback layout
- Badge text content or semantics
- Cross-surface WCAG AA contrast remediation (tracked by DEBT-279)
