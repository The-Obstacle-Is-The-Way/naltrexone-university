# DEBT-312: Choice Button Neutral-State Surface Alignment

**Priority:** P2
**Created:** 2026-03-14
**Status:** Resolved
**Resolved:** 2026-03-15
**Resolved in commits:** `f91bec51` (DEBT-312 baseline), `753db166` (final follow-up alignment via DEBT-313/314)
**Source:** Quick Practice answer-choice contrast investigation (user-reported visual audit + repo-doc cross-check)
**Scope:** Neutral answer-choice states in `components/question/choice-button.tsx` across Quick Practice, active practice sessions, and review pages. Post-submit feedback cards are intentionally out of scope for this ticket.

**Historical note:** This archived debt item records the original cross-theme alignment pass that replaced the old `muted`-opacity contract and locked in the branch-placement discipline still retained by the final implementation. The specific neutral rest surface proposed here was later refined by DEBT-313 after visual QA of the implemented result.

---

## Context

Quick Practice exposed a broader shared-component issue: the pre-verdict answer choices currently read more like faint wireframes than contained interactive sub-surfaces, especially in light mode.

This is not a Quick Practice-only implementation detail. The same `ChoiceButton` component is reused by:

- Quick Practice (`/app/practice/quick`)
- Active tutor/exam sessions (`/app/practice/[sessionId]`)
- Review flows via `QuestionCard`

So the problem needs to be framed as an `I-3` pattern issue, not a page-local one.

The repo's frontend system already established a clearer visual language for "sub-surfaces inside a larger card":

| Surface | Current neutral pattern |
|---------|-------------------------|
| Practice filter containers | `bg-foreground/5` |
| Dashboard nested rows | `bg-foreground/5` |
| Filter chips | `border-foreground/45 bg-foreground/[0.07]` in light mode, `dark:border-foreground/40` in dark mode |
| Choice buttons | `border-border/60 bg-muted/20` in light mode, no dark-specific rest fill override (base `bg-muted/20` still composites to an almost card-matching fill) in dark mode |

Choice buttons are the outlier. They still rely on the old `muted`-opacity approach in light mode even though the repo already documented that light-mode `muted` opacity ramps are too weak on white surfaces.

---

## Current Implementation Mismatch

Current neutral-state `ChoiceButton` tokens:

```tsx
Base rest:                    border-border/60 bg-muted/20
Enabled hover fill branch:    hover:bg-muted/40
Unselected hover branch:      hover:border-muted-foreground/30 dark:hover:border-foreground/55 dark:hover:bg-foreground/8
Selected neutral branch:      border-ring bg-muted/40 dark:border-foreground/70 dark:bg-foreground/15

Dark rest override (unselected/no verdict): dark:border-foreground/40
```

Implementation nuance that matters for this ticket:

- `hover:bg-muted/40` is currently attached to the broad `!disabled` branch, so selected neutral choices still carry the light-mode hover fill token
- `hover:border-muted-foreground/30` and the dark hover overrides are attached to the narrower `!disabled && !selected` branch
- any replacement light-mode hover tokens must preserve that branch separation or selected neutral choices will regress from selected -> hover when the pointer enters

This conflicts with three repo-level decisions already captured elsewhere:

1. **Required boundaries must clear 3:1** when the border is doing the work of defining the control. See [Contrast Policy](../../frontend/contrast-policy.md) §3.2.
2. **Light mode cannot depend on `bg-muted/*` opacity for meaningful affordance** on white or near-white surfaces. See [DEBT-262](./debt-262-light-mode-opacity.md) and [Pattern Registry](../../frontend/pattern-registry.md) Part 1.2.
3. **Interactive children inside a card now generally use a foreground-based tonal ramp** (`bg-foreground/5`, `bg-foreground/[0.08]`, etc.) rather than white-on-white `muted` whisper fills. See [Practice](../../frontend/pages/practice.md), [Dashboard](../../frontend/pages/dashboard.md), [DEBT-291](./debt-291-filter-chip-light-mode-border-contrast.md), and [DEBT-309](./debt-309-filter-chip-hover-border-affordance.md).

---

## Computed Light-Mode Evidence

Using the current light tokens from `app/globals.css`:

- `--background` / `--card`: `#FFFFFF`
- `--muted`: `hsl(210 40% 96.1%)`
- `--border`: `hsl(214.3 31.8% 91.4%)`
- `--foreground`: `hsl(222.2 84% 4.9%)`

Current neutral `ChoiceButton` values composite to:

| Element | Effective color | Contrast |
|---------|-----------------|----------|
| Rest fill `bg-muted/20` | `#FCFDFE` | `1.02:1` vs white card |
| Rest border `border-border/60` | `#EEF1F6` | `1.13:1` vs white card |
| Rest border vs rest fill | `#EEF1F6` vs `#FCFDFE` | `1.11:1` |
| Hover border `hover:border-muted-foreground/30` | `#D1D5DC` | `1.47:1` vs white card |
| Rest fill vs selected fill (`bg-muted/20` -> `bg-muted/40`) | `#FCFDFE` -> `#F9FBFD` | `1.02:1` delta |

That explains the reported visual outcome:

- the row barely separates from the card
- hover is mostly invisible in light mode
- selected still feels too close to rest unless the user reads the border change carefully

Even if the fill is treated as supplementary, the current light-mode boundary is materially weaker than the standards already accepted for other required interactive boundaries such as `FilterChip`.

---

## Why This Is Debt

This is not just "taste drift." It is a pattern-level inconsistency:

- `ChoiceButton` still uses the old light-mode `muted` opacity recipe
- the rest of the question-adjacent UI has already moved toward a clearer foreground-tonal hierarchy
- the page inventory for [Quick Practice](../../frontend/pages/quick-practice.md) is dark-mode-only, so the light-mode weakness was never fully documented

The result is a high-frequency core interaction that no longer feels visually integrated with the newer practice/dashboard surface system.

---

## Recommended Direction

Treat `ChoiceButton` as a **hybrid pattern**:

- like Dashboard / Practice nested rows, it should read as a tonal child surface inside `QuestionCard`
- like `FilterChip`, it still needs a clearly compliant boundary because the row itself is the clickable control

So the correct direction is **not**:

- borderless dashboard-style rows
- a return to the heavier pre-DEBT-280 dark "boxed" look
- continuing to rely on `bg-muted/*` opacity in light mode

The correct direction is:

1. **Use a foreground-based tonal fill for the neutral row surface**
2. **Use a foreground-based border in light mode**
3. **Keep the dark-mode anti-"gray brick" principle from DEBT-280, but restore a subtle contained surface so the row does not read as pure wireframe**

---

## Recommended Token Baseline

### Light mode

```text
Rest:     border-foreground/50 bg-foreground/5
Hover:    hover:border-foreground/55 hover:bg-foreground/[0.08]
Selected: border-ring bg-foreground/[0.12]
```

### Dark mode

```text
Rest:     dark:border-foreground/40 dark:bg-foreground/5
Hover:    dark:hover:border-foreground/55 dark:hover:bg-foreground/8
Selected: dark:border-foreground/70 dark:bg-foreground/15
```

### Why this baseline

- `bg-foreground/5` restores the same subtle in-card tonal lift already used by Practice filter containers and Dashboard nested rows
- `border-foreground/50` clears `3.37:1` against `bg-foreground/5` in light mode, where `border-foreground/45` would still be too weak (`2.88:1`)
- `hover:border-foreground/55` clears `3.76:1` against `bg-foreground/[0.08]` in light mode and remains visibly stronger than rest without jumping straight to a punched-out look
- the dark rest fill at `bg-foreground/5` keeps the DEBT-280 direction intact: subtle containment, not gray bricks
- the dark hover fill at `bg-foreground/8` produces a 3pp fill delta over the new `bg-foreground/5` rest fill (`~11.3%` → `~13.9%` lightness). This is the same gap used by Dashboard I-1 in-card tonal rows (`bg-foreground/5` → `hover:bg-foreground/[0.08]`), and acceptable here because the border jump (`/40` → `/55`) carries the primary dark-mode hover signal. If post-implementation QA reveals the combined hover cue is too subtle, the fallback is `dark:hover:bg-foreground/[0.10]` (5pp gap) — but start with the system-consistent value

### Branch placement requirement

These replacement tokens are only correct if they land in the right conditional branches:

- `border-foreground/50 bg-foreground/5` becomes the new neutral base
- `hover:border-foreground/55 hover:bg-foreground/[0.08]` must live in the same unselected neutral hover branch as the current `hover:border-muted-foreground/30 ...` tokens
- `border-ring bg-foreground/[0.12]` remains selected-neutral-only

Do not leave `hover:bg-foreground/[0.08]` on the broad enabled branch. If it remains attached to all enabled choices, selected neutral choices will visually step backwards on hover (`[0.12]` → `[0.08]` in light mode).

This is intentionally a **recommended baseline**, not a claim that the exact selected token is settled forever. If `border-ring` feels too loud once the neutral row is fixed, the fallback to evaluate is `border-foreground/60` on the selected neutral state, not a return to `bg-muted/*`.

---

## Files In Scope

### Production

| File | Change |
|------|--------|
| `components/question/choice-button.tsx` | Replace the light-mode `border-border/60 bg-muted/20` neutral-state recipe with the foreground-tonal hybrid recipe; add subtle dark rest fill; move the replacement light hover tokens into the unselected-neutral branch so selected choices do not regress on hover |

### Tests

| File | Change |
|------|--------|
| `components/question/choice-button.test.tsx` | Update positive token assertions; add negative assertions removing `border-border/60`, `bg-muted/20`, `hover:bg-muted/40`, and `hover:border-muted-foreground/30` from the neutral-state contract; assert selected neutral markup does not inherit the new unselected-only hover tokens |
| `components/theme-token-regression.test.tsx` | Update the shared ChoiceButton token regression so it no longer asserts `border-border/60` / `bg-muted/40` for the neutral contract |
| `components/question/ChoiceButton.browser.spec.tsx` | Keep the selected-hover guard, but update it to verify selected neutral markup does not inherit the new unselected-only light hover tokens |

### Documentation

| File | Change |
|------|--------|
| `docs/frontend/pattern-registry.md` | Update `I-3` to document the new hybrid "tonal row + required boundary" pattern; rewrite the design rationale to explain why `bg-foreground/5` rest fill is acceptable containment while the old `bg-foreground/8` was "gray bricks" (5% is the system-standard tonal surface, not a mid-opacity fill); update the fill progression from `0 → 8 → 15` to `5 → 8 → 15`; update the I-3 summary row / hover decision-tree callouts that currently still encode the old light-mode contract |
| `docs/frontend/contrast-policy.md` | Add an explicit note that `ChoiceButton` uses a required boundary and light-mode foreground-based border because `muted` opacity is insufficient on white |
| `docs/frontend/standards.md` | Update §5 "Interactive row/card hover" to reflect the new foreground-based choice button hover tokens (current table references stale `dark:hover:bg-foreground/15`); revise the blanket "Always use the `muted` token for neutral hover backgrounds" rule to account for foreground-ramp tonal patterns already established by I-1, I-2, I-3, and I-4 |
| `docs/frontend/pages/quick-practice.md` | Expand from dark-mode-only historical note to a current cross-theme audit; explicitly document the light-mode rationale and the selected neutral-state contract |

---

## Out of Scope

These are intentionally excluded from DEBT-312:

1. **Feedback section containment cards** after submission. That is a separate follow-up if the same tonal/boundary issue is confirmed there.
2. **Correct / incorrect semantic verdict states.** Green/red states are not the problem described here.
3. **Action bar buttons and segmented controls.** They already have their own tracked contracts.
4. **Letter badge redesign.** Keep the inner `A/B/C/D` badge unchanged in the first pass unless post-fix screenshots show a new mismatch.

---

## Test Plan

### Unit coverage

1. Neutral rest state uses the new light-mode foreground border/fill tokens
2. Neutral rest state no longer contains `border-border/60`
3. Neutral rest state no longer contains `bg-muted/20`
4. Neutral hover state no longer contains `hover:bg-muted/40`
5. Neutral hover state no longer contains `hover:border-muted-foreground/30`
6. Selected neutral markup does not inherit the new unselected-only light hover tokens
7. Dark neutral rest state now includes the subtle dark fill
8. Shared theme-token regression coverage is updated to the new neutral-state contract
9. Correct / incorrect verdict states remain unchanged

### Manual visual QA

Validate in all of these contexts because `ChoiceButton` is shared:

1. Quick Practice, light mode
2. Quick Practice, dark mode
3. Active Tutor session, light mode
4. Active Tutor session, dark mode
5. Active Exam session, light mode
6. Active Exam session, dark mode
7. Review question page, light mode
8. Review question page, dark mode

### Visual acceptance criteria

1. Unselected choices no longer read as hairline wireframes in light mode
2. The neutral rest state feels like a contained child surface inside the card
3. Hover is visible without becoming louder than the question text
4. Selected is clearly stronger than hover
5. Dark mode regains subtle containment without returning to the old "gray brick" / punched-out appearance

---

## Relationship to Existing Work

- **Extends [DEBT-280](./debt-280-choice-button-dark-mode-surface-refinement.md)** from dark-mode refinement into a cross-theme neutral-state alignment pass
- **Applies the same light-mode reasoning used by [DEBT-291](./debt-291-filter-chip-light-mode-border-contrast.md)**: foreground-based borders are required when white/light surfaces make semantic `border` tokens too quiet
- **Builds on [DEBT-309](./debt-309-filter-chip-hover-border-affordance.md)**: hover needs an edge-level cue, not just a tiny fill change
- **Closes a documentation gap left by the current [Quick Practice page inventory](../../frontend/pages/quick-practice.md)**, which only audits dark mode

---

## Audit Corrections Applied

This ticket was tightened after a line-by-line repo audit on 2026-03-14. The corrections above are intentional and should not be reverted:

- describe the hover branches exactly as implemented instead of flattening them into a single generic "Hover" line
- stop calling the current dark rest fill "transparent" — there is no dark-specific rest fill override, but the base `bg-muted/20` token still exists and composites to a near-card value
- include the shared theme-token regression and browser spec in scope because they encode the current neutral-state contract
- include Active Exam in manual QA because `QuestionCard` is shared by both tutor and exam session flows
