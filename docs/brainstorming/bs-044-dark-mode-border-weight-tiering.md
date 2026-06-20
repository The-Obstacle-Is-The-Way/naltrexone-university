# BS-044: Dark Mode Border Weight Tiering — Elegance vs. Compliance

**Date:** 2026-03-05
**Triggered by:** Visual review of DEBT-279 dark mode after `dark:border-foreground/40` was applied uniformly to all surfaces — dashboard, choice buttons, session rows, bookmark cards, etc. The result is technically WCAG compliant but aesthetically heavy: "boxes inside boxes."
**Scope:** Explore whether dark-mode borders should be tiered by element role (interactive vs. container vs. structural) instead of applied uniformly.
**Related:** [DEBT-279](../_archive/debt/debt-279-wcag-aa-contrast-remediation-plan.md), [BS-042](../_archive/brainstorming/bs-042-contrast-consistency-and-wcag-compliance-audit.md), [BS-043](../_archive/brainstorming/bs-043-question-flow-typography-and-feedback-visual-unification.md), [Pattern Registry](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md), [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md), [DEBT-307](../_archive/debt/debt-307-bookmarks-row-visual-unification.md), [DEBT-313](../_archive/debt/debt-313-choice-button-dark-surface-and-badge-visibility.md)

**Status:** Active — still not archiveable, but no longer a repo-wide "everything has the same bright dark border" problem. Later follow-ups resolved major slices of the original complaint (`DEBT-280`, `DEBT-289`, `DEBT-301`, `DEBT-302`, `DEBT-307`, `DEBT-312/313/314`). The remaining open question is narrower: which read-only containers and subordinate inner separators, if any, still deserve a softer dark-mode treatment.

---

## The Problem

DEBT-279 correctly identified that dark-mode borders at `border-border/60` (~1.1:1 contrast) were invisible and failed WCAG SC 1.4.11. The initial remediation applied `dark:border-foreground/40` (~3.5:1) broadly across the application.

That "uniform bright dark border everywhere" picture is no longer fully current. Since this doc was created, later PRs have already peeled that treatment back across multiple slices:

- **Choice buttons / shared tab switch container**: `DEBT-280` (PR #175), later refined by `DEBT-312/313/314` (PR #216)
- **Dashboard nested rows and badge pills**: `DEBT-289` (PR #185)
- **History rows and breakdown separators**: `DEBT-301` (PR #197) and `DEBT-302` (PR #198)
- **Bookmarks rows**: `DEBT-307` (PR #206)
- **Practice filter containers**: `DEBT-290` and related chip follow-ups (`DEBT-291`, `DEBT-294`, `DEBT-295`, `DEBT-309`)

So the current question is no longer "should everything be tiered?" It is "which remaining containers and subordinate borders are still too heavy, now that many formerly-problematic rows and controls have already been settled?"

Key observations from the current state:

### What still plausibly looks too heavy

- **Dashboard stat cards / summary cards**: Read-only info panels still use the default bordered `Card` shell. The content already defines the panel strongly.
- **Feedback inner cards**: Wrong-answer explanation cards and the Reference separator still use stronger dark borders inside an already bordered question-feedback surface.
- **Certain subordinate borders**: Toast/info shells and other non-primary container strokes may still read louder than necessary.

### What looks appropriate

- **Choice buttons**: Interactive elements where the border communicates the clickable area. These need a required boundary.
- **Filter chips / inputs / selects / outline buttons**: Interactive controls where the border still carries a WCAG-relevant role.
- **Decorative vs required-boundary split in policy**: `contrast-policy.md` and `pattern-registry.md` now explicitly classify some borders as decorative and others as required, which means part of the original thesis has already been adopted.

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

## Resolved Since Creation

These surfaces were part of the original complaint, but no longer belong in the active unresolved inventory:

- **History rows**: now tonal-fill, not bordered cards (`DEBT-301`, `DEBT-302`)
- **Bookmark rows/cards**: now tonal-fill rows with a separate Remove control (`DEBT-307`)
- **Dashboard nested rows / badge pills**: now borderless tonal fill and fill-only pills (`DEBT-289`)
- **Choice-button rest-state heaviness**: resolved, then further refined (`DEBT-280`, `DEBT-312`, `DEBT-313`)
- **Shared tab-switch container border**: explicitly classified as decorative and reverted from the stronger dark override (`DEBT-280`)

## Remaining Open Inventory

These are the surfaces that still justify keeping this doc active:

### Dashboard (`app/(app)/app/dashboard/page.tsx`)
- 4 stat cards (Total answered, Overall accuracy, etc.)
- Current streak card
- Ready to practice CTA card

### Question flow (`components/question/feedback.tsx`)
- Wrong-answer explanation cards
- Reference top divider

### Shared primitives / shared surfaces (`components/ui/`)
- Notification provider toast shells
- Any future read-only or decorative inner containers that currently inherit a stronger dark border by default

### Deliberately settled, not currently open
- Choice buttons
- Filter chips
- Inputs
- Selects
- Outline buttons
- Tab switch container

---

## Open Questions

1. **Should read-only dashboard cards keep the default bordered `Card` shell in dark mode?** Or should they adopt a softer container treatment while preserving the structural outer edge elsewhere?

2. **Are feedback inner cards and reference dividers truly required boundaries?** Or are they subordinate content separators that could be demoted now that the parent feedback surface already provides containment?

3. **Do we need a dedicated softer dark container token?** Or is this better handled as a small number of surface-specific decisions rather than a new global token tier?

4. **Is the remaining aesthetic concern worth the churn?** The big "boxes inside boxes" regressions are mostly gone. The remaining candidates are lower-severity polish, not broad compliance fallout.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-05 | Created BS-044 | DEBT-279 fix is correct and workable, but the uniform border treatment is aesthetically heavy. Needs exploration before committing to changes. |
| 2026-03-05 | Marked as open for debate | Requires rigorous element-by-element review across all views. No changes to code until the approach is validated visually. |
| 2026-03-11 | Kept active after audit | The History and choice-button slices were extracted and resolved via narrower follow-ups (`DEBT-280`, `DEBT-301`, `DEBT-302`), but the broader app-wide tiering question still remains across surfaces like bookmarks, feedback cards, inputs/selects, and other dark-mode containers. |
| 2026-03-13 | Chrome visual audit flagged FilterChip dark rest border parity | `dark:border-foreground/40` is 5% weaker than light `border-foreground/45`, compounding the dark-mode hover problem. Relevant to T1 interactive tier — if rest borders are ever revisited, consider aligning dark to 45% to match light. Noted via [BS-050](../_archive/brainstorming/bs-050-practice-chip-hover-affordance.md) visual audit. |
| 2026-03-29 | Refreshed scope after implementation inventory | Major parts of the original concern were already consumed by later PRs (dashboard rows, History, bookmarks rows, choice-button refinements, tab-switch policy). This doc remains active, but now tracks the narrower residual question around read-only cards and subordinate inner borders rather than the earlier broad app-wide inventory. |
| 2026-06-20 | Re-verified against live code; kept Active | Owner backlog review. Confirmed the residual surfaces still carry the heavy `dark:border-foreground/40`: `components/question/feedback.tsx` (inner feedback cards, 2×) and `components/ui/notification-provider.tsx` (toast shells). The interactive primitives that also carry it (input/textarea/select/button/segmented-control) are the T1 tier this doc says should keep it. Premise valid, not superseded — but this remains the weakest item (Open Q#4: "is the remaining aesthetic concern worth the churn?"). No tiering decision taken — parked-but-living polish. |
