# DEBT-262: Light-Mode Opacity Scale

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** LIGHT-1
**Blocked by:** Decision 12 (Light-Mode Opacity Strategy)
**Files:** `app/globals.css` (if Option A/B), and documentation updates in `docs/frontend/pattern-registry.md` (Part 1.2)

---

## Item

### LIGHT-1: Light-Mode Opacity Scale Produces Imperceptible Contrast

**Severity:** Medium-High (affects all hover/fill states in light mode)

The Pattern Registry opacity scale was designed for dark mode. In light mode, `--muted` at 96.1% lightness is too close to white for perceptible background-hover contrast below `/100`.

**Current token evidence** (`app/globals.css`):
- `--muted: 210 40% 96.1%` (`app/globals.css:100`)
- `--accent: 210 40% 96.1%` (`app/globals.css:102`)
- `--background: 0 0% 100%` (`app/globals.css:90`)

**Representative affected patterns in current code (not exhaustive):**
- Dashboard rows use `bg-muted/20` + `hover:bg-muted/40` (`app/(app)/app/dashboard/page.tsx:234`)
- History session rows use `bg-muted/20` (`app/(app)/app/history/components/history-sessions-tab.tsx:183`)
- Choice buttons use `hover:bg-muted/80` (`components/question/choice-button.tsx:30`)
- Mobile nav active state uses `bg-muted` (`components/mobile-nav.tsx:74`)

Token-level impact: any use of `bg-muted/*`, `hover:bg-muted/*`, `bg-accent/*`, or `hover:bg-accent/*` on white/near-white light-mode surfaces is in scope for LIGHT-1.

---

## Decision Dependency

**Decision 12** must resolve:
- **Option A:** Darken `--muted` in light mode (`210 40% 96.1%` → `210 20% 88%`)
- **Option B:** Introduce `--muted-hover` custom property for light mode
- **Option C (recommended):** Accept asymmetry — light-mode hover relies more on border/shadow cues than background fill. Keep this explicitly documented in Pattern Registry Part 1.2.

**If Option C:** This becomes a documentation-only update that folds into DEBT-264.

---

## Verification

```bash
# Baseline: current light-mode muted token value
rg -n '^\\s*--muted:\\s*210 40% 96\\.1%;' app/globals.css
# Expected: 1 match currently

# Baseline: current affected classes still present
rg -n 'bg-muted/20|hover:bg-muted/40' app/'(app)'/app/dashboard/page.tsx
rg -n 'bg-muted/20' app/'(app)'/app/history/components/history-sessions-tab.tsx
rg -n 'hover:bg-muted/80' components/question/choice-button.tsx
rg -n 'bg-muted px-3 py-3' components/mobile-nav.tsx
# Expected: matches present in current state

# Scope inventory (all potentially impacted muted/accent opacity usages)
rg -n 'bg-(muted|accent)/(20|30|40|50|60|80)|hover:bg-(muted|accent)/(20|30|40|50|60|80)|\\bbg-muted\\b' \
  app components
# Expected: reviewed as LIGHT-1 inventory (not all entries are failures; classify by light-mode surface context)

# Option A verification (if selected): muted token darkened
rg -n '^\\s*--muted:\\s*210 20% 88%;' app/globals.css
# Expected: 1 match when Option A is implemented

# Option B verification (if selected): dedicated hover token added
rg -n '^\\s*--muted-hover:' app/globals.css
# Expected: >=1 match when Option B is implemented

# Option C verification (if selected): asymmetry explicitly documented
rg -n 'Light-mode caveat|light-mode hover feedback relies on border changes' \
  docs/frontend/pattern-registry.md
# Expected: >=1 match
```

Visual verification (required): in light mode, hover dashboard/history rows and confirm whether feedback remains intentionally border/shadow-led (Option C) or becomes visibly fill-led (Option A/B).
