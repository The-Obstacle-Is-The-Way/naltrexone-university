# BUG-151: Card/Row Affordance Inconsistency — Misleading Hover, Missing Focus Rings, Pattern Asymmetry

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-23

---

## Description

A card/row interaction audit across Dashboard, History, Bookmarks, Practice summary, and Marketing surfaces reveals four categories of UX inconsistency:

1. **Non-interactive cards with hover affordance** — Cards change color on hover but don't do anything when clicked, misleading users into thinking they're interactive.
2. **Interactive links missing `focus-visible` ring** — Several card-internal links rely on default outline behavior instead of the app-standard 3px `focus-visible` ring, creating weak keyboard affordance.
3. **History sessions LI row focus ring status changed** — The interactive `<li>` now includes `focus-visible` classes and remains keyboard-focusable (`tabIndex={0}` when interactive). The inner `<Link>` still has `tabIndex={-1}`.
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
| 6 | History — sessions tab rows | `history-sessions-tab.tsx` | 179–285 | C | `hover:bg-accent/40` + `cursor-pointer` | **Present on LI row** (`focus-visible:ring-[3px]` at line 185; inner link has ring and `tabIndex={-1}`) | Yes (card-level onClick) | **Asymmetric with #7 (Pattern C vs Pattern B)** |
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

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx` lines 181–186

This change is already present in current code. The interactive `<li>` now receives focus-visible styling directly:

```tsx
className={cn(
  'rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors',
  isRowInteractive
    ? 'cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:hover:bg-foreground/10'
    : undefined,
)}
```

**File:** `app/(app)/app/history/components/history-questions-tab.tsx` line 517

> **Note:** This diff is superseded by Fix 3. If Fix 3 is implemented (Pattern A conversion), the inner title `<Link>` at line 517 is removed entirely — it becomes a `<span>` inside the outer `<Link>`. Only apply this diff if Fix 3 is deferred.

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

Current structure (lines 511–552):

```tsx
<li key={row.questionId}>
  <Card className="gap-0 rounded-2xl border-border p-4 shadow-sm">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <Link href={href} className="text-sm font-medium text-foreground hover:underline">
          {title}
        </Link>
        {shouldShowBodyText ? (
          <div className="text-sm text-muted-foreground" data-testid="history-question-preview">
            {bodyPreview}
          </div>
        ) : null}
        <QuestionMetadata row={row} middleLabel={row.difficulty} middleLabelClassName="capitalize" />
      </div>
      <Button asChild variant="outline" className="rounded-full">
        <Link href={href} aria-label={`Review question: ${title}`}>Review</Link>
      </Button>
    </div>
  </Card>
</li>
```

Target structure (Pattern A):

```tsx
<li key={row.questionId}>
  <Link
    href={href}
    className="block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
  >
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <span className="text-sm font-medium text-foreground">
          {title}
        </span>
        {shouldShowBodyText ? (
          <div className="text-sm text-muted-foreground" data-testid="history-question-preview">
            {bodyPreview}
          </div>
        ) : null}
        <QuestionMetadata row={row} middleLabel={row.difficulty} middleLabelClassName="capitalize" />
      </div>
      <span className="inline-flex items-center rounded-full border px-4 py-2 text-sm">
        Review
      </span>
    </div>
  </Link>
</li>
```

Key changes:
- `<Card>` replaced by outer `<Link>` with equivalent border/padding/shadow styling plus hover and focus ring
- Inner title `<Link>` (line 515) → `<span>` (no nested links)
- `<Button asChild><Link>` (lines 537–548) → non-interactive `<span>` styled as a badge (the whole card is the link now)
- `aria-label` on the Review button is no longer needed since the outer `<Link>` contains the full card content for screen readers

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
| 4 | `history-sessions-tab.tsx` lines 181–186 | `focus-visible` ring already present on focusable LI row (no code change needed) | Resolved |
| 5 | `history-questions-tab.tsx` line 517 | Add `focus-visible` ring to question title link *(superseded by row 8 — inner link removed by Pattern A conversion)* | P3 |
| 6 | `session-breakdown-list.tsx` line 34 | Add `focus-visible` ring to breakdown link | P3 |
| 7 | `bookmarks/page.tsx` line 96 | Add `focus-visible` ring to bookmark title link | P3 |
| 8 | `history-questions-tab.tsx` lines 511–552 | Convert question cards from Pattern B to Pattern A (Link-as-Card); keep session rows Pattern C | P1 |
| 9 | `components/theme-token-regression.test.tsx` lines 53–149 | Update token regression assertions to match chosen hover policy | P2 |

**Total files touched (expected):** 7–8
**Estimated complexity:** Low for fixes 1–7 and 9 (class string + test assertions), moderate for fix 8 (question card structure/interaction model).

## Note: Dark Mode Focus Ring Contrast

`app/globals.css` line 152 sets `--ring: 0 0% 40%` in dark mode. Combined with `ring-ring/50` (50% opacity), the effective ring color is a ~20% opacity gray on dark backgrounds (`--background: 0 0% 3.5%`). This may fail WCAG 3:1 contrast ratio for focus indicators. Consider increasing to `--ring: 0 0% 60%` or higher in dark mode. This is a separate concern from the missing rings documented above — tracked here as context but may warrant its own bug if accessibility audit confirms contrast failure.

## Verification

- [x] Dashboard stat cards: hover produces no visual change
- [x] Session summary stat cards: hover produces no visual change
- [x] Marketing feature cards: hover produces no visual change
- [x] History questions tab cards use Pattern A (Link-as-Card)
- [x] History sessions tab rows remain Pattern C (row navigation + breakdown toggle)
- [x] History sessions tab: card-level click still works (no regression)
- [x] History sessions tab: keyboard activation on LI still works (Enter/Space)
- [x] Tab-key through history session rows shows visible focus ring on LI
- [x] Tab-key through history question navigation target shows visible focus ring (outer card link after Fix 3, title link only if Fix 3 is deferred)
- [x] Tab-key through session breakdown links shows visible focus ring
- [x] Tab-key through bookmark title links shows visible focus ring
- [x] `components/theme-token-regression.test.tsx` expectations match the updated hover policy
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test --run` passes
- [x] `pnpm build` succeeds

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-23 | Use Pattern A (Link-as-Card) for history question cards; keep Pattern C for history session rows | Question cards are single-destination navigation; session rows are genuinely multi-action |

## Related

- BS-031 (Card/Row Affordance Consistency — Interaction Pattern Audit)
- BS-020 (Card Contrast and Hover Consistency)
- SPEC-038 (History Page Hardening — introduced Pattern C for session cards)
