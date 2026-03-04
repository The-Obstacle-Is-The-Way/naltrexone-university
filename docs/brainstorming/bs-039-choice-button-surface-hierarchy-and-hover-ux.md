# BS-039: Choice Button Surface Hierarchy and Hover UX

**Date:** 2026-03-03
**Triggered by:** Visual inspection of Quick Practice multiple choice view — answer choices show inconsistent dark gradation and an uncanny hover effect
**Scope:** The `ChoiceButton` component uses `bg-background` (Layer 0) inside a `<Card>` (`bg-card`, Layer 1), creating an inverted visual hierarchy where interactive elements are darker than their container
**Related:** [BS-035 (archived)](../_archive/brainstorming/bs-035-card-hover-and-gray-consistency-audit.md) — identified choice hover shade mismatch as symptom #4 but only fixed hover opacity, not base surface; [Pattern Registry I-3](../../frontend/pattern-registry.md); [choice-button.tsx](../../components/question/choice-button.tsx)

---

## The Problem

In dark mode, the Quick Practice question view has a visually awkward layering effect:

1. **Different gradation of black** — The question stem sits on `bg-card` (7% lightness) while the four answer choices use `bg-background` (3.5% lightness). This makes choices appear as darker rectangles "punched through" the card surface, creating unintentional visual weight variation.

2. **Jarring hover effect** — When hovering a choice, the surface jumps from `bg-background` (3.5%) to `hover:bg-muted/60` (rendered ~9.4% over bg-card). That's a ~6% lightness leap in one step — roughly 7× larger than the dashboard's gentle ~0.8% hover transition. The hover overshoots the parent card surface rather than sitting naturally within it, creating a flash effect instead of a smooth highlight.

3. **Letter badge disconnect** — The A/B/C/D circle badges use `bg-muted` (11% lightness), making them the brightest surface in the stack. Combined with the dark choice rows, the badges visually "float" rather than sitting naturally within their row.

### Visual Hierarchy (current, dark mode)

```
Layer        Token              Rendered*        Visual
─────────────────────────────────────────────────────────
Page bg      --background       3.5%             ████████ darkest
Choice row   bg-background      3.5%             ████████ same as page (!)
Card         bg-card            7.0%             █████░░░ question stem area
Choice hover bg-muted/60        ~9.4%†           ███░░░░░ overshoots card
Letter badge bg-muted           11.0%            ██░░░░░░ brightest
Border       --border           15.0%            █░░░░░░░ edges

* Alpha-blended values composited over their parent surface (bg-card).
  See Pattern Registry §1.2 for the full opacity scale.
† Base 3.5% → hover 9.4% = ~6% jump (vs dashboard's ~0.8% step).
```

The choice rows and page background are identical. There is no visual surface for the choices to exist "on" — they're transparent to the page, with only a thin border differentiating them.

### Contrast with Dashboard (works correctly)

```
Layer        Token              Rendered*        Visual
─────────────────────────────────────────────────────────
Page bg      --background       3.5%             ████████
Card         bg-card            7.0%             █████░░░ card surface
Row base     bg-muted/20        ~8.0%            ████░░░░ sits just above card
Row hover    bg-muted/40        ~8.6%            ███░░░░░ smooth ~0.8% step up

* Composited over bg-card (7%). Pattern Registry §1.2 confirms
  bg-muted/20 ≈ ~8% inside card, bg-muted/40 ≈ ~8.6% inside card.
```

Dashboard rows sit just above the card surface and hover with a gentle ~0.8% step — a smooth upward progression. Users perceive this as natural highlighting.

---

## Root Cause Analysis

### 1. `bg-background` on ChoiceButton (the design intent mismatch)

From the Pattern Registry (I-3), the design rationale states:

> Uses `bg-background` (layer 0), not `bg-card`, so choices feel like standalone interactive elements, not Card subsections.

This rationale was written for the *general case* but creates a conflict specifically in `QuestionCard`, where choices are rendered *inside* a `<Card>` component. The "standalone" intent is undermined by the Card wrapper — the choice appears to be a card subsection *structurally* but tries to be standalone *visually*, landing in an uncanny valley.

### 2. Hover delta is too large

The choice base (`bg-background` = 3.5%) sits far below `bg-card` (7.0%), so when hover applies `bg-muted/60` (composited ~9.4% over bg-card), the surface leaps ~6% in one step. Dashboard rows go from `bg-muted/20` (~8%) to `hover:bg-muted/40` (~8.6%) — a smooth ~0.8% step. The choice hover delta is ~7× larger, creating a jarring flash instead of a gentle highlight.

**Note:** The original analysis (pre-verification) estimated `bg-muted/60` at ~6.6% by treating the alpha as a simple lightness multiplier (11% × 0.6). This ignores alpha compositing — the actual rendered value depends on the parent surface. The Pattern Registry §1.2 confirms the composited value is ~9.4% inside a card.

### 3. The Card wrapper forces a layering problem

`QuestionCard` wraps everything in `<Card>`, giving the question stem a `bg-card` surface. But then the choices inside that card use `bg-background`, creating a step *down* in the hierarchy. The Card component was designed as a top-level surface container, not a container for elements that punch through it.

### 4. BS-035 fixed hover opacity but not the base surface

BS-035 (DEBT-250 compliance) changed choice hover from `bg-muted/80` to `bg-muted/60` to match the Pattern Registry's "direct-action target" tier. This was correct for the opacity scale, but the underlying `bg-background` base was never questioned because the Pattern Registry had already canonized it.

---

## Severity Assessment

- **Who:** All users in dark mode (the app's primary/only theme)
- **Where:** Quick Practice, Practice (tutor/exam), Session Review, History question review, Bookmarks reattempt — every view that uses `QuestionCard`
- **Frequency:** Every question interaction (core product experience)
- **Severity:** Low-medium. The feature works correctly — the issue is purely visual discomfort. But it affects the product's most-used view and undermines the polished feel of the rest of the UI.

---

## Proposed Options

### Option A: Elevate choice base to `bg-muted/20` (match dashboard rows)

```tsx
// choice-button.tsx line 28, change:
'block w-full rounded-xl border border-border bg-background p-4 ...'
// to:
'block w-full rounded-xl border border-border/60 bg-muted/20 p-4 ...'
```

And update hover from `hover:bg-muted/60` to `hover:bg-muted/40`:

```
Before:  bg-background (3.5%) → hover:bg-muted/60 (~9.4%)  — jarring 6% jump
After:   bg-muted/20   (~8.0%) → hover:bg-muted/40 (~8.6%) — smooth ~0.8% step

Rendered lightness values composited over bg-card (7%).
```

**Pros:**
- Directly matches dashboard row pattern — maximum consistency
- Clear upward hover progression (~8.0% → ~8.6%, matching dashboard)
- Choices gain a visible "surface" that differentiates them from the page
- `border-border/60` is already the dashboard row convention — softer than full border

**Cons:**
- Contradicts Pattern Registry I-3 rationale ("standalone, not Card subsections")
- Pattern Registry would need updating
- Choices lose their "floating on the page" aesthetic (if that was valued)

### Option B: Remove Card wrapper from QuestionCard

```tsx
// question-card.tsx, change <Card> to a plain container:
<div className="space-y-0">
  <Markdown content={stemMd} className="text-base text-foreground" />
  <fieldset className="mt-8 space-y-3">...</fieldset>
</div>
```

**Pros:**
- Eliminates the layering conflict entirely — no more bg-card vs bg-background clash
- Choices truly are standalone elements against the page
- Question stem and choices exist at the same hierarchy level

**Cons:**
- Loses the Card's visual containment (border, padding, shadow) around the question stem
- The question stem would need its own visual treatment or would float as plain text
- Significant visual change across all question views

### Option C: Elevate choice to `bg-card` (same as parent)

```tsx
// choice-button.tsx line 28, change bg-background to bg-card:
'block w-full rounded-xl border border-border bg-card p-4 ...'
```

**Pros:**
- Choices match the Card surface — no visible "holes"
- Simple one-token change
- Border alone differentiates choices from the card body

**Cons:**
- Choices blend into the card surface at rest — differentiation relies entirely on borders
- Hover (`bg-muted/60` ≈ 9.4% composited) would work directionally (rises above 7% card base), but the 2.4% step is still larger than the dashboard's ~0.8% convention — would benefit from changing hover to `hover:bg-muted/40` (~8.6%) for consistency

### Option D: Subtle tint with accent color

Instead of pure gray, give choices a very faint hue (e.g., `bg-primary/5`) to create visual separation without relying on lightness steps.

**Pros:**
- Unique visual identity for interactive choices vs passive cards
- Works even if lightness values are close
- Could create a "selected answer space" feeling

**Cons:**
- Introduces a colored surface not used elsewhere in the design system
- May look odd with the success/destructive correctness states
- Adds design system complexity for a niche use case

---

## Recommendation

**Option A** (elevate to `bg-muted/20` + `hover:bg-muted/40`) is the strongest candidate:

1. It directly reuses the dashboard's proven pattern
2. It fixes both the gradation and hover issues simultaneously
3. The change is small (two classes in one file + Pattern Registry update)
4. It creates a consistent "interactive row" pattern across the app

The Pattern Registry I-3 rationale should be updated to acknowledge that choices inside a Card wrapper need the "in-card row" treatment (`bg-muted/20 → hover:bg-muted/40`) rather than the standalone treatment.

**Supporting evidence from the existing code:** The *selected* state already uses `bg-muted/20` (line 34: `selected && correctness === null && 'border-ring bg-muted/20'`). This means the correct token is already known for "this row is active" — the developer chose the right value for the selected state but used the wrong value for the default state. Option A simply promotes the default base to match what the selected state already uses, making `bg-muted/20` the universal base instead of a selection-only override.

---

## Open Questions

1. **Should letter badges also change?** Currently `bg-muted` (11%). If the row base moves to `bg-muted/20` (~8% inside card), the badge-to-row contrast *decreases* (from 7.5% gap to 3% gap), which should make badges feel more naturally nested in their rows. Worth visual verification.

2. **Should the selected state change?** Currently `border-ring bg-muted/20` — if the base is also `bg-muted/20`, the selected state would need a higher opacity like `bg-muted/40` or a ring-based approach instead.

3. **Does this affect the correctness states?** `bg-success/10` and `bg-destructive/10` replace the base background, so they should work regardless. But worth verifying the visual contrast.

4. **Should this be a Pattern Registry amendment or a new pattern?** I-3 currently describes one choice button pattern. It may need "standalone" vs "in-card" variants, or the standalone variant may simply be retired since choices always appear inside `QuestionCard`.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-03 | Created BS-039 | Visual inspection revealed inverted surface hierarchy in Quick Practice choice buttons |

## Visual Verification (Playwright, dark mode)

**Capture timestamp:** 2026-03-04T00:54:23Z (local run)  
**Artifacts:** `audit-screenshots/bs-039-visual-verification-2026-03-03/`

### Screenshot set reviewed

- `quick-practice-default.png`
- `quick-practice-choice-hover.png`
- `quick-practice-choice-selected.png`
- `quick-practice-after-submit.png`
- `dashboard-default.png`
- `dashboard-session-row-hover.png`
- `dashboard-activity-row-hover.png`
- `history-sessions-default.png`
- `history-sessions-row-hover.png`
- `history-questions-default.png`
- `bookmarks-default.png`
- `dashboard-activity-review-debug.png` (Correct state)
- `dashboard-activity-review-incorrect-debug.png` (Incorrect state)
- Style snapshots: `style-metrics.json`, `dashboard-review-style-metrics.json`

### Surface findings from rendered dark mode

1. **Choice row base is visibly below its parent card surface (inverted hierarchy).**  
   In Quick Practice default state, measured backgrounds:
   - Question card: `rgb(18, 18, 18)`
   - Choice row: `rgb(9, 9, 9)`

   This confirms BS-039's core issue: choices read as darker cutouts inside the card.

2. **Dashboard + History rows use the intended stacked progression.**  
   Measured backgrounds:
   - Row base (`bg-muted/20`): `oklab(... / 0.2)`
   - Row hover (`hover:bg-muted/40`): `oklab(... / 0.4)`

   This progression is consistent across Dashboard and History Sessions, and visually reads correctly.

3. **Choice hover is perceptually weak/unstable in the observed Quick Practice render.**  
   Captured hover style remained effectively identical to default in this run (`rgb(9, 9, 9)`), so the hover affordance is not reliably legible in practice compared to dashboard/history rows.

4. **Letter badge contrast is high relative to the row base.**  
   In Quick Practice default:
   - Row base: `rgb(9, 9, 9)`
   - Badge: `rgb(28, 28, 28)`

   Badge remains the brightest local element and appears slightly detached from the row surface.

5. **Correct/Incorrect states render with clear semantic contrast in review-mode QuestionCard.**  
   From dashboard-linked review captures:
   - Correct row: success tint `bg-success/10`, success border/text
   - Incorrect row: destructive tint `bg-destructive/10`, destructive border/text

   These post-answer semantic states are visually strong and should be preserved.

### Additional inconsistencies found (not fully covered in original BS-039)

1. **~~Quick Practice submit error~~ (RESOLVED — missing DB migration):** The `Internal error` banner on submit was caused by migration 0014 (`claimed_at` column on `idempotency_keys`) not being applied to the Neon `dev` branch after PR #169 merged. Fixed by running `pnpm db:migrate`. Not a code bug — unrelated to the surface hierarchy issue. See [deployment-environments.md Known Gotchas](../dev/deployment-environments.md#missing-database-migration-causes-silent-write-failures).
2. **History session review route inconsistency:** one captured session-review navigation reached a `Question` header but rendered no QuestionCard content (`session-review-question.png`, style metrics `null`).
3. **Bookmarks currently dominated by unavailable items:** `bookmarks-default.png` shows unavailable rows with `Remove` but no `Review` link, preventing Bookmarks → QuestionCard verification in this run.
4. **History Questions tab also surfaced unavailable-only rows in this dataset (`history-questions-default.png`), limiting hover/row behavior comparison for active review links.**

### Option evaluation (A-D) after verification

- **Option A (`bg-muted/20` + `hover:bg-muted/40`) remains the strongest fix.**  
  It matches the already-successful Dashboard/History row pattern and resolves the observed card-vs-choice inversion.
- **Option B (remove Card wrapper) is still too broad** for a primarily surface-token issue.
- **Option C (`bg-card`) still risks insufficient separation** at rest.
- **Option D (accent tint) still introduces unnecessary token complexity** for this use case.

### Refined recommendation

Proceed with **Option A**, plus a small state-tuning follow-up:

1. Change choice base to `bg-muted/20` and hover to `hover:bg-muted/40`.
2. Align border with row convention: `border-border/60`.
3. Revisit selected neutral state after base change (currently `bg-muted/20`), likely promoting selected to a stronger surface (e.g., `bg-muted/40`) while preserving `border-ring`.
4. Keep success/destructive correctness states unchanged (they render clearly in dark mode).

### Decision update

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-03 | Option A remains recommended after visual verification | Live dark-mode capture confirms inverted Quick Practice hierarchy and validates dashboard/history row pattern as the stable reference |
| 2026-03-03 | Accuracy review: corrected composited lightness values | Original ~6.6% estimate for bg-muted/60 was wrong (ignored alpha compositing over bg-card). Pattern Registry §1.2 confirms ~9.4%. Reframed hover problem from "convergence with parent" to "jarring 6% jump from too-dark base." Dashboard values updated to composited-in-card values (~8%, ~8.6%). Added Chrome agent insight: selected state already uses bg-muted/20, proving the correct token is in the codebase. |
| 2026-03-03 | "Internal error" on submit resolved — missing DB migration | Unrelated to surface hierarchy. Migration 0014 (`claimed_at` on `idempotency_keys`) was not applied to Neon `dev` branch. Fixed with `pnpm db:migrate`. Documented in deployment-environments.md Known Gotchas. |
| 2026-03-03 | Promoted to DEBT-273 | Analysis complete. Option A selected. Single-file fix in `choice-button.tsx` covers all 6+ question views (Quick Practice, Tutor, Exam, Dashboard review, History review, Bookmarks review). |
