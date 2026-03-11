# DEBT-302: History Row Fill Depth and Affordance Cleanup

**Priority:** P3
**Created:** 2026-03-10
**Status:** Active
**Source:** [BS-048](../brainstorming/bs-048-history-row-fill-depth-and-hover-policy.md)
**Related:** [DEBT-301](../_archive/debt/debt-301-history-page-visual-unification.md), [Pattern Registry](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md)

---

## Context

DEBT-301 unified History's visual language by removing borders/shadows and adopting `bg-foreground/5` tonal fill. However, History rows sit on `bg-background` (#09090B), not `bg-card` (#121212), so the same token produces a perceptually darker result than Dashboard or Practice. A cross-page Chrome visual audit confirmed: History rows are noticeably darker than Dashboard and Practice rows despite using the identical `bg-foreground/5` token, because the parent surface is darker.

The pattern registry (§1.2) already codifies parent-aware opacity adjustment for the muted scale (`/40` in-card ≈ `/50` on-page). This debt extends the same principle to the foreground-ramp tonal fill: `bg-foreground/5` in-card ≈ `bg-foreground/[0.08]` on-page.

Additionally, several affordances are now redundant or noisy after DEBT-301's chevron disclosure and tonal fill changes: row-level hover on disclosure rows, hover underlines on session summary and breakdown links, and the trailing "Review" pill on Questions tab rows.

---

## Unified Fill Rule

**All History rows on page background use `bg-foreground/[0.08]` at rest.** Both tabs, both available and unavailable rows. One opacity for the entire page.

`bg-foreground/[0.08]` on `bg-background` (#09090B) → ~#1B1B1D. This achieves perceptual parity with `bg-foreground/5` on `bg-card` (#121212) → ~#1D1D1D, following the same parent-aware adjustment the muted scale uses.

**Hover is functional, not decorative:**
- Sessions rows: no hover (disclosure-primary, chevron is the affordance — matches Practice filter pattern)
- Questions available rows: `hover:bg-foreground/[0.12]` (navigation-primary, entire row is a `<Link>` — matches Dashboard row pattern with parent-adjusted hover step)

---

## Sessions Tab Changes

### 1. Raise session row rest fill + remove hover

Current row contract in `app/(app)/app/history/components/history-sessions-tab.tsx`:

```tsx
'rounded-xl bg-foreground/5 p-3 transition-colors hover:bg-foreground/[0.08]'
```

Target contract:

```tsx
'rounded-xl bg-foreground/[0.08] p-3'
```

Remove `hover:bg-foreground/[0.08]` (no row-level hover on disclosure rows). Remove `transition-colors` (no transition to animate). Keep `cursor-pointer` on interactive rows.

### 2. Remove session summary Link underline

Current inner Link at line 205:

```tsx
className="rounded-md text-sm text-foreground transition-colors hover:underline focus-visible:..."
```

Target:

```tsx
className="rounded-md text-sm text-foreground focus-visible:..."
```

Remove `hover:underline` and `transition-colors`. The Chrome audit confirmed: no other page uses `hover:underline` on rows. Dashboard, Practice, and Questions tab all rely on fill-change or cursor alone. The underline is a visual outlier.

---

## Questions Tab Changes

### 3. Raise question row rest fill + adjust hover step

Current available row contract in `app/(app)/app/history/components/history-questions-tab.tsx`:

```tsx
className="block rounded-2xl bg-foreground/5 p-4 transition-colors hover:bg-foreground/[0.08] focus-visible:..."
```

Target:

```tsx
className="block rounded-2xl bg-foreground/[0.08] p-4 transition-colors hover:bg-foreground/[0.12] focus-visible:..."
```

The rest fill moves from `/5` to `/[0.08]` (unified with Sessions). The hover moves from `/[0.08]` to `/[0.12]` to maintain a proportional step (same ~4pp delta that Dashboard uses with its 5→8 step on a brighter parent).

### 4. Remove trailing "Review" pill

Current available row markup at line 485–487:

```tsx
<span className="inline-flex items-center rounded-full border-0 bg-foreground/[0.06] px-4 py-2 text-sm font-medium text-foreground/60">
  Review
</span>
```

Remove this `<span>` entirely. The Chrome audit confirmed: the entire row is a `<Link>` — the pill is redundant. It provides no unique interaction and takes up horizontal space.

After removal, the row content simplifies to the left-aligned title + preview + metadata stack. The `flex-col gap-4 sm:flex-row sm:items-start sm:justify-between` layout wrapper should be simplified since there's no longer a trailing element to justify against.

### 5. Raise unavailable question row fill

Current unavailable row in `history-questions-tab.tsx`:

```tsx
className="rounded-2xl bg-foreground/5 p-4"
```

Target:

```tsx
className="rounded-2xl bg-foreground/[0.08] p-4"
```

Unavailable rows match their available siblings in rest fill. No hover (static rows).

---

## Shared Component Changes

### 6. Remove breakdown list link underline

Current breakdown link in `app/(app)/app/shared/components/session-breakdown-list.tsx` line 42:

```tsx
className="... hover:bg-muted/20 hover:underline focus-visible:..."
```

Target:

```tsx
className="... hover:bg-muted/20 focus-visible:..."
```

Remove `hover:underline` only. Keep `hover:bg-muted/20` as the sole hover feedback. The Chrome audit confirmed the double hover (background + underline) is an outlier — no other page uses underline on rows.

**Note:** This is a targeted change to the breakdown list component, not a change to the L-2 Content Link pattern in the pattern registry.

---

## Cross-Tab Treatment Summary

After DEBT-302, both tabs share the same rest fill. Only hover and structural differences remain — all functionally motivated.

| Aspect | Sessions tab | Questions tab | Why different |
|--------|-------------|---------------|---------------|
| **Rest fill** | `bg-foreground/[0.08]` | `bg-foreground/[0.08]` | **Unified** — same page background, same opacity |
| **Hover fill** | None | `hover:bg-foreground/[0.12]` | Sessions are disclosure-primary (chevron). Questions are navigation-primary (`<Link>`). |
| **Trailing affordance** | Chevron disclosure button | None (Review pill removed) | Sessions need expand/collapse control. Questions are entire-row Links. |
| **Row density** | `rounded-xl p-3 space-y-2` | `rounded-2xl p-4 space-y-4` | Sessions are compact summaries. Questions have multi-line previews. This is an intentional density difference, not a gap — see "Deferred" below. |
| **Row element** | `<li>` with delegated click + nested `<Link>` | `<Link>` (entire row) | Sessions have dual-action (navigate + expand). Questions are single-action (navigate). |

---

## Deferred / Out of Scope

- **Cross-tab border radius / padding unification:** Sessions use `rounded-xl p-3` (I-1 compact row pattern), Questions use `rounded-2xl p-4` (I-2 standalone row pattern). The Chrome audit flagged this as a polish issue. However, the density difference is intentional — Sessions rows are compact single-line summaries while Questions rows contain multi-line previews. Unifying would either make Sessions too airy or Questions too cramped. Deferred as a separate design judgment if needed.
- **Breakdown list `hover:bg-muted/20`:** Stays. This is the correct in-row hover for links inside an expanded breakdown.
- **Pattern Registry §1.2 foreground-ramp table:** Should be updated to document the two-tier foreground ramp (in-card `/5` vs on-page `/[0.08]`). Tracked as a doc-sync task in this debt, not a separate debt.

---

## Acceptance Criteria

- [ ] Session rows use `bg-foreground/[0.08]` at rest (not `bg-foreground/5`)
- [ ] Session rows do NOT have `hover:bg-foreground/[0.08]` (no row-level hover)
- [ ] Session rows do NOT have `transition-colors` on the `<li>`
- [ ] Interactive session rows preserve `cursor-pointer`
- [ ] Session summary `<Link>` does NOT have `hover:underline` or `transition-colors`
- [ ] Questions tab available rows use `bg-foreground/[0.08]` at rest (not `bg-foreground/5`)
- [ ] Questions tab available rows use `hover:bg-foreground/[0.12]` (not `hover:bg-foreground/[0.08]`)
- [ ] Questions tab unavailable rows use `bg-foreground/[0.08]` (not `bg-foreground/5`)
- [ ] Questions tab available rows do NOT render a trailing "Review" pill
- [ ] Questions tab available row layout is cleaned up after pill removal
- [ ] Breakdown list links do NOT have `hover:underline`
- [ ] Breakdown list links preserve `hover:bg-muted/20`
- [ ] SegmentedControl, filter dropdowns, and pagination links remain unchanged
- [ ] Pattern Registry §1.2 updated with foreground-ramp two-tier table (in-card vs on-page)
- [ ] Pattern Registry I-2 updated with new on-page tokens (`bg-foreground/[0.08]` + `hover:bg-foreground/[0.12]`)
- [ ] Contrast Policy updated with revised History row computed values for both tabs

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
- `docs/frontend/pattern-registry.md` — Update §1.2 with foreground-ramp two-tier table; update I-1 tonal-fill variant History note; update I-2 with new on-page tokens
- `docs/frontend/contrast-policy.md` — Update History row computed values for both tabs
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
- [ ] History Questions tab — rows are visually brighter than before (same brightness as Sessions rows)
- [ ] History Questions tab — no trailing "Review" pill on available rows
- [ ] History Questions tab — row hover fill works (`bg-foreground/[0.12]`)
- [ ] History Questions tab — row content is left-aligned without empty trailing space
- [ ] History Questions tab — unavailable rows match available row rest brightness
- [ ] Tab switch between Sessions and Questions — no jarring brightness shift
- [ ] Compare with Dashboard "Recent sessions" rows — History rows should feel similar in brightness
