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
| Mode badges | Inline `<span>` with pill classes | — | `border-border/60`, `dark:border-foreground/40` |
| Difficulty badges | Inline `<span>` with pill classes | — | Same border tokens as mode badges |
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

**Known issues:** The top-half cards are flat (card IS the content). The bottom-half cards are containers (card WRAPS a list of individually-bordered rows). This creates a visual inconsistency local to the dashboard. Adjacent pages use cleaner but different patterns: History sessions uses bordered rows directly on the page background, while History questions and Bookmarks use standalone cards per item. Also, the `lg:grid-cols-2` recent-lists row currently stretches both panels to equal height, which amplifies empty space in the shorter Recent sessions panel. See [DEBT-289](../../debt/debt-289-dashboard-nested-card-surface-strategy.md).

---

## Data Flow

- Server component (`DashboardPage`) fetches `getUserStats()` and `getSessionHistory({ limit: 3 })` in parallel
- Stats failure → full error state (heading + `<ErrorCard>` + practice CTA)
- Session history failure → partial error state (stats render, sessions show `<ErrorCard>`)
- `recentActivity` sliced to 8 rows client-side from the stats response
- `maxDuration = 30` (Vercel edge function timeout)

---

## Dark Mode Tokens

Rows use the I-1 pattern dark mode overrides:
- Rest border: `dark:border-foreground/40` (~3.46:1 vs card)
- Hover border: `dark:hover:border-foreground/70`
- Rest fill: `bg-muted/20` (tinted Layer 2)
- Hover fill: `hover:bg-muted/40`

Mode/difficulty badge borders also use `dark:border-foreground/40`.

---

## Related Documentation

- [Frontend Standards](../standards.md) — Design tokens, Card component standard
- [Pattern Registry](../pattern-registry.md) — S-1 (Card Surface), I-1 (Hoverable Row)
- [Contrast Policy](../contrast-policy.md) — WCAG AA targets
- [DEBT-289](../../debt/debt-289-dashboard-nested-card-surface-strategy.md) — Nested card visual strategy
