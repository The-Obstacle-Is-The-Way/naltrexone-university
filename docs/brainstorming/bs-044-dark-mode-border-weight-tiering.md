# BS-044: Dark Mode Border Weight Tiering — Elegance vs. Compliance

**Date:** 2026-03-05
**Triggered by:** Visual review of DEBT-279 dark mode after `dark:border-foreground/40` was applied uniformly to all surfaces — dashboard, choice buttons, session rows, bookmark cards, etc. The result is technically WCAG compliant but aesthetically heavy: "boxes inside boxes."
**Scope:** Explore whether dark-mode borders should be tiered by element role (interactive vs. container vs. structural) instead of applied uniformly.
**Related:** [DEBT-279](../debt/debt-279-wcag-aa-contrast-remediation-plan.md), [BS-042](./bs-042-contrast-consistency-and-wcag-compliance-audit.md), [BS-043](./bs-043-question-flow-typography-and-feedback-visual-unification.md), [Pattern Registry](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md)

**Status:** Open for debate — requires a more rigorous element-by-element review across all views before making decisions.

---

## The Problem

DEBT-279 correctly identified that dark-mode borders at `border-border/60` (~1.1:1 contrast) were invisible and failed WCAG SC 1.4.11. The fix applied `dark:border-foreground/40` (~3.5:1) broadly across the application. Every card, row, button, input, filter chip, session entry, and container now has a visible white-ish border in dark mode.

The result is compliant but visually heavy. The subtle, floating dark-mode aesthetic is replaced by a grid of outlined rectangles. Key observations from the current state:

### What looks too heavy

- **Dashboard stat cards**: Read-only info panels with bright borders. The content (large numbers, labels) already defines the card visually.
- **Session rows (history page)**: Each row is a fully-bordered rectangle, creating a wall of cages. A subtle divider or spacing would communicate separation without the visual weight.
- **Bookmark cards**: Content-dense cards that speak for themselves — the border adds noise.
- **Boxes-inside-boxes effect**: Dashboard has bordered cards inside a bordered content area. The nesting of borders compounds the visual heaviness.

### What looks appropriate

- **Choice buttons**: Interactive elements where the border communicates the clickable area. These genuinely need visible boundaries.
- **Tab switches / filter chips**: Interactive controls that need delineation.
- **Action buttons**: Interactive, need clear boundaries.
- **Selected state differentiation**: The stepped fills (8/15/20) work well for conveying state hierarchy.

### The light-mode screenshot observation

The light-mode screenshot (Quick Practice page) shows a much softer look. Borders exist but are subtle gray-on-white. The same `border-border/60` that was invisible in dark mode is appropriately subtle in light mode. This confirms the issue is specifically about the dark-mode override token being too visually prominent when applied everywhere.

---

## The Core Tension

### WCAG SC 1.4.11 — what it actually says

> "The visual presentation of the following have a contrast ratio of at least 3:1 against adjacent color(s): User Interface Components: Visual information **required to identify** user interface components and states."

The key phrase is "required to identify." If a user can identify the component through other means — spacing, content grouping, background elevation, typographic hierarchy — then the border is **decorative**, and SC 1.4.11 does not strictly require it to hit 3:1.

### How premium dark-mode apps handle this

Most premium dark-mode applications do NOT achieve 3:1 on every container border:

- **Linear**: Near-invisible borders. Cards float on background elevation tiers.
- **Vercel Dashboard**: Subtle borders, background differentiation primary.
- **Spotify**: Virtually no card borders. Background color and spacing define groups.
- **Discord**: Very faint borders on most surfaces.
- **Apple (system apps)**: Relies heavily on background tiers and vibrancy, not borders.

These apps prioritize visual elegance and use borders selectively — typically only on interactive components where the boundary communicates affordance.

### The question for us

Where on the spectrum do we want to land?

```
Full WCAG SC 1.4.11     Selective compliance      Aesthetic-first
on ALL borders          (interactive only)        (decorative borders exempt)
    |                         |                         |
    ├── Current state         ├── Proposed middle       ├── Pre-DEBT-279 state
    │   (too heavy)           │   ground                │   (too invisible)
```

---

## Proposed Tiering Model (Sketch — Open for Debate)

| Tier | Role | Elements | Proposed dark border treatment |
|------|------|----------|-------------------------------|
| **T1: Interactive** | User clicks/taps this element | Choice buttons, action buttons, inputs, selects, tab switches, filter chips | Keep `dark:border-foreground/40` (3.5:1) — WCAG required |
| **T2: Container** | Groups related content visually | Stat cards, session rows, bookmark cards, activity items | Softer — `dark:border-foreground/15` (~1.8:1) or no dark override (rely on background + spacing) |
| **T3: Structural** | Outer page/section boundary | Card component wrapper, page sections | Keep current — one clear containing boundary |
| **T4: Decorative** | Visual rhythm, not functional | Dividers, separators between list items | Softest — `dark:border-foreground/10` or `dark:divide-foreground/20` |

### What this would change visually

- Dashboard stat cards: Borders fade back, content defines the card
- Session rows: Subtle separation instead of hard outlines
- Bookmark cards: Softer boundary, content-forward
- Choice buttons: **Unchanged** — keep strong borders
- Outer Card wrapper: **Unchanged** — keeps containment clear

### What this would mean for WCAG

- T1 (interactive) remains fully SC 1.4.11 compliant
- T2/T4 (container/decorative) would intentionally fall below 3:1, justified by the "required to identify" clause — these elements are identifiable through content, spacing, and background
- This is the same approach Linear, Vercel, and Spotify take
- Document the decision in `contrast-policy.md` with rationale

---

## Alternative Approaches to Explore

### A. Background elevation instead of borders

Instead of visible borders, differentiate containers through background fill tiers:

```
Page background:    bg-background      (3.5% lightness)
Outer card:         bg-card            (7.0% lightness)
Inner card/row:     bg-foreground/8    (≈8.5% lightness on card)
Hover:              bg-foreground/15   (≈13% lightness on card)
```

Remove borders entirely from containers. Spacing + background contrast does the work.

**Problem**: The current gray stack doesn't have enough range between adjacent tiers for 3:1. Would need to compress or stretch the scale. This is a bigger design system change.

### B. Border-on-interaction only

Keep container borders invisible at rest. They appear on hover/focus as a progressive disclosure of affordance.

**Problem**: Doesn't meet SC 1.4.11 at rest. But it's what Linear does.

### C. Mixed: softer token globally, strong on interactive

Create a second dark border token:
- `dark:border-foreground/40` — for interactive elements (existing)
- `dark:border-foreground/18` — for containers (new, softer)

This keeps SOME visual boundary for containers without the "cage" effect.

### D. Shadow-based depth

Replace container borders with subtle dark-mode box shadows:

```css
dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]
```

This creates a very faint outline glow without a hard border edge. Many premium apps use this technique.

---

## Affected Surfaces (Inventory — Needs Rigorous Per-Element Review)

This is a preliminary list. Each item needs individual scrutiny across all views before deciding on treatment:

### Dashboard (`app/(app)/app/dashboard/page.tsx`)
- 4 stat cards (Total answered, Overall accuracy, etc.)
- Current streak card
- Ready to practice CTA card
- Recent sessions section with session rows
- Recent activity section with question items

### History (`app/(app)/app/history/components/history-sessions-tab.tsx`)
- Session rows (each fully bordered)
- Tab switch (Sessions/Questions)
- Filter chips (All/Tutor/Exam)
- "View breakdown" buttons within rows

### Bookmarks (`app/(app)/app/bookmarks/page.tsx`)
- Bookmark cards with Review/Remove buttons

### Practice (`app/(app)/app/practice/components/practice-session-starter.tsx`)
- Tag filter rows
- Session configuration card

### Question flow (`components/question/`)
- Choice buttons (interactive — keep strong)
- Feedback cards (semantic borders — keep as-is)
- Outer question card (structural — keep)

### Shared primitives (`components/ui/`)
- Button (outline variant)
- Input
- Select
- Filter chip
- Tab switch styles
- Notification provider (toast borders)

---

## Open Questions

1. **Is the tiering model the right framing?** Or should we think about this differently — e.g., "primary surface" vs. "secondary surface" vs. "interactive control"?

2. **How much WCAG SC 1.4.11 flexibility do we actually have?** The "required to identify" clause gives wiggle room, but we should document our interpretation explicitly in contrast-policy.md if we adopt selective compliance.

3. **Should we just get used to it?** Genuine question. The current state IS compliant and functional. The aesthetic concern is real but subjective. Sometimes "good enough" is the right call when there are higher-priority items.

4. **One element at a time or systematic?** This could be tackled as a systematic token-tier refactor, or as a surface-by-surface evaluation. The latter is more work but might yield better results since each surface has different needs.

5. **Does this interact with BS-043 (typography unification)?** If we're going to touch the question flow for typography, should the border refinement happen in the same pass?

6. **What about the selected-state gray concern?** The light-mode screenshot shows that the selected choice button (gray highlight) doesn't strongly differentiate from unselected in light mode. Is this related, or a separate issue?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-05 | Created BS-044 | DEBT-279 fix is correct and workable, but the uniform border treatment is aesthetically heavy. Needs exploration before committing to changes. |
| 2026-03-05 | Marked as open for debate | Requires rigorous element-by-element review across all views. No changes to code until the approach is validated visually. |
