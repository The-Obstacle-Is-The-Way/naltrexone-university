# DEBT-263: Text Contrast

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** LIGHT-2
**Blocked by:** Decision 13 (Success/Destructive Text Contrast Strategy) + DEBT-251 merged
**Files:** `app/globals.css` and small-text consumers (dashboard/activity labels, choice badges)

---

## Item

### LIGHT-2: Success/Destructive Text Colors Fail WCAG AA at Normal Text Sizes

**Severity:** Medium-High (WCAG AA failure)

`text-success` and `text-destructive` fail WCAG AA for normal-sized text on white backgrounds.

**Current token evidence** (`app/globals.css`):
- `--success: 142 72% 35%` (`app/globals.css:106`)
- `--destructive: 0 84.2% 60.2%` (`app/globals.css:104`)

**Current contrast on white** (computed from current token RGB):
- `text-success` (`rgb(25,154,72)`) ≈ `3.65:1`
- `text-destructive` (`rgb(239,68,68)`) ≈ `3.76:1`
- WCAG AA normal text requires `>= 4.5:1`

**Affected current usage (small text):**
- Dashboard activity labels: `text-success` / `text-destructive` at `text-xs` (`app/(app)/app/dashboard/page.tsx:205-207`, `app/(app)/app/dashboard/page.tsx:244-246`)
- Choice badge text uses semantic colors at `text-xs` (`components/question/choice-button.tsx:52`, `components/question/choice-button.tsx:55-57`)

---

## Decision Dependency

**Decision 13** must resolve:
- **Option A:** Darken both in light mode: `--success` to `142 72% 28%`, `--destructive` to `0 84.2% 48%`
- **Option B:** Use `text-foreground` for small-text instances, reserve semantic colors for large text/badges
- **Option C (recommended):** Subtle global darkening: `--success: 142 72% 29%`, `--destructive: 0 84.2% 45%` (targets AA-safe contrast while keeping semantic hue identity)

**Sequencing:** Must merge **after DEBT-251** (which fixes `text-success-foreground` → `text-success` on the same component).

---

## Verification

```bash
# Baseline: current token values
rg -n '^\\s*--success:\\s*142 72% 35%;' app/globals.css
rg -n '^\\s*--destructive:\\s*0 84\\.2% 60\\.2%;' app/globals.css
# Expected: 1 match each currently

# Baseline: current small-text semantic color usages
rg -n 'text-success|text-destructive' app/'(app)'/app/dashboard/page.tsx components/question/choice-button.tsx
# Expected: matches present in current state

# Option A verification (if selected)
rg -n '^\\s*--success:\\s*142 72% 28%;' app/globals.css
rg -n '^\\s*--destructive:\\s*0 84\\.2% 48%;' app/globals.css
# Expected: 1 match each when Option A is implemented

# Option C verification (if selected)
rg -n '^\\s*--success:\\s*142 72% 29%;' app/globals.css
rg -n '^\\s*--destructive:\\s*0 84\\.2% 45%;' app/globals.css
# Expected: 1 match each when Option C is implemented

# Option B verification (if selected): no semantic color on small text call sites
rg -n 'text-success|text-destructive' app/'(app)'/app/dashboard/page.tsx
# Expected: 0 matches (or non-small-text-only matches by explicit design)
```

Visual verification (required): in Chrome DevTools, inspect a `text-success`/`text-destructive` element at `text-xs` on a white or near-white background and confirm computed contrast is `>= 4.5:1` for the adopted option.
