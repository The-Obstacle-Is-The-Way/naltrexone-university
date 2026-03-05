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

1. **Color-on-color readability** — Green text on a green-tinted background (and red on red) produces low contrast. The verdict is the most important piece of information on the feedback card, but the monochromatic color scheme makes the text blend into its background rather than standing out.

2. **Accidental full-width stretch** — The badge appears full-width because `<Card>` has `flex flex-col` which stretches flex items by default. The `inline-flex` class signals compact sizing intent, but flex-col's default `align-items: stretch` overrides it. The result is a pill that stretches edge-to-edge within the card — visually heavy and disproportionate for a short label like "Correct".

---

## Options Considered

| Option | Background | Text | Width | Verdict |
|--------|-----------|------|-------|---------|
| **A: Soft tint + white text** | `bg-success/15` (keep) | `text-success-foreground` (white) | Full-width | **Rejected** — white text on 15% tinted background is unreadable in light mode (white on near-white). The `*-foreground` tokens are designed for solid backgrounds, not tinted ones. |
| **B: Solid + white text + full-width** | `bg-success` (solid) | `text-success-foreground` (white) | Full-width | **Rejected** — solid color works with white text in both modes, but full-width stretch looks heavy and disproportionate for a one-word label. |
| **C: Solid + white text + compact** | `bg-success` (solid) | `text-success-foreground` (white) | Compact (content-hugging) | **Selected** — solid background + white text gives maximum contrast and works in both light/dark modes. Compact sizing makes the pill proportional to its content. Matches Reddit flair / Material chip pattern. |

---

## Solution

Solid-color compact pill with white text: the badge hugs its content instead of stretching across the card.

### Before / After

| Property | Before | After |
|----------|--------|-------|
| Correct background | `bg-success/15` (15% tint) | `bg-success` (solid) |
| Correct text | `text-success` (green) | `text-success-foreground` (white) |
| Incorrect background | `bg-destructive/15` (15% tint) | `bg-destructive` (solid) |
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
    isCorrect && 'bg-success text-success-foreground',
    !isCorrect && 'bg-destructive text-destructive-foreground',
  )}
>
  {isCorrect ? 'Correct' : 'Incorrect'}
</span>
```

### Why `self-start`

The `<Card>` component renders as `flex flex-col` (card.tsx:10). In a flex-col container, `align-items: stretch` is the default — all children expand to full width. Adding `self-start` on the badge overrides this for just the badge, letting it shrink to its content width while remaining left-aligned.

### Color Token Values (from `globals.css`)

| Token | Light Mode | Dark Mode |
|-------|-----------|-----------|
| `--success` | `142 72% 29%` | `142 70% 42%` |
| `--success-foreground` | `0 0% 100%` (white) | `0 0% 98%` (near-white) |
| `--destructive` | `0 84.2% 48%` | `0 72% 51%` |
| `--destructive-foreground` | `210 40% 98%` (near-white) | `0 0% 93%` (near-white) |

---

## Design Rationale

| Decision | Rationale |
|----------|-----------|
| Solid background (`bg-success` / `bg-destructive`) | 15% tinted backgrounds are too faint in light mode for white text. Solid backgrounds ensure the `*-foreground` tokens (white/near-white) maintain strong contrast in both light and dark modes. The verdict is a binary signal — bold color fits its importance. |
| White text via `*-foreground` tokens | Design system tokens `success-foreground` and `destructive-foreground` are white/near-white in both modes, built specifically for text on solid success/destructive backgrounds. Using tokens (not hardcoded `text-white`) ensures theme correctness. |
| Compact via `self-start` | A one-word label ("Correct" / "Incorrect") stretched to full card width looks disproportionate. Compact sizing creates a tighter, more intentional pill shape. `self-start` is the minimal override — it only affects the badge without changing the Card's layout for other children. |
| Keep `rounded-full` | Creates the capsule "pill" shape at compact width. Matches Reddit flair and Material chip patterns. |

---

## Affected Tests

One existing test asserts the current badge styling and must be updated:

**`Feedback.test.tsx` — "renders a neutral status card with a verdict badge"** (lines 30-32):

```tsx
// Current assertions (must change):
expect(verdictBadge?.getAttribute('class')).toContain('bg-success/15');
expect(verdictBadge?.getAttribute('class')).toContain('text-success');

// Updated assertions:
expect(verdictBadge?.getAttribute('class')).toContain('bg-success');
expect(verdictBadge?.getAttribute('class')).toContain('text-success-foreground');
```

No other tests assert badge color tokens. All other test assertions (`rounded-full`, text content, structural ordering) are unaffected.

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Correct answer → verdict badge | Solid green compact pill, white text, "Correct" |
| T2 | Incorrect answer → verdict badge | Solid red compact pill, white text, "Incorrect" |
| T3 | Light mode | Dark green pill (HSL 142 72% 29%) with white text — readable contrast |
| T4 | Dark mode | Medium green pill (HSL 142 70% 42%) with near-white text — readable contrast |
| T5 | Pill width | Badge hugs text content, does not stretch full card width |
| T6 | All other feedback card elements unchanged | Section cards, choice explanations, reference section, layout ordering all preserved |

---

## Scope Boundary

This debt doc covers ONLY the verdict badge styling. It does NOT cover:
- Section card containment colors (already handled by DEBT-276)
- Clinical pearl callout styling (already handled by DEBT-277)
- Any structural changes to the feedback layout
- Badge text content or semantics
