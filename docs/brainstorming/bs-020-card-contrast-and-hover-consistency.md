# BS-020: Card Contrast and Hover Consistency — Landing Page vs App

**Date:** 2026-02-17
**Triggered by:** Visual audit — dashboard cards lose contrast on hover, blending into the page background; landing page cards don't have this problem
**Scope:** Background color layering, card hover effects, and visual consistency between the marketing site and the authenticated app
**Related:** [Design Principles](../frontend/design-principles.md), [DEBT-108](../_archive/debt/debt-108-hardcoded-zinc-colors-break-light-dark-toggle.md) (original semantic color cleanup)

---

## The Problem

The landing page and the authenticated app use different background colors. The Card component sits on top of both. In dark mode, this creates a **contrast inversion** — cards that look great on the landing page become nearly invisible on hover in the app.

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

## Open Questions

1. **Is the two-tone app background intentional?** The `bg-muted` body was introduced to visually separate the header from content. Was this a conscious design decision or inherited from a template? If intentional, Option B or C respects it. If incidental, Option A/D is simpler.

2. **Should stat cards even have hover effects?** The dashboard stat cards aren't clickable — they're display-only. The hover effect implies interactivity that doesn't exist. Should we remove hover from non-interactive cards entirely and only add it where there's a click action?

3. **Should we audit light mode too?** In light mode, `bg-background` (white) and `bg-muted` (96.1% light gray) and `bg-card` (white) have the same relative ordering issue, but the contrast differences are much smaller and may not be visible.

4. **Does the Chrome agent need to verify this?** The issue is clearly traceable in code (CSS variables → Tailwind classes → computed styles). But a Chrome agent could take before/after screenshots of the hover states on each page to create a visual record.

5. **What about the landing page impact stat cards?** They have no hover effect but sit on `bg-background`. They look fine. Should they gain hover for consistency with the feature cards below them?

6. **Scope: quick fix or design system pass?** Option A is one line. Option C is a design system change. What's the right scope for this moment?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-17 | Document created | Visual audit revealed card hover contrast loss on dashboard in dark mode |

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
