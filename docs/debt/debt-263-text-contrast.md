# DEBT-263: Text Contrast

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** LIGHT-2
**Blocked by:** Decision 13 (Success/Destructive Text Contrast Strategy) + DEBT-251 merged
**Files:** `app/globals.css` + semantic text consumers across `app/**` and `components/**`

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

**Representative affected usage (small/normal text):**
- Dashboard activity labels: `text-success` / `text-destructive` at `text-xs` (`app/(app)/app/dashboard/page.tsx:205-207`, `app/(app)/app/dashboard/page.tsx:244-246`)
- Choice badges: semantic colors at `text-xs` (`components/question/choice-button.tsx:55-57`)
- History question metadata badges: semantic colors inside a `text-xs` row (`app/(app)/app/history/components/history-questions-tab.tsx:64-69`, `app/(app)/app/history/components/history-questions-tab.tsx:86-88`)
- Session breakdown result labels at `text-sm` (`app/(app)/app/shared/components/session-breakdown-list.tsx:24`, `app/(app)/app/shared/components/session-breakdown-list.tsx:49-51`)
- Pricing/marketing annual savings labels at `text-sm` (`app/pricing/pricing-view.tsx:161`, `components/marketing/marketing-home.tsx:221`)
- Exam review warning text at `text-sm` (`app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:199`)

Token-level impact: any `text-success` or `text-destructive` usage on white/near-white surfaces is in scope for LIGHT-2; examples above are high-signal call sites, not an exhaustive list.

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

# Scope inventory (all semantic text usages in app code)
rg -n 'text-success(?!-foreground)|text-destructive(?!-foreground)' \
  app components --glob '!**/*.test.*' --pcre2
# Expected: review output as LIGHT-2 inventory (classify by text size + background context)

# Option A verification (if selected)
rg -n '^\\s*--success:\\s*142 72% 28%;' app/globals.css
rg -n '^\\s*--destructive:\\s*0 84\\.2% 48%;' app/globals.css
# Expected: 1 match each when Option A is implemented

# Option C verification (if selected)
rg -n '^\\s*--success:\\s*142 72% 29%;' app/globals.css
rg -n '^\\s*--destructive:\\s*0 84\\.2% 45%;' app/globals.css
# Expected: 1 match each when Option C is implemented

# Option B verification (if selected): semantic colors removed from failing small-text-on-light usages
rg -n 'text-success(?!-foreground)|text-destructive(?!-foreground)' \
  app components --glob '!**/*.test.*' --pcre2
# Expected: remaining matches are explicitly approved (large-text/tinted/icon contexts) and documented in Decision 13 notes
```

Visual verification (required): in Chrome DevTools, inspect a `text-success`/`text-destructive` element at `text-xs` on a white or near-white background and confirm computed contrast is `>= 4.5:1` for the adopted option.
