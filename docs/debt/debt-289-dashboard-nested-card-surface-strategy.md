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

### Material Design 3: Tonal Elevation Overlay

Material Design's dark theme uses a fundamentally different strategy — **tonal elevation via white overlay opacity**, not borders. Higher elevation = slightly lighter surface. The official overlay table:

| Elevation | White overlay opacity | Use case |
|-----------|----------------------|----------|
| 0dp | 0% | Page background |
| 1dp | 5% | Card surface |
| 2dp | 7% | Nested element on card |
| 3dp | 8% | Nested interactive element |
| 4dp | 9% | App bar |

The step from card (1dp) to nested element (2dp) is only **2 percentage points** of white overlay. The system is designed to be barely perceptible — a whisper, not a shout. Borders are not used to differentiate elevation levels; fill alone carries the hierarchy.

**Source:** [Material Design Dark Theme](https://m2.material.io/design/environment/elevation.html), [Prototypr Guide](https://blog.prototypr.io/how-to-design-a-dark-theme-for-your-android-app-3daeb264637)

### Atlassian Elevation System

Atlassian defines four surface levels (sunken → default → raised → overlay) and explicitly warns: **"Don't apply sunken elevations on raised or overlay elevations."** Their guidance for differentiating areas within a surface: use whitespace or borders — but not nested raised surfaces.

**Source:** [Atlassian Elevation](https://atlassian.design/foundations/elevation/)

### Key insight

The industry consensus is that **borders are not the mechanism for expressing elevation in dark mode.** Material Design uses tonal fill overlays. Atlassian avoids nesting entirely. The current dashboard uses borders for both the outer card AND inner rows — that's what creates the noise. The fix is to remove the inner borders and let fill alone express the nesting, following Material Design's tonal overlay model.

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

### Option F: Borderless Inner Cards with Tonal Fill Elevation (Material Design approach)

Keep the outer `<Card>` container. Keep the inner card **shape** (rounded-xl). Remove the inner card **border** entirely. Increase the fill from `bg-muted/20` (nearly invisible at ~1.1:1) to `bg-foreground/[0.04]`–`bg-foreground/5` — just enough to see the rounded rectangle shape without looking "punched out" or too gray.

This follows Material Design 3's tonal elevation model: nested elements are differentiated by a subtle white overlay, not borders. The 1dp→2dp step in Material is only 2% more white overlay — barely perceptible but structurally present.

```
┌─Card (bg-card #121212, border, rounded-2xl)──┐
│ Recent sessions                    View all   │
│                                               │
│ ┌─ bg-foreground/4 (no border) ──────────┐   │
│ │ [Tutor] Mar 7, 2026                    │   │
│ │ 0/5 correct (0%)                       │   │
│ └────────────────────────────────────────┘   │
│                                               │
│ ┌─ bg-foreground/4 (no border) ──────────┐   │
│ │ [Tutor] Mar 6, 2026                    │   │
│ │ 0/20 correct (0%)                      │   │
│ └────────────────────────────────────────┘   │
│                                               │
│ ┌─ bg-foreground/4 (no border) ──────────┐   │
│ │ [Exam] Mar 4, 2026                     │   │
│ │ 2/5 correct (40%)                      │   │
│ └────────────────────────────────────────┘   │
└───────────────────────────────────────────────┘
```

#### Why this is a pivot from Option B

Option B (flush dividers) was previously recommended because it eliminates the double-border noise while preserving container grouping. However, it also eliminates the individual **card shape** of each row — rows become flat list items separated by hairlines, losing the rounded-rectangle elegance that the current design has.

The core insight behind this pivot: **the problem was never the card-within-card nesting concept itself — it was the borders.** Before the WCAG dark-mode border strengthening (DEBT-279/DEBT-280), the inner rows had a nearly invisible `border-border` (#262626, ~1.3:1 vs card). That felt elegant. The WCAG fix bumped inner borders to `dark:border-foreground/40` (#6A6A6A, ~3.46:1 vs card) — 2.6x brighter than before — making the child borders louder than the parent card's border. That's what broke the visual hierarchy.

Option F fixes the root cause: remove the inner borders entirely, and compensate with a slightly stronger fill so the card shape is still visible without needing a stroke.

#### Computed fill values in dark mode

| Fill token | Effective color on `bg-card` (#121212) | RGB | WCAG contrast vs card | Perceptibility |
|------------|----------------------------------------|-----|----------------------|----------------|
| `bg-muted/20` (current) | #141414 | rgb(20) | 1.02:1 | Invisible — muted is too close to card |
| `bg-foreground/[0.04]` | #1B1B1B | rgb(27) | 1.09:1 | Borderline visible on good displays |
| **`bg-foreground/5`** | **#1D1D1D** | **rgb(29)** | **1.11:1** | **Gentle — recommended default** |
| `bg-foreground/6` | #1F1F1F | rgb(31) | 1.14:1 | Perceptible — step-up if 5% is too subtle |
| `bg-foreground/8` (too much) | #242424 | rgb(36) | 1.21:1 | Punched-out risk |

> **Note on WCAG ratios at very dark values:** The WCAG contrast formula includes a +0.05 luminance floor that compresses dark-on-dark ratios. An 11 RGB-level lift (rgb(18) → rgb(29)) is clearly visible to the eye, but the WCAG ratio is only 1.11:1. This is fine — these fills are supplementary hierarchy hints, not required boundaries. WCAG SC 1.4.11's 3:1 threshold does not apply here (see [Contrast Policy §3.2](../frontend/contrast-policy.md)).

The recommended default is **`bg-foreground/5`**, with `bg-foreground/6` as the step-up if too subtle. `bg-foreground/[0.04]` is the lower bound — usable but borderline on lower-quality displays.

#### Hover inversion bug (resolved)

The original spec kept `hover:bg-muted/40` from the current implementation. This creates a **hover inversion**: in dark mode, `bg-muted/40` composites to rgb(22) on the card surface — *darker* than the rest fill at rgb(27). On hover, rows would dim instead of brighten. The same inversion occurs in light mode: `bg-muted/40` on white composites to rgb(249, 251, 253) — lighter than the rest fill at rgb(245, 245, 246), so hover washes out instead of deepening.

**Root cause:** The rest fill uses `foreground` (93% lightness in dark mode) as its tint base, while the old hover used `muted` (11% lightness). A small percentage of a bright color produces more visible tinting than a larger percentage of a nearly-black color. Mixing two color scales creates a non-monotonic brightness ramp.

**Fix:** Switch hover to the same foreground-based scale. `hover:bg-foreground/[0.08]` composites to rgb(36) in dark mode — a clean +7 level lift from the rest rgb(29). In light mode, it composites to rgb(235, 235, 236) — a visible darkening from rest rgb(245, 245, 246). Both directions are correct.

| State | Dark mode (on card #121212) | Light mode (on card #FFFFFF) | Direction |
|-------|---------------------------|------------------------------|-----------|
| Rest `bg-foreground/5` | rgb(29) | rgb(243, 243, 244) | — |
| Hover `bg-foreground/[0.08]` | rgb(36) | rgb(235, 235, 237) | Brightens (dark) / Deepens (light) ✓ |
| ~~Hover `bg-muted/40`~~ (old) | ~~rgb(22)~~ | ~~rgb(249, 251, 253)~~ | ~~Dims / Washes out~~ ✗ |

#### Badge treatment (companion change)

Mode badges (Tutor/Exam) and difficulty badges (Easy/Medium) currently share `border-border/60 dark:border-foreground/40` — the same border treatment as the rows. Once row borders are removed, these become the only high-contrast strokes inside the card, looking orphaned and visually incongruent.

**Fix:** Convert badges to borderless fill-only pills: `bg-foreground/[0.06] border-0 rounded-full`. This gives them a subtle tonal lift using the same visual language as the rows. The text contrast inside the badge is already sufficient for readability; the border was decorative, not functional. This is a companion change — ship it with the row border removal.

#### Implementation

- Remove from rows: `border border-border/60`, `dark:border-foreground/40`, `dark:hover:border-foreground/70`
- Change row fill: `bg-muted/20` → `bg-foreground/5` (or `bg-foreground/6` if too subtle — validate visually)
- Change hover: `hover:bg-muted/40` → `hover:bg-foreground/[0.08]` (fixes hover inversion — see above)
- Keep on rows: `rounded-xl`, `p-3`, `transition-colors`, focus-visible ring
- Keep: outer `<Card>` wrapper, `space-y-2` row rhythm, section heading + "View all"
- Add to bottom grid: `items-start` to fix equal-height stretching
- Companion: convert mode/difficulty badge pills to borderless fill-only (`bg-foreground/[0.06] border-0`)

Interactive rows:
```
block rounded-xl bg-foreground/5 p-3 transition-colors hover:bg-foreground/[0.08]
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

Unavailable/static rows:
```
rounded-xl bg-foreground/5 p-3
```

**Pros:**
- Preserves the card-within-card elegance — each row is still a distinct rounded rectangle
- Removes the border noise that caused the "bipolar" feel — only the outer card has a visible border
- Follows Material Design 3's tonal elevation model (industry standard)
- Minimal code change — swap border classes for a fill class, remove dark border overrides
- Hover state (`hover:bg-foreground/[0.08]`) lifts cleanly from the rest fill — same foreground-based scale ensures monotonic brightening in both themes
- No dividers needed — the card shapes and `space-y-2` rhythm handle visual separation

**Cons:**
- The fill-only shape is subtle at rest — some users may not immediately perceive the inner cards as distinct elements. This is intentional (Material Design's philosophy) but worth validating visually.
- Mode/difficulty badge borders become the loudest strokes inside the card once row borders are gone — addressed as companion change (see "Badge treatment" above).

**WCAG consideration:** The fill at `bg-foreground/5` does not meet 3:1 as a required boundary (SC 1.4.11), and at WCAG 1.11:1 it is well below the threshold. However, the inner rows are identifiable without the fill through: (1) text content and layout, (2) cursor change to pointer on hover, (3) hover fill change (`bg-foreground/[0.08]`), (4) focus-visible ring on keyboard navigation. The tonal fill is a **supplementary visual cue**, not the primary boundary — per [Contrast Policy §3.2](../frontend/contrast-policy.md), 3:1 applies only to required boundaries. The outer card's border remains the section-level required boundary. This mirrors Material Design's approach where elevation overlays are not relied upon as accessibility boundaries — they're hierarchy hints. No contrast policy violation.

---

## Evaluation

> **Pivot (2026-03-08):** The original evaluation recommended Option B (Flush Dividers). After further analysis — including Material Design 3 research, Atlassian's elevation system, and stakeholder review of the current screenshots — the recommendation has shifted to **Option F (Borderless Inner Cards with Tonal Fill Elevation)**. The rationale: the core problem was never cards-within-cards itself — it was the inner borders being louder than the outer card border after WCAG dark-mode hardening. Option F fixes the root cause while preserving the card-within-card elegance. Option B would have worked but sacrifices the individual card shape that the stakeholder values.

### Visual elegance

- **Strongest:** Option F
- **Runner-up:** Option B

Option F preserves the rounded-rectangle card shape for each row — the visual elegance of "items as cards" — while removing the border noise. Option B flattens rows into a divider-separated list, which is clean but loses the card feel. Option A is the purest flattening but unanchors the section grouping.

### WCAG AA compliance

- **Safest:** Option A (explicit borders on page background)
- **Acceptable:** Option F and Option B

Option F's fill at `bg-foreground/5` (WCAG 1.11:1) does not meet 3:1 as a required boundary, but the fill is not the required boundary — it's a supplementary hierarchy hint. Row identification comes from text content, cursor, hover fill (`bg-foreground/[0.08]`), and focus ring. Per [Contrast Policy §3.2](../frontend/contrast-policy.md), 3:1 applies only to required boundaries — no violation. This mirrors Material Design 3's approach. Option B faces the same question with dividers.

### Information density

- **Best balance:** Option F
- **Close second:** Option B

Option F preserves the current `space-y-2` rhythm and card padding. Option B is slightly denser (no card padding per row) but requires hover-radius hacks (`-mx-2 rounded-xl px-2`) to recover interactive target shapes.

### Consistency across the app

- **Best reusable nested-card pattern:** Option F
- **Best if nesting should be avoided entirely:** Option A

Option F defines a clean, reusable answer to "how should nested items look inside a container card?" — borderless tonal cards. This is applicable anywhere the pattern arises in the future. Option A sidesteps the question by eliminating containers.

### Implementation simplicity

- **Least code churn:** Option F
- **Most JSX restructuring:** Option A

Option F is a class-swap: remove border classes, change fill token. No JSX restructuring, no divider markup, no negative-margin hover hacks. Option B requires replacing `<ul className="space-y-2">` with `<ul className="divide-y">` and reworking row padding/hover.

### Bottom line

- **Option F** is the recommended solution — fixes the root cause (border noise) while preserving the card-within-card elegance.
- **Option B** remains a coherent alternative if fill-only differentiation proves too subtle after visual validation.
- **Option A** remains the purest flattening fallback.
- **Options C, D, and E** are rejected.

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

1. **Optimal fill value: `bg-foreground/5` vs `bg-foreground/6`?** Default is `bg-foreground/5` (rgb(29), WCAG 1.11:1). Step up to `bg-foreground/6` (rgb(31), WCAG 1.14:1) if 5% is too subtle on lower-quality displays. Validate visually during implementation.

2. **Light mode visual check.** The `foreground`-based fill adapts per theme. In light mode, `foreground` = hsl(222.2, 84%, 4.9%) ≈ #020817 (dark navy). At 5% opacity on white: rgb(243, 243, 244) — a clean cool-gray tint. Should be fine, but validate visually. The hover (`bg-foreground/[0.08]`) produces rgb(235, 235, 237) — a correct darkening direction.

3. **Should History sessions eventually adopt the same fill-only pattern?** It currently uses bordered muted rows on `bg-background` (no wrapper card). That's a separate consistency question — not part of this implementation.

### Resolved Questions

- ~~**Hover inversion bug**~~ — Resolved. `hover:bg-muted/40` was darker than `bg-foreground/5` rest fill in dark mode (rgb(22) < rgb(29)). Fixed by switching to `hover:bg-foreground/[0.08]` (rgb(36) in dark mode, rgb(235) in light mode). See "Hover inversion fix" section in Option F.
- ~~**Badge dominance**~~ — Resolved as companion change. Convert badges to borderless fill-only pills (`bg-foreground/[0.06] border-0`). See "Badge treatment" section in Option F.

---

## Scope

- **Production code:** `app/(app)/app/dashboard/page.tsx` — remove row border classes, change fill + hover tokens, add `items-start` to bottom grid, convert badge pills to borderless fill-only
- **Pattern Registry update:** add a new pattern entry for borderless tonal inner cards (fill-only nested elevation), or extend I-1 with a "borderless variant" note
- **Test updates:** `app/(app)/app/dashboard/page.test.tsx` — update class-based assertions for border removal and fill/hover change
- **Doc updates:** `docs/frontend/pages/dashboard.md` — update surface hierarchy and component inventory
- **No new files** — this modifies existing patterns

---

## Recommendation

Choose **Option F: Borderless Inner Cards with Tonal Fill Elevation**.

### Ideal bottom-half structure

Keep:
- the existing two-column summary layout, but add `items-start` to the grid (`grid items-start gap-4 lg:grid-cols-2`) so the shorter left panel does not stretch to the taller right panel
- the section header row: heading on the left, `View all` link on the right
- the outer `<Card className="gap-0 rounded-2xl p-6 shadow-sm">` wrappers — they provide useful section grouping
- the `<ul className="mt-4 space-y-2">` list rhythm — card shapes with spacing handle visual separation
- the `rounded-xl p-3` shape on each row — this IS the card-within-card elegance
- hover: `transition-colors hover:bg-foreground/[0.08]`
- focus: `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`
- empty/error states inside the section cards

Remove:
- `border border-border/60` from all inner rows
- `dark:border-foreground/40` from all inner rows
- `dark:hover:border-foreground/70` from all inner rows

Replace:
- `bg-muted/20` → `bg-foreground/5` (validate visually; `bg-foreground/6` is the step-up if too subtle)
- `hover:bg-muted/40` → `hover:bg-foreground/[0.08]` (fixes hover inversion — rest and hover on same foreground scale)

Companion:
- Convert mode/difficulty badge pills from `border-border/60 dark:border-foreground/40` to `bg-foreground/[0.06] border-0 rounded-full`

### Resulting row classes

Interactive rows:
```
block rounded-xl bg-foreground/5 p-3 transition-colors hover:bg-foreground/[0.08]
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

Unavailable/static rows:
```
rounded-xl bg-foreground/5 p-3
```

### Why this is the right call

- **Fixes the root cause.** The jarring visual was never the nesting concept — it was the inner borders at `foreground/40` being 2.6x brighter than the outer card's `border-border`. Removing the inner borders eliminates the noise at its source.
- **Preserves the elegance.** Each row is still a distinct rounded rectangle — a card shape — just defined by a gentle fill instead of a competing border. This is the Material Design 3 tonal elevation approach.
- **Minimal code change.** Remove border classes, swap fill token. No JSX restructuring, no divider markup, no negative-margin hacks.
- **Keeps container grouping.** The outer card, "View all" link, and two-column layout all stay intact.
- **Industry-validated.** Material Design uses 2% white overlay steps for nested elevation. Our `bg-foreground/5` is in that range.
- **Hover correctness.** Rest (`bg-foreground/5`) and hover (`bg-foreground/[0.08]`) use the same foreground-based color scale, guaranteeing monotonic brightening in dark mode and monotonic deepening in light mode.

### Validation during implementation

1. Visual check in dark mode: do the inner card shapes read as distinct rounded rectangles at `bg-foreground/5`? If too subtle, step up to `bg-foreground/6`.
2. Visual check in light mode: does the same fill token produce an acceptable cool-gray tint? (Expected: rgb(243, 243, 244) on white — should be fine.)
3. Hover transition: does `bg-foreground/5` → `hover:bg-foreground/[0.08]` produce a satisfying, monotonic brightness lift? (Expected: rgb(29→36) dark, rgb(243→235) light — both correct directions.)
4. Badge pills: verify the borderless fill-only treatment (`bg-foreground/[0.06] border-0`) looks clean alongside the borderless rows.
5. Focus ring: verify the focus-visible ring still looks clean without a row border adjacent to it.

Option B (flush dividers) is the fallback if fill-only differentiation proves too subtle after visual validation.

---

## Other Observations

- The unavailable activity row (`app/(app)/app/dashboard/page.tsx:210`) already demonstrates that the nested structure feels heavy even when the row is not interactive; the wrapper/row layering is the problem, not only the hover affordance.
- The mode and difficulty pills introduce an additional micro-boundary inside already-bordered rows. With row borders removed, these become the loudest remaining strokes — addressed as companion change: convert to borderless fill-only pills (`bg-foreground/[0.06] border-0`). See "Badge treatment" in Option F.
- The `grid gap-4 lg:grid-cols-2` container currently stretches both bottom-half cards to equal height. Because `Recent activity` is much taller than `Recent sessions`, this creates a large empty void in the left column. Independent of the surface decision, `items-start` is likely the correct layout fix.
- The `Recent activity` rows carry more visual signals than the session rows: stem preview, colored Correct/Incorrect text, timestamp metadata, and bordered difficulty pills. Once the row borders are reduced, that content stack should be re-checked so status color does not outrank the row title.
- `View all` is structurally correct where it is today, but in the current muted link styling it is very quiet. That is a secondary discoverability issue, not the main DEBT-289 problem.
- `app/(app)/app/history/components/history-sessions-tab.tsx` currently uses I-1-style muted rows directly on the page background. That is a separate consistency issue adjacent to DEBT-289, but it should not be conflated with the dashboard wrapper-card problem.
