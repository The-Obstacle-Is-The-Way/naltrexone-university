# Dashboard Page

**Page:** `/app/dashboard`
**Source:** `app/(app)/app/dashboard/page.tsx`
**Last Updated:** 2026-03-08

---

## Page Structure

Top to bottom:

1. **Page heading** — "Dashboard" h1 + subtitle
2. **Stats grid** — 4 stat cards in a responsive row (`lg:grid-cols-4`)
3. **Streak + CTA row** — Current streak card + "Ready to practice?" CTA card (`lg:grid-cols-3`)
4. **Recent lists row** — "Recent sessions" + "Recent activity" side by side (`lg:grid-cols-2`)

---

## Component Inventory

| Element | Component / Pattern | Pattern Registry | Notes |
|---------|-------------------|-----------------|-------|
| Stat cards | `<Card>` (S-1) | S-1: Card Surface | Non-interactive, no hover |
| Streak card | `<Card>` (S-1) | S-1: Card Surface | Non-interactive |
| CTA card | `<Card>` (S-1) + `<Button>` | S-1 + standard Button | `lg:col-span-2` |
| Session container | `<Card>` (S-1) | S-1: Card Surface | Wraps list of interactive rows |
| Activity container | `<Card>` (S-1) | S-1: Card Surface | Wraps list of interactive/static rows |
| Session rows | `<Link>` with I-1 classes | I-1: Hoverable Row | Nested inside session container card |
| Activity rows | `<Link>` with I-1 classes | I-1: Hoverable Row | Nested inside activity container card |
| Unavailable activity | `<div>` with S-2 classes | S-2: Muted Row | Static nested row, no link — question deleted |
| Mode badges | Inline `<span>` with pill classes | — | `border-border/60`, `dark:border-foreground/40`, `text-muted-foreground` |
| Difficulty badges | Inline `<span>` with pill classes | — | Same border + text tokens as mode badges |
| Header action links | `<Button variant="link">` | L-5: Secondary Header Action | Uses `headerActionLinkClasses` |
| Error state | `<ErrorCard>` | — | Session history fetch failure |

---

## Surface Hierarchy

```
bg-background (Layer 0 — page)
  └─ <Card> bg-card (Layer 1 — stat / streak / CTA cards)         ← FLAT
  └─ <Card> bg-card (Layer 1 — session / activity containers)     ← NESTED
       └─ <Link> bg-muted/20 + border-border/60 (Layer 2 — rows) ← ROWS INSIDE CARD
```

**Known issues:** The top-half cards are flat (card IS the content). The bottom-half cards are containers (card WRAPS a list of individually-bordered rows). The inner row borders — strengthened to `dark:border-foreground/40` for WCAG compliance — are about **2.8x** stronger contrast than the outer card's `border-border`, creating an inverted visual hierarchy where children shout louder than the parent. The fix (DEBT-289) is to remove inner borders entirely and use tonal fill elevation (`bg-foreground/5`, borderless `rounded-xl` shapes) following Material Design 3's dark-theme overlay model, with `hover:bg-foreground/[0.08]` for a monotonic brightness ramp. Badge pills will also convert to borderless fill-only with `text-foreground/60` as a companion change. Also, the `lg:grid-cols-2` recent-lists row currently stretches both panels to equal height, which amplifies empty space in the shorter Recent sessions panel (`items-start` fix included in DEBT-289). See [DEBT-289](../../debt/debt-289-dashboard-nested-card-surface-strategy.md).

---

## Data Flow

- Server component (`DashboardPage`) fetches `getUserStats()` and `getSessionHistory({ limit: 3 })` in parallel
- Stats failure → full error state (heading + `<ErrorCard>` + practice CTA)
- Session history failure → partial error state (stats render, sessions show `<ErrorCard>`)
- `recentActivity` sliced to 8 rows client-side from the stats response
- `maxDuration = 30` (Vercel edge function timeout)

---

## Dark Mode Tokens

**Current state** (pre-DEBT-289) — rows use I-1 pattern dark mode overrides:
- Rest border: `dark:border-foreground/40` (~3.46:1 vs card) — **to be removed**
- Hover border: `dark:hover:border-foreground/70` — **to be removed**
- Rest fill: `bg-muted/20` (tinted Layer 2) — **to be replaced with `bg-foreground/5`**
- Hover fill: `hover:bg-muted/40` — **to be replaced with `hover:bg-foreground/[0.08]`** (fixes hover inversion)

**Target state** (post-DEBT-289) — borderless tonal fill elevation:
- No rest border — inner cards defined by fill shape only
- Rest fill: `bg-foreground/5` (~#1D1D1D, rgb(29) on card #121212, WCAG 1.11:1)
- Hover fill: `hover:bg-foreground/[0.08]` (~#242424, rgb(36) — same foreground scale, monotonic lift)
- Badge pills: borderless fill-only (`bg-foreground/[0.06] border-0 text-foreground/60`) — companion change

Mode/difficulty badge borders currently use `dark:border-foreground/40` and `text-muted-foreground` — will be converted to borderless fill-only (`bg-foreground/[0.06] border-0 text-foreground/60`) as a companion change in DEBT-289 so small badge text stays AA-compliant in dark mode.

---

## Related Documentation

- [Frontend Standards](../standards.md) — Design tokens, Card component standard
- [Pattern Registry](../pattern-registry.md) — S-1 (Card Surface), I-1 (Hoverable Row)
- [Contrast Policy](../contrast-policy.md) — WCAG AA targets
- [DEBT-289](../../debt/debt-289-dashboard-nested-card-surface-strategy.md) — Nested card visual strategy
