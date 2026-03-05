# DEBT-278: Verdict Badge White Text

**Priority:** P2
**Created:** 2026-03-05
**Source:** Visual review of feedback card UX
**Scope:** Single-component styling change in `feedback.tsx` verdict badge

---

## Problem

The verdict badge ("Correct" / "Incorrect") at the top of the feedback card uses colored text on a tinted background — green text on green tint, red text on red tint:

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

2. **Unused design tokens** — `--success-foreground` and `--destructive-foreground` are defined in `globals.css` as white/near-white specifically for text on success/destructive backgrounds. They're unused by the verdict badge.

3. **Misleading `inline-flex`** — The badge appears full-width because `<Card>` has `flex flex-col` which stretches flex items by default. But `inline-flex` signals compact sizing intent. The full-width behavior is accidental, not intentional.

---

## Solution

Keep the existing soft tinted background. Change only the text color to white via the design system's `*-foreground` tokens, and make the full-width intent explicit.

### Before / After

| Property | Before | After |
|----------|--------|-------|
| Correct background | `bg-success/15` | `bg-success/15` — **unchanged** |
| Correct text | `text-success` (green) | `text-success-foreground` (white) |
| Incorrect background | `bg-destructive/15` | `bg-destructive/15` — **unchanged** |
| Incorrect text | `text-destructive` (red) | `text-destructive-foreground` (white) |
| Display | `inline-flex` (accidental stretch) | `block` (explicit full-width) |
| Shape | `rounded-full` | `rounded-full` — unchanged |
| Padding | `px-3 py-1` | `px-3 py-1` — unchanged |
| Font | `text-sm font-semibold` | `text-sm font-semibold` — unchanged |

### Target Code

```tsx
// feedback.tsx — verdict badge
<span
  className={cn(
    'block rounded-full px-3 py-1 text-sm font-semibold',
    isCorrect && 'bg-success/15 text-success-foreground',
    !isCorrect && 'bg-destructive/15 text-destructive-foreground',
  )}
>
  {isCorrect ? 'Correct' : 'Incorrect'}
</span>
```

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
| Keep `bg-success/15` / `bg-destructive/15` tinted backgrounds | The soft tinted background provides a calm, non-aggressive feel that fits the educational context. The readability problem is the text color, not the background intensity. |
| White text via `*-foreground` tokens | White text on a tinted background provides clear contrast without the color-on-color blending problem. Using `success-foreground` / `destructive-foreground` tokens (not hardcoded `text-white`) ensures light/dark mode correctness. |
| `block` instead of `inline-flex` | The badge stretches full-width in both current and target states. Current behavior is accidental (flex-col stretch default). `block` makes the intent explicit and removes dependence on Card's flex layout. |

---

## Affected Tests

One existing test asserts the current badge styling and must be updated:

**`Feedback.test.tsx` — "renders a neutral status card with a verdict badge"** (lines 30-32):

```tsx
// Current assertions (must change):
expect(verdictBadge?.getAttribute('class')).toContain('text-success');

// Updated assertion:
expect(verdictBadge?.getAttribute('class')).toContain('text-success-foreground');
```

The `bg-success/15` assertion at line 31 is unchanged. No other tests assert badge text color tokens.

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Correct answer → verdict badge | Soft green tinted background, white text, "Correct", full-width capsule |
| T2 | Incorrect answer → verdict badge | Soft red tinted background, white text, "Incorrect", full-width capsule |
| T3 | Light mode | White text readable against tinted backgrounds in both correct/incorrect states |
| T4 | Dark mode | Near-white text readable against tinted backgrounds in both correct/incorrect states |
| T5 | All other feedback card elements unchanged | Section cards, choice explanations, reference section, layout ordering all preserved |

---

## Scope Boundary

This debt doc covers ONLY the verdict badge text color. It does NOT cover:
- Background intensity changes (kept at 15% opacity)
- Section card containment colors (already handled by DEBT-276)
- Clinical pearl callout styling (already handled by DEBT-277)
- Any structural changes to the feedback layout
- Badge text content or semantics
