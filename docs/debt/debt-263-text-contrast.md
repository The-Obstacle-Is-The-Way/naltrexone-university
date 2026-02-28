# DEBT-263: Text Contrast

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** LIGHT-2
**Blocked by:** Decision 13 (Success/Destructive Text Contrast Strategy) + DEBT-251 merged
**Files:** `app/globals.css`

---

## Item

### LIGHT-2: Success/Destructive Text Colors Fail WCAG AA at Normal Text Sizes

**Severity:** Medium-High (WCAG AA failure)

`text-success` (~3.65:1) and `text-destructive` (~3.86:1) fail WCAG AA for normal-sized text on white backgrounds. Used at `text-xs` (12px) for correct/incorrect labels.

---

## Decision Dependency

**Decision 13** must resolve:
- **Option A:** Darken both in light mode: `--success` to `142 72% 28%`, `--destructive` to `0 84.2% 48%`
- **Option B:** Use `text-foreground` for small-text instances, reserve semantic colors for large text/badges
- **Option C (recommended):** Subtle darkening: `--success: 142 72% 29%` (~4.6:1), `--destructive: 0 84.2% 45%` (~4.9:1)

**Sequencing:** Must merge **after DEBT-251** (which fixes `text-success-foreground` → `text-success` on the same component).

---

## Verification

In Chrome DevTools, inspect a `text-success` element at `text-xs`. Run accessibility color contrast audit. Expected: ≥4.5:1 contrast ratio.
