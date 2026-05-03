# Contrast Policy (WCAG AA)

**Last Updated:** 2026-03-15
**Status:** Canonical

This document defines the app's contrast targets and the engineering rules that follow from them.

Use `docs/_archive/brainstorming/bs-042-contrast-consistency-and-wcag-compliance-audit.md` for computed findings and evidence. This doc is normative: it describes what we are aiming for and what is allowed.

---

## 1. WCAG Targets

We target **WCAG AA**.

| Category | Minimum | Applies To | Reference |
|----------|---------|-----------|-----------|
| Normal text | 4.5:1 | Most text (`text-xs`, `text-sm`, `text-base`) | WCAG 2.x SC 1.4.3 |
| Large text | 3.0:1 | >= 18pt, or >= 14pt bold | WCAG 2.x SC 1.4.3 |
| Non-text (UI boundaries) | 3.0:1 | UI component boundaries and state indicators required to use the UI | WCAG 2.x SC 1.4.11 |

Notes:
- SC 1.4.11 does not apply to text. Text is governed by SC 1.4.3.
- A border/fill that is purely decorative is not automatically required by SC 1.4.11, but decorative cues must never be the only way a user can identify a component or state.

---

## 2. Definitions

**Required boundary (SC 1.4.11):** A visual cue that a user must perceive to identify a UI component (for example: a button, choice, row link, badge) or its state (hover, selected, correct/incorrect, focus).

**Decorative separator:** A cue that is not required for understanding or operation because the UI remains clear without it (for example, an extra hairline divider when spacing and layout already communicate grouping).

### Classified decorative borders

| Element | Justification | Decided in |
|---------|---------------|------------|
| Shared tab-switch container (`tabSwitchContainerClasses`) | Active pill (`bg-primary`), text labels, `bg-muted` surface elevation, and grouped layout identify the control. The container border falls back to `border-border` (~1.13:1 vs `bg-muted` in dark mode) and is not required for identification. | [DEBT-280](../_archive/debt/debt-280-choice-button-dark-mode-surface-refinement.md) |

### Classified required boundaries

| Element | Tokens | WCAG ratio | Justification | Decided in |
|---------|--------|------------|---------------|------------|
| Choice button neutral boundary (I-3) | `border-foreground/50 bg-background/50` rest, `hover:border-foreground/55 hover:bg-foreground/[0.06]` hover, `dark:border-foreground/40 dark:bg-background/50` rest, `dark:hover:border-foreground/50 dark:hover:bg-foreground/[0.05]` hover | Light rest border ~`3.76:1` vs white rest surface, light hover border ~`3.93:1` vs hover fill, dark `border-foreground/30` fails at roughly `2.4-2.5:1` against `dark:bg-background/50`, dark `border-foreground/40` remains compliant at roughly `3.4-3.6:1` | The entire row is the clickable answer target inside `QuestionCard`, so the edge is a required SC 1.4.11 boundary. Light-mode `muted` opacity (`border-border/60`, `bg-muted/20`) was insufficient on white/card surfaces, so the required boundary stays foreground-based while the rest fill shifts to a clean `bg-background/50`. In dark mode the rest surface is recessed via `dark:bg-background/50`, but the boundary still must remain compliant. | [DEBT-313](../_archive/debt/debt-313-choice-button-dark-surface-and-badge-visibility.md) |

### Classified supplementary fills (not required boundaries)

Tonal fill elevation used as a supplementary hierarchy hint, not a required boundary per SC 1.4.11. Row identification relies on text content, cursor, hover fill change, and focus ring — the fill itself is not the only way a user can identify the component or its state. The 3:1 non-text minimum does not apply.

| Element | Tokens | WCAG ratio (dark) | Justification | Decided in |
|---------|--------|-------------------|---------------|------------|
| Dashboard nested rows (I-1 variant) | `bg-foreground/5` rest, `hover:bg-foreground/[0.08]` hover | 1.11:1 rest, 1.21:1 hover (vs card #121212) | Borderless tonal fill following Material Design 3. Rows are identified by text content, pointer cursor, hover brightness lift, and focus ring — fill is supplementary. | [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md) |
| Dashboard unavailable rows (S-2 variant) | `bg-foreground/5` | 1.11:1 (vs card #121212) | Static tonal fill matching interactive row rest state for visual consistency. Row is identified by its text content. | [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md) |
| Dashboard badge pills (mode/difficulty) | `bg-foreground/[0.06] border-0 text-foreground/60` | Fill 1.14:1 (vs card), text 5.94:1 (AA pass) | Borderless fill-only badge. Text contrast is the required boundary (AA-compliant at 5.94:1); the fill shape is supplementary. | [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md) |
| History sessions rows | `bg-foreground/[0.08]` | 1.16:1 (vs page #090909) | Disclosure-primary tonal fill on page background. The row is identified by text content, chevron affordance, cursor, nested Link, and focus ring — fill is supplementary. | [DEBT-302](../_archive/debt/debt-302-history-row-fill-and-affordance-cleanup.md) |
| History available question rows | `bg-foreground/[0.08]` rest, `hover:bg-foreground/[0.12]` hover | 1.16:1 rest, 1.28:1 hover (vs page #090909) | Standalone navigation rows on page background need a stronger foreground-ramp step than in-card rows. Identification still comes from text content, hover lift, and focus ring — fill is supplementary. | [DEBT-302](../_archive/debt/debt-302-history-row-fill-and-affordance-cleanup.md) |
| History unavailable question rows | `bg-foreground/[0.08]` | 1.16:1 (vs page #090909) | Static tonal fill matching the available-row family so unavailable rows read as sibling surfaces rather than legacy cards. | [DEBT-302](../_archive/debt/debt-302-history-row-fill-and-affordance-cleanup.md) |
| Bookmarks available rows (I-2 multi-action variant) | `bg-foreground/[0.08]` rest, `hover:bg-foreground/[0.12]` hover | 1.16:1 rest, 1.28:1 hover (vs page #090909) | Standalone bookmark rows on page background share the History Questions foreground ramp, but use delegated container activation because the row also contains a separate Remove button. Identification comes from text content, pointer cursor, hover lift, explicit title Link, Remove button, and focus rings — fill is supplementary. | [DEBT-307](../_archive/debt/debt-307-bookmarks-row-visual-unification.md) |
| Bookmarks unavailable rows (S-2 page-background sibling variant) | `bg-foreground/[0.08]` | 1.16:1 (vs page #090909) | Static tonal fill matching the available bookmark-row family so unavailable rows remain visual siblings without reviving card borders. The unavailable copy and Remove button communicate the state/action; the fill is supplementary. | [DEBT-307](../_archive/debt/debt-307-bookmarks-row-visual-unification.md) |
| Practice filter containers (S-2 variant) | `bg-foreground/5` | 1.11:1 (vs card #121212) | Borderless tonal fill for Topic/Substance/Treatment `<details>` containers. The control is identified by summary label, selected-count text, disclosure behavior, pointer cursor, and focus ring; the fill is supplementary. | [DEBT-290](../_archive/debt/debt-290-practice-filter-tonal-fill-elevation.md) |
| Practice filter chips rest fill (I-4 variant) | `bg-foreground/[0.07] text-foreground/80` rest, `hover:bg-foreground/[0.12] hover:text-foreground` hover | Fill 1.21:1 dark / 1.16:1 light (vs practice filter container), text 8.18:1 dark / 9.67:1 light | Borderless tonal-fill toggle. The fill is supplementary; identification comes from text, cursor, hover fill/text lift, focus ring, and `aria-pressed`. `text-foreground/80` keeps normal-text contrast well above AA while letting unselected chips recede against selected `bg-primary` chips. | [DEBT-294](../_archive/debt/debt-294-filter-chip-fill-depth-and-cursor.md), [DEBT-295](../_archive/debt/debt-295-filter-chip-unselected-text-weight.md), [DEBT-309](../_archive/debt/debt-309-filter-chip-hover-border-affordance.md), [DEBT-377](../debt/debt-377-practice-starter-chip-emphasis-and-hierarchy.md) |

---

## 3. Rules

### 3.1 Text

- Informational text MUST meet 4.5:1 (normal text), including: labels, timestamps, metadata, helper text, and inactive navigation items.
- Do not use `text-muted-foreground` for `text-xs`/`text-sm` on dark surfaces if it fails 4.5:1 in that context. Current failures are documented in BS-042.
- Do not use parent `opacity-*` on containers as a substitute for text styling when descendants contain informational text or UI glyphs. It reduces contrast for everything inside the subtree.

### 3.2 Non-Text Boundaries

- Any required boundary MUST meet 3.0:1 against the adjacent surface.
- A focus indicator MUST be visible and treated as a required boundary.
- SC 1.4.11 governs the required boundary itself, not every background fill inside the component. When a border carries the required-boundary role, the fill may remain subtler.
- ChoiceButton (I-3) is the canonical example of this split: in light mode the row uses a foreground-based required boundary (`border-foreground/50`, hover `/55`) because `muted` opacity is too weak on white, while the clean `bg-background/50` rest surface and the subtle `bg-foreground/[0.06]` hover fill remain supplementary containment. In dark mode, `dark:border-foreground/30` is too soft against the recessed `dark:bg-background/50` rest surface, so the required boundary stays at `dark:border-foreground/40` or stronger.
- State fills still matter. For interactive controls with base/hover/selected states, fills MUST remain stepped enough to preserve hierarchy and state recognition. Do not reuse the same fill token across multiple states just because the border is compliant.
- If a component needs to remain visually subordinate, do not achieve that by dropping below 3.0:1 for a required boundary. Prefer spacing, typography, and hierarchy via layout rather than illegible edges.

### 3.3 Pattern Workflows

- When adding or changing a visual pattern in `docs/frontend/pattern-registry.md`, verify it against the targets above in both light and dark mode.
- If a pattern cannot meet targets without violating the product’s intended hierarchy, explicitly document the exception in `docs/frontend/standards.md` "Known Violations" and link the rationale + evidence (typically BS-042). Exceptions must be temporary and tracked as debt.

---

## 4. Evidence and Audits

- Computed findings and screenshots belong in: `docs/_archive/brainstorming/bs-042-contrast-consistency-and-wcag-compliance-audit.md`
- When a contrast change is proposed, include:
  - Token values involved (`app/globals.css`)
  - The component/pattern and file path
  - Computed contrast ratios for both themes
