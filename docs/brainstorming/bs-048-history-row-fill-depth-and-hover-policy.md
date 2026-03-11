# BS-048: History Row Fill Depth, Hover Policy, and Affordance Cleanup

**Date:** 2026-03-10
**Triggered by:** Visual inspection of History page (both tabs) in dark mode after DEBT-301 visual unification
**Scope:** Session rows appear perceptually darker than Dashboard/Practice rows despite using the same `bg-foreground/5` token (different parent surface). Session row hover and underlines are redundant with chevron disclosure. Questions tab "Review" pill is redundant with row-level navigation.
**Related:** [DEBT-301](../_archive/debt/debt-301-history-page-visual-unification.md), [BS-044](./bs-044-dark-mode-border-weight-tiering.md), [Pattern Registry](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md)

---

## The Problem

After DEBT-301, History uses the same `bg-foreground/5` token as Dashboard and Practice, but the rows feel heavier/darker because History rows sit on `bg-background` instead of `bg-card`. Additionally, several visual affordances are now redundant or aesthetically noisy after the chevron disclosure and tonal fill changes.

### Why the same token produces different results

| Page | Parent surface | Row token | Computed row color (dark) | Contrast vs parent |
|------|---------------|-----------|--------------------------|-------------------|
| Dashboard | `bg-card` (#121212) | `bg-foreground/5` | ~#1D1D1D | 1.11:1 |
| Practice filters | `bg-card` (#121212) | `bg-foreground/5` | ~#1D1D1D | 1.11:1 |
| **History** | `bg-background` (#090909) | `bg-foreground/5` | ~#141414 | 1.08:1 |

The pattern registry (§1.2) already codifies this principle for the muted scale: `/40` inside cards ≈ `/50` on page background. The foreground-ramp tonal fill needs the same parent-aware adjustment.

---

## Root Cause Analysis

1. **Fill depth:** DEBT-301 matched the token (`bg-foreground/5`) but not the parent surface. The "no wrapping Card" decision (DEBT-301 Gap 3) means History rows lack the `bg-card` intermediate surface.

2. **Hover redundancy:** DEBT-301 carried `hover:bg-foreground/[0.08]` forward from pre-unification bordered rows. Practice established the precedent that disclosure summaries with a chevron do not need a `hover:*` class: `practice-session-starter.tsx:213-221` uses `cursor-pointer` and `transition-colors`, but no hover fill or underline.

3. **Session summary underline:** The inner `<Link>` at `history-sessions-tab.tsx:205` has `hover:underline`. Inside a tonal fill row, the underline is visually noisy — especially when the row already has cursor-pointer and a chevron.

4. **Breakdown list underline:** `session-breakdown-list.tsx:42` has both `hover:bg-muted/20` AND `hover:underline` — double hover feedback. The underline is redundant and looks cluttered against the tonal fill surface.

5. **Questions "Review" pill:** The entire available question row is a `<Link>`. The trailing "Review" pill (`bg-foreground/[0.06]`) is a redundant label inside an already-clickable surface.

---

## Severity Assessment

- **Who is affected:** All users viewing History page in dark mode
- **How often:** Every History visit
- **Impact:** Aesthetic polish. No WCAG failures, no functional issues.
- **Priority:** P3

---

## Gap Inventory

### Gap 1: Session row rest fill too dark — DECIDED

**Current:** `bg-foreground/5` on `bg-background` → ~#141414 (1.08:1)

**Decision:** Raise to `bg-foreground/[0.08]` → ~#1B1B1B (1.16:1).

**Rationale:** With the live dark tokens (`--background: 0 0% 3.5%`, `--foreground: 0 0% 93%`), `bg-foreground/[0.08]` on page background composites to ~#1B1B1B, which is near-identical in perceived brightness to `bg-foreground/5` on `bg-card` (~#1D1D1D). This parallels the muted scale's parent-aware opacity adjustment (§1.2). The user confirmed the current hover value (`[0.08]`) "seems like the correct color" for the rest state.

### Gap 2: Session row hover removal — DECIDED

**Current:** `hover:bg-foreground/[0.08]` on the full `<li>` row.

**Decision:** Remove row-level hover entirely. Keep `cursor-pointer` on interactive rows.

**Rationale:** Practice filter disclosure summaries (Topic/Substance/Treatment) established the pattern: chevron + cursor-pointer, no hover class on the interactive summary row. History session rows are disclosure-primary (expand to see breakdown). Navigation feedback comes from `cursor-pointer` and the inner `<Link>` — the user never needs the entire row to light up. The `hover:underline` on the inner Link will also be removed (Gap 3), but the row click handler and cursor-pointer remain as navigation cues.

### Gap 3: Session summary Link underline removal — DECIDED

**Current:** `hover:underline` at `history-sessions-tab.tsx:205`.

**Decision:** Remove `hover:underline`. The session summary text inside a tonal fill row does not need underline hover. Navigation is communicated by cursor-pointer on the row.

### Gap 4: Breakdown list link underline removal — DECIDED

**Current:** `hover:underline` at `session-breakdown-list.tsx:42` (alongside `hover:bg-muted/20`).

**Decision:** Remove `hover:underline`. Keep `hover:bg-muted/20` as the sole hover feedback for breakdown question links.

**Rationale:** The background hover is sufficient. The double hover (background + underline) is visually cluttered. This is a targeted change to the breakdown list component, not a change to the L-2 Content Link pattern itself.

### Gap 5: Questions tab "Review" pill removal — DECIDED

**Current:** `<span className="inline-flex items-center rounded-full border-0 bg-foreground/[0.06] px-4 py-2 text-sm font-medium text-foreground/60">Review</span>` at `history-questions-tab.tsx:485-487`.

**Decision:** Remove the Review pill entirely. The entire available question row is a `<Link>` — the cursor, hover fill, and focus ring already communicate "this is clickable." A redundant label inside a clickable row adds visual weight without informational value.

### Gap 6: Questions tab fill — UNIFIED with Sessions

**Current:** `bg-foreground/5` rest + `hover:bg-foreground/[0.08]` hover.

**Decision:** Raise to `bg-foreground/[0.08]` rest + `hover:bg-foreground/[0.12]` hover. Unified with Sessions — same parent surface, same fill rule. At the live dark tokens, the hover state composites to ~#242424. The Review pill removal (Gap 5) will reduce visual content weight, making the too-dark fill more noticeable. One opacity for the entire page is simpler than maintaining two.

Chrome visual audit confirmed: the parent-surface issue affects both tabs equally.

### Gap 7: Unavailable row consistency

Questions tab unavailable rows also move from `bg-foreground/5` to `bg-foreground/[0.08]` — matching their available-row siblings.

Session rows don't have standalone unavailable variants (those appear in the breakdown list, shared component, unchanged).

### Gap 8: Cross-tab border radius / padding — DEFERRED

Chrome audit flagged: Sessions use `rounded-xl p-3` while Questions use `rounded-2xl p-4`. This is an intentional density difference (Sessions are compact single-line summaries; Questions have multi-line previews), not a gap. Deferred as a separate design judgment if needed.

---

## Cross-Tab Treatment Summary

After these changes, both tabs share the same rest fill. Only functional differences remain:

| Aspect | Sessions tab | Questions tab |
|--------|-------------|---------------|
| Rest fill | `bg-foreground/[0.08]` | `bg-foreground/[0.08]` |
| Hover fill | None (disclosure → chevron) | `hover:bg-foreground/[0.12]` (navigation → Link) |
| Trailing affordance | Chevron button | None (Review pill removed) |
| Row density | `p-3`, `space-y-2`, `rounded-xl` | `p-4`, `space-y-4`, `rounded-2xl` |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-10 | Created BS-048 | Post-DEBT-301 visual review revealed fill depth mismatch, hover redundancy, underline clutter, and redundant Review pill |
| 2026-03-10 | Gap 1: `bg-foreground/[0.08]` for Sessions rows | Parallels muted scale parent-aware adjustment; user confirmed hover value is the correct rest color |
| 2026-03-10 | Gap 2: Remove Sessions row hover | Practice disclosure precedent; chevron + cursor is sufficient |
| 2026-03-10 | Gap 3: Remove session summary `hover:underline` | Noisy inside tonal fill row; cursor-pointer provides navigation cue |
| 2026-03-10 | Gap 4: Remove breakdown list `hover:underline` | Double hover (bg + underline) is cluttered; keep bg-only |
| 2026-03-10 | Gap 5: Remove Questions Review pill | Redundant label inside a clickable row |
| 2026-03-10 | Gap 6: Unified fill — both tabs `bg-foreground/[0.08]` | Chrome audit confirmed parent-surface issue affects both tabs; one opacity per page is cleaner than two; Review pill removal reduces content weight making dark fill more noticeable |
| 2026-03-10 | Gap 8: Radius/padding deferred | Intentional density difference; Sessions compact, Questions airy |
| 2026-03-10 | Promoted to [DEBT-302](../debt/debt-302-history-row-fill-and-affordance-cleanup.md) | All gaps decided; ready for implementation |
