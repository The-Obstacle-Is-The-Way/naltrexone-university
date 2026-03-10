# Contrast Policy (WCAG AA)

**Last Updated:** 2026-03-10
**Status:** Canonical

This document defines the app's contrast targets and the engineering rules that follow from them.

Use `docs/brainstorming/bs-042-contrast-consistency-and-wcag-compliance-audit.md` for computed findings and evidence. This doc is normative: it describes what we are aiming for and what is allowed.

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

### Classified supplementary fills (not required boundaries)

Tonal fill elevation used as a supplementary hierarchy hint, not a required boundary per SC 1.4.11. Row identification relies on text content, cursor, hover fill change, and focus ring — the fill itself is not the only way a user can identify the component or its state. The 3:1 non-text minimum does not apply.

| Element | Tokens | WCAG ratio (dark) | Justification | Decided in |
|---------|--------|-------------------|---------------|------------|
| Dashboard nested rows (I-1 variant) | `bg-foreground/5` rest, `hover:bg-foreground/[0.08]` hover | 1.11:1 rest, 1.21:1 hover (vs card #121212) | Borderless tonal fill following Material Design 3. Rows are identified by text content, pointer cursor, hover brightness lift, and focus ring — fill is supplementary. | [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md) |
| Dashboard unavailable rows (S-2 variant) | `bg-foreground/5` | 1.11:1 (vs card #121212) | Static tonal fill matching interactive row rest state for visual consistency. Row is identified by its text content. | [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md) |
| Dashboard badge pills (mode/difficulty) | `bg-foreground/[0.06] border-0 text-foreground/60` | Fill 1.14:1 (vs card), text 5.94:1 (AA pass) | Borderless fill-only badge. Text contrast is the required boundary (AA-compliant at 5.94:1); the fill shape is supplementary. | [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md) |
| History sessions + available question rows | `bg-foreground/5` rest, `hover:bg-foreground/[0.08]` hover | 1.08:1 rest, 1.16:1 hover (vs page #090909) | Borderless tonal fill on page background. Rows are identified by text content, hover lift, cursor or explicit CTA treatment, and focus ring — fill is supplementary. | [DEBT-301](../_archive/debt/debt-301-history-page-visual-unification.md) |
| History unavailable question rows | `bg-foreground/5` | 1.08:1 (vs page #090909) | Static tonal fill matching the available-row family so unavailable rows read as disabled siblings rather than legacy cards. | [DEBT-301](../_archive/debt/debt-301-history-page-visual-unification.md) |
| History Review pill | `bg-foreground/[0.06] border-0 text-foreground/60` | Fill 1.14:1 (vs history row `#141414`), text 5.79:1 (AA pass) | Borderless fill-only row CTA indicator. Text contrast is the required boundary; the fill shape is supplementary. | [DEBT-301](../_archive/debt/debt-301-history-page-visual-unification.md) |
| Practice filter containers (S-2 variant) | `bg-foreground/5` | 1.11:1 (vs card #121212) | Borderless tonal fill for Topic/Substance/Treatment `<details>` containers. The control is identified by summary label, selected-count text, disclosure behavior, pointer cursor, and focus ring; the fill is supplementary. | [DEBT-290](../_archive/debt/debt-290-practice-filter-tonal-fill-elevation.md) |
| Practice filter chips rest fill (I-4 variant) | `bg-foreground/[0.07]` + `text-foreground` | Fill 1.21:1 (vs practice filter container `#1D1D1D`), text 11.93:1 dark / 15.54:1 light | The chip border remains the required SC 1.4.11 boundary. The rest fill only adds depth so the chip reads as a toggle surface rather than a transparent label; identification still comes from the border, text, cursor, hover fill, and focus ring. Full `text-foreground` restores primary interactive-label hierarchy while remaining well above AA in both themes. | [DEBT-294](../_archive/debt/debt-294-filter-chip-fill-depth-and-cursor.md), [DEBT-295](../_archive/debt/debt-295-filter-chip-unselected-text-weight.md) |

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
- State fills still matter. For interactive controls with base/hover/selected states, fills MUST remain stepped enough to preserve hierarchy and state recognition. Do not reuse the same fill token across multiple states just because the border is compliant.
- If a component needs to remain visually subordinate, do not achieve that by dropping below 3.0:1 for a required boundary. Prefer spacing, typography, and hierarchy via layout rather than illegible edges.

### 3.3 Pattern Workflows

- When adding or changing a visual pattern in `docs/frontend/pattern-registry.md`, verify it against the targets above in both light and dark mode.
- If a pattern cannot meet targets without violating the product’s intended hierarchy, explicitly document the exception in `docs/frontend/standards.md` "Known Violations" and link the rationale + evidence (typically BS-042). Exceptions must be temporary and tracked as debt.

---

## 4. Evidence and Audits

- Computed findings and screenshots belong in: `docs/brainstorming/bs-042-contrast-consistency-and-wcag-compliance-audit.md`
- When a contrast change is proposed, include:
  - Token values involved (`app/globals.css`)
  - The component/pattern and file path
  - Computed contrast ratios for both themes
