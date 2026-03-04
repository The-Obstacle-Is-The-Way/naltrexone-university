# BS-039: Choice Button Surface Hierarchy and Hover UX

**Date:** 2026-03-03
**Triggered by:** Visual inspection of Quick Practice multiple choice view — answer choices show inconsistent dark gradation and an uncanny hover effect
**Scope:** The `ChoiceButton` component uses `bg-background` (Layer 0) inside a `<Card>` (`bg-card`, Layer 1), creating an inverted visual hierarchy where interactive elements are darker than their container
**Related:** [BS-035 (archived)](../_archive/brainstorming/bs-035-card-hover-and-gray-consistency-audit.md) — identified choice hover shade mismatch as symptom #4 but only fixed hover opacity, not base surface; [Pattern Registry I-3](../../frontend/pattern-registry.md); [choice-button.tsx](../../components/question/choice-button.tsx)

---

## The Problem

In dark mode, the Quick Practice question view has a visually awkward layering effect:

1. **Different gradation of black** — The question stem sits on `bg-card` (7% lightness) while the four answer choices use `bg-background` (3.5% lightness). This makes choices appear as darker rectangles "punched through" the card surface, creating unintentional visual weight variation.

2. **Uncanny hover effect** — When hovering a choice, `hover:bg-muted/60` raises the surface to ~6.6% lightness, which is *almost* the same as `bg-card` (7%) but not quite. Instead of feeling like "this element is highlighted," the hover feels like "this hole is being filled back in." The hover state converges with the parent surface rather than rising above it.

3. **Letter badge disconnect** — The A/B/C/D circle badges use `bg-muted` (11% lightness), making them the brightest surface in the stack. Combined with the dark choice rows, the badges visually "float" rather than sitting naturally within their row.

### Visual Hierarchy (current, dark mode)

```
Layer        Token              HSL Lightness    Visual
─────────────────────────────────────────────────────────
Page bg      --background       3.5%             ████████ darkest
Choice row   bg-background      3.5%             ████████ same as page (!)
Choice hover bg-muted/60        ~6.6%            ██████░░ almost card level
Card         bg-card            7.0%             █████░░░ question stem area
Letter badge bg-muted           11.0%            ███░░░░░ brightest
Border       --border           15.0%            ██░░░░░░ edges
```

The choice rows and page background are identical. There is no visual surface for the choices to exist "on" — they're transparent to the page, with only a thin border differentiating them.

### Contrast with Dashboard (works correctly)

```
Layer        Token              HSL Lightness    Visual
─────────────────────────────────────────────────────────
Page bg      --background       3.5%             ████████
Card         bg-card            7.0%             █████░░░ card surface
Row base     bg-muted/20        ~5.0%            ██████░░ sits above page
Row hover    bg-muted/40        ~7.9%            ████░░░░ rises above card
```

Dashboard rows start above the page level and hover to above the card level — a clean upward progression. Users perceive this as natural highlighting.

---

## Root Cause Analysis

### 1. `bg-background` on ChoiceButton (the design intent mismatch)

From the Pattern Registry (I-3), the design rationale states:

> Uses `bg-background` (layer 0), not `bg-card`, so choices feel like standalone interactive elements, not Card subsections.

This rationale was written for the *general case* but creates a conflict specifically in `QuestionCard`, where choices are rendered *inside* a `<Card>` component. The "standalone" intent is undermined by the Card wrapper — the choice appears to be a card subsection *structurally* but tries to be standalone *visually*, landing in an uncanny valley.

### 2. Hover target convergence

The choice hover (`bg-muted/60` ≈ 6.6%) nearly matches `bg-card` (7.0%). This 0.4% difference is below the perceptual threshold for most displays. The hover state doesn't create contrast — it creates near-equivalence with the parent, which reads as "the element blends in" rather than "the element is highlighted."

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
Before:  bg-background (3.5%) → hover:bg-muted/60 (~6.6%)  — converges with card
After:   bg-muted/20   (~5.0%) → hover:bg-muted/40 (~7.9%)  — rises above card
```

**Pros:**
- Directly matches dashboard row pattern — maximum consistency
- Clear upward hover progression (5.0% → 7.9%)
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
- Hover (`bg-muted/60` ≈ 6.6%) would be *below* the base (`bg-card` = 7.0%) — hover would actually darken!
- Would need to also change hover to something above card level, e.g., `hover:bg-muted/80` (~10%)

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

---

## Open Questions

1. **Should letter badges also change?** Currently `bg-muted` (11%). If the row base moves to `bg-muted/20` (~5%), the badge-to-row contrast *increases*, which may actually look better. But worth checking visually.

2. **Should the selected state change?** Currently `border-ring bg-muted/20` — if the base is also `bg-muted/20`, the selected state would need a higher opacity like `bg-muted/40` or a ring-based approach instead.

3. **Does this affect the correctness states?** `bg-success/10` and `bg-destructive/10` replace the base background, so they should work regardless. But worth verifying the visual contrast.

4. **Should this be a Pattern Registry amendment or a new pattern?** I-3 currently describes one choice button pattern. It may need "standalone" vs "in-card" variants, or the standalone variant may simply be retired since choices always appear inside `QuestionCard`.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-03 | Created BS-039 | Visual inspection revealed inverted surface hierarchy in Quick Practice choice buttons |
