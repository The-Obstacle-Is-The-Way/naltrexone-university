# DEBT-262: Light-Mode Opacity Scale

**Status:** Resolved (documentation-only → folds into DEBT-264)
**Resolved:** 2026-02-28
**Parent:** [DEBT-250](../../debt/debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** LIGHT-1
**Decision 12:** Option C — Accept asymmetry
**Files:** Documentation only: `docs/frontend/pattern-registry.md` (Part 1.2)

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
- Choice buttons use `hover:bg-muted/60` (`components/question/choice-button.tsx:30`)
- Mobile nav active state uses `bg-muted` (`components/mobile-nav.tsx:74`)

Token-level impact: any use of `bg-muted/*`, `hover:bg-muted/*`, `bg-accent/*`, or `hover:bg-accent/*` on white/near-white light-mode surfaces is in scope for LIGHT-1.

---

## Decision 12 — RESOLVED: Option C (Accept Asymmetry)

### Chosen path

Light-mode hover feedback relies on border/shadow cues, not background fills. The opacity scale remains unchanged. The Pattern Registry Part 1.2 caveat (already present) is refined in DEBT-264.

### Reasoning

**Option A is mathematically infeasible.** Even darkening `--muted` from L=96.1% to L=88%:
- `bg-muted/40` on white produces ~1.12:1 contrast — still imperceptible
- `bg-muted/20` on white produces ~1.06:1 — still invisible
- To make `/40` visibly distinct (~1.3:1), `--muted` would need L≈73%, which turns every `bg-muted` surface into conspicuous medium gray and fundamentally changes the light theme character

**Option A actively degrades Decision 13 fixes.** Cross-cutting contrast analysis proved:
- Darker `--muted` backgrounds reduce `text-success`/`text-destructive` contrast ratios
- D12-A + D13-C can fail WCAG AA on muted fills (`text-success` fails by `bg-muted/60`; `text-destructive` fails by `bg-muted/40`)
- The two decisions interact adversely when Option A is chosen

**Option B introduces disproportionate complexity.** A mode-specific `--muted-hover` token:
- Breaks the elegant "one token, multiple opacities" pattern
- Requires Tailwind theme registration and migration of all hover classes
- Serves only light mode — cognitive overhead for a one-mode workaround

**Option C is defensible because:**
1. shadcn/ui ships identical `--accent`/`--muted` values (96.1%) and relies on text-color hover changes, not fills
2. Production precedent: Vercel Dashboard, Linear, GitHub use border/shadow hover in light mode
3. Most affected components already have non-fill hover cues (choice-button has `hover:border-muted-foreground/30`, mobile nav has `hover:text-foreground`, tabs/chips have `hover:text-foreground`)
4. The 4 row components (dashboard, history) that lack non-fill hover feedback are addressed by DEBT-260 (UX-1) — hover border fixes belong there, not in a token change

**Inventory of current hover affordance coverage:**

| Component | Fill hover | Non-fill hover cue | Light-mode status |
|-----------|-----------|--------------------|--------------------|
| Choice button | `hover:bg-muted/60` | `hover:border-muted-foreground/30` | Border visible ✅ |
| Mobile nav (inactive) | `hover:bg-muted/50` | `hover:text-foreground` | Text visible ✅ |
| Tab switch (inactive) | `hover:bg-muted/50` | `hover:text-foreground` | Text visible ✅ |
| Filter chip | `hover:bg-muted/50` | `hover:text-accent-foreground` | Text visible ✅ |
| Button outline/ghost | `hover:bg-accent` | `hover:text-accent-foreground` | Text visible ✅ |
| Dashboard rows | `hover:bg-muted/40` | None | Cursor only ⚠️ → DEBT-260 |
| History session rows | `hover:bg-muted/40` | None | Cursor only ⚠️ → DEBT-260 |
| History question rows | `hover:bg-muted/50` | None | Cursor only ⚠️ → DEBT-260 |

### Result

No CSS changes. Documentation update (Pattern Registry Part 1.2 caveat refinement) folds into DEBT-264 scope.

---

## Verification

```bash
# Option C: --muted token UNCHANGED
rg -n '^\s*--muted:\s*210 40% 96\.1%;' app/globals.css
# Expected: 1 match (light mode value preserved)

# Option C: asymmetry documented in Pattern Registry
rg -n 'Light-mode caveat|light-mode hover feedback relies on border' \
  docs/frontend/pattern-registry.md
# Expected: >=1 match (caveat already present, refined in DEBT-264)
```
