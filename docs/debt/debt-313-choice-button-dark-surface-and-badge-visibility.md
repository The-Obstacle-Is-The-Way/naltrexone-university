# DEBT-313: Choice Button Dark Surface & Badge Visibility

**Priority:** P1
**Created:** 2026-03-15
**Source:** Post-implementation visual QA of DEBT-312
**Status:** Open
**Supersedes:** DEBT-312 (dark-mode rest fill direction and light-mode fill approach only — DEBT-312's branch placement, border compliance, and foreground-tonal hover/selected ramp remain correct)
**Scope:** Neutral answer-choice rest surface in `components/question/choice-button.tsx` and letter-badge visibility across `ChoiceButton` and `Feedback`. Post-submit feedback card fills are the reference model, not the change target.

---

## Context

DEBT-312 was implemented correctly per its spec. Every token landed in the right branch, tests pin the contract, and docs are aligned. The problem only became visible after seeing the result on screen.

The core issue: **DEBT-312's `bg-foreground/5` lightens the dark-mode surface, but the feedback section's `bg-background/50` darkens it.** The feedback section looks crisper because it pushes the inner surface closer to pure black, maximizing text contrast. DEBT-312 pushes it toward gray, creating a muddy veil that makes the answer text harder to read.

This was not predictable from token analysis alone — it required visual comparison. The debt doc was theoretically sound; the eye disagreed.

---

## The Feedback Section Model

The feedback section's "Why other answers are wrong" cards already solve this problem. Their tokens (from `components/question/feedback.tsx`, lines 171/231):

```tsx
className="rounded-xl border border-border/60 bg-background/50 p-4 dark:border-foreground/40"
```

What `bg-background/50` produces in each theme:

| Theme | `--background` | Composited on card | Effective lightness | Effect |
|-------|---------------|--------------------|---------------------|--------|
| Light | `0 0% 100%` (white) | `0 0% 100%` (white card) | ~100% | Invisible — fill is transparent white on white |
| Dark | `0 0% 3.5%` | `0 0% 7%` (dark card) | ~5.25% | **Darker than card** — recessed, crisp |

Versus DEBT-312's `bg-foreground/5`:

| Theme | `--foreground` | Composited on card | Effective lightness | Effect |
|-------|---------------|--------------------|---------------------|--------|
| Light | `222.2 84% 4.9%` (navy) | `0 0% 100%` (white card) | ~95.2% | Subtle gray tint on white |
| Dark | `0 0% 93%` (near-white) | `0 0% 7%` (dark card) | ~11.3% | **Lighter than card** — gray veil, muddy |

The feedback section darkens; DEBT-312 lightens. The eye prefers darkened.

---

## What Needs to Change

### 1. Dark-mode rest fill: replace the gray veil

**Current (DEBT-312):** `bg-foreground/5` → 11.3% lightness (lighter than card, gray veil)
**Target:** `bg-background/50` → 5.25% lightness (darker than card, recessed and crisp)

This matches the feedback section's existing dark-mode pattern. Text at `text-foreground` (93%) against 5.25% gives maximum readability.

### 2. Dark-mode rest border: soften

**Current (DEBT-312):** `dark:border-foreground/40` → visible white-ish line
**Target:** Evaluate `dark:border-foreground/25` or `dark:border-foreground/30` — the recessed `bg-background/50` surface gives the row natural containment from the fill contrast against the card, so the border no longer needs to carry as much definition weight. A softer border avoids the "outlined wireframe" appearance.

If the border becomes purely supplementary (fill + layout provide identification), it does not need to meet the 3:1 required-boundary threshold in dark mode. The selected state's `dark:border-foreground/70` would still serve as the clear state-change signal.

**Fallback:** If the softer border makes hover too subtle, keep `dark:border-foreground/40` — the surface change alone will still be a major improvement.

### 3. Light-mode rest fill: drop the gray tint

**Current (DEBT-312):** `bg-foreground/5` → subtle gray tint on white
**Target:** `bg-background/50` → invisible on white (same as feedback section)

The feedback section's light-mode cards are clean white with just a border for containment. The DEBT-312 gray tint was intended as a "tonal child surface" but in practice reads as a slightly dirty white — not clearly gray enough to be intentional, not white enough to be clean. Dropping to `bg-background/50` removes the ambiguity.

### 4. Light-mode rest border: keep WCAG-compliant

**Keep:** `border-foreground/50` from DEBT-312. Unlike the feedback section (which uses `border-border/60` for non-interactive cards), the choice button border is a required boundary for an interactive control. `border-foreground/50` clears 3:1 against the card surface and should be retained.

This means light mode will look like: clean white fill, visible dark border. Not identical to the feedback section's border weight, but WCAG requires it for clickable targets.

### 5. Letter badge visibility in light mode

The A/B/C/D letter badges are nearly invisible in light mode. Current tokens:

```tsx
border-border bg-muted text-foreground
```

On a white (or near-white) card surface:
- `border-border` = `hsl(214.3 31.8% 91.4%)` → barely visible against white
- `bg-muted` = `hsl(210 40% 96.1%)` → barely visible against white

This affects both `ChoiceButton` (line 63) and `Feedback` (lines 174, 234) — they share the same badge tokens.

**Target:** Use the same foreground-opacity approach that works elsewhere:
- `border-foreground/20 bg-foreground/[0.06]` in light mode — subtle but visible circle
- Dark mode badges (`dark:border-foreground/60 dark:bg-foreground/20`) are already fine and should remain unchanged

This is a cross-component fix: both ChoiceButton and Feedback need it.

---

## Recommended Token Baseline

### Choice button label (neutral rest)

```text
Light:    border-foreground/50 bg-background/50
Dark:     dark:border-foreground/30 dark:bg-background/50
```

### Choice button label (neutral hover, unselected branch only)

```text
Light:    hover:border-foreground/55 hover:bg-foreground/[0.06]
Dark:     dark:hover:border-foreground/45 dark:hover:bg-foreground/[0.06]
```

Note: The hover fill switches from `bg-background/*` to `bg-foreground/*` because hover needs to LIFT the surface away from rest, not push it further down. A small foreground tint on the recessed base gives a visible but restrained hover cue.

### Choice button label (selected neutral)

```text
Light:    border-ring bg-foreground/[0.08]
Dark:     dark:border-foreground/70 dark:bg-foreground/15
```

Note: Selected fill is slightly reduced from DEBT-312's `bg-foreground/[0.12]` because the rest surface is now darker in dark mode. The gap between rest and selected needs to feel proportional, not identical to what it was when rest was lighter.

### Letter badge (both ChoiceButton and Feedback)

```text
Light:    border-foreground/20 bg-foreground/[0.06]
Dark:     dark:border-foreground/60 dark:bg-foreground/20  (unchanged)
```

---

### Why this baseline

- `bg-background/50` is the exact pattern already proven by the feedback section — not a new invention
- In dark mode it produces a recessed surface (~5.25% lightness) that maximizes text contrast instead of veiling it with gray
- In light mode it produces an invisible fill (white on white), letting the border carry containment cleanly
- `border-foreground/50` is retained in light mode for WCAG SC 1.4.11 required-boundary compliance
- `dark:border-foreground/30` softens the dark border now that the fill provides natural containment; if this proves too subtle, `dark:border-foreground/40` is the named fallback
- The hover tokens switch to `bg-foreground/*` to produce a visible lift from the recessed rest surface
- The badge fix uses the same foreground-opacity vocabulary already established by DEBT-291 and DEBT-309

---

### State fill progression (dark mode)

| State | Token | Effective lightness | Delta from rest |
|-------|-------|--------------------|----|
| Rest | `dark:bg-background/50` | ~5.25% | — |
| Hover | `dark:hover:bg-foreground/[0.06]` | ~12.2% | +7pp |
| Selected | `dark:bg-foreground/15` | ~19.9% | +15pp |

The rest-to-hover gap is now larger than DEBT-312's (7pp vs 3pp) because the rest surface moved down. This should make hover feel more responsive without needing to push the fill high.

### State fill progression (light mode)

| State | Token | Effective lightness | Delta from rest |
|-------|-------|--------------------|----|
| Rest | `bg-background/50` | ~100% (white) | — |
| Hover | `hover:bg-foreground/[0.06]` | ~94.3% | perceptible tint |
| Selected | `bg-foreground/[0.08]` | ~92.4% | slightly stronger |

---

## Open Questions

1. **Should hover combine border + fill, or just fill?** DEBT-312 established `hover:border-foreground/55` for hover. With the recessed rest surface, the border jump might be unnecessary — fill alone might carry the cue. Start with both and remove the border hover if it feels noisy.

2. **Should the selected light-mode fill be `/[0.08]` or `/[0.10]`?** The rest surface is now white (not gray), so the gap between rest and selected is perceptually larger. `/[0.08]` may be sufficient; `/[0.10]` is the fallback if it reads too weak.

3. **Should the feedback section's `border-border/60` also move to `border-foreground/50` in light mode?** The feedback cards are non-interactive (no required boundary), so WCAG doesn't require it. But visual consistency might benefit from alignment. This is explicitly optional and can be deferred.

---

## Files In Scope

### Production

| File | Change |
|------|--------|
| `components/question/choice-button.tsx` | Replace rest fill from `bg-foreground/5` to `bg-background/50`; soften dark border; adjust hover/selected to new baseline; fix light-mode badge tokens |
| `components/question/feedback.tsx` | Fix light-mode badge tokens on the "Why other answers are wrong" cards (lines 174, 234) to match the new foreground-opacity badge recipe |

### Tests

| File | Change |
|------|--------|
| `components/question/choice-button.test.tsx` | Update neutral-state token assertions to the new rest/hover/selected baseline; add badge visibility assertions |
| `components/theme-token-regression.test.tsx` | Update the ChoiceButton token regression to assert `bg-background/50` instead of `bg-foreground/5`, and `border-foreground/50` (retained from DEBT-312) |
| `components/question/ChoiceButton.browser.spec.tsx` | Update the selected-hover guard to the new token set |
| `components/question/feedback.test.tsx` | Add light-mode badge token assertions |

### Documentation

| File | Change |
|------|--------|
| `docs/frontend/pattern-registry.md` | Update I-3 rest fill from `bg-foreground/5` to `bg-background/50`; update fill progression; update design rationale to explain recessed-surface approach |
| `docs/frontend/contrast-policy.md` | Note the dark-mode border reclassification (supplementary when fill provides containment) |
| `docs/frontend/pages/quick-practice.md` | Update the cross-theme audit to reflect the new rest fill approach |

---

## Out of Scope

1. **Feedback section card fill** — `bg-background/50` is already the target. No change needed.
2. **Feedback section border in light mode** — `border-border/60` is acceptable for non-interactive cards. Optional follow-up.
3. **Correct/incorrect verdict states** — green/red states are unaffected.
4. **Action bar buttons** — separate pattern.

---

## Test Plan

### Unit coverage

1. Neutral rest state uses `bg-background/50` (not `bg-foreground/5`)
2. Neutral rest state retains `border-foreground/50` in light mode
3. Dark neutral rest state uses `dark:bg-background/50`
4. Dark neutral rest border uses the softened value
5. Light-mode letter badge uses `border-foreground/20 bg-foreground/[0.06]`
6. Dark-mode letter badge is unchanged (`dark:border-foreground/60 dark:bg-foreground/20`)
7. Selected neutral fill is updated to the new baseline
8. Hover tokens produce a visible lift from the recessed rest surface
9. Feedback component light-mode badges match the new recipe
10. Correct/incorrect verdict states remain unchanged

### Manual visual QA

1. Quick Practice, light mode
2. Quick Practice, dark mode
3. Active Tutor session, light mode
4. Active Tutor session, dark mode
5. Active Exam session, light mode
6. Active Exam session, dark mode
7. Review question page (feedback section), light mode — badge visibility
8. Review question page (feedback section), dark mode

### Visual acceptance criteria

1. Dark mode answer rows feel crisp and recessed, not muddy/gray
2. Dark mode answer rows visually match the feedback section's "Why other answers are wrong" cards
3. Light mode answer rows are clean white with a visible border, not a gray-tinted white
4. Letter badges (A/B/C/D) are clearly visible in light mode in both ChoiceButton and Feedback
5. Hover is perceptible without being louder than the question text
6. Selected is clearly stronger than hover
7. The overall visual weight of the question area is balanced across themes

---

## Relationship to Existing Work

- **Supersedes DEBT-312's dark-mode rest fill direction:** `bg-foreground/5` → `bg-background/50`
- **Retains DEBT-312's contributions:** branch placement discipline, light-mode border compliance (`border-foreground/50`), foreground-tonal hover/selected ramp, and test coverage structure
- **Extends the pattern established by `Feedback`'s existing `bg-background/50` cards** into the pre-submit answer surface
- **Fixes a cross-component badge issue** that DEBT-312 intentionally excluded from scope
