# BS-045: Choice Button Dark Mode Fill and Border Refinement

**Date:** 2026-03-06
**Triggered by:** Per-page visual audit of Quick Practice in dark mode ([page audit](../frontend/pages/quick-practice.md)). The DEBT-279 remediation made choice buttons WCAG compliant but aesthetically heavy — gray fills look unnatural, borders are too prominent, and hover/selected states are nearly indistinguishable.
**Scope:** Refine the dark-mode visual treatment of choice buttons: remove the resting fill, keep the border WCAG-compliant, and widen the fill steps so hover and selected states are clearly perceptible.
**Related:** [BS-044](./bs-044-dark-mode-border-weight-tiering.md) (broad border tiering), [DEBT-279](../_archive/debt/debt-279-wcag-aa-contrast-remediation-plan.md) (original remediation), [Contrast Policy](../frontend/contrast-policy.md), [Pattern Registry](../frontend/pattern-registry.md), [Page Audit](../frontend/pages/quick-practice.md)

---

## The Problem

After DEBT-279 (PR #174), choice buttons in dark mode have three dark-override tokens applied simultaneously:

```
Rest:     dark:bg-foreground/8    dark:border-foreground/40
Hover:    dark:hover:bg-foreground/15   dark:hover:border-foreground/70
Selected: dark:bg-foreground/20   dark:border-foreground/70
```

**Source:** `components/question/choice-button.tsx:32-42`

This produces the following concrete problems:

### P1: Gray fill looks unnatural

Using the actual dark token values from `app/globals.css` (`--foreground: #EDEDED`, `--card: #121212`), `bg-foreground/8` composites to `#242424` on the card surface. Every choice button is visibly gray against the dark card. Before DEBT-279, buttons had no dark fill — they sat flush with the card, clean and sleek. The gray fill makes them look like concrete blocks.

### P2: Border is too heavy relative to the card

`border-foreground/40` computes to `#6A6A6A` at ~`3.46:1` against the card. The question card's own border is `border-border` = `#262626` (~`1.24:1`). The choice borders are far brighter than their parent container, inverting the visual hierarchy. The buttons look "caged."

### P3: Letter badge separation is weakest on hovered and selected surfaces

The A/B/C/D badges use `dark:bg-foreground/20` (`#3E3E3E`) with `dark:border-foreground/60` (`#959595`). The fill separation is modest even before the proposed refinement:

- badge fill `#3E3E3E` vs current rest fill `#242424` = ~`1.45:1`
- badge fill `#3E3E3E` vs proposed selected fill `#333333` = ~`1.18:1`

The badge border is doing most of the work. This does **not** need to be changed in the first pass, but the implementation spec must call out that the badge fill should stay unchanged unless visual QA still shows blending after the main button refinement.

### P4: Hover is barely perceptible

Fill goes from 8% → 15% (`#242424` → `#333333`). In the screenshot, hovering choice B is almost identical to the non-hovered choices. The border jump (40% → 70%) provides the only meaningful hover signal, but it's a blunt instrument — the entire border flashes bright.

### P5: Selected is indistinguishable from hover

- Border: identical (both `foreground/70`)
- Fill: 15% → 20% — only ~4 lightness points (`#333333` → `#3E3E3E`)

A user hovering one choice while another is selected cannot visually tell them apart by border or fill. The only differentiator is the hidden radio input state.

### P6: Segmented control has the same heavy border

The tab switcher (`tab-switch-styles.ts`) uses `dark:border-foreground/40` — the same heavy token. For a small, self-contained control with a bright active pill (`bg-primary`), this border adds visual noise without improving comprehension.

---

## Root Cause Analysis

DEBT-279 needed to bring dark-mode borders up to WCAG SC 1.4.11's 3:1 minimum. The fix was correct in principle: `dark:border-foreground/40` achieves ~`3.46:1` on the card. But the implementation also added `dark:bg-foreground/8` as a resting fill to establish a "stepped hierarchy" for the fill progression (8 → 15 → 20).

Two root causes:

1. **The fill steps are too narrow.** Starting at 8% leaves only 12 percentage points of range (8 → 20). Each state transition is 5–7 points — below the perceptual threshold for most users on dark backgrounds.

2. **The resting border treats the WCAG minimum as a design target.** 3:1 is the accessibility *floor*, not the goal. Applying a ~`3.46:1` border to every resting choice button produces a line that's technically compliant but visually oppressive. Premium dark-mode apps (Linear, Vercel, Notion) use much quieter resting borders and reserve 3:1+ for *state communication* (selected, focus, active) — not resting containers.

The resting fill itself creates the primary aesthetic complaint: the "gray box" look. And the uniform `/40` border creates the secondary complaint: "caged" / "wireframe" appearance.

### WCAG SC 1.4.11 — what it actually requires

> "Visual information **required to identify** user interface components and states."

The key phrase is "required to identify." Choice buttons are identifiable through multiple redundant channels: letter badges (A/B/C/D), text labels, vertical stacking, spacing, and fieldset grouping. The resting border is not the sole identifier — it is a **supporting cue**. This means the resting border can be treated as partially decorative, and the 3:1 requirement applies most strictly to **state boundaries** (selected, focus) where the border communicates a change the user must perceive.

This is the same interpretation Linear, Vercel, Spotify, and Notion apply in their dark modes — quiet resting borders, strong state borders.

---

## Severity Assessment

- **Who sees it:** Every user of Quick Practice, Practice sessions, standalone question view, session review, and bookmark reattempt — anywhere `ChoiceButton` renders in dark mode.
- **How often:** Every question interaction in dark mode.
- **Impact:** Aesthetic — the app looks less premium/polished than it should. The hover/selected indistinguishability (P4/P5) is a mild UX issue — users can still interact correctly, but the visual feedback is weak.
- **Not a regression for functionality.** WCAG compliance is not at risk. This is about finding a better balance between compliance and aesthetics.

---

## Proposed Fix

**Remove the resting fill. Soften the resting border. Widen the state steps. Make selected qualitatively different from hover.**

### Approach A: Conservative (approved for DEBT-280)

Keep `/40` at rest. Simpler WCAG argument — no need to justify decorative classification.

| State | Current | Proposed | Rationale |
|-------|---------|----------|-----------|
| **Rest border** | `dark:border-foreground/40` | `dark:border-foreground/40` | **Keep** — ~`3.46:1`, no WCAG risk. Without the gray fill, the line reads cleaner. |
| **Rest fill** | `dark:bg-foreground/8` | _(remove)_ | **Remove** — flush with card. |
| **Hover border** | `dark:hover:border-foreground/70` | `dark:hover:border-foreground/55` | **Soften** — clear lift from /40 without being jarring. |
| **Hover fill** | `dark:hover:bg-foreground/15` | `dark:hover:bg-foreground/8` | Gentle acknowledgment. 0→8 is perceptible. |
| **Selected border** | `dark:border-foreground/70` | `dark:border-foreground/70` | **Keep** — strong, distinct from hover /55. |
| **Selected fill** | `dark:bg-foreground/20` | `dark:bg-foreground/15` | Clear commitment. 0→8→15 gaps of 8 and 7 — both perceptible. |

```
Rest:      bg-transparent         border-foreground/40    ← clean, flush with card
Hover:     bg-foreground/8        border-foreground/55    ← subtle lift
Selected:  bg-foreground/15       border-foreground/70    ← clearly chosen
```

**Pros:** Safe WCAG compliance. Simple argument.
**Cons:** Resting border is still the brightest element at rest — may still feel somewhat heavy.

### Approach B: Exploratory only (not approved for DEBT-280)

Soften the resting border substantially. Reserve 3:1+ for state communication only.

| State | Current | Proposed | Rationale |
|-------|---------|----------|-----------|
| **Rest border** | `dark:border-foreground/40` | `dark:border-foreground/20` | **Soften** — ~`1.75:1`. Quiet, but extremely faint. Requires a policy-level decorative-boundary justification and fresh visual evidence. |
| **Rest fill** | `dark:bg-foreground/8` | _(remove)_ | **Remove** — flush with card. |
| **Hover border** | `dark:hover:border-foreground/70` | `dark:hover:border-foreground/40` | Border "wakes up" to 3:1 on interaction — WCAG compliant for state. |
| **Hover fill** | `dark:hover:bg-foreground/15` | `dark:hover:bg-foreground/6` | Barely-there lift. Enough to register. |
| **Selected border** | `dark:border-foreground/70` | `dark:border-foreground/60` | Strong, clear 3:1+. Unmistakable. |
| **Selected fill** | `dark:bg-foreground/20` | `dark:bg-foreground/12` | Noticeable fill. Combined with strong border, reads as committed. |
| **Selected extra** | _(none)_ | `dark:ring-1 dark:ring-foreground/20` | **Do not use in DEBT-280.** This would compete with the existing focus ring channel and inherit the current dark-mode ring-contrast concerns. |

```
Rest:      bg-transparent         border-foreground/20    ← quiet, almost invisible
Hover:     bg-foreground/6        border-foreground/40    ← border wakes up, gentle fill
Selected:  bg-foreground/12       border-foreground/60    ← clearly chosen + optional ring
```

**Pros:** Matches premium dark-mode aesthetics more closely.
**Cons:** `foreground/20` is too faint to ship on choice buttons without a broader policy change. If a softer-border experiment is revisited later, it should be tracked separately and start from fresh screenshots and contrast math, not substituted into DEBT-280.

### Recommended Starting Point

**Approach A is the correct first implementation.** It removes the gray slab effect, keeps WCAG compliance unambiguous, and avoids introducing a second ring channel that would muddy focus semantics. Approach B remains brainstorming material only; do not treat it as an equally-approved implementation path.

### Visual Hierarchy Summary (Approach A)

```
Rest:      bg-transparent         border-foreground/40    ← clean, flush with card
Hover:     bg-foreground/8        border-foreground/55    ← visible lift (fill appears, border brightens)
Selected:  bg-foreground/15       border-foreground/70    ← clearly chosen (fill stronger, border brightest)
```

**Exact dark-mode composites on card (`#121212`):**

- `foreground/8` = `#242424` (~`1.21:1`)
- `foreground/15` = `#333333` (~`1.48:1`)
- `foreground/40` = `#6A6A6A` (~`3.46:1`)
- `foreground/55` = `#8A8A8A` (~`5.43:1`)
- `foreground/70` = `#ABABAB` (~`8.16:1`)

### Letter Badge Adjustment

Currently: `dark:border-foreground/60 dark:bg-foreground/20`

When the button fill is transparent, the badge at `/20` will have more contrast against the card surface. The badge should remain distinguishable across all button states:

- On transparent button: badge bg `#3E3E3E` vs card `#121212` = ~`1.75:1`
- On hovered button (`bg-foreground/8` = `#242424`): badge `#3E3E3E` vs `#242424` = ~`1.45:1`
- On selected button (`bg-foreground/15` = `#333333`): badge `#3E3E3E` vs `#333333` = ~`1.18:1`

The badge border (`dark:border-foreground/60` = `#959595`) remains the primary separator. Keep the badge tokens unchanged in the first pass. If post-implementation QA still shows blending, open a follow-up to test `dark:bg-foreground/25`.

### Segmented Control

Remove `dark:border-foreground/40` from `tab-switch-styles.ts`. Let it fall back to `border-border` (`#262626`). On `bg-muted` (`#1C1C1C`), that border is only ~`1.13:1`, so the container must be treated as decorative. This is acceptable because every current consumer has strong grouped labels plus a dominant active pill / active tab treatment.

**Shared-consumer note:** `tabSwitchContainerClasses` is shared by `SegmentedControl`, `HistoryTabBar`, and the History Sessions mode filter. Any implementation PR must verify all of those consumers, not just Quick Practice.

---

## Alternatives Considered

### Alt A: Keep fill, widen steps

```
Rest:     bg-foreground/3    border-foreground/40
Hover:    bg-foreground/12   border-foreground/55
Selected: bg-foreground/24   border-foreground/70
```

Still has a faint gray tint at rest. Wider steps (3→12→24, gaps of 9 and 12). The 3% fill is nearly invisible — it either reads as transparent (making it pointless) or creates a subtle gray that's worse than no fill.

**Rejected:** A barely-visible fill is worse than no fill. Either commit to it being visible (which is the current problem) or remove it.

### Alt B: Border-only, no fills at all

```
Rest:     bg-transparent     border-foreground/40
Hover:    bg-transparent     border-foreground/60
Selected: bg-transparent     border-foreground/80
```

Pure border signaling. Clean, minimal. But hover and selected are communicated only by border brightness, which is a narrow channel — the entire button edge changes but the interior doesn't.

**Rejected:** Fills provide a clear, large-area signal that's easier to perceive than border brightness alone. The proposed fix uses fills on interaction only, which is the best of both worlds.

### Alt C: Drop border below 3:1 for aesthetics

```
Rest:     bg-transparent     border-foreground/30  (~2.5:1)
```

Sleeker, but fails WCAG SC 1.4.11. Could argue the border is decorative (badge + text + layout identify the button), but this is a weaker argument for choice buttons than for containers — the border genuinely helps communicate the clickable area.

**Not rejected outright** — subsumed into Approach B above, which takes a more systematic position on the decorative-border argument.

### Alt D: Brand/primary tint on selected state

```
Selected: dark:border-primary/70   dark:bg-primary/8
```

Uses the primary color instead of neutral gray for the selected state. Makes selected *categorically* different from hover — not just "more of the same." This is the Notion approach (blue tint on selected).

**Deferred:** Interesting idea but adds a color dimension that may conflict with the verdict states (green/red) that appear after submission. If selected is tinted and then the answer resolves to correct/incorrect, the color transitions could be jarring. Worth revisiting if the monochrome approach (Approach A/B) doesn't produce enough selected differentiation in visual testing.

---

## File Changes (When Implemented)

| File | Change |
|------|--------|
| `components/question/choice-button.tsx` | Remove `dark:bg-foreground/8` from rest state. Adjust hover fill to `/8`, hover border to `/55`. Adjust selected fill to `/15`. Keep badge tokens unchanged in this ticket. |
| `components/ui/tab-switch-styles.ts` | Remove `dark:border-foreground/40` from container classes. |
| `components/question/choice-button.test.tsx` | Update positive assertions to the new tokens and add negative assertions so stale `dark:bg-foreground/8` / `dark:hover:border-foreground/70` / `dark:bg-foreground/20` cannot leak through. |
| `components/ui/segmented-control.test.tsx` | Add a negative assertion that the container does **not** include `dark:border-foreground/40`. The current substring assertion is too weak. |
| `app/(app)/app/history/components/history-tab-bar.test.tsx` | Add the same negative assertion because `HistoryTabBar` consumes the shared tab-switch container. |
| `docs/frontend/pattern-registry.md` | Update choice button pattern entry with new token values. |
| `docs/frontend/pages/quick-practice.md` | Update the live token audit after implementation or clearly mark the current analysis as pre-DEBT-280. |

---

## Implementation Notes

1. **Hover fill is resolved to `/8`.** DEBT-280 now chooses `0 → 8 → 15`, not `/10` or `/12`.

2. **Badge stays unchanged in this ticket.** Keep `dark:border-foreground/60 dark:bg-foreground/20`. If it still blends after the main pass, that becomes a follow-up, not a last-minute scope creep.

3. **Do not add a selected ring.** Focus already uses `focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]`. A second ring channel would blur selection vs focus and is not part of this debt item.

4. **Verdict states stay exactly as they are.** `correct` / `incorrect` must continue to bypass the neutral dark overrides via `!hasVerdict`. `wrong-unselected` should remain neutral and readable.

5. **The segmented-control change ships in the same PR.** It is part of the same visual problem, but the QA surface must include all shared `tabSwitchContainerClasses` consumers.

6. **Before/after screenshots are required.** This is an aesthetic change with subjective risk; reviewers need visual proof, not just token diffs.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-06 | Created BS-045 | BS-044 identified the broad concern; this doc narrows to the most immediately actionable piece — choice buttons on the Quick Practice page. |
| 2026-03-06 | Proposed: remove rest fill, keep /40 border, widen state steps | Removes the "gray box" look while maintaining WCAG compliance. Fill appears only on interaction as progressive disclosure. Border reads as elegant rather than heavy when there's no fill behind it. |
| 2026-03-06 | Proposed: remove segmented control dark border override | Active pill provides sufficient visual definition. Container border is decorative. |
| 2026-03-06 | Incorporated independent design review (Claude sidebar) | Review validated all 6 problems. Two material improvements: (1) resting border could be softer — `/40` treats WCAG minimum as design target; (2) selected needs qualitative differentiation, not just "more gray." Added Approach B (aggressive) as alternative to Approach A (conservative). Added Alt D (brand tint on selected). Decision: start with Approach A, iterate toward B if needed. |
