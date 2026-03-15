# DEBT-313: Choice Button Dark Surface & Badge Visibility

**Priority:** P1
**Created:** 2026-03-15
**Status:** Resolved
**Resolved:** 2026-03-15
**Resolved in commit:** `753db166`
**Source:** Post-implementation visual QA of DEBT-312
**Follow-up to:** DEBT-312 (revises the implemented rest-surface direction and badge scope only — DEBT-312's branch placement discipline and light-mode required-boundary strategy remain correct)
**Scope:** Neutral answer-choice rest surface in `components/question/choice-button.tsx` and letter-badge visibility across `ChoiceButton` and `Feedback`. Post-submit feedback card fills are the reference model, not the change target.

---

## Context

DEBT-312 was implemented correctly per its spec. Every token landed in the right branch, tests pin the contract, and docs are aligned. The problem only became visible after seeing the result on screen.

The core issue: **DEBT-312's `bg-foreground/5` lightens the dark-mode surface, but the feedback section's `bg-background/50` darkens it.** The feedback section looks crisper because it pushes the inner surface closer to pure black, maximizing text contrast. DEBT-312 pushes it toward gray, creating a muddy veil that makes the answer text harder to read.

This was not fully predictable from token analysis alone — it required visual comparison. DEBT-312 was technically correct for the problem it targeted; DEBT-313 is a follow-up visual correction to the implemented result, not a wholesale undo of DEBT-312.

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

### 2. Dark-mode rest border: keep the compliant baseline

**Current (DEBT-312):** `dark:border-foreground/40` → visible white-ish line
**Target:** Keep `dark:border-foreground/40` as the baseline. The feedback reference cards already use `dark:border-foreground/40`, and it remains the cleanest compliant boundary against the recessed `dark:bg-background/50` fill.

Measured against `dark:bg-background/50`, the softer candidates that initially looked attractive do not hold up:

| Token | Contrast vs `dark:bg-background/50` | Result |
|-------|-------------------------------------|--------|
| `dark:border-foreground/30` | ~2.42:1 | Fails SC 1.4.11 required-boundary threshold |
| `dark:border-foreground/35` | ~2.89:1 | Still fails |
| `dark:border-foreground/[0.38]` | ~3.20:1 | First softer compliant candidate |
| `dark:border-foreground/40` | ~3.42:1 | Compliant and already proven in `Feedback` |

ChoiceButton's edge is still a required boundary under the current [Contrast Policy](../../frontend/contrast-policy.md). DEBT-313 should not reclassify it as supplementary just to justify a softer border. If post-implementation QA still finds `/40` a touch too bright, the only named softening candidate in this debt item is `dark:border-foreground/[0.38]`; do not drop below compliance.

### 3. Light-mode rest fill: drop the gray tint

**Current (DEBT-312):** `bg-foreground/5` → subtle gray tint on white
**Target:** `bg-background/50` → invisible on white (same as feedback section)

The feedback section's light-mode cards are clean white with just a border for containment. The DEBT-312 gray tint was intended as a "tonal child surface" but in practice reads as a slightly dirty white — not clearly gray enough to be intentional, not white enough to be clean. Dropping to `bg-background/50` removes the ambiguity.

### 4. Light-mode rest border: keep WCAG-compliant

**Keep:** `border-foreground/50` from DEBT-312. Unlike the feedback section (which uses `border-border/60` for non-interactive cards), the choice button border is a required boundary for an interactive control. `border-foreground/50` clears 3:1 against the card surface and should be retained.

This means light mode will look like: clean white fill, visible dark border. Not identical to the feedback section's border weight, but WCAG requires it for clickable targets.

### 5. Hover must be specified as a replacement, not a layer

`hover:bg-*` replaces the rest `bg-*` token. It does **not** layer on top of `bg-background/50`.

That means dark hover must be evaluated as a direct replacement on `bg-card`:

| Token | Effective lightness on dark card | Notes |
|-------|----------------------------------|-------|
| `dark:bg-background/50` | ~5.25% | Recessed rest surface |
| `dark:hover:bg-foreground/[0.05]` | ~11.3% | Visible lift without fully reviving the DEBT-312 gray cast |
| `dark:hover:bg-foreground/[0.06]` | ~12.2% | Larger jump; risks feeling too close to the muddy DEBT-312 rest state |

Because the user preference here is explicitly "darker, crisper, more like Feedback," DEBT-313 should start with `dark:hover:bg-foreground/[0.05]`, not `/[0.06]`. If QA later shows the hover cue is too quiet, escalate from there.

### 6. Letter badge visibility in light mode

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
Dark:     dark:border-foreground/40 dark:bg-background/50
```

### Choice button label (neutral hover, unselected branch only)

```text
Light:    hover:border-foreground/55 hover:bg-foreground/[0.06]
Dark:     dark:hover:border-foreground/50 dark:hover:bg-foreground/[0.05]
```

Note: The hover fill switches from `bg-background/*` to `bg-foreground/*` because hover needs to LIFT the surface away from rest, not push it further down. In CSS this is a replacement, not a second layer, so the token must be chosen against `bg-card` directly.

### Choice button label (selected neutral)

```text
Light:    border-ring bg-foreground/[0.08]
Dark:     dark:border-foreground/70 dark:bg-foreground/[0.12]
```

Note: Selected fill is intentionally reduced from DEBT-312 in both themes. With the rest surface now darker in dark mode and cleaner in light mode, the selected delta should stay clearly above hover without jumping all the way to the DEBT-312 dark `/15` intensity on top of the new recessed base.

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
- `dark:border-foreground/40` stays aligned with the feedback reference model and remains compliant against the recessed dark rest fill; `dark:border-foreground/30` does not
- The hover tokens switch to `bg-foreground/*` to produce a visible lift from the recessed rest surface, but the dark hover value is calibrated as a direct replacement on `bg-card`, not as a layered composite over `bg-background/50`
- `dark:bg-foreground/[0.12]` keeps selected clearly above hover while avoiding the larger rest-to-selected jump that `dark:bg-foreground/15` would create from the new recessed base
- The badge fix uses the same foreground-opacity vocabulary already established by DEBT-291 and DEBT-309

---

### State fill progression (dark mode)

| State | Token | Effective lightness | Delta from rest |
|-------|-------|--------------------|----|
| Rest | `dark:bg-background/50` | ~5.25% | — |
| Hover | `dark:hover:bg-foreground/[0.05]` | ~11.3% | +6.0pp |
| Selected | `dark:bg-foreground/[0.12]` | ~17.3% | +12.1pp |

These values are calculated as direct replacements on `bg-card`, because `hover:bg-*` does not stack with the recessed rest fill. The progression is intentionally darker than the first DEBT-313 draft so the hover state lifts without snapping back toward the muddy DEBT-312 rest surface.

### State fill progression (light mode)

| State | Token | Effective lightness | Delta from rest |
|-------|-------|--------------------|----|
| Rest | `bg-background/50` | ~100% (white) | — |
| Hover | `hover:bg-foreground/[0.06]` | ~94.3% | perceptible tint |
| Selected | `bg-foreground/[0.08]` | ~92.4% | slightly stronger |

---

## Open Questions

1. **Does dark hover need the border jump at all?** The baseline keeps `dark:hover:border-foreground/50` plus the replacement fill lift. If that feels noisy in QA, evaluate fill-only hover before raising the fill brighter.

2. **Is `dark:border-foreground/[0.38]` worth testing, or does reference-model parity justify locking `/40`?** `/[0.38]` is the first softer compliant candidate. Anything below that fails against the recessed base.

3. **Does `dark:bg-foreground/[0.12]` feel strong enough for selected state on lower-quality displays?** `/[0.12]` gives a more proportional jump than `/15`; if it reads too weak in QA, the fallback is to restore `dark:bg-foreground/15`.

4. **Should the feedback section's `border-border/60` also move to `border-foreground/50` in light mode?** The feedback cards are non-interactive (no required boundary), so WCAG doesn't require it. But visual consistency might benefit from alignment. This is explicitly optional and can be deferred.

---

## Files In Scope

### Production

| File | Change |
|------|--------|
| `components/question/choice-button.tsx` | Replace rest fill from `bg-foreground/5` to `bg-background/50`; keep the compliant dark rest border baseline; adjust hover/selected to the new baseline; fix light-mode badge tokens |
| `components/question/feedback.tsx` | Fix light-mode badge tokens on the "Why other answers are wrong" cards (lines 174, 234) to match the new foreground-opacity badge recipe |

### Tests

| File | Change |
|------|--------|
| `components/question/choice-button.test.tsx` | Update neutral-state token assertions to the new rest/hover/selected baseline; add badge visibility assertions |
| `components/theme-token-regression.test.tsx` | Update the ChoiceButton token regression to assert the new unselected rest tokens (`bg-background/50`, `border-foreground/50`) and the reduced selected neutral fill (`bg-foreground/[0.08]`) |
| `components/question/ChoiceButton.browser.spec.tsx` | Update the selected-hover guard to the new token set |
| `components/question/Feedback.test.tsx` | Update the existing wrong-answer badge assertions from `border-border bg-muted` to the new light-mode badge recipe and keep the dark badge assertions unchanged |

### Documentation

| File | Change |
|------|--------|
| `docs/frontend/pattern-registry.md` | Update I-3 rest fill from `bg-foreground/5` to `bg-background/50`; update fill progression; update design rationale to explain recessed-surface approach |
| `docs/frontend/contrast-policy.md` | Update the I-3 entry to the new recessed rest fill while retaining the required-boundary classification; explicitly note that dark `border-foreground/30` fails against `dark:bg-background/50` |
| `docs/frontend/standards.md` | Update the interactive row/card hover guidance and any I-3 references so they no longer describe the DEBT-312 `bg-foreground/5 -> hover:bg-foreground/[0.08]` dark rest model |
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
2. Neutral rest state retains `border-foreground/50` in light mode and `dark:border-foreground/40` in dark mode
3. Dark neutral rest state uses `dark:bg-background/50`
4. Hover tokens move to the new replacement baseline: `hover:bg-foreground/[0.06]` in light mode and `dark:hover:bg-foreground/[0.05]` in dark mode
5. Selected neutral markup still does not inherit the unselected-only hover tokens
6. Light-mode letter badge uses `border-foreground/20 bg-foreground/[0.06]`
7. Dark-mode letter badge is unchanged (`dark:border-foreground/60 dark:bg-foreground/20`)
8. Selected neutral fill updates to `bg-foreground/[0.08]` in light mode and `dark:bg-foreground/[0.12]` in dark mode
9. Shared theme-token regression coverage updates from `bg-foreground/5` to `bg-background/50`
10. Feedback component badge assertions update the existing light-mode recipe while preserving the dark-mode badge tokens
11. Correct/incorrect verdict states remain unchanged

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

- **Follow-up to DEBT-312's implemented rest-surface direction:** `bg-foreground/5` → `bg-background/50`
- **Retains DEBT-312's contributions:** branch placement discipline, light-mode required boundary (`border-foreground/50`), unselected-branch hover isolation, and the existing test coverage structure
- **Reuses `Feedback`'s existing `bg-background/50` wrong-answer cards as the visual reference model** for the pre-submit neutral rest surface; it does not change those card fills
- **Fixes a cross-component badge issue** that DEBT-312 intentionally excluded from scope
