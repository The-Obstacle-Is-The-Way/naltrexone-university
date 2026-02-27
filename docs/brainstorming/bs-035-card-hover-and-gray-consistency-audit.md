# BS-035: Card Hover and Gray Consistency Audit

**Date:** 2026-02-27
**Triggered by:** Visual inspection of history page, dashboard, quick practice, and landing page — inconsistent hover states, gray shades, and nested card visual hierarchy
**Scope:** Exhaustive audit of every interactive element, hover behavior, background gray value, link style, button variant, border, and dark-mode strategy across all 13 routes
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
| **Tab-switch inactive** | `tab-switch-styles.ts` | `hover:bg-muted/50` | 5.5% gray |
| **Filter chip (unselected)** | `filter-chip.tsx:28` | `hover:bg-accent` (100%!) | 11% gray |
| **Pricing pills (marketing)** | `marketing-home.tsx:58` | `hover:bg-muted` (100%) | 11% gray |
| **Canonical standard** | `docs/frontend/standards.md` | `hover:bg-muted/50` | 5.5% gray |

**Note:** None of the actual card/row components match the canonical `hover:bg-muted/50` from the standards doc.

### 3. Dark Mode Override Violations

The standards doc states:
> Do NOT add explicit `dark:` variants in page/component code — only in `components/ui/`

But `history-sessions-tab.tsx` uses:
- `dark:hover:bg-foreground/10` (on the row `<li>`, line 185)
- `dark:border-foreground/30 dark:bg-foreground/10 dark:hover:bg-foreground/25` (on the "View breakdown" button, line 244)

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
| Link hover patterns divergent | **Medium** | All navigation links | Some underline, some bg change, some text-color only |
| Button variant usage inconsistent in dark mode | **Medium** | Every outline/ghost button in dark mode | outline vs ghost have different dark strategies |
| Warning/alert backgrounds inconsistent | **Low** | Billing, past-due banner, question page | Different opacity values for same semantic |

---

## Exhaustive Page-by-Page Divergence Inventory

### Page 1: Landing / Marketing Home (`/`)

**Files:** `components/marketing/marketing-home.tsx`, `components/marketing/marketing-layout.tsx`

#### Cards
| Element | Classes | Hover | Notes |
|---------|---------|-------|-------|
| Impact stat cards (4) | `Card` + `text-center animate-fade-in-up` | None | Non-interactive — correct |
| Feature cards (4) | `Card` + `cn(feature.wide && 'md:col-span-2')` | None | Non-interactive — correct |
| Monthly pricing card | `Card` + `p-8` | None | Non-interactive — correct |
| Annual pricing card | `Card` + `border-2 border-primary p-8` | None | Non-interactive — correct |

#### Buttons
| Element | Variant | Extra Classes | Notes |
|---------|---------|---------------|-------|
| "View pricing" pill | `outline` | `h-auto rounded-full border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-muted` | **DIVERGENT:** Uses `hover:bg-muted` (100%) — no other component does this. Also overrides bg to `bg-card` instead of using variant default |
| "Get Started" (monthly) | `secondary` | `mt-8 h-auto w-full rounded-full py-3 text-sm font-medium` | Standard secondary variant hover (`hover:bg-secondary/80`) |
| "Get Started" (annual) | `default` (overridden) | `mt-8 h-auto w-full rounded-full bg-foreground py-3 text-sm font-medium text-background hover:bg-foreground/90` | **DIVERGENT:** Custom `bg-foreground` + `text-background` + `hover:bg-foreground/90` — completely bypasses button variant system |
| "Sign in" pill | `outline` | same `outlinePillClasses` as "View pricing" | Same divergent hover pattern |

#### Links
| Element | Classes | Hover Pattern |
|---------|---------|--------------|
| Nav links (desktop/mobile/footer) | `rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:...` | Text color change only — **consistent within marketing** |
| Brand link | `rounded-md text-sm font-semibold focus-visible:...` | No hover — no `transition-colors` either. **Missing hover affordance** |

---

### Page 2: Pricing (`/pricing`)

**File:** `app/pricing/pricing-view.tsx`

#### Cards
| Element | Classes | Hover | Notes |
|---------|---------|-------|-------|
| "Already subscribed" card | `rounded-2xl border border-border bg-card p-8 text-center shadow-sm` | None | Raw div, not `<Card>`. **DIVERGENT:** Manually replicates Card styles instead of using the component |
| "Subscription needs attention" card | Same raw div pattern | None | Same divergence |
| Monthly plan card | `rounded-2xl border border-border bg-card p-8 shadow-sm` | None | Raw div again |
| Annual plan card | `rounded-2xl border-2 border-primary bg-card p-8 shadow-sm` | None | Raw div again |
| Status banner | `rounded-2xl border bg-card p-4 text-sm shadow-sm flex items-center justify-between` | None | Conditional border color: `border-destructive` or `border-border` |

#### Links & Buttons
| Element | Classes | Hover Pattern | Notes |
|---------|---------|--------------|-------|
| Banner dismiss "×" | `ml-4 rounded-md text-current hover:opacity-70 focus-visible:...` | **`hover:opacity-70`** | **UNIQUE:** Only element in entire codebase using opacity-based hover. Everything else uses bg/text color changes |
| "Back to Home" link | `rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:...` | Text color change | Consistent with marketing nav links |
| All buttons | Standard Button variants + `rounded-full` | Per variant | Consistent |

---

### Page 3: App Layout (all `/app/*` routes)

**File:** `app/(app)/app/layout.tsx`

#### Header
| Element | Classes | Hover Pattern | Notes |
|---------|---------|--------------|-------|
| "Addiction Boards" logo link | `text-sm font-semibold text-foreground` | **No hover** | **DIVERGENT:** Marketing brand link has `rounded-md` + focus ring but no hover either. Both missing hover affordance. But marketing layout nav links have `transition-colors hover:text-foreground` |
| Past-due banner link | `underline font-medium transition-colors hover:text-foreground` | Underline + text color | **UNIQUE:** Only in-text link using base `underline` (always visible). All other links either have no underline or `hover:underline` |

#### Navigation
| Element | Desktop (`app-desktop-nav.tsx`) | Mobile (`mobile-nav.tsx`) |
|---------|------|------|
| Active link | `rounded-md text-foreground font-medium` | `block rounded-md bg-muted px-3 py-3 text-sm font-medium text-foreground` |
| Inactive link | `rounded-md text-muted-foreground transition-colors hover:text-foreground` | `block rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground` |
| **Divergence** | Text color change only on hover | **Background AND text color change on hover** (`hover:bg-muted`) |

---

### Page 4: Dashboard (`/app/dashboard`)

**File:** `app/(app)/app/dashboard/page.tsx`

#### Cards
| Element | Classes | Hover | Notes |
|---------|---------|-------|-------|
| Stat cards (4) | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | None | Non-interactive — correct |
| Current streak card | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | None | Non-interactive |
| CTA card | `Card` + `gap-0 rounded-2xl p-6 shadow-sm lg:col-span-2` | None | Contains button |
| Recent sessions card | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | None | Contains interactive rows |
| Recent activity card | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | None | Contains interactive rows |

#### Interactive Rows
| Element | Base | Hover | Notes |
|---------|------|-------|-------|
| Session rows (Link) | `block rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors` | `hover:bg-muted/40` | Uses `muted` token |
| Activity rows (Link) | Same | `hover:bg-muted/40` | Consistent with sessions |
| Unavailable activity rows (div) | `rounded-xl border border-border/60 bg-muted/20 p-3` | None | Correct — not interactive |

#### Badges
| Element | Classes |
|---------|---------|
| Mode badge | `inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-xs font-medium text-muted-foreground` |
| Difficulty badge | Same |

#### Links
| Element | Classes | Hover Pattern |
|---------|---------|--------------|
| "View all" links | Button variant="link" + `h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline` | Text color change + explicit `no-underline` override (because link variant adds `hover:underline`) |

---

### Page 5: Practice Starter (`/app/practice`)

**File:** `app/(app)/app/practice/components/practice-session-starter.tsx`

#### Cards
| Element | Classes | Hover | Notes |
|---------|---------|-------|-------|
| Session starter card | `Card` + `gap-0 rounded-2xl border-border p-6` | None | Non-interactive container |
| Tag group details | `rounded-xl border border-border/60 bg-muted/20 px-4 py-3` | None | Native `<details>` — summary has `cursor-pointer` |
| Incomplete session card | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | None | Non-interactive container |

#### Interactive Elements
| Element | Classes | Hover | Notes |
|---------|---------|-------|-------|
| Filter chips | `FilterChip` component | `hover:bg-accent hover:text-accent-foreground` | **DIVERGENT:** 100% opacity hover — far more aggressive than any card row |
| Segmented controls | `SegmentedControl` component | Active: `bg-primary text-primary-foreground shadow-sm` / Inactive: `text-muted-foreground hover:bg-muted/50 hover:text-foreground` | Closest to canonical standard |
| `<summary>` in details | `cursor-pointer list-none ... focus-visible:ring-ring/50 focus-visible:ring-[3px]` | No `hover:` classes | **Missing hover affordance** on clickable element |

#### Links
| Element | Classes | Hover Pattern |
|---------|---------|--------------|
| "← Back to Practice" | Button variant="link" + `h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline` | Same as dashboard "View all" — consistent |

---

### Page 6: Practice Session (`/app/practice/[sessionId]`)

**Files:** `practice-view.tsx`, `session-summary-view.tsx`

#### Cards
| Element | Classes | Notes |
|---------|---------|-------|
| Loading state | `Card` + `gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm` | Consistent |
| "No more questions" | Same | Consistent |
| Session summary stat cards (4) | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | Consistent |
| Session summary breakdown card | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | Consistent |

#### Buttons
All buttons use standard variants + `rounded-full`. Consistent.

#### Links
| Element | Classes | Hover Pattern |
|---------|---------|--------------|
| "← Back to Practice" / "End session" | Button variant="link" + `h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline` | Consistent back-link pattern |

---

### Page 7: Quick Practice (`/app/practice/quick`)

Uses the same `PracticeView` component as Page 6. Interactive elements:

#### Choice Buttons (`choice-button.tsx`)
| State | Classes | Notes |
|-------|---------|-------|
| Default | `block w-full rounded-xl border border-border bg-background p-4 text-left shadow-sm transition-colors` | Uses `bg-background` — different from Card (`bg-card`). In dark mode: 3.5% vs 7% |
| Hover (enabled) | `cursor-pointer hover:border-muted-foreground/30 hover:bg-muted/80` | **DIVERGENT:** `/80` is 2x more than canonical `/50` and far more than row hover `/40` |
| Selected | `border-ring` | Ring color highlight |
| Correct | `border-success bg-success/10 text-success-foreground` | Green tint |
| Incorrect | `border-destructive bg-destructive/10 text-destructive` | Red tint |
| Disabled (no correctness) | `cursor-not-allowed opacity-50` | Standard |
| Wrong-unselected | `opacity-60` | **DIVERGENT:** Different opacity than disabled (50 vs 60). Inconsistent disabled dimming |

#### Choice Badge Circle
| State | Classes | Notes |
|-------|---------|-------|
| Default | `rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground` | Uses `bg-muted` — solid 11% in dark mode |
| Correct | `border-success bg-success/15 text-success` | `/15` opacity |
| Incorrect | `border-destructive bg-destructive/15 text-destructive` | `/15` opacity |

#### Filter Chips (`filter-chip.tsx`)
| State | Classes |
|-------|---------|
| Unselected | `border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground` |
| Selected | `border-primary bg-primary text-primary-foreground` |
| **Divergence** | Unselected hover is `hover:bg-accent` (100%) — jumps from `bg-background` to full accent. Every other interactive element uses partial opacity |

---

### Page 8: Question Review (`/app/questions/[slug]`)

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx`

#### Cards
| Element | Classes | Notes |
|---------|---------|-------|
| Unanswered session reveal | `Card` + `gap-0 rounded-2xl border-warning/50 bg-warning/5 p-4 text-sm text-foreground shadow-sm` | Warning-tinted card |
| Loading states | `Card` + `gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm` | Consistent |

#### Review Question Navigator (`review-question-navigator.tsx`)
| Element | Classes | Notes |
|---------|---------|-------|
| Navigator container | `Card` + `gap-0 rounded-2xl p-4 shadow-sm` | Consistent |
| Question buttons (correct) | Button `variant="success"` + `relative rounded-full` | Uses success variant |
| Question buttons (incorrect) | Button `variant="destructive"` + `relative rounded-full` | Uses destructive variant |
| Question buttons (unanswered) | Button `variant="outline"` + `relative rounded-full` | Uses outline variant |
| Current question | `ring-2 ring-ring` | **DIVERGENT:** Uses `ring-2 ring-ring` — this is the deprecated focus ring pattern per standards doc. Standard is `ring-[3px] ring-ring/50` |

#### Links
| Element | Classes | Hover Pattern |
|---------|---------|--------------|
| Back link (top) | `rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:...` | Text color change — consistent |

#### Feedback Component (`feedback.tsx`)
| Element | Classes | Notes |
|---------|---------|-------|
| Correct badge | `inline-flex rounded-full px-3 py-1 text-sm font-semibold bg-success/15 text-success` | `/15` opacity on success |
| Incorrect badge | Same with `bg-destructive/15 text-destructive` | `/15` opacity on destructive |
| Choice explanation boxes | `rounded-xl border border-border/60 bg-background/50 p-3` | `bg-background/50` — 50% opacity on background |
| "Your answer" badge | `rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive` | `/10` opacity on destructive |
| Reference separator | `border-t border-border/40 pt-3` | `/40` opacity border — same low-contrast issue as history breakdown |

---

### Page 9: History — Sessions Tab (`/app/history`)

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx`

#### Interactive Rows
| Element | Base | Hover | Notes |
|---------|------|-------|-------|
| Session rows (interactive) | `rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors` | `hover:bg-accent/40 dark:hover:bg-foreground/10` + `cursor-pointer` | **DIVERGENT:** Uses `accent` not `muted`, AND has `dark:` override using `foreground` token |
| Session rows (non-interactive) | Same base minus hover/cursor | None | Correct |

#### Buttons
| Element | Variant | Extra Classes | Notes |
|---------|---------|---------------|-------|
| "View/Hide breakdown" | `outline` | `rounded-full transition-colors dark:border-foreground/30 dark:bg-foreground/10 dark:hover:bg-foreground/25` | **DIVERGENT:** 3 dark-mode overrides using `foreground` base. Violates standards. Different color system from outline variant's built-in `dark:bg-input/30 dark:hover:bg-input/50` |
| "Review session" (expanded) | `outline` | `rounded-full` | Standard outline — no dark overrides. Contrast issue against muted parent |
| "Go to Practice" | `outline` | `rounded-full` | Standard |

#### Expanded Breakdown
| Element | Classes | Notes |
|---------|---------|-------|
| Separator | `mt-3 space-y-2 border-t border-border/40 pt-3` | `/40` opacity border — nearly invisible in dark mode |
| Breakdown question links | `rounded-sm font-medium text-foreground hover:underline focus-visible:...` | **hover:underline** — different hover pattern than rows (bg change) |
| "Unanswered" label | `text-muted-foreground/60` | **UNIQUE:** Opacity on text color token. Only instance in codebase |

#### Links
| Element | Classes | Hover Pattern |
|---------|---------|--------------|
| Session summary link (inside row) | `rounded-md text-sm text-foreground transition-colors hover:text-foreground focus-visible:...` | Text stays same color on hover — **no visible hover change** |
| Mode filter tab links | Tab-switch classes | Consistent |
| "Previous"/"Next" pagination | Button variant="link" + headerLinkButtonClasses | Consistent |

---

### Page 10: History — Questions Tab

**File:** `app/(app)/app/history/components/history-questions-tab.tsx`

#### Cards
| Element | Classes | Notes |
|---------|---------|-------|
| Filter card | `Card` + `gap-0 rounded-2xl border-border p-4 shadow-sm` | Non-interactive — correct. Note: `p-4` not `p-6` |
| Empty state cards | `Card` + `gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm` | Consistent |
| Unavailable question cards | `Card` + `gap-0 rounded-2xl border-border p-4 shadow-sm` | Non-interactive |

#### Interactive Rows
| Element | Base | Hover | Notes |
|---------|------|-------|-------|
| Question rows | `block rounded-2xl border border-border p-4 shadow-sm transition-colors` | `hover:bg-accent/40` | **DIVERGENT from dashboard:** uses `accent` not `muted`, uses `rounded-2xl` not `rounded-xl`, uses `border-border` not `border-border/60`, has `shadow-sm`, no `bg-muted/20` base |

#### "Review" Pill
| Element | Classes | Notes |
|---------|---------|-------|
| Review indicator | `inline-flex items-center rounded-full border px-4 py-2 text-sm` | **No hover** — relies on parent Link hover. **Missing:** No explicit text/border color tokens — relies on defaults |

#### Links
| Element | Classes | Hover Pattern |
|---------|---------|--------------|
| "Clear filters" | Button variant="link" + headerLinkButtonClasses | Consistent |
| Pagination | Same | Consistent |

---

### Page 11: Bookmarks (`/app/bookmarks`)

**File:** `app/(app)/app/bookmarks/page.tsx`

#### Cards
| Element | Classes | Notes |
|---------|---------|-------|
| Empty state card | `Card` + `gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm` | Consistent |
| Bookmark cards | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | **Non-interactive card** — correct, contains links/buttons inside |

#### Links
| Element | Classes | Hover Pattern | Notes |
|---------|---------|--------------|-------|
| Question link (in card) | `rounded-sm hover:underline focus-visible:...` | **hover:underline** — no transition-colors, no bg change | Same pattern as session breakdown links |
| "Go to Practice" header | Button variant="link" + `h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline` | Consistent back-link pattern |

#### Buttons
| Element | Variant | Notes |
|---------|---------|-------|
| "Review" | `outline` + `rounded-full` | Standard |
| "Remove" | `outline` + `rounded-full` | Standard |
| "Remove bookmark" (AlertDialog action) | `destructive` | Standard |

**Key observation:** Bookmarks page uses **non-hoverable** Card containers with interactive links/buttons inside. This is a different pattern from history-questions-tab which makes the **entire row** a hoverable Link. Both patterns exist for similar content (question list with review action).

---

### Page 12: Billing (`/app/billing`)

**File:** `app/(app)/app/billing/page.tsx`

#### Cards
| Element | Classes | Notes |
|---------|---------|-------|
| Subscription card | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | Consistent |

#### Warning/Alert Boxes
| Element | Classes | Notes |
|---------|---------|-------|
| Cancellation warning | `mt-4 rounded-xl border border-warning bg-warning/15 p-4 text-sm text-warning-foreground` | Uses `/15` on warning |
| Past-due banner (layout) | `block border-b border-warning bg-warning/10 px-4 py-3 text-center text-sm text-warning-foreground` | Uses `/10` on warning |
| Question page unanswered reveal | `Card` + `border-warning/50 bg-warning/5 p-4` | Uses `/5` on warning, `/50` on border |
| **Divergence** | Three different warning background opacities (`/5`, `/10`, `/15`) across three files | Should be standardized |

---

### Page 13: Auth Pages (`/sign-in`, `/sign-up`)

These use Clerk components. No custom styling to audit.

---

## Cross-Cutting Divergences (Not Page-Specific)

### A. Link Hover Patterns (4 distinct strategies)

| Strategy | Where Used | Pattern |
|----------|-----------|---------|
| **Text color only** | Nav links (desktop, marketing, auth), back links, pricing links | `text-muted-foreground transition-colors hover:text-foreground` |
| **Background color change** | Dashboard rows, history rows, mobile nav inactive | `hover:bg-muted/40` or `hover:bg-accent/40` |
| **Underline** | Session breakdown links, bookmarks question links, button variant="link" | `hover:underline` |
| **Opacity** | Pricing banner dismiss | `hover:opacity-70` |

**Problem:** No clear rule for when to use which. The standards doc says hoverable cards use bg change, but doesn't address link text or underline hover.

### B. "headerLinkButtonClasses" Pattern (5 files)

Used in: `dashboard/page.tsx`, `history-sessions-tab.tsx`, `history-questions-tab.tsx`, `practice-page-client.tsx`, `practice-view.tsx`

```ts
const headerLinkButtonClasses =
  'h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline';
```

**Problem:** This is copy-pasted as a local const in 5 separate files. Not a shared constant. If the pattern changes, all 5 files need updating.

### C. Border Opacity Values (3 different values)

| Value | Where Used |
|-------|-----------|
| `border-border` (100%) | Card component default, filter card, history questions rows, marketing sections |
| `border-border/60` | Dashboard rows, history sessions rows, practice starter details, feedback choice boxes |
| `border-border/40` | History expanded breakdown separator, feedback reference separator |

**Problem:** No documented rationale for when to use which opacity. The `/40` borders are nearly invisible in dark mode.

### D. Background for Similar Elements (rows vs cards)

| Element Pattern | Background | Border | Radius |
|----------------|-----------|--------|--------|
| Dashboard session rows | `bg-muted/20` | `border-border/60` | `rounded-xl` |
| Dashboard activity rows | `bg-muted/20` | `border-border/60` | `rounded-xl` |
| History session rows | `bg-muted/20` | `border-border/60` | `rounded-xl` |
| History question rows | (none) | `border-border` | `rounded-2xl` |
| Practice starter details | `bg-muted/20` | `border-border/60` | `rounded-xl` |
| Bookmarks cards | `Card` (bg-card) | `border` (default) | `rounded-2xl` |

**Problem:** Dashboard/history session rows use `bg-muted/20` + `rounded-xl`, but history question rows use no bg + `rounded-2xl`. Bookmarks use full Card component. Three different treatments for similar list-of-items patterns.

### E. Button Dark Mode Inconsistencies (within `button.tsx`)

| Variant | Dark Hover | Notes |
|---------|-----------|-------|
| `outline` | `dark:hover:bg-input/50` | Uses `input` token |
| `ghost` | `dark:hover:bg-accent/50` | Uses `accent` token |
| `destructive` | `hover:bg-destructive/90` + `dark:bg-destructive/60` | Different base in dark |
| `success` | `hover:bg-success/90` + `dark:bg-success/60` | Different base in dark |

**Problem:** `outline` uses `input` for dark hover; `ghost` uses `accent` for dark hover. These are different tokens (though currently identical values). If tokens diverge, these button variants will look different when they shouldn't.

### F. Disabled State Opacity Values

| Value | Where Used |
|-------|-----------|
| `opacity-50` | Button disabled, input disabled, select disabled, dropdown items, filter chip disabled, choice button disabled (no correctness) |
| `opacity-60` | Choice button with `correctness='wrong-unselected'` |

**Problem:** `opacity-60` for wrong-unselected is close to `opacity-50` for disabled. The intent is different (dimmed-but-readable vs disabled), but the 10% gap is barely perceptible.

### G. Warning Background Opacity Values

| Opacity | File | Context |
|---------|------|---------|
| `bg-warning/5` | `question-page-client.tsx:260` | Unanswered question reveal card |
| `bg-warning/10` | `app/layout.tsx:118` | Past-due banner |
| `bg-warning/15` | `billing/page.tsx:90` | Cancellation scheduled alert |

**Problem:** Three different warning background opacities for three different contexts. No documented scale.

### H. Pricing Page Raw Divs vs Card Component

The pricing page (`pricing-view.tsx`) constructs card-like containers using raw `<div>` elements with manual classes (`rounded-2xl border border-border bg-card p-8 shadow-sm`) instead of the `<Card>` component. This means:
- Any future Card component changes won't propagate
- The styling is close but not identical to `Card` (Card uses `gap-0` which raw divs don't)

### I. Marketing Annual Button Custom Colors

`marketing-home.tsx:231`:
```
bg-foreground py-3 text-sm font-medium text-background hover:bg-foreground/90
```

This completely bypasses the button variant system. It's a one-off color inversion (light-on-dark becomes dark-on-light) that would break if foreground/background tokens change.

### J. Review Question Navigator Ring Style

`review-question-navigator.tsx:58`:
```
ring-2 ring-ring
```

The standards doc explicitly deprecates this pattern:
> Deprecated pattern: `ring-2 ring-ring ring-offset-2` (do NOT use)

The current standard is `ring-[3px] ring-ring/50`. The navigator uses the old ring style without `/50` opacity and with `ring-2` instead of `ring-[3px]`.

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
- `app/(app)/app/history/components/history-sessions-tab.tsx` — rows: `accent/40` + `dark:` → `muted/50`; remove `dark:` overrides
- `app/(app)/app/history/components/history-questions-tab.tsx` — rows: `accent/40` → `muted/50`
- `components/question/choice-button.tsx` — `/80` → `/60` (or keep at `/80` with rationale)
- `components/ui/filter-chip.tsx` — `hover:bg-accent` → `hover:bg-muted/50` or `/60`

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

### Phase 4: Extract Shared Constants

Extract `headerLinkButtonClasses` into a shared constant (e.g., `lib/shared-styles.ts` or add to `tab-switch-styles.ts` as a general style constants file) to eliminate the 5-file copy-paste.

### Phase 5: Standardize Row vs Card Patterns

Document and enforce: when should a list item be a `rounded-xl bg-muted/20 border-border/60` row vs a full `<Card>` component? Proposed rule:
- **Rows inside Cards:** Use `rounded-xl border-border/60 bg-muted/20` (dashboard, history sessions)
- **Standalone list items:** Use `<Card>` component (bookmarks, history questions)

### Phase 6: Warning Background Scale

Pick a single opacity or define a documented 3-tier scale:
- Subtle hint: `/5` (inline status)
- Standard alert: `/10` (banners, warnings)
- Emphasized: `/15` (blocking alerts)

### Phase 7: Differentiate Token Values (optional, larger scope)

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

7. **Should the marketing annual pricing button be refactored to use a proper button variant?** Currently bypasses the variant system entirely.

8. **Should the pricing page use `<Card>` components instead of raw divs?** Reduces drift risk.

9. **Should we define a documented link-hover strategy?** Currently 4 distinct patterns (text color, bg change, underline, opacity) with no rule for when to use which.

10. **Should the review question navigator ring be updated to the current standard?** `ring-2 ring-ring` → `ring-[3px] ring-ring/50`.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-27 | Created BS-035 | User reported visual inconsistencies across history, dashboard, and quick practice pages |
| 2026-02-27 | Expanded to exhaustive audit | User requested complete page-by-page divergence inventory covering all 13 routes |
