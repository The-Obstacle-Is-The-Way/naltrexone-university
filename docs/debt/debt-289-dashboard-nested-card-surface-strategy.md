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

This is the first page in the app where a bordered `<Card>` container holds a list of individually-bordered rows. That exact wrapper-plus-row pattern does **not** currently appear in Bookmarks or the History questions tab:

- `app/(app)/app/history/components/history-sessions-tab.tsx` uses similar `rounded-xl border border-border/60 bg-muted/20 p-3` rows, but they sit directly on `bg-background` with **no outer Card wrapper**
- `app/(app)/app/history/components/history-questions-tab.tsx` uses standalone `rounded-2xl border border-border p-4 shadow-sm` rows on the page background
- `app/(app)/app/bookmarks/page.tsx` uses one `<Card>` per bookmark item, not a Card wrapping nested bordered rows

So this is primarily a **dashboard-local surface hierarchy problem** with implications for future pattern standardization, not a guaranteed app-wide migration in one shot.

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

Surface: `bg-card` + `border` on `bg-background`, then inside: `bg-muted/20` + `border-border/60` rows. Two levels of bordered containers. Interactive rows add `dark:border-foreground/40 dark:hover:border-foreground/70`; the unavailable activity row at lines 207-220 is the same nested treatment without hover.

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

Remove the `<Card>` wrapper from list sections. The heading + rows sit directly on `bg-background`. Rows become first-class standalone cards.

```
bg-background
  ├─ [Stat Card] bg-card + border                    ← flat card
  ├─ [Streak Card] bg-card + border                  ← flat card
  ├─ "Recent sessions" heading + "View all" link      ← plain text
  ├─ [Session Row] bg-card + border, rounded-2xl      ← row IS a card
  ├─ [Session Row] bg-card + border, rounded-2xl      ← row IS a card
  └─ [Session Row] bg-card + border, rounded-2xl      ← row IS a card
```

**Visual:** Every element on the page is either plain text or a first-class card on the page background. No nesting. Uniform visual rhythm.

**Pros:**
- Eliminates nesting entirely
- Rows and stat cards share the same visual treatment — unified page
- Simplest possible surface hierarchy (always 2 layers)
- Rows can use the existing standalone-row/card treatment already present elsewhere in the app:
  - interactive rows: `block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`
  - non-interactive unavailable rows: `rounded-2xl border border-border p-4 shadow-sm`

**Cons:**
- Section heading + "View all" link float without a container — may feel less organized
- The two-column layout (`lg:grid-cols-2`) that groups sessions and activity side-by-side loses its visual separation
- Empty states ("No completed sessions yet.") need different treatment without a container

**WCAG impact:** Lowest risk. The row keeps its own full card boundary on `bg-background`, so there is no need to argue that a divider or tinted fill is sufficient identification by itself.

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
- Rows lose their individual card feel — becomes more of a grouped list/table treatment
- Divider contrast must do more work in dark mode if the divider becomes the only visible rest-state row separator
- Need to verify focus-visible ring still looks good without the row border

**WCAG consideration:** The current row border at `dark:border-foreground/40` is the clearest required boundary. If we remove it, we should assume the replacement divider/separator becomes the required boundary and therefore must itself stay visible enough, especially in dark mode. Hover fill and focus ring help, but they do not fully solve the rest-state identification question on their own.

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

**WCAG consideration:** Higher risk than Option B because the proposal removes both the crisp row border and any stronger separator. `bg-muted/20` is too subtle against `bg-card` to be trusted as the primary identifying boundary.

---

## Evaluation

### Steve Jobs minimalism

- **Strongest:** Option B
- **Runner-up:** Option A

Option B removes the loudest part of the discord — row boxes inside card boxes — while preserving clean grouping. After the browser audit, the important nuance is that the dashboard bottom half is not just a list; it is two side-by-side summary panels with their own headings and actions. Option A is still visually pure, but on this specific page it risks making the headings and rows feel less anchored as groups.

### WCAG AA compliance

- **Safest:** Option A
- **Potentially acceptable with care:** Option B
- **Riskiest:** Option E

Option A preserves explicit row boundaries on the page background. Option B can be made accessible, but only if the replacement separators/dividers are treated as real boundaries rather than decorative hairlines. Option E asks a near-invisible tinted fill to do too much.

### Information density

- **Best balance:** Option B
- **Close second:** Option A

Option B packs the most rows into the least visual space because it removes duplicate row chrome while keeping a stable group container. Option A is still workable, but it spends more visual space per row and asks the page structure to do more grouping work on desktop.

### Consistency across the app

- **Best reusable nested-list pattern:** Option B
- **Best alignment with some existing standalone pages:** Option A

Option A moves the dashboard closer to the app's existing standalone-item patterns:
- History questions already use standalone bordered rows on the page background
- Bookmarks already use one card per item

But Option A does not actually define a reusable answer to the real design question here: how a grouped list should look when a container card is warranted. Option B does. History sessions is adjacent but not identical: it uses muted bordered rows directly on the page background with no wrapper. That is still closer to Option A than to the dashboard's current nested-card treatment.

### Implementation simplicity

- **Least code churn:** Option B
- **Simplest long-term dashboard fix:** Option B

Option B is the most surgical change and reads as the better dashboard-specific answer once grouping, `View all` anchoring, and the two-column layout are accounted for. Option A requires more JSX restructuring and then further tuning to recover the same sense of grouped sections.

### Bottom line

- **Option B** is the best overall dashboard solution.
- **Option A** remains the cleanest pure flattening strategy, but it is now the runner-up rather than the default recommendation.
- **Options C, D, and E** should be rejected.

---

## Verified Scope

| File | Current pattern | Relationship to DEBT-289 |
|------|-----------------|--------------------------|
| `app/(app)/app/dashboard/page.tsx` | `<Card>` wrapper around bordered rows | **Direct target** |
| `app/(app)/app/dashboard/page.test.tsx` | Dashboard structure assertions | **Direct test impact** |
| `app/(app)/app/history/components/history-sessions-tab.tsx` | Bordered muted rows on page background, no wrapper card | Adjacent reference pattern |
| `app/(app)/app/history/components/history-questions-tab.tsx` | Standalone `rounded-2xl border border-border p-4 shadow-sm` rows | Adjacent reference pattern |
| `app/(app)/app/bookmarks/page.tsx` | One `<Card>` per bookmark item | Adjacent reference pattern |
| `app/(app)/app/shared/components/session-breakdown-list.tsx` | Flush divider list inside disclosure region | Adjacent reference pattern |
| `docs/frontend/pattern-registry.md` | Defines I-1 / I-2 / S-2 | Likely doc update target |
| `docs/frontend/pages/dashboard.md` | Dashboard page contract | Likely doc update target |

This decision does **not** automatically imply simultaneous code changes to History questions or Bookmarks, because they are already using different, cleaner patterns.

---

## Open Questions

1. **Is the row border a "required boundary" under SC 1.4.11?** If yes, Options B and E need a compensating mechanism. The row's text content, cursor change, hover fill, and focus ring may collectively suffice — but this needs validation.

2. **Does the "View all" header action pattern work without a container?** Option A needs a way to visually associate the "View all" link with its section heading when there's no enclosing card.

3. **Should History sessions eventually converge too?** It already avoids the dashboard's wrapper-card nesting, but it still uses the lower-contrast muted row treatment directly on `bg-background`, which is a separate consistency question.

---

## Scope

- **Production code:** `app/(app)/app/dashboard/page.tsx` (primary)
- **Pattern Registry update:** likely I-2 clarification for standalone dashboard rows, or a new dashboard/containerless section note if needed
- **Test updates:** `app/(app)/app/dashboard/page.test.tsx` for class-based assertions affected by border/fill changes
- **No new files** — this modifies existing patterns

---

## Recommendation

Choose **Option B: Flush Dividers**.

### Ideal bottom-half structure

Keep:
- the existing two-column summary layout, but add `items-start` to the grid (`grid items-start gap-4 lg:grid-cols-2`) so the shorter left panel does not stretch to the taller right panel
- the section header row: heading on the left, `View all` link on the right
- the outer `<Card className="gap-0 rounded-2xl p-6 shadow-sm">` wrappers, because on this page they provide useful section grouping
- empty/error states inside those section cards

Remove:
- the nested in-card row borders and rest-state row boxes
- the current `space-y-2` stacked-card rhythm for dashboard list rows

Replace with:
- container-internal lists that use real separators instead of nested boxes:
  - list wrapper: `mt-4 divide-y divide-border/60 dark:divide-foreground/40`
  - interactive rows: a flush hover zone such as `block -mx-2 rounded-xl px-2 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`
  - unavailable/static rows: the same internal spacing (`px-2 py-3`) without hover
- a quieter internal badge strategy if needed after the border removal, because bordered pills become more visually dominant once row borders are gone

### Why this is the right call

- It removes the noisiest part of the current design: bordered rows inside bordered cards.
- It preserves the useful grouping that the dashboard's two-column summary panels need.
- It keeps the `View all` action naturally anchored to its section.
- It aligns with grouped-list patterns used by products like Linear, GitHub, and Stripe more closely than the current nested-card treatment.

Option A is still a coherent fallback if the team wants maximum flattening. But for this specific dashboard, the best end state is a grouped card with flush internal rows, not a containerless field of mini-cards.

---

## Other Observations

- The unavailable activity row (`app/(app)/app/dashboard/page.tsx:210`) already demonstrates that the nested structure feels heavy even when the row is not interactive; the wrapper/row layering is the problem, not only the hover affordance.
- The mode and difficulty pills introduce an additional micro-boundary inside already-bordered rows. If row borders are removed, those bordered pills may become the loudest remaining strokes and should be reviewed at the same time.
- The `grid gap-4 lg:grid-cols-2` container currently stretches both bottom-half cards to equal height. Because `Recent activity` is much taller than `Recent sessions`, this creates a large empty void in the left column. Independent of the surface decision, `items-start` is likely the correct layout fix.
- The `Recent activity` rows carry more visual signals than the session rows: stem preview, colored Correct/Incorrect text, timestamp metadata, and bordered difficulty pills. Once the row borders are reduced, that content stack should be re-checked so status color does not outrank the row title.
- `View all` is structurally correct where it is today, but in the current muted link styling it is very quiet. That is a secondary discoverability issue, not the main DEBT-289 problem.
- `app/(app)/app/history/components/history-sessions-tab.tsx` currently uses I-1-style muted rows directly on the page background. That is a separate consistency issue adjacent to DEBT-289, but it should not be conflated with the dashboard wrapper-card problem.
