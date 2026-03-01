# DEBT-263: Text Contrast

**Status:** Resolved
**Resolved:** 2026-02-28
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** LIGHT-2
**Decision 13:** Modified Option C — Subtle global darkening (success L=29%, destructive L=48%)
**Sequencing:** DEBT-251 merged ✅ (PR #150)
**Files:** `app/globals.css` (`:root` block, lines 104 and 106)

---

## Item

### LIGHT-2: Success/Destructive Text Colors Fail WCAG AA at Normal Text Sizes

**Severity:** Medium-High (WCAG AA failure)

`text-success` and `text-destructive` fail WCAG AA for normal-sized text on white backgrounds.

**Baseline token evidence (pre-fix)** (`app/globals.css`):
- `--success: 142 72% 35%` (`app/globals.css:106`)
- `--destructive: 0 84.2% 60.2%` (`app/globals.css:104`)

**Baseline contrast on white** (computed from prior token RGB):
- `text-success` (`rgb(25,154,72)`) ≈ `3.648:1` — FAIL (AA requires >= 4.5:1)
- `text-destructive` (`rgb(239,68,68)`) ≈ `3.763:1` — FAIL (AA requires >= 4.5:1)

**Representative affected usage (small/normal text):**
- Dashboard activity labels: `text-success` / `text-destructive` at `text-xs`
- Choice badges: semantic colors at `text-xs`
- History question metadata badges: semantic colors inside a `text-xs` row
- Session breakdown result labels at `text-sm`
- Pricing/marketing annual savings labels at `text-sm`
- Exam review warning text at `text-sm`

---

## Decision 13 — RESOLVED: Modified Option C (Subtle Global Darkening)

### Chosen values

```css
/* Light mode (:root) — CHANGE */
--success: 142 72% 29%;        /* was: 142 72% 35% */
--destructive: 0 84.2% 48%;    /* was: 0 84.2% 60.2% */

/* Dark mode (.dark) — NO CHANGE */
--success: 142 70% 42%;        /* unchanged */
--destructive: 0 72% 51%;      /* unchanged */
```

### Contrast verification

| Token | HSL | Approx RGB | Contrast on White | AA Normal (>=4.5) | Buffer |
|-------|-----|------------|-------------------|-------------------|--------|
| Success (current) | `142 72% 35%` | `rgb(25,154,72)` | 3.648:1 | FAIL | -0.852 |
| Success (new) | `142 72% 29%` | `rgb(21,127,60)` | **5.081:1** | PASS | +0.581 (+12.9%) |
| Destructive (current) | `0 84.2% 60.2%` | `rgb(239,68,68)` | 3.763:1 | FAIL | -0.737 |
| Destructive (new) | `0 84.2% 48%` | `rgb(225,19,19)` | **4.879:1** | PASS | +0.379 (+8.4%) |

### Reasoning

**Why L=29% for success (not L=28% or L=35%):**
- L=35% (current): 3.648:1 — fails AA by 18.9%
- L=29%: 5.081:1 — passes with 12.9% buffer. Modest 6-point lightness shift from current. The green shifts from medium-bright to slightly deeper forest green. Hue and saturation unchanged — recognizably the same semantic green.
- L=28% (Option A): 5.352:1 — only 0.271 more contrast for 1 additional point of darkening. Negligible benefit, slightly more visual shift.
- AA threshold for this hue/sat combo: L=31.12%. L=29% has 2.12 points of safety margin.

**Why L=48% for destructive (not L=45% or L=60.2%):**
- L=60.2% (current): 3.763:1 — fails AA by 16.4%
- L=48%: 4.879:1 — passes with 8.4% buffer. 12-point lightness shift (`rgb(225,19,19)`). Retains warmth as a clearly red color without the dramatic character change of deeper darkening.
- L=45% (Option C as spec'd): 5.433:1 — 15-point drop transforms coral-red (`rgb(239,68,68)`, Tailwind red-500 territory) into blood red (`rgb(211,18,18)`). The visual character changes from "friendly warning" to "urgent alarm." Overshoot for a contrast fix.
- AA threshold for this hue/sat combo: L=50.0%. L=48% has 2 points of safety margin.

**Why not Option B (swap to text-foreground):**
- Requires 12 files, 22 individual class changes
- Cannot work on choice-button/feedback badges where semantic color IS the UX signal
- "Correct" and "Incorrect" badges looking identical defeats the purpose
- The blast radius is disproportionate and destroys semantic meaning

**Dark mode safety:** Light and dark mode use completely separate CSS custom property declarations in `:root` vs `.dark`. Changing `:root` lines 104/106 has zero effect on `.dark` lines 144/146.

### Known follow-up: tinted background contrast

`text-success` on `bg-success/15` and `text-destructive` on `bg-destructive/15` still won't reach AA even with these changes (the tinted background reduces luminance contrast). Affected spots:
- Choice-button badge circle (A/B/C/D letter) at `text-xs` on `bg-success/15`
- Feedback verdict badge ("Correct"/"Incorrect") at `text-sm` on `bg-success/15`

This is a separate concern — reducing tint opacity (e.g., `/15` → `/5`) or using a different pattern. Tracked as a potential follow-up item, not blocking this fix.

---

## Implementation

Two-line change in `app/globals.css`, `:root` block:

```diff
-    --destructive: 0 84.2% 60.2%;
+    --destructive: 0 84.2% 48%;
     --destructive-foreground: 210 40% 98%;
-    --success: 142 72% 35%;
+    --success: 142 72% 29%;
```

---

## Verification

```bash
# New token values present in light mode
rg -n '^\s*--success:\s*142 72% 29%;' app/globals.css
rg -n '^\s*--destructive:\s*0 84\.2% 48%;' app/globals.css
# Expected: 1 match each

# Dark mode values UNCHANGED
rg -n '^\s*--success:\s*142 70% 42%;' app/globals.css
rg -n '^\s*--destructive:\s*0 72% 51%;' app/globals.css
# Expected: 1 match each

# text-success and text-destructive still used semantically (not replaced with text-foreground)
rg -n 'text-success|text-destructive' app components --glob '!**/*.test.*'
# Expected: matches present — semantic colors preserved
```

Visual verification (required): in Chrome DevTools, inspect a `text-success`/`text-destructive` element at `text-xs` on a white background and confirm the green is slightly deeper and the red is moderately darker while remaining clearly green/red.
