# DEBT-262: Light-Mode Opacity Scale

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** LIGHT-1
**Blocked by:** Decision 12 (Light-Mode Opacity Strategy)
**Files:** `app/globals.css` or documentation only

---

## Item

### LIGHT-1: Light-Mode Opacity Scale Produces Imperceptible Contrast

**Severity:** Medium-High (affects all hover/fill states in light mode)

The Pattern Registry opacity scale was designed for dark mode. In light mode, `--muted` at 96.1% lightness produces invisible contrast at all opacity levels below 100%.

---

## Decision Dependency

**Decision 12** must resolve:
- **Option A:** Darken `--muted` in light mode (`210 40% 96.1%` → `210 20% 88%`)
- **Option B:** Introduce `--muted-hover` custom property for light mode
- **Option C (recommended):** Accept — light-mode hover uses border changes (already present). Document asymmetry in Pattern Registry Part 1.2.

**If Option C:** This becomes a documentation-only update that folds into DEBT-264.

---

## Verification

Visual: In light mode, hover dashboard session items. Observe whether background changes perceptibly (or confirm border-based feedback is sufficient).
