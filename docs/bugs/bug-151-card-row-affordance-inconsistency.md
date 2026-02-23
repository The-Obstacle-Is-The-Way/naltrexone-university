# BUG-151: Card/Row Affordance Inconsistency — Misleading Hover, Missing Focus Rings, Pattern Asymmetry

**Status:** Open
**Priority:** P2
**Date:** 2026-02-23

---

## Description

A card/row interaction audit across Dashboard, History, Bookmarks, Practice summary, and Marketing surfaces reveals four categories of UX inconsistency:

1. **Non-interactive cards with hover affordance** — Cards change color on hover but don't do anything when clicked, misleading users into thinking they're interactive.
2. **Interactive links missing `focus-visible` ring** — Several card-internal links rely on default outline behavior instead of the app-standard 3px `focus-visible` ring, creating weak keyboard affordance.
3. **History sessions LI row missing focus ring** — The `<li>` has `tabIndex={0}` and `role="link"` but no `focus-visible` classes. The inner `<Link>` has `tabIndex={-1}`, so the keyboard-focusable container is visually under-indicated.
4. **Pattern asymmetry on the same page** — History sessions tab uses card-level `onClick` (Pattern C), while the questions tab uses inner-target links (Pattern B). Users switch tabs and the interaction model changes. **Decision:** promote question cards to Pattern A (Link-as-Card) while keeping sessions as Pattern C.

## Codebase-Wide Audit Results

### All Card/Row Surfaces

| # | Surface | File | Lines | Pattern | Hover | Focus Ring | Clickable? | Issue |
|---|---------|------|-------|---------|-------|------------|------------|-------|
| 1 | Dashboard — stat cards (×4) | `app/(app)/app/dashboard/page.tsx` | 61–91 | D | `hover:border-border hover:bg-muted/50` | None | No | **Misleading hover** |
| 2 | Dashboard — streak card | `app/(app)/app/dashboard/page.tsx` | 95–103 | D | `hover:border-border hover:bg-muted/50` | None | No | **Misleading hover** |
| 3 | Dashboard — recent sessions | `app/(app)/app/dashboard/page.tsx` | 145–172 | A | `hover:bg-muted/40` | `focus-visible:ring-[3px]` | Yes (Link-as-Card) | OK |
| 4 | Dashboard — recent activity | `app/(app)/app/dashboard/page.tsx` | 220–241 | A | `hover:bg-muted/40` | `focus-visible:ring-[3px]` | Yes (Link-as-Card) | OK |
| 5 | Practice session summary — stat cards (×4) | `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | 40–66 | D | `hover:border-border hover:bg-muted/50` | None | No | **Misleading hover** |
| 6 | History — sessions tab rows | `history-sessions-tab.tsx` | 179–283 | C | `hover:bg-accent/40` + `cursor-pointer` | **Missing on LI row** (inner link has ring but `tabIndex={-1}`) | Yes (card-level onClick) | **Missing focus ring on focusable LI + asymmetric with #7** |
| 7 | History — questions tab cards | `history-questions-tab.tsx` | 511–552 | B | None (card); `hover:underline` (link) | **Missing** on title link (line 517) | Inner targets only | **Missing focus ring + asymmetry with #6** |
| 8 | History — session breakdown links | `session-breakdown-list.tsx` | 27–38 | B | `hover:underline` (link) | **Missing** on link (line 34) | Inner target only | **Missing focus ring** |
| 9 | Bookmarks — bookmark cards | `app/(app)/app/bookmarks/page.tsx` | 84–197 | B | None (card); `hover:underline` (link line 96) | **Missing** on title link (line 96) | Inner targets (link + buttons) | **Missing focus ring** |
| 10 | Marketing — feature cards (×4) | `components/marketing/marketing-home.tsx` | 152–169 | D | `hover:bg-muted` | None | No | **Misleading hover** |
| 11 | Marketing — impact stat cards | `components/marketing/marketing-home.tsx` | 107–124 | D | None | None | No | OK (no misleading affordance) |
| 12 | Marketing — pricing cards | `components/marketing/marketing-home.tsx` | 190–238 | D | None | None | No (buttons inside) | OK |
| 13 | Pricing — pricing cards | `app/pricing/pricing-view.tsx` | 126–178 | D | None | None | No (form/buttons inside) | OK |
| 14 | Practice — incomplete session card | `practice/components/incomplete-session-card.tsx` | 29–82 | B | None | N/A (button handles focus) | Inner button only | OK |
| 15 | Practice — session starter | `practice/components/practice-session-starter.tsx` | 100–272 | B | None | N/A (button handles focus) | Inner button only | OK |

### Pattern Legend

- **Pattern A:** Link-as-Card — entire card is a `<Link>`, best semantics
- **Pattern B:** Card with inner targets — display card, links/buttons inside
- **Pattern C:** Card with card-level onClick — `<li>` with `onClick`/`onKeyDown`/`tabIndex`
- **Pattern D:** Non-interactive display card

---

## Fix Plan

### Fix 1: Remove misleading hover from non-interactive cards (P2)

**5 cards in dashboard + 4 cards in session summary + 4 feature cards on landing page.**

**File:** `app/(app)/app/dashboard/page.tsx`

Lines 61, 68, 77, 84, 95 — remove `transition-colors hover:border-border hover:bg-muted/50` from each stat/streak `<Card>`.

```diff
- <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border hover:bg-muted/50">
+ <Card className="gap-0 rounded-2xl p-6 shadow-sm">
```

Apply to all 5 stat/streak cards (lines 61, 68, 77, 84, 95).

**File:** `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

Lines 40, 47, 54, 61 — remove `transition-colors hover:border-border hover:bg-muted/50` from all four summary stat cards.

```diff
- <Card className="gap-0 rounded-2xl p-6 shadow-sm transition-colors hover:border-border hover:bg-muted/50">
+ <Card className="gap-0 rounded-2xl p-6 shadow-sm">
```

**File:** `components/marketing/marketing-home.tsx`

Line 155 — remove `transition-colors hover:bg-muted` from feature cards.

```diff
- className={cn(
-   'transition-colors hover:bg-muted',
-   feature.wide && 'md:col-span-2',
- )}
+ className={cn(feature.wide && 'md:col-span-2')}
```

### Fix 2: Add `focus-visible` ring to all interactive card links and focusable rows (P2)

**Consistent ring class:** `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`

This matches the existing pattern used on dashboard Link-as-Card elements.

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx` lines 183–186

The `<li>` row is already keyboard-focusable (`tabIndex={0}`, `role="link"`) and already handles keyboard activation (`onKeyDown` for Enter/Space), but it has no focus-visible classes. The inner `<Link>` has `tabIndex={-1}`, so it's the LI that receives focus and needs explicit ring treatment.

```diff
  className={cn(
-   'rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-accent/40 dark:hover:bg-foreground/10',
+   'rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-accent/40 dark:hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]',
    isRowInteractive ? 'cursor-pointer' : undefined,
  )}
```

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

### Fix 3: Adopt Pattern A for history question cards (P1, decision locked)

**Problem:** Sessions tab uses Pattern C (card-level onClick), questions tab uses Pattern B (inner targets only). Users switching tabs encounter different interaction models on the same page.

**Decision:** History question cards move from Pattern B to **Pattern A (Link-as-Card)**. History session cards stay **Pattern C** because they have two distinct actions (row navigation + breakdown toggle).

Convert history question cards from Pattern B to Pattern A by wrapping the entire card in a `<Link>`. The card has one primary action (review question), so Link-as-Card is the simplest semantic model.

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

**Rejected alternative:** Pattern C for question cards (`onClick`/`onKeyDown`/`tabIndex`) was considered and rejected because question cards have a single navigation destination and do not need click-guard complexity.

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

### Optional Follow-Up: Sessions Row Full-Target Alternative (P3)

Instead of LI-level click handling (Pattern C), a "stretched-link" implementation could make the existing inner `<Link>` fill the row click area while preserving the separate breakdown button. This can reduce JS click-guard complexity but introduces layout/z-index coordination and must preserve button accessibility. Keep this as an optional refactor; it is not required to resolve BUG-151.

### Optional Follow-Up: Bookmarks Navigation Target Simplification (P3)

Bookmarks currently render both a title link and a "Review" button that resolve to the same destination, plus a distinct "Remove" action. The card cannot be naively wrapped in a single link because of the destructive secondary action. Optional simplification:

1. Keep a single primary navigation target.
2. Keep "Remove" as the distinct secondary action.
3. If row-level click is desired, use guarded container activation and preserve explicit focus affordance.

---

## Summary of All Changes

| # | File | Change | Severity |
|---|------|--------|----------|
| 1 | `app/(app)/app/dashboard/page.tsx` lines 61, 68, 77, 84, 95 | Remove `hover:border-border hover:bg-muted/50` from 5 stat/streak cards | P2 |
| 2 | `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` lines 40, 47, 54, 61 | Remove `hover:border-border hover:bg-muted/50` from 4 non-interactive summary cards | P2 |
| 3 | `components/marketing/marketing-home.tsx` line 155 | Remove `transition-colors hover:bg-muted` from feature cards | P2 |
| 4 | `history-sessions-tab.tsx` lines 183–186 | Add `focus-visible` ring to focusable LI row | P2 |
| 5 | `history-questions-tab.tsx` line 517 | Add `focus-visible` ring to question title link | P3 |
| 6 | `session-breakdown-list.tsx` line 34 | Add `focus-visible` ring to breakdown link | P3 |
| 7 | `bookmarks/page.tsx` line 96 | Add `focus-visible` ring to bookmark title link | P3 |
| 8 | `history-questions-tab.tsx` lines 511–552 | Convert question cards from Pattern B to Pattern A (Link-as-Card); keep session rows Pattern C | P1 |
| 9 | `components/theme-token-regression.test.tsx` lines 53–149 | Update token regression assertions to match chosen hover policy | P2 |

**Total files touched (expected):** 8–9
**Estimated complexity:** Low for fixes 1–7 and 9 (class string + test assertions), moderate for fix 8 (question card structure/interaction model).

## Note: Dark Mode Focus Ring Contrast

`app/globals.css` line 152 sets `--ring: 0 0% 40%` in dark mode. Combined with `ring-ring/50` (50% opacity), the effective ring color is a ~20% opacity gray on dark backgrounds (`--background: 0 0% 3.5%`). This may fail WCAG 3:1 contrast ratio for focus indicators. Consider increasing to `--ring: 0 0% 60%` or higher in dark mode. This is a separate concern from the missing rings documented above — tracked here as context but may warrant its own bug if accessibility audit confirms contrast failure.

## Verification

- [ ] Dashboard stat cards: hover produces no visual change
- [ ] Session summary stat cards: hover produces no visual change
- [ ] Marketing feature cards: hover produces no visual change
- [ ] History questions tab cards use Pattern A (Link-as-Card)
- [ ] History sessions tab rows remain Pattern C (row navigation + breakdown toggle)
- [ ] History sessions tab: card-level click still works (no regression)
- [ ] History sessions tab: keyboard activation on LI still works (Enter/Space)
- [ ] Tab-key through history session rows shows visible focus ring on LI
- [ ] Tab-key through history question title links shows visible focus ring
- [ ] Tab-key through session breakdown links shows visible focus ring
- [ ] Tab-key through bookmark title links shows visible focus ring
- [ ] `components/theme-token-regression.test.tsx` expectations match the updated hover policy
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test --run` passes
- [ ] `pnpm build` succeeds

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-23 | Use Pattern A (Link-as-Card) for history question cards; keep Pattern C for history session rows | Question cards are single-destination navigation; session rows are genuinely multi-action |

## Related

- BS-031 (Card/Row Affordance Consistency — Interaction Pattern Audit)
- BS-020 (Card Contrast and Hover Consistency)
- SPEC-038 (History Page Hardening — introduced Pattern C for session cards)
