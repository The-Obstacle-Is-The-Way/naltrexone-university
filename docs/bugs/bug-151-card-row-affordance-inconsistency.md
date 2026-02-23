# BUG-151: Card/Row Affordance Inconsistency — Misleading Hover, Missing Focus Rings, Pattern Asymmetry

**Status:** Open
**Priority:** P2
**Date:** 2026-02-23

---

## Description

A codebase-wide audit of card/row interactive patterns reveals four categories of UX inconsistency:

1. **Non-interactive cards with hover affordance** — Cards change color on hover but don't do anything when clicked, misleading users into thinking they're interactive.
2. **Interactive links missing `focus-visible` ring** — Keyboard users can't see where focus is when tabbing through card links.
3. **Pattern asymmetry on the same page** — History sessions tab uses card-level `onClick` (Pattern C), while the questions tab on the same page uses inner-target links (Pattern B). Users switch tabs and the interaction model changes.
4. **Landing page feature cards with misleading hover** — Marketing feature cards have `hover:bg-muted` but are purely display.

## Codebase-Wide Audit Results

### All Card/Row Surfaces

| # | Surface | File | Lines | Pattern | Hover | Focus Ring | Clickable? | Issue |
|---|---------|------|-------|---------|-------|------------|------------|-------|
| 1 | Dashboard — stat cards (×4) | `app/(app)/app/dashboard/page.tsx` | 61–91 | D | `hover:border-border hover:bg-muted/50` | None | No | **Misleading hover** |
| 2 | Dashboard — streak card | `app/(app)/app/dashboard/page.tsx` | 95–103 | D | `hover:border-border hover:bg-muted/50` | None | No | **Misleading hover** |
| 3 | Dashboard — recent sessions | `app/(app)/app/dashboard/page.tsx` | 145–172 | A | `hover:bg-muted/40` | `focus-visible:ring-[3px]` | Yes (Link-as-Card) | OK |
| 4 | Dashboard — recent activity | `app/(app)/app/dashboard/page.tsx` | 220–241 | A | `hover:bg-muted/40` | `focus-visible:ring-[3px]` | Yes (Link-as-Card) | OK |
| 5 | History — sessions tab rows | `history-sessions-tab.tsx` | 177–273 | C | `hover:bg-accent/40` + `cursor-pointer` | `tabIndex={0}` (row) + `focus-visible:ring-[3px]` (inner link) | Yes (card-level onClick) | OK but asymmetric with #6 |
| 6 | History — questions tab cards | `history-questions-tab.tsx` | 511–552 | B | None (card); `hover:underline` (link) | **Missing** on title link (line 517) | Inner targets only | **Missing focus ring + asymmetry with #5** |
| 7 | History — session breakdown links | `session-breakdown-list.tsx` | 27–38 | B | `hover:underline` (link) | **Missing** on link (line 34) | Inner target only | **Missing focus ring** |
| 8 | Bookmarks — bookmark cards | `app/(app)/app/bookmarks/page.tsx` | 84–197 | B | None (card); `hover:underline` (link line 96) | **Missing** on title link (line 96) | Inner targets (link + buttons) | **Missing focus ring** |
| 9 | Marketing — feature cards (×3+) | `components/marketing/marketing-home.tsx` | 152–169 | D | `hover:bg-muted` | None | No | **Misleading hover** |
| 10 | Marketing — impact stat cards | `components/marketing/marketing-home.tsx` | 107–124 | D | None | None | No | OK (no misleading affordance) |
| 11 | Marketing — pricing cards | `components/marketing/marketing-home.tsx` | 190–238 | D | None | None | No (buttons inside) | OK |
| 12 | Pricing — pricing cards | `app/pricing/pricing-view.tsx` | 126–178 | D | None | None | No (form/buttons inside) | OK |
| 13 | Practice — incomplete session card | `practice/components/incomplete-session-card.tsx` | 29–82 | B | None | N/A (button handles focus) | Inner button only | OK |
| 14 | Practice — session starter | `practice/components/practice-session-starter.tsx` | 100–272 | B | None | N/A (button handles focus) | Inner button only | OK |

### Pattern Legend

- **Pattern A:** Link-as-Card — entire card is a `<Link>`, best semantics
- **Pattern B:** Card with inner targets — display card, links/buttons inside
- **Pattern C:** Card with card-level onClick — `<li>` with `onClick`/`onKeyDown`/`tabIndex`
- **Pattern D:** Non-interactive display card

---

## Fix Plan

### Fix 1: Remove misleading hover from non-interactive stat cards (P2)

**5 cards in dashboard, 3+ feature cards on landing page.**

**File:** `app/(app)/app/dashboard/page.tsx`

Lines 61, 68, 77, 84, 95 — remove `transition-colors hover:border-border hover:bg-muted/50` from each stat/streak `<Card>`.

```diff
- <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border hover:bg-muted/50">
+ <Card className="gap-0 rounded-2xl p-6 shadow-sm">
```

Apply to all 5 stat/streak cards (lines 61, 68, 77, 84, 95).

**File:** `components/marketing/marketing-home.tsx`

Line 155 — remove `transition-colors hover:bg-muted` from feature cards.

```diff
- className={cn(
-   'transition-colors hover:bg-muted',
-   feature.wide && 'md:col-span-2',
- )}
+ className={cn(feature.wide && 'md:col-span-2')}
```

### Fix 2: Add `focus-visible` ring to all interactive card links (P3)

**Consistent ring class:** `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`

This matches the existing pattern used on dashboard Link-as-Card elements and the history session inner link.

**File:** `app/(app)/app/history/components/history-questions-tab.tsx` line 517

```diff
- className="text-sm font-medium text-foreground hover:underline"
+ className="rounded-sm text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
```

**File:** `app/(app)/app/shared/components/session-breakdown-list.tsx` line 34

```diff
- className="flex items-center gap-2 font-medium text-foreground hover:underline"
+ className="flex items-center gap-2 rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
```

**File:** `app/(app)/app/bookmarks/page.tsx` line 96

```diff
- className="hover:underline"
+ className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
```

### Fix 3: Resolve history page pattern asymmetry (P1)

**Problem:** Sessions tab uses Pattern C (card-level onClick), questions tab uses Pattern B (inner targets only). Users switching tabs encounter different interaction models on the same page.

**Decision required — two options:**

**Option A (Recommended): Promote question cards to Pattern A (Link-as-Card)**

Convert history question cards from Pattern B to Pattern A by wrapping the entire card in a `<Link>`. This is the simplest unification — the card has one primary action (review the question), so Link-as-Card is the natural fit.

In `history-questions-tab.tsx`, the `<Card>` becomes a child of `<Link>`:

```tsx
<li key={row.questionId}>
  <Link
    href={href}
    className="block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
  >
    {/* card content — remove inner <Link> and <Button asChild><Link> */}
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <span className="text-sm font-medium text-foreground">
          {title}
        </span>
        {/* ...rest of content... */}
      </div>
      <span className="inline-flex items-center rounded-full border px-4 py-2 text-sm">
        Review
      </span>
    </div>
  </Link>
</li>
```

The "Review" button becomes a visual indicator (non-interactive span styled as a button) since the entire card is the link.

**Option B: Promote question cards to Pattern C (card-level onClick)**

Add `onClick`/`onKeyDown`/`tabIndex` to question card `<li>` elements, matching the session cards. This is more complex (needs click-guard logic) but preserves inner links as secondary click targets.

**Recommendation:** Option A. It's simpler, uses native `<a>` semantics (better accessibility), and aligns with the dashboard's existing Link-as-Card pattern. The session cards on the history page use Pattern C because they have two genuinely distinct actions (review + view breakdown); question cards have only one action (review).

### Fix 4: Apply same Link-as-Card pattern to session breakdown list (optional, P3)

Session breakdown items in `session-breakdown-list.tsx` also have a single action (review the question). They could be promoted from Pattern B to Pattern A for consistency.

Currently:
```tsx
<li className="flex items-center gap-2 text-sm text-muted-foreground">
  <Link href={...} className="flex items-center gap-2 font-medium text-foreground hover:underline">
    <span>{row.order}.</span>
    <span>{stemPreview}</span>
  </Link>
  {/* status badge */}
</li>
```

This is low-severity because the link already covers the primary content area. The status badge (Correct/Incorrect/Unanswered) sits outside the link, which is fine semantically.

**Recommendation:** Just add the focus ring (Fix 2) and leave the pattern as-is. The link covers enough of the visual area that the affordance is clear.

---

## Summary of All Changes

| # | File | Change | Severity |
|---|------|--------|----------|
| 1 | `app/(app)/app/dashboard/page.tsx` lines 61, 68, 77, 84, 95 | Remove `hover:border-border hover:bg-muted/50` from 5 stat/streak cards | P2 |
| 2 | `components/marketing/marketing-home.tsx` line 155 | Remove `transition-colors hover:bg-muted` from feature cards | P2 |
| 3 | `history-questions-tab.tsx` line 517 | Add `focus-visible` ring to question title link | P3 |
| 4 | `session-breakdown-list.tsx` line 34 | Add `focus-visible` ring to breakdown link | P3 |
| 5 | `bookmarks/page.tsx` line 96 | Add `focus-visible` ring to bookmark title link | P3 |
| 6 | `history-questions-tab.tsx` lines 511–552 | Convert question cards from Pattern B to Pattern A (Link-as-Card) | P1 |

**Total files touched:** 5
**Estimated complexity:** Low for fixes 1–5 (class string edits), moderate for fix 6 (restructure question card JSX).

## Verification

- [ ] Dashboard stat cards: hover produces no visual change
- [ ] Marketing feature cards: hover produces no visual change
- [ ] History questions tab: entire card is clickable, navigates to review
- [ ] History sessions tab: card-level click still works (no regression)
- [ ] Tab-key through history question cards shows visible focus ring
- [ ] Tab-key through session breakdown links shows visible focus ring
- [ ] Tab-key through bookmark title links shows visible focus ring
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test --run` passes
- [ ] `pnpm build` succeeds

## Related

- BS-031 (Card/Row Affordance Consistency — Interaction Pattern Audit)
- BS-020 (Card Contrast and Hover Consistency)
- SPEC-038 (History Page Hardening — introduced Pattern C for session cards)
