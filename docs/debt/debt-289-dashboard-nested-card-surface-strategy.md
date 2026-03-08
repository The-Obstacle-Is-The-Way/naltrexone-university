# DEBT-289: Dashboard Nested Card Surface Strategy

**Priority:** P3
**Created:** 2026-03-08
**Status:** Brainstorming

---

## Problem

The dashboard page has a "bipolar" visual feel — two distinct surface strategies on the same page:

**Top half** (stat cards, streak, CTA):
- Flat `<Card>` components sitting directly on `bg-background`
- Card IS the content — no nesting
- Clean, simple visual hierarchy: `bg-background` → `bg-card` (2 layers)

**Bottom half** (Recent sessions, Recent activity):
- `<Card>` containers wrapping lists of individually-bordered interactive rows
- Card is a WRAPPER — the rows are the content
- Triple visual hierarchy: `bg-background` → `bg-card` → `bg-muted/20` + `border-border/60` (3 layers)

The bottom half creates card-in-card nesting: each row has its own `rounded-xl border` treatment inside an already-bordered `rounded-2xl border` card. The result is visual noise — borders within borders, two levels of rounded corners, and a fundamentally different visual rhythm from the clean flat cards above.

### Why this matters

This is the first page in the app where container cards hold individually-bordered items. The pattern also appears in the History tab (session list, question list), making this a systemic decision, not a one-off dashboard fix. Whatever we decide here becomes the canonical nested-list treatment across the app.

---

## Current Implementation

**File:** `app/(app)/app/dashboard/page.tsx`

### Top half — flat cards (lines 58-118)

```tsx
<Card className="gap-0 rounded-2xl p-6 shadow-sm">
  <div className="text-sm text-muted-foreground">Total answered</div>
  <div className="mt-2 text-3xl font-bold font-display text-foreground">140</div>
</Card>
```

Surface: `bg-card` + `border` on `bg-background`. No children with their own borders.

### Bottom half — container cards with nested rows (lines 120-253)

```tsx
<Card className="gap-0 rounded-2xl p-6 shadow-sm">
  <div>Recent sessions</div>
  <ul className="mt-4 space-y-2">
    <li>
      <Link className="block rounded-xl border border-border/60 bg-muted/20 p-3
        transition-colors hover:bg-muted/40
        dark:border-foreground/40 dark:hover:border-foreground/70">
        {/* row content */}
      </Link>
    </li>
  </ul>
</Card>
```

Surface: `bg-card` + `border` on `bg-background`, then inside: `bg-muted/20` + `border-border/60` rows. Two levels of bordered containers.

---

## Design Reference: How the Best Do It

Modern dashboards (Linear, Notion, Stripe, Apple) consistently avoid double-bordered nesting:

| Product | Stats/metrics | List sections | Nesting strategy |
|---------|--------------|---------------|-----------------|
| Linear | Flat cards | Flush rows, no container card | No nesting |
| Notion | Flat cards | Section heading + flat list | No nesting |
| Stripe | Flat cards | Flat table/list rows | No nesting |
| Apple (Settings) | — | Grouped container with hairline dividers (no individual row borders) | Flush dividers |
| GitHub | Flat cards | Container card with borderless rows, divider lines | Flush dividers |

The pattern: **list containers either don't exist (items sit on the page background) or their items don't have individual borders (separated by hairlines/spacing instead).**

---

## Options

### Option A: Containerless Sections (Rows on Page Background)

Remove the `<Card>` wrapper from list sections. The heading + rows sit directly on `bg-background`. Rows become first-class cards.

```
bg-background
  ├─ [Stat Card] bg-card + border                    ← flat card
  ├─ [Streak Card] bg-card + border                  ← flat card
  ├─ "Recent sessions" heading + "View all" link      ← plain text
  ├─ [Session Row] bg-card + border, rounded-2xl      ← row IS a card
  ├─ [Session Row] bg-card + border, rounded-2xl      ← row IS a card
  └─ [Session Row] bg-card + border, rounded-2xl      ← row IS a card
```

**Visual:** Every element on the page is a flat card or plain text. No nesting. Uniform visual rhythm.

**Pros:**
- Eliminates nesting entirely
- Rows and stat cards share the same visual treatment — unified page
- Simplest possible surface hierarchy (always 2 layers)
- Rows naturally use `bg-card` (Layer 1) which is the correct interactive card surface

**Cons:**
- Section heading + "View all" link float without a container — may feel less organized
- The two-column layout (`lg:grid-cols-2`) that groups sessions and activity side-by-side loses its visual separation
- Empty states ("No completed sessions yet.") need different treatment without a container

**WCAG impact:** None — removing a container doesn't affect contrast compliance.

---

### Option B: Flush Dividers (Keep Container, Remove Row Borders)

Keep the `<Card>` wrapper but remove borders and rounded corners from rows. Rows blend flush into the card surface, separated by spacing or hairline dividers.

```
┌─Card (bg-card, border, rounded-2xl)──────────┐
│ Recent sessions                    View all   │
│                                               │
│ [Tutor] Mar 7, 2026                          │
│ 0/5 correct (0%)                             │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│ [Tutor] Mar 6, 2026                          │
│ 0/20 correct (0%)                            │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│ [Exam] Mar 4, 2026                           │
│ 2/5 correct (40%)                            │
└───────────────────────────────────────────────┘
```

**Implementation:**
- Row classes: remove `rounded-xl border border-border/60 bg-muted/20` and `dark:border-foreground/40`
- Add dividers: `divide-y divide-border/40` on the `<ul>`, or `border-t border-border/40` on each `<li>` except first
- Hover: `hover:bg-muted/40` still works (no border needed for hover)
- Padding: `py-3 px-0` (or `py-3 -mx-2 px-2 rounded-lg` for hover radius)

**Pros:**
- The container card groups content visually (section heading, "View all" link, items all feel related)
- No double borders — only the outer card has a border
- Clean list-in-card feel (similar to GitHub, email clients, task managers)
- Hover state provides the interactive affordance without needing a rest-state border

**Cons:**
- Rows lose their individual rounded-xl "card" feel — becomes more of a table/list
- Hover-only boundaries may not meet SC 1.4.11 if the row border was the "required boundary" — but the row text, mode badge, and hover state collectively identify the interactive element
- Need to verify focus-visible ring still looks good without the row border

**WCAG consideration:** The row border at `dark:border-foreground/40` currently serves as a required boundary (SC 1.4.11) for identifying the interactive element. If we remove it, the interactive nature must be communicated by other means: hover fill change, cursor pointer, underline-on-hover, or the text itself being clearly a link. The `<Link>` element's focus-visible ring already handles the focus state.

---

### Option C: Subtle Container (Borderless Outer Card)

Keep the `<Card>` structure but remove the outer card's border. The `bg-card` fill provides the slight surface elevation, but the outer border disappears. Rows keep their individual borders.

```
bg-background
  ├─ [Stat Card] bg-card + border                    ← flat card (has border)
  └─ bg-card (NO border, NO shadow)                  ← section container
       ├─ "Recent sessions" heading
       └─ [Row] bg-muted/20 + border-border/60       ← row has border
```

**Pros:**
- Removes one layer of borders (outer card border gone)
- Rows are still clearly individual interactive elements

**Cons:**
- Stat cards have borders but list containers don't — another inconsistency
- `bg-card` fill still creates a visible boundary in dark mode (#121212 vs #090909)
- Doesn't fundamentally solve the nesting problem — just hides one border

**Assessment:** This is the least effective option. It creates a new inconsistency (some cards have borders, some don't) without fully resolving the visual discord.

---

### Option D: Hybrid — Containerless on Large Screens, Container on Small

On `lg:` screens where sessions and activity are side-by-side, remove the container cards and let rows be standalone. On small screens where they stack, keep the container for grouping.

**Assessment:** Adds responsive complexity for a visual nuance. Not worth the engineering cost. Ruled out.

---

### Option E: Reduce Row Visual Weight (Keep Structure, Soften Rows)

Keep the current structure but make the rows less visually assertive: remove row borders, keep only the tinted fill. Rows are identified by `bg-muted/20` fill against the `bg-card` surface, with `hover:bg-muted/40` for interaction.

```
┌─Card (bg-card, border, rounded-2xl)──────────┐
│ Recent sessions                    View all   │
│                                               │
│ ┌─ bg-muted/20 (no border) ──────────────┐   │
│ │ [Tutor] Mar 7, 2026                    │   │
│ │ 0/5 correct (0%)                       │   │
│ └────────────────────────────────────────┘   │
│                                               │
│ ┌─ bg-muted/20 (no border) ──────────────┐   │
│ │ [Tutor] Mar 6, 2026                    │   │
│ │ 0/20 correct (0%)                      │   │
│ └────────────────────────────────────────┘   │
└───────────────────────────────────────────────┘
```

**Pros:**
- Rows are still visually grouped and individually identifiable via fill
- One less border layer — only the outer card has a border
- `rounded-xl` radius on the fill creates a soft, modern look
- Hover state adds `bg-muted/40` — visible and satisfying

**Cons:**
- `bg-muted/20` against `bg-card` is very subtle in dark mode (~1.1:1). Rows may feel invisible at rest.
- SC 1.4.11: the fill alone may not meet 3:1 as a required boundary. The fill contrast is decorative-level.
- Loses the crisp "this is a clickable thing" signal the border provides

**WCAG consideration:** Same as Option B — if the row border was a required boundary, removing it requires other cues to identify the interactive element.

---

## Initial Assessment

**Option A (Containerless)** and **Option B (Flush Dividers)** are the two strongest candidates:

- **Option A** produces the cleanest result and eliminates the problem entirely, but the section heading + "View all" link need thoughtful styling without a container.
- **Option B** preserves the container grouping (which works well for the "Recent sessions" heading + "View all" pattern) while eliminating the double-border visual.

**Option C** is a half-measure. **Option D** is over-engineered. **Option E** works aesthetically but has WCAG risk.

---

## Implications Beyond Dashboard

The same nested-card pattern appears in:

| Page | Container | Items |
|------|-----------|-------|
| Dashboard | Recent sessions card, Recent activity card | Session rows, activity rows |
| History (sessions tab) | Sessions list area | Session rows with expandable breakdown |
| History (questions tab) | Questions list area | Question rows |
| Bookmarks page | Bookmarks list area | Bookmark rows |

Whatever we decide for the dashboard should be applied consistently across all list-in-card contexts. This is a systemic pattern, not a per-page decision.

---

## Open Questions

1. **Is the row border a "required boundary" under SC 1.4.11?** If yes, Options B and E need a compensating mechanism. The row's text content, cursor change, hover fill, and focus ring may collectively suffice — but this needs validation.

2. **Does the "View all" header action pattern work without a container?** Option A needs a way to visually associate the "View all" link with its section heading when there's no enclosing card.

3. **Should stat cards also lose their borders for consistency?** If list sections go containerless (Option A), should the stat cards match? Or is the distinction between "content cards" and "list sections" a deliberate and useful visual hierarchy?

---

## Scope

- **Production code:** `app/(app)/app/dashboard/page.tsx` (primary), plus any pages sharing the nested-card pattern
- **Pattern Registry update:** New entry or modification to S-1 for container-style cards and/or I-1 for borderless rows
- **Test updates:** `app/(app)/app/dashboard/page.test.tsx` for class-based assertions affected by border/fill changes
- **No new files** — this modifies existing patterns
