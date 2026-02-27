# BS-035: Card Hover and Gray Consistency Audit

**Date:** 2026-02-27
**Triggered by:** Visual inspection of history page, dashboard, quick practice, and landing page — inconsistent hover states, gray shades, and nested card visual hierarchy
**Scope:** Systematic audit of all card/row hover behaviors, background gray values, and interactive state consistency across every page
**Related:** [BS-020 (archived)](../_archive/brainstorming/bs-020-card-contrast-and-hover-consistency.md) — deferred residual hover standardization; [BS-031 (archived)](../_archive/brainstorming/bs-031-card-row-affordance-consistency.md); [Frontend Standards](../frontend/standards.md)

---

## The Problem

Interactive cards and rows across the app use different hover opacity values, different color tokens, and different dark-mode strategies. The result: hovering a card on the dashboard looks subtly different from hovering one on the history page, which looks different from hovering a choice button on the quick practice page. When the history page expands a session breakdown, the nested content area has no visual distinction from the card background, causing the "Review session" button to visually meld into its container.

**User-reported symptoms (screenshots attached to original request):**
1. History page session cards turn "light gray" on hover — unclear if this is the intended global pattern
2. Clicking "View breakdown" causes the card to appear washed out; the "Review session" button nearly disappears into the background
3. Dashboard session cards hover differently from history session cards
4. Quick practice choice buttons hover to a noticeably different shade than cards elsewhere
5. Overall lack of clear visual hierarchy in nested card states (card > expanded content > buttons)

---

## Root Cause Analysis

### 1. Identical CSS Variable Values (the core design token problem)

In `globals.css`, three semantically distinct tokens resolve to the **exact same value**:

| Token | Light Mode | Dark Mode | Intended Purpose |
|-------|-----------|-----------|-----------------|
| `--secondary` | `210 40% 96.1%` | `0 0% 11%` | Secondary backgrounds |
| `--muted` | `210 40% 96.1%` | `0 0% 11%` | Subdued/muted backgrounds |
| `--accent` | `210 40% 96.1%` | `0 0% 11%` | Accent/highlight backgrounds |

Using `hover:bg-accent/40` vs `hover:bg-muted/40` produces identical output today, but the code *looks* inconsistent. If these tokens are ever separated (as a proper design system would), the visual behavior will diverge unpredictably.

Similarly, `--border` and `--input` are identical in both modes (`214.3 31.8% 91.4%` light; `0 0% 15%` dark).

### 2. Hover Opacity Chaos (7 different values across components)

The standards doc specifies **one canonical hoverable-card pattern**:
```
transition-colors hover:border-border hover:bg-muted/50
```

Actual usage across the codebase:

| Component | File | Hover Pattern | Effective Dark BG |
|-----------|------|--------------|-------------------|
| **Dashboard session rows** | `dashboard/page.tsx:156` | `hover:bg-muted/40` | 4.4% gray |
| **Dashboard activity rows** | `dashboard/page.tsx:234` | `hover:bg-muted/40` | 4.4% gray |
| **History sessions tab rows** | `history-sessions-tab.tsx:185` | `hover:bg-accent/40` + `dark:hover:bg-foreground/10` | 9.3% gray |
| **History questions tab rows** | `history-questions-tab.tsx:464` | `hover:bg-accent/40` | 4.4% gray |
| **Choice buttons** | `choice-button.tsx:30` | `hover:bg-muted/80` | 8.8% gray |
| **Tab-switch inactive** | `tab-switch-styles.ts` | `hover:bg-muted/50` (implicit via styles) | N/A (text only) |
| **Filter chip (unselected)** | `filter-chip.tsx` | `hover:bg-accent` (100%!) | 11% gray |
| **Pricing pills (marketing)** | `marketing-home.tsx` | `hover:bg-muted` (100%) | 11% gray |
| **Canonical standard** | `docs/frontend/standards.md` | `hover:bg-muted/50` | 5.5% gray |

**Note:** None of the actual card/row components match the canonical `hover:bg-muted/50` from the standards doc.

### 3. Dark Mode Override Violations

The standards doc states:
> Do NOT add explicit `dark:` variants in page/component code — only in `components/ui/`

But `history-sessions-tab.tsx` uses:
- `dark:hover:bg-foreground/10` (on the row `<li>`)
- `dark:border-foreground/30 dark:bg-foreground/10 dark:hover:bg-foreground/25` (on the "View breakdown" button)

These `dark:` overrides use `foreground` (93% white) as the base — a completely different color system from the `muted`-based approach used everywhere else. This makes the history sessions tab look and behave differently from equivalent components.

### 4. Expanded Breakdown Visual Hierarchy Problem

When a session card in history is expanded ("View breakdown"), the structure is:

```
<li>  ← bg-muted/20, border-border/60
  <div>  ← session summary row
    <Button "View breakdown">  ← dark:bg-foreground/10
  </div>
  <div>  ← mt-3 space-y-2 border-t border-border/40 pt-3
    <Button "Review session">  ← outline variant (inherits from button.tsx)
    <SessionBreakdownList>     ← question links
  </div>
</li>
```

**Problems:**
- The expanded content area has **no distinct background** — it sits inside the same `bg-muted/20` container
- The `border-t border-border/40` separator uses 40% opacity on an already-low-contrast border color (15% gray in dark mode), making it nearly invisible
- The "Review session" button uses the outline variant, which in dark mode is `dark:bg-input/30` (15% gray at 30% = 4.5% gray). Against the `bg-muted/20` parent (11% gray at 20% = 2.2% gray), there's only ~2.3% lightness difference
- On hover, the entire `<li>` changes to `dark:hover:bg-foreground/10` (9.3% gray), which further reduces contrast with the button inside

### 5. Base Background Layer Confusion

The gray "stack" in dark mode with very thin separation:

| Layer | Value | HSL Lightness |
|-------|-------|--------------|
| `--background` (page) | `0 0% 3.5%` | 3.5% |
| `--card` (Card component) | `0 0% 7%` | 7% |
| `bg-muted/20` (row default) | 11% at 20% opacity | ~4.9% effective |
| `bg-muted/40` (dashboard hover) | 11% at 40% opacity | ~6.3% effective |
| `bg-accent/40` (history hover) | 11% at 40% opacity | ~6.3% effective |
| `dark:hover:bg-foreground/10` (history sessions) | 93% at 10% opacity | ~12.5% effective |
| `bg-muted/80` (choice hover) | 11% at 80% opacity | ~9.5% effective |

**Key insight:** The difference between the page background (3.5%) and a row's resting state (~4.9%) is only 1.4% lightness. The difference between resting and hover on dashboard (~4.9% to ~6.3%) is also only 1.4%. These are barely perceptible, especially on non-calibrated monitors.

Meanwhile, the history sessions tab jumps to a different token system entirely (`foreground/10` = ~12.5%), creating a visually jarring inconsistency compared to the dashboard's subtle `muted/40`.

---

## Severity Assessment

| Issue | Severity | Frequency | User Impact |
|-------|----------|-----------|-------------|
| Hover opacity inconsistency across pages | **Medium** | Every interactive card/row | "Something feels off" — different hover intensities per page |
| Expanded breakdown visual hierarchy | **High** | Every history session expansion | "Review session" button nearly invisible; card structure disappears |
| `dark:` override violations | **Low** | History sessions tab only | Code maintainability; diverges from standards |
| Identical muted/accent/secondary tokens | **Low** | Codebase-wide | No visible impact today, but tech debt — blocks future differentiation |
| Standards doc not matching implementation | **Medium** | All hoverable elements | Misleading documentation |

---

## Complete Inventory of Hover Patterns by Page

### Landing Page (`components/marketing/marketing-home.tsx`)
- **Stat cards** (500+, 2, Instant, 100%): No hover — correct (non-interactive)
- **Feature cards** (High-Yield, Tutor+Exam, etc.): No hover — correct (non-interactive)
- **Pricing pills** (Monthly/Annual toggle): `hover:bg-muted` (100% opacity)
- **Pricing plan cards**: No hover — correct (non-interactive)

### Dashboard (`app/(app)/app/dashboard/page.tsx`)
- **Stat cards** (Total answered, Accuracy, etc.): No hover — correct (non-interactive)
- **Recent session rows**: `hover:bg-muted/40` — clickable `<Link>`
- **Recent activity rows**: `hover:bg-muted/40` — clickable `<Link>`
- **Unavailable activity rows**: No hover — correct (non-interactive `<div>`)
- **CTA card** (Ready to practice?): No hover — correct (button inside handles interaction)

### History — Sessions Tab (`history-sessions-tab.tsx`)
- **Session rows** (interactive): `hover:bg-accent/40` + `dark:hover:bg-foreground/10` — clickable `<li>`
- **Session rows** (non-interactive, no firstQuestionSlug): No hover — correct
- **"View breakdown" button**: outline + `dark:bg-foreground/10 dark:hover:bg-foreground/25`
- **"Review session" button** (inside expanded area): outline (default variant, no overrides)
- **Question breakdown links**: `hover:underline` only (no background change)

### History — Questions Tab (`history-questions-tab.tsx`)
- **Filter card**: No hover — correct (contains form controls)
- **Question rows**: `hover:bg-accent/40` — clickable `<Link>`
- **"Review" pill on question rows**: No dedicated hover (inherits from parent link)
- **Unavailable question cards**: No hover — correct (non-interactive)

### Quick Practice (`app/(app)/app/practice/quick-practice/`)
- **Filter chips**: `hover:bg-accent hover:text-accent-foreground` (100% opacity!)
- **Question card container**: No hover — correct (non-interactive container)
- **Choice buttons**: `hover:bg-muted/80 hover:border-muted-foreground/30`
- **Action buttons** (Submit, Next, Bookmark): Button variant hover (per button.tsx)

### Practice Starter (`practice-session-starter.tsx`)
- **Tag group detail sections**: No hover — correct (`<details>` element)
- **Incomplete session card**: No hover — correct (non-interactive Card)

### Bookmarks (`app/(app)/app/bookmarks/`)
- *(Should match history-questions-tab pattern — not separately audited yet)*

---

## Proposed Fix Sketch

### Phase 1: Standardize the Hover Token (quick win)

Define a single canonical row/card hover approach and enforce it:

```
/* Canonical interactive row hover */
transition-colors hover:bg-muted/50

/* Canonical choice/option hover (needs more emphasis) */
transition-colors hover:bg-muted/60
```

Update all components to use one of these two values. Remove all `dark:hover:bg-foreground/*` overrides from page components.

**Files to change:**
- `app/(app)/app/dashboard/page.tsx` — rows: `/40` → `/50`
- `app/(app)/app/history/components/history-sessions-tab.tsx` — rows: `/40` + `dark:` → `/50`; remove `dark:` overrides
- `app/(app)/app/history/components/history-questions-tab.tsx` — rows: `/40` → `/50`
- `components/question/choice-button.tsx` — `/80` → `/60` (or keep at `/80` with rationale)
- `components/ui/filter-chip.tsx` — `hover:bg-accent` → `hover:bg-muted/50`

### Phase 2: Fix Expanded Breakdown Visual Hierarchy

Add a distinct background to the expanded breakdown area:

```tsx
{/* Expanded content */}
<div className="mt-3 space-y-2 rounded-lg bg-background/60 border border-border/30 p-3">
  ...
</div>
```

Or inset the content with a subtle background shift:

```tsx
<div className="mt-3 -mx-1 space-y-2 rounded-lg bg-card p-3">
```

### Phase 3: "View Breakdown" Button Dark Mode Fix

Remove `dark:` overrides from the button and let the outline variant handle it. If the outline variant's dark mode appearance is insufficient, fix it in `components/ui/button.tsx` (the correct location for `dark:` variants per standards).

### Phase 4: Differentiate Token Values (optional, larger scope)

If the design warrants it, separate `muted`, `accent`, and `secondary` in `globals.css`:

```css
.dark {
  --secondary: 0 0% 11%;     /* Keep as-is */
  --muted: 0 0% 13%;         /* Slightly lighter — for row backgrounds */
  --accent: 0 0% 15%;        /* Lighter still — for hover highlights */
}
```

This would require visual regression testing across all pages.

---

## Open Questions

1. **Should choice button hover be more intense than card row hover?** Currently `/80` vs `/40`. A stronger hover on choices makes sense (direct interaction target vs navigation affordance), but the gap is too wide.

2. **Should the expanded breakdown area use `bg-card` or `bg-background`?** Using `bg-card` would make it match the parent Card's base, but creates no visual separation. Using `bg-background` (page color) would create a "sunken" inset effect.

3. **Should the "Review session" button inside the breakdown be a different variant?** A `default` (primary) button would stand out more against the muted card background than `outline`.

4. **Should we differentiate `muted` vs `accent` vs `secondary` token values?** Today they're identical. Separating them enables proper design system semantics but requires regression testing.

5. **Should the standards doc be updated first or last?** Option A: Update standards, then enforce. Option B: Fix components, then update standards to match.

6. **Is the filter chip `hover:bg-accent` (100% opacity) intentional?** It's far more aggressive than any other hover in the app. Should it align with the card row pattern?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-27 | Created BS-035 | User reported visual inconsistencies across history, dashboard, and quick practice pages |
