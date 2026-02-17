# BS-020: Card Contrast and Hover Consistency — Landing Page vs App

**Date:** 2026-02-17
**Triggered by:** Visual audit — dashboard cards lose contrast on hover, blending into the page background; landing page cards don't have this problem
**Scope:** Background color layering, card hover effects, and visual consistency between the marketing site and the authenticated app, with the landing visual system as the baseline reference
**Related:** [Design Principles](../frontend/design-principles.md), [DEBT-108](../_archive/debt/debt-108-hardcoded-zinc-colors-break-light-dark-toggle.md) (original semantic color cleanup)

---

## The Problem

The landing page and the authenticated app use different background colors. The Card component sits on top of both. In dark mode, this creates a **contrast inversion** — cards that look great on the landing page become nearly invisible on hover in the app.

## Alignment Intent (North-Star)

This investigation exists to support a single “unified front” outcome: after sign-in, the app should still feel like the same product users just saw on the landing page.

That does **not** require identical information architecture. It does require a shared visual surface model:

- Page background and card elevation should follow the same hierarchy logic
- Hover behavior should increase card separation, not erase it
- Dashboard-first impressions should preserve the same “clean, elegant” readability as landing

### The Color Stack (Dark Mode)

| Token | CSS Variable | HSL Lightness | Hex Approx | Used Where |
|-------|-------------|---------------|------------|------------|
| `--background` | `0 0% 3.5%` | **3.5%** | `#090909` | Landing page body, app header |
| `--card` | `0 0% 7%` | **7%** | `#121212` | Card base (both landing + app) |
| `--muted` | `0 0% 11%` | **11%** | `#1c1c1c` | App body background, hover targets |
| `--border` | `0 0% 15%` | **15%** | `#262626` | Card borders |

### How the Contrast Inverts

**Landing page** (body = `bg-background` at 3.5%):
```
Background ████ 3.5%   ← darkest
Card       ████ 7%     ← lighter than bg → card POPS OUT
Hover      ████ 11%    ← even lighter → good hover feedback
```
Cards are lighter than their surroundings. Hover makes them lighter still. Contrast is excellent.

**App pages** (body = `bg-muted` at 11%):
```
Background ████ 11%    ← lightest
Card       ████ 7%     ← darker than bg → card SINKS IN
Hover      ████ ~11%   ← matches bg → card DISAPPEARS
```
Cards are darker than their surroundings. On hover, `bg-muted/50` (11% at 50% opacity over 7% card) blends toward 11% — exactly the page background color. The card boundary vanishes.

### The Disappearing Card Bug

Dashboard stat cards use `hover:bg-muted/50`:
```tsx
// app/(app)/app/dashboard/page.tsx:61
<Card className="... transition-colors hover:border-border/80 hover:bg-muted/50">
```

`bg-muted/50` = `hsl(0 0% 11% / 0.5)`. This semi-transparent fill sits on a parent with `bg-muted` (11%). The card becomes nearly indistinguishable from the page. You can see this clearly in the screenshots — hover over "Total answered" and the card border fades while the background matches the page.

Landing page feature cards use `hover:bg-muted` (full opacity, no `/50`):
```tsx
// components/marketing/marketing-home.tsx:148
<Card className="transition-colors hover:bg-muted" ...>
```

This works because `bg-muted` (11%) over `bg-background` (3.5%) still has 7.5% lightness difference.

### Technical Note: `transition-colors` Interaction

Dashboard and session summary stat cards include `transition-colors` in their class list. This means dark-mode toggling *animates* the background-color change rather than snapping it. During the transition (~150ms default), the card passes through intermediate RGB values between the light and dark mode colors. This is not a user-facing bug — it's expected CSS transition behavior — but it has two implications:

1. **Automated color measurements are unreliable** unless CSS transitions are disabled before reading `getComputedStyle`. The Playwright E2E tests inject `transition: none !important` before toggling dark mode to get stable readings.
2. **The transition itself creates a brief visual artifact** during theme changes — the card briefly appears as a random mid-tone gray before settling to its final dark-mode color, reinforcing the sense that the card surface is unstable.

---

## Root Cause

The app layout was designed with `bg-muted` as the page background to create visual separation between the header (which uses `bg-background`) and the content area. This was a reasonable design choice — the darker header and slightly lighter content area create a subtle visual hierarchy.

```tsx
// app/(app)/app/layout.tsx:73
<div className="min-h-screen bg-muted">
```

```tsx
// components/marketing/marketing-layout.tsx:22
<div className="min-h-[100dvh] bg-background text-foreground">
```

The problem is that the Card component uses `bg-card` (7%), which is lighter than `bg-background` (3.5%) but darker than `bg-muted` (11%). The Card was implicitly designed to sit on top of `bg-background`, not `bg-muted`.

When DEBT-108 cleaned up hardcoded zinc colors and FE-022 standardized stat card hover to `hover:bg-muted/50`, nobody noticed the interaction between the card hover color and the page background color. Each change was correct in isolation; the combination creates the contrast problem.

---

## Full Card Audit

### Cards WITH hover effects

| Location | File:Line | Hover Classes | Works? |
|----------|-----------|---------------|--------|
| Dashboard stat cards (5) | `dashboard/page.tsx:61-95` | `hover:border-border/80 hover:bg-muted/50` | **No** — card disappears into `bg-muted` parent |
| Dashboard nested list items | `dashboard/page.tsx:147,220` | `bg-muted/20 hover:bg-muted/40` | Marginal — subtle but somewhat visible due to `border-border/60` |
| Session summary stat cards (4) | `session-summary-view.tsx:39-60` | `hover:border-border/80 hover:bg-muted/50` | **No** — same problem |
| Landing feature cards (4) | `marketing-home.tsx:148` | `hover:bg-muted` | **Yes** — full opacity on `bg-background` parent |
| Choice buttons | `choice-button.tsx:29` | `hover:bg-muted` | **Yes** — sits on card (7%), hover to muted (11%) = visible |
| Mobile nav links | `mobile-nav.tsx:75` | `hover:bg-muted` | OK — context-dependent |

### Cards WITHOUT hover effects

| Location | File | Notes |
|----------|------|-------|
| Landing impact stat cards (4) | `marketing-home.tsx:104-122` | Static — no interaction |
| Practice view info cards | `practice-view.tsx:179,203` | Loading/empty states — not interactive |
| Bookmarks page cards | `bookmarks/page.tsx:122,144` | Static containers |
| Billing card | `billing/page.tsx:65` | Static container |
| History question cards | `history-questions-tab.tsx` (many) | Static containers |
| Practice starter card | `practice-session-starter.tsx:108` | Static container |
| Exam review cards | `exam-review-view.tsx` (many) | Static containers |
| Question page info cards | `question-page-client.tsx:183,189` | Loading/empty states |
| Review question navigator | `review-question-navigator.tsx:39` | Static container |
| "Ready to practice?" CTA card | `dashboard/page.tsx:105` | Static — no hover |
| "Recent sessions" / "Recent activity" | `dashboard/page.tsx:123,173` | Static containers (inner items have hover) |

### Summary

- **9 cards** have the disappearing hover problem (all in app pages with `bg-muted` parent)
- **4 cards** have working hover (landing page + choice buttons on card parent)
- **~20+ cards** are static containers with no hover effect

---

## Additional Inconsistencies

### Inconsistency 1: Two Background Strategies

The app uses a two-tone approach (dark header `bg-background`, lighter body `bg-muted`) while the landing page is uniform (`bg-background` everywhere). The user sees this as a visual disconnect when transitioning between the two.

### Inconsistency 2: Hover Pattern Divergence

| Context | Hover Pattern |
|---------|--------------|
| Landing feature cards | `hover:bg-muted` (full opacity shift) |
| App stat cards | `hover:bg-muted/50` (half-opacity, blends away) |
| App list items | `hover:bg-muted/40` (40% opacity, barely visible) |
| Most app cards | No hover effect at all |

Three different hover strategies. No documented standard for which to use where.

### Inconsistency 3: Interactive Cards vs Static Cards

Some cards visually suggest interactivity (hover effects) while others don't, but the distinction isn't based on whether the card IS interactive. The "Ready to practice?" card with a button inside has no hover. The "Current streak" stat card with no click action has hover. The mental model for "this card responds to my mouse" is inconsistent.

### Inconsistency 4: Border Behavior on Hover

Dashboard stat cards use `hover:border-border/80` which actually makes the border MORE transparent on hover (going from `border` at 100% to 80%). Combined with the background disappearing, the card boundary almost completely vanishes. This is the opposite of what most hover effects do (emphasize, not diminish).

---

## Severity Assessment

| Issue | Severity | Who's Affected | How Often |
|-------|----------|----------------|-----------|
| Card disappearing on hover (dashboard) | **Medium** | Every user on every visit | Every session |
| Card disappearing on hover (session summary) | Low-Medium | Users completing sessions | End of every session |
| Background mismatch: landing vs app | Low | Users transitioning between marketing and app | First login, billing visits |
| Inconsistent hover patterns | Low | Design coherence / OCPD trigger | Ongoing |
| Interactive vs static card confusion | Low | All users | Ongoing |

The dashboard card hover is the most impactful — it's the first thing users see after login, and it feels broken.

---

## Proposed Design Direction

### Option A: Darken App Background to Match Landing

Change the app layout from `bg-muted` to `bg-background`:

```diff
// app/(app)/app/layout.tsx:73
- <div className="min-h-screen bg-muted">
+ <div className="min-h-screen bg-background">
```

**Pros:**
- Cards immediately regain correct contrast (lighter than background)
- Landing-to-app transition feels unified
- All existing `hover:bg-muted` effects work correctly
- Simplest fix — one line change

**Cons:**
- Loses the header/body visual separation that `bg-muted` provides
- App content area becomes fully black, which may feel heavy
- Header border becomes the only visual separation between header and content

### Option B: Keep Different Backgrounds, Fix Card Hover

Keep `bg-muted` as the app background but fix the hover effect to provide visible contrast:

```diff
// All stat cards in dashboard and session summary:
- hover:border-border/80 hover:bg-muted/50
+ hover:border-border hover:bg-card/80
```

Or use a new approach: make the card lighter on hover instead of trying to match muted:

```diff
- hover:border-border/80 hover:bg-muted/50
+ hover:border-border hover:brightness-110
```

**Pros:**
- Preserves the intentional two-tone header/body design
- Cards gain visible hover feedback
- No global layout change

**Cons:**
- Needs a new hover token/pattern that works on `bg-muted` parent
- Landing and app still use different hover strategies
- Doesn't unify the visual language

### Option C: Introduce an Elevated Card Surface

Add a new CSS variable `--card-elevated` that's lighter than `--card` but darker than `--muted`, specifically for interactive cards:

```css
.dark {
  --card: 0 0% 7%;
  --card-elevated: 0 0% 13%;  /* new */
}
```

Interactive cards use `hover:bg-[hsl(var(--card-elevated))]`. Static cards stay on `bg-card`.

**Pros:**
- Semantic distinction between interactive and static cards
- Works regardless of parent background
- Clean design system approach

**Cons:**
- Adds a new design token
- Requires updating every interactive card
- May be overengineering for a ~9-card fix

### Option D: Hybrid — Darken Background + Subtle Elevation

Use `bg-background` for the app body (like Option A) but add a subtle top shadow or border-top to the main content area to preserve the header/body separation:

```tsx
<main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
```

The max-width container already creates visual separation from the full-bleed header. The darker background just reinforces it.

**Pros:**
- One-line background fix
- Cards work correctly
- Landing-to-app feels unified
- Header border already provides separation

**Cons:**
- Slightly different visual feel from current app
- Need to verify all app pages still look good on darker background

---

## Impact Analysis: Option A Verified (Playwright + Source Audit)

A full audit of every app page, hover pattern, and `bg-muted/20` accent was conducted via Playwright E2E tests and source code inspection. The results confirm that **Option A is the recommended path** with minor follow-up cleanup.

### What Automatically Fixes (Zero Code Beyond the One-Line Change)

| Element | Current (on `bg-muted` 11%) | After (on `bg-background` 3.5%) |
|---------|----------------------------|--------------------------------|
| Card at rest (`bg-card` 7%) | **Darker** than page → sinks in | **Lighter** than page → pops out |
| Card hover (`bg-muted/50` → ~9%) | 9% vs 11% page = **2% gap → invisible** | 9% vs 3.5% page = **5.5% gap → visible** |
| Landing feature card hover (`hover:bg-muted`) | Already works (different page) | No change |
| Choice button hover (`hover:bg-muted`) | Already works (on `bg-card` parent) | No change |

### What Is Unaffected (Inside Cards, Not on Page Background)

| Element | Location | Parent | Why Safe |
|---------|----------|--------|----------|
| Dashboard list items (`bg-muted/20 hover:bg-muted/40`) | `dashboard/page.tsx:147,220` | `bg-card` (inside Card) | Sits on card, not page |
| Practice filter tags (`bg-muted/20`) | `practice-session-starter.tsx:221` | `bg-card` (inside Card) | Sits on card, not page |
| History question list items | `history-questions-tab.tsx` | `bg-card` (Card component) | Full Card, not opacity |

### What Gets Slightly More Visible (Improvement)

| Element | Current | After | Direction |
|---------|---------|-------|-----------|
| History session items (`bg-muted/20` on page) | 11% on 11% = **0% contrast** | ~5% on 3.5% = **~1.5% contrast** | Better (was invisible, now slightly visible) |
| History tab bar (`bg-muted/20` on page) | Same stacking issue | Improved | Better |

### What Still Needs Follow-Up Cleanup (Separate from Background Change)

These aren't blocking — the background change works without them — but they should be addressed for full consistency:

| Issue | Current | Recommended | Why |
|-------|---------|-------------|-----|
| Border fades on hover | `hover:border-border/80` (9 cards) | `hover:border-border` | Border should emphasize, not fade |
| Non-interactive cards have hover | Stat cards aren't clickable but have hover effects | Remove hover from display-only cards | Hover implies interactivity that doesn't exist |
| Three hover strategies | `/50`, `/40`, full opacity | Standardize to `hover:bg-muted` (full) where hover is appropriate | Now works everywhere on `bg-background` |

### Light Mode Impact (Minimal)

In light mode, `bg-background` (white, 100%) vs `bg-muted` (off-white, 96.1%) is a ~4% difference. The change makes the app body pure white instead of very slightly gray. The header already uses `bg-background`, so the two-tone distinction was barely visible in light mode anyway. Cards are also `bg-card` (white, 100%) — in light mode, card and background were already identical. No contrast regression.

### Affected App Pages (All Under `app/(app)/app/layout.tsx:73`)

Dashboard, Practice, Quick Practice, Session pages, History, Bookmarks, Billing, Question View — all inherit from the same layout root. All were reviewed. No page-specific breakage found.

---

## Recommended Direction

**Primary change:** Option A — `bg-muted` → `bg-background` in `app/(app)/app/layout.tsx:73`

**Follow-up cleanup (can be same PR or separate):**
1. Change `hover:border-border/80` → `hover:border-border` on all 9 stat cards
2. Evaluate removing hover from non-interactive stat cards (dashboard + session summary)
3. Consider standardizing remaining hover patterns to `hover:bg-muted` (full opacity)

**What we are moving away from:**
- Two-tone app body (`bg-muted` 11%) / header (`bg-background` 3.5%) that inverts the card elevation model
- Semi-transparent hover patterns (`bg-muted/50`, `bg-muted/40`) that blend toward the page background
- Border hover that fades instead of emphasizing (`border-border/80`)
- Visual disconnect between landing page and authenticated app

**What we are moving towards:**
- Unified `bg-background` surface matching the landing page's visual model
- Cards that float above their background (correct elevation hierarchy)
- Hover effects that lift cards up (increase contrast), not dissolve them
- Landing page visual quality as the north-star for all surfaces (per BS-021 policy)
- A single coherent dark-mode elevation stack: `background (3.5%) → card (7%) → muted (11%) → border (15%)`

---

## Open Questions

1. **Is the two-tone app background intentional?** The `bg-muted` body was introduced to visually separate the header from content. Was this a conscious design decision or inherited from a template? If intentional, Option B or C respects it. If incidental, Option A/D is simpler.

2. **Should stat cards even have hover effects?** The dashboard stat cards aren't clickable — they're display-only. The hover effect implies interactivity that doesn't exist. Should we remove hover from non-interactive cards entirely and only add it where there's a click action?

3. **Should we audit light mode too?** In light mode, `bg-background` (white) and `bg-muted` (96.1% light gray) and `bg-card` (white) have the same relative ordering issue, but the contrast differences are much smaller and may not be visible.

4. **Does the Chrome agent need to verify this?** *(Answered: Playwright E2E tests now verify this with measured lightness values — see `tests/e2e/bs-020-card-contrast-audit.spec.ts`. Tests confirm: dashboard card lightness (7%) < page bg lightness (11%) at rest, and hover lightness approaches page bg within <5% difference. Landing page cards confirmed to have >5% hover-to-page contrast. Stronger evidence than screenshots alone.)*

5. **What about the landing page impact stat cards?** They have no hover effect but sit on `bg-background`. They look fine. Should they gain hover for consistency with the feature cards below them?

6. **Scope: quick fix or design system pass?** Option A is one line. Option C is a design system change. What's the right scope for this moment?

---

## Success Criteria (Unified Visual Front)

1. In dark mode, primary cards on app surfaces are visibly elevated from the page background at rest and on hover.
2. Hover states on non-clickable cards do not imply false interactivity.
3. Landing → Dashboard transition preserves the same card-surface readability and visual rhythm.
4. The chosen background strategy is documented as explicit policy (not accidental drift).

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-17 | Document created | Visual audit revealed card hover contrast loss on dashboard in dark mode |
| 2026-02-17 | Landing aesthetic set as visual north-star for card surfaces | User-facing goal is a unified front where authenticated app screens preserve the same card elevation/readability quality seen on landing |
| 2026-02-17 | Playwright E2E audit completed | `tests/e2e/bs-020-card-contrast-audit.spec.ts` — 5 tests: CSS variable values verified, dashboard contrast inversion measured (card 7% < page 11%), disappearing hover confirmed (<5% diff), landing page good contrast confirmed (>5% diff), session summary source verified (4× identical `hover:bg-muted/50`), three hover strategies confirmed. Discovered `transition-colors` causes flaky computed-color reads during theme toggle |

---

## Verified Code Paths

| What | File | Lines | Current |
|------|------|-------|---------
| App layout background | `app/(app)/app/layout.tsx` | 73 | `bg-muted` (11% in dark) |
| Landing layout background | `components/marketing/marketing-layout.tsx` | 22 | `bg-background` (3.5% in dark) |
| Dark mode `--background` | `app/globals.css` | 130 | `0 0% 3.5%` |
| Dark mode `--card` | `app/globals.css` | 132 | `0 0% 7%` |
| Dark mode `--muted` | `app/globals.css` | 140 | `0 0% 11%` |
| Card component base | `components/ui/card.tsx` | 10 | `bg-card` (no hover) |
| Dashboard stat card hover | `app/(app)/app/dashboard/page.tsx` | 61 | `hover:bg-muted/50` |
| Session summary stat card hover | `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | 39 | `hover:bg-muted/50` |
| Landing feature card hover | `components/marketing/marketing-home.tsx` | 148 | `hover:bg-muted` |
| Landing impact stat cards | `components/marketing/marketing-home.tsx` | 104-122 | No hover |
| App header background | `app/(app)/app/layout.tsx` | 75 | `bg-background` (3.5% in dark) |

---

## Related Documentation

- [DEBT-108](../_archive/debt/debt-108-hardcoded-zinc-colors-break-light-dark-toggle.md) — Original semantic color cleanup that established current token values
- [Standards: Stat card hover](../frontend/standards.md) — Documents `hover:border-border/80 hover:bg-muted/50` as the standard (this standard may need updating)
- [E2E Audit Test](../../tests/e2e/bs-020-card-contrast-audit.spec.ts) — Playwright tests measuring contrast inversion, disappearing hover, and hover pattern divergence with computed lightness values
