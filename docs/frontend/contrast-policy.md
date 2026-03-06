# Contrast Policy (WCAG AA)

**Last Updated:** 2026-03-06
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
