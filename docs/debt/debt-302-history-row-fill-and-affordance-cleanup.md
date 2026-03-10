# DEBT-302: History Row Fill Depth and Affordance Cleanup

**Priority:** P3
**Created:** 2026-03-10
**Status:** Active
**Source:** [BS-048](../brainstorming/bs-048-history-row-fill-depth-and-hover-policy.md)
**Related:** [DEBT-301](../_archive/debt/debt-301-history-page-visual-unification.md), [Pattern Registry](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md)

---

## Context

DEBT-301 unified History's visual language by removing borders/shadows and adopting `bg-foreground/5` tonal fill. However, History rows sit on `bg-background` (#09090B), not `bg-card` (#121212), so the same token produces a perceptually darker result than Dashboard or Practice. Additionally, several hover affordances and a redundant "Review" pill need cleanup.

The pattern registry (§1.2) already codifies parent-aware opacity adjustment for the muted scale (`/40` in-card ≈ `/50` on-page). This debt extends the same principle to the foreground-ramp tonal fill.

---

## Sessions Tab Changes

### 1. Raise session row rest fill to compensate for page background

Current row contract in `app/(app)/app/history/components/history-sessions-tab.tsx`:

```tsx
'rounded-xl bg-foreground/5 p-3 transition-colors hover:bg-foreground/[0.08]'
```

Target contract:

```tsx
'rounded-xl bg-foreground/[0.08] p-3 transition-colors'
```

`bg-foreground/[0.08]` on `bg-background` (#09090B) computes to ~#1B1B1D — perceptual parity with `bg-foreground/5` on `bg-card` (#121212) which computes to ~#1D1D1D. This parallels how the muted scale uses different opacities for different parent surfaces.

Interactive rows must preserve their existing `cursor-pointer` class.

### 2. Remove session row hover fill

Remove `hover:bg-foreground/[0.08]` from the `<li>` row. The chevron + cursor-pointer is sufficient for disclosure affordance, matching the Practice filter disclosure pattern (no hover).

`transition-colors` can also be removed from the row since there is no longer a color transition to animate.

### 3. Remove session summary Link underline

Current inner Link at line 205:

```tsx
className="rounded-md text-sm text-foreground transition-colors hover:underline focus-visible:..."
```

Target:

```tsx
className="rounded-md text-sm text-foreground focus-visible:..."
```

Remove `hover:underline` and `transition-colors` (no color transition left). The underline is visually noisy inside a tonal fill row. Navigation feedback comes from cursor-pointer on the parent row.

---

## Questions Tab Changes

### 4. Remove trailing "Review" pill

Current available row markup at line 485–487:

```tsx
<span className="inline-flex items-center rounded-full border-0 bg-foreground/[0.06] px-4 py-2 text-sm font-medium text-foreground/60">
  Review
</span>
```

Remove this `<span>` entirely. The entire row is a `<Link>` — cursor, hover fill change, and focus ring already communicate interactivity. The "Review" label adds visual weight without informational value.

After removal, the row content simplifies to the left-aligned title + preview + metadata stack. The `flex-col gap-4 sm:flex-row sm:items-start sm:justify-between` layout wrapper can be simplified since there's no longer a trailing element to justify against.

### 5. Questions tab fill/hover — NO CHANGE

`bg-foreground/5` rest + `hover:bg-foreground/[0.08]` hover stays as-is. The Questions tab contrast and hover feel correct per visual review. If Questions rows feel too dark after the Review pill removal reduces visual content weight, the same fill raise to `[0.08]` can be applied as a follow-up.

---

## Shared Component Changes

### 6. Remove breakdown list link underline

Current breakdown link in `app/(app)/app/shared/components/session-breakdown-list.tsx` line 42:

```tsx
className="-mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 font-medium text-foreground transition-colors hover:bg-muted/20 hover:underline focus-visible:..."
```

Target:

```tsx
className="-mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 font-medium text-foreground transition-colors hover:bg-muted/20 focus-visible:..."
```

Remove `hover:underline` only. Keep `hover:bg-muted/20` as the sole hover feedback. The double hover (background + underline) is visually cluttered against the tonal fill surface.

**Note:** This is a targeted change to the breakdown list component's link styling, not a change to the L-2 Content Link pattern in the pattern registry. The breakdown list links are tighter/denser than typical content links and benefit from background-only hover.

---

## Cross-Tab Divergence Summary

After DEBT-302, the Sessions and Questions tabs intentionally differ in treatment. This table makes the divergence explicit.

| Aspect | Sessions tab | Questions tab | Why different |
|--------|-------------|---------------|---------------|
| **Rest fill** | `bg-foreground/[0.08]` | `bg-foreground/5` | Sessions rows are denser (`p-3`, `space-y-2`, `rounded-xl`); the lower-content rows need a brighter fill to avoid looking like heavy gray bars. Questions rows have more visual content per row (title + preview + metadata) and more spacing (`p-4`, `space-y-4`, `rounded-2xl`), so `/5` reads well. |
| **Hover fill** | None | `hover:bg-foreground/[0.08]` | Sessions are disclosure-primary (chevron expands breakdown); Practice established no-hover for disclosure. Questions are navigation-primary (each row is a `<Link>` to review); Dashboard established hover for navigable rows. |
| **Trailing affordance** | Chevron disclosure button | None (Review pill removed) | Sessions need an explicit expand/collapse control. Questions are entire-row Links — no secondary affordance needed. |
| **Row element** | `<li>` with delegated click + nested `<Link>` | `<Link>` (entire row) | Sessions have dual-action (navigate + expand); Questions are single-action (navigate). |
| **Inner hover feedback** | None (underline removed) | None (no underline was present) | Aligned — neither tab uses underline on row content. |

**Is this divergence a problem?** The two tabs are never visible simultaneously (tab switch). The visual shift on switch is mitigated by the shared tab bar, page header, and filter controls providing continuity. The difference in row density/spacing already makes the tabs feel distinct even at the same fill opacity.

**Future alignment path:** If the Review pill removal makes Questions rows feel too light or if cross-tab consistency becomes a higher priority, the fill can be unified to `bg-foreground/[0.08]` on both tabs with minimal effort. This is documented as a follow-up option, not a commitment.

---

## Deferred / Out of Scope

- **Questions tab fill raise:** Not included. If Questions rows need the same fill raise later, that's a trivial follow-up.
- **Questions tab unavailable rows:** Stay at `bg-foreground/5` (matching their available-row siblings).
- **Breakdown list `hover:bg-muted/20`:** Stays. This is the correct in-row hover for links inside an expanded breakdown.
- **Pattern Registry §1.2 foreground-ramp table:** Should be updated to document the two-tier foreground ramp (in-card vs on-page). Tracked as a doc-sync task in this debt, not a separate debt.

---

## Acceptance Criteria

- [ ] Session rows use `bg-foreground/[0.08]` at rest (not `bg-foreground/5`)
- [ ] Session rows do NOT have `hover:bg-foreground/[0.08]` (no row-level hover)
- [ ] Session rows do NOT have `transition-colors` on the `<li>` (no animation without a transition target)
- [ ] Interactive session rows preserve `cursor-pointer`
- [ ] Session summary `<Link>` does NOT have `hover:underline`
- [ ] Breakdown list links do NOT have `hover:underline`
- [ ] Breakdown list links preserve `hover:bg-muted/20` (background hover intact)
- [ ] Questions tab available rows do NOT render a trailing "Review" pill
- [ ] Questions tab available row layout is cleaned up after pill removal (no empty justify-between target)
- [ ] Questions tab fill/hover (`bg-foreground/5` + `hover:bg-foreground/[0.08]`) remains unchanged
- [ ] Questions tab unavailable rows are unchanged
- [ ] SegmentedControl, filter dropdowns, and pagination links remain unchanged
- [ ] Pattern Registry §1.2 updated with foreground-ramp two-tier table (in-card vs on-page)
- [ ] Contrast Policy updated with revised History sessions row computed values

---

## Files to Modify

### Source
- `app/(app)/app/history/components/history-sessions-tab.tsx`
- `app/(app)/app/history/components/history-questions-tab.tsx`
- `app/(app)/app/shared/components/session-breakdown-list.tsx`

### Tests
- `app/(app)/app/history/components/history-sessions-tab.test.tsx`
- `app/(app)/app/history/components/history-sessions-tab.browser.spec.tsx`
- `app/(app)/app/history/components/history-questions-tab.test.tsx`
- `app/(app)/app/shared/components/session-breakdown-list.test.tsx`

### Documentation sync
- `docs/frontend/pattern-registry.md` — Update §1.2 with foreground-ramp two-tier table; update I-1 tonal-fill variant and I-2 with new on-page tokens
- `docs/frontend/contrast-policy.md` — Update History sessions row computed values
- `docs/debt/index.md` — Register DEBT-302
- `docs/debt/debt-302-history-row-fill-and-affordance-cleanup.md` — This file

---

## Visual Verification Checklist

After implementation, verify in both dark and light mode:

- [ ] History Sessions tab — collapsed rows are visually brighter than before, closer to Dashboard row brightness
- [ ] History Sessions tab — hovering a row does NOT change its background fill
- [ ] History Sessions tab — hovering the session summary text does NOT underline it
- [ ] History Sessions tab — cursor changes to pointer on interactive rows
- [ ] History Sessions tab — chevron still rotates on expand/collapse
- [ ] History Sessions tab — expanded breakdown question links do NOT underline on hover
- [ ] History Sessions tab — expanded breakdown question links still show subtle background on hover
- [ ] History Questions tab — no trailing "Review" pill on available rows
- [ ] History Questions tab — row hover fill still works (bg-foreground/[0.08])
- [ ] History Questions tab — row content is left-aligned without empty trailing space
- [ ] History Questions tab — unavailable rows unchanged
- [ ] Sessions and Questions tabs feel like siblings of the same page (no jarring tab-switch contrast shift)
