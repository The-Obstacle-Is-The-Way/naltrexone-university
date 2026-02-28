# BS-035: Card Hover and Gray Consistency Audit

**Date:** 2026-02-27
**Triggered by:** Visual inspection of history page, dashboard, quick practice, and landing page — inconsistent hover states, gray shades, and nested card visual hierarchy
**Scope:** Exhaustive audit of interactive elements, hover behavior, background gray value, link style, button variant, border, dark-mode strategy, loading states, and error surfaces across app/marketing routes plus shared UI primitives
**Related:** [BS-020 (archived)](../_archive/brainstorming/bs-020-card-contrast-and-hover-consistency.md) — deferred residual hover standardization; [BS-031 (archived)](../_archive/brainstorming/bs-031-card-row-affordance-consistency.md); [Frontend Standards](../frontend/standards.md); [DEBT-250](../debt/debt-250-frontend-visual-divergence-compliance-plan.md)

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

At audit start, the standards doc used **one canonical hoverable-card example**:
```
transition-colors hover:border-border hover:bg-muted/50
```

Current standards now delegate hover opacity to a context-dependent scale in the Pattern Registry (`/40` in-card, `/50` on page background, `/60` direct-action).

Actual usage across the codebase:

| Component | File | Hover Pattern | Dark Composite (approx.) |
|-----------|------|--------------|---------------------------|
| **Dashboard session rows** | `app/(app)/app/dashboard/page.tsx:156` | `hover:bg-muted/40` | ~8.6% (inside `bg-card`) |
| **Dashboard activity rows** | `app/(app)/app/dashboard/page.tsx:234` | `hover:bg-muted/40` | ~8.6% (inside `bg-card`) |
| **History sessions tab rows** | `app/(app)/app/history/components/history-sessions-tab.tsx:185` | `hover:bg-accent/40` + `dark:hover:bg-foreground/10` | ~6.5% (`accent/40`) or ~12.5% (`foreground/10`) |
| **History questions tab rows** | `app/(app)/app/history/components/history-questions-tab.tsx:464` | `hover:bg-accent/40` | ~6.5% (on page background) |
| **Choice buttons** | `components/question/choice-button.tsx:30` | `hover:bg-muted/80` | ~10.2% (inside `bg-card`) |
| **Tab-switch inactive** | `components/ui/tab-switch-styles.ts:23` | `hover:bg-muted/50` | Nearly unchanged (parent is already `bg-muted`) |
| **Filter chip (unselected)** | `components/ui/filter-chip.tsx:28` | `hover:bg-accent` (100%!) | 11% gray |
| **Pricing pills (marketing)** | `components/marketing/marketing-home.tsx:58` | `hover:bg-muted` (100%) | 11% gray |
| **Canonical standard** | `docs/frontend/standards.md:285` | Context-dependent (`/40`, `/50`, `/60`) | Context-dependent |

**Note:** Dashboard in-card rows align with the `/40` baseline; history rows and direct-action controls still diverge in several places (tracked below).

### 3. Dark Mode Override Violations

The standards doc states:
> Do NOT add explicit `dark:` variants in page/component code — only in `components/ui/`

But `app/(app)/app/history/components/history-sessions-tab.tsx` uses:
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
- The "Review session" button uses the outline variant, which in dark mode is `dark:bg-input/30` (`components/ui/button.tsx:19`). Against `bg-muted/20`, contrast is modest and drops further when the parent switches to `dark:hover:bg-foreground/10`
- On hover, the entire `<li>` changes to `dark:hover:bg-foreground/10` (~12.5%), which is a much larger jump than dashboard rows and changes the hierarchy abruptly

### 5. Base Background Layer Confusion

The gray stack is context-dependent (page background vs card background). Verified values:

| Layer | Value | Approx Effective L* |
|-------|-------|---------------------|
| `--background` (page) | `0 0% 3.5%` | 3.5% |
| `--card` (Card component) | `0 0% 7%` | 7% |
| `bg-muted/20` on page | 11% at 20% opacity | ~4.9% |
| `bg-muted/20` inside card | 11% at 20% opacity over 7% | ~7.8% |
| `bg-muted/40` inside card (dashboard hover) | 11% at 40% opacity over 7% | ~8.6% |
| `bg-accent/40` on page (history questions hover) | 11% at 40% opacity over 3.5% | ~6.5% |
| `dark:hover:bg-foreground/10` on page (history sessions hover) | 93% at 10% opacity over 3.5% | ~12.5% |
| `bg-muted/80` inside card (choice hover) | 11% at 80% opacity over 7% | ~10.2% |

**Key insight:** Dashboard rows are rendered inside `Card` surfaces, while history rows are on page background, so identical token/opacity values do not produce identical perceived contrast. This is the core context drift behind “same class, different feel.”

Meanwhile, the history sessions tab jumps to a different token system entirely (`foreground/10` = ~12.5%), creating a visually jarring inconsistency compared to dashboard’s `muted/40` (~8.6% inside card).

**Visual QA validation (2026-02-27):** A browser-based visual audit independently confirmed that the `/40` in-card hover (1.6 percentage-point shift from ~7% to ~8.6%) is **effectively invisible** to the human eye in dark mode. The audit reported "no visible hover state" on dashboard rows and history session rows despite hover classes being present in the code. This validates the concern that the low end of the opacity scale may need to be bumped — `/50` inside cards (~9% effective, a 2% shift) may be the practical minimum for perceptible hover feedback.

### 6. `globals.css` Cross-Reference (verified)

All token values cited above were re-verified against `app/globals.css`:
- `--secondary`, `--muted`, `--accent` are identical in light (`210 40% 96.1%`) and dark (`0 0% 11%`) (`app/globals.css:98-103`, `app/globals.css:138-143`)
- `--border` and `--input` are identical in light and dark (`app/globals.css:110-112`, `app/globals.css:150-152`)

Additional visual-consistency tokens not previously called out in BS-035:
- `--ring` (`app/globals.css:112`, `app/globals.css:152`) controls all focus ring color
- `--radius` (`app/globals.css:118`) maps to `--radius-lg/md/sm` (`app/globals.css:59-61`)
- Semantic status tokens: `--success`, `--success-foreground`, `--warning`, `--warning-foreground`, `--destructive`, `--destructive-foreground` (`app/globals.css:104-109`, `app/globals.css:144-149`)

Global CSS behaviors affecting hover/focus/transition consistency:
- Base `* { @apply border-border outline-ring/50; }` (`app/globals.css:169-176`) applies default border/ring tone project-wide
- `.metallic-border` animated gradient + `@keyframes metallic-shift` (`app/globals.css:183-208`)
- `.animate-fade-in-up` + reduced-motion override (`app/globals.css:211-238`)
- `.scrollbar-hidden` utility (`app/globals.css:251-258`)

### 7. `tailwind.config` Cross-Reference (verified)

There is **no** `tailwind.config.ts` in this repo; active config file is `tailwind.config.js`.

Relevant findings from `tailwind.config.js`:
- `darkMode: ['class']` (`tailwind.config.js:2`)
- `theme.extend` only defines semantic color aliases and border radius tokens (`tailwind.config.js:9-49`)
- No custom plugins, no custom keyframes, and no animation extensions in this file

Note: animations used by this repo (`metallic-shift`, `fade-in-up`) are defined in `app/globals.css`, not Tailwind config.

### 8. Frontend Standards Cross-Reference (verified)

Verified citations from BS-035:
- Hover guidance now points to the context-dependent Pattern Registry scale (`docs/frontend/standards.md:285`)
- Dark-mode rule is now explicitly scoped to color overrides (`docs/frontend/standards.md:603`)

Previously identified standards drift has been synchronized:
- Button variant list now includes `success` (`docs/frontend/standards.md:98`)
- Tab-switch base class now documents `py-2` (`docs/frontend/standards.md:163`)
- Raw `<button>` rule now includes an app-shell disclosure toggle exception (`docs/frontend/standards.md:76`)

---

## Severity Assessment

| Issue | Severity | Frequency | User Impact |
|-------|----------|-----------|-------------|
| Hover opacity inconsistency across pages | **Medium** | Every interactive card/row | "Something feels off" — different hover intensities per page |
| Expanded breakdown visual hierarchy | **High** | Every history session expansion | "Review session" button nearly invisible; card structure disappears |
| `dark:` override violations | **Low** | History sessions tab only | Code maintainability; diverges from standards |
| Identical muted/accent/secondary tokens | **Low** | Codebase-wide | No visible impact today, but tech debt — blocks future differentiation |
| Standards doc not matching implementation | **Low** | Historical (resolved) | Drift was corrected on 2026-02-27; keep monitoring as code evolves |
| Link hover patterns divergent | **Medium** | All navigation links | Some underline, some bg change, some text-color only |
| Button variant usage inconsistent in dark mode | **Medium** | Every outline/ghost button in dark mode | outline vs ghost have different dark strategies |
| Warning/alert backgrounds inconsistent | **Low** | Billing, past-due banner, question page | Three opacities exist; now documented as a tiered scale but not fully normalized in implementation |
| Monthly pricing CTA near-invisible | **High** | Landing page pricing section | `variant="secondary"` (11%) on `bg-card` (7%) = 4% lightness difference; button boundary disappears in dark mode. Conversion impact |
| Choice button selected state too subtle | **Medium** | Quick practice, practice session | `border-ring` only (no background change) for the most important interaction moment. Reported as hard to distinguish |
| Landing page button style proliferation | **Medium** | Landing page only | 5 distinct button treatments on one page vs 2-3 in-app. Visual language inconsistency between marketing and product |
| Pricing subscribed-state dead space | **Low** | Pricing page (subscribed users only) | ~400px empty gap between tiny card and footer due to `min-h-screen`. Page feels unfinished — layout density issue |
| No bookmark on standalone question review | **Low** | Question review page | Functional gap: Quick Practice has bookmark, standalone review doesn't. By-design per `design-principles.md` §2 but may warrant revisiting |
| Marketing nav missing ThemeToggle | **Low** | Landing page, pricing page | Users can't manually toggle dark/light mode on marketing pages. Falls back to system preference |
| Clerk dark mode visual seam | **Low** | User menu dropdown, account modal | Third-party component uses Clerk's own dark theme, not app tokens. Expected trade-off |

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
| MetallicCtaButton (bottom CTA) | (custom) | `metallic-border` animated gradient + `bg-background text-foreground` | **UNDOCUMENTED:** No pattern registry entry. Animated gradient border, not a standard Button variant |

**Visual QA note (2026-02-27):** Browser visual audit confirmed two landing page button issues:

1. **Monthly "Get Started" is near-invisible in dark mode.** The `variant="secondary"` button (`bg-secondary` = `hsl(0 0% 11%)`) sits on `bg-card` (`hsl(0 0% 7%)`) — a **4 percentage-point** lightness difference. The button boundary virtually disappears. Meanwhile the Annual "Get Started" (`bg-foreground text-background`) has maximum contrast. This asymmetry hurts Monthly plan conversion affordance.

2. **Button style proliferation.** The landing page uses **5 distinct button treatments** on a single page: (1) `default` variant (hero CTA), (2) `outline` with custom overrides (hero secondary + bottom "Sign in"), (3) `secondary` variant (Monthly CTA — near-invisible), (4) custom inverted `bg-foreground text-background` (Annual CTA), (5) MetallicCtaButton with animated border (bottom "Get Started"). In-app pages use 2-3 treatments. This should be rationalized — ideally down to `default` + `outline` + one marketing accent.

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

**Visual QA note (2026-02-27):** Browser visual audit flagged three concerns on the subscribed-state pricing page:

1. **Massive dead space on subscribed state.** The pricing root container uses `min-h-screen` (`app/pricing/pricing-view.tsx:35`), and the subscribed card is a tiny centered element (~200px tall). On a standard viewport, this leaves ~400px of pure `bg-background` between the card and the footer. The page feels like a stub. Consider either (a) removing `min-h-screen` in favor of the outer `MarketingLayout` `min-h-[100dvh]` handling footer push, or (b) enriching the subscribed state with plan details, usage stats, or an upsell.

2. **"No hover on buttons" — debunked.** The audit incorrectly reported "zero visual change on hover" for both "Go to Dashboard" (`default` variant, `hover:bg-primary/90`) and "Manage Billing" (`outline` variant, `hover:bg-accent`). Both have hover states via their Button variants. The subtle primary hover (100% → 90% opacity) may have been imperceptible visually but the code is correct.

3. **"Back to Home has no hover" — debunked.** The link has `hover:text-foreground` + `transition-colors` (see table above). The text shifts from `muted-foreground` (45% lightness) to `foreground` (93% lightness) — this is the standard L-1 nav link pattern.

---

### Page 3: App Layout (all `/app/*` routes)

**File:** `app/(app)/app/layout.tsx`

#### Header
| Element | Classes | Hover Pattern | Notes |
|---------|---------|--------------|-------|
| "Addiction Boards" logo link | `text-sm font-semibold text-foreground` | **No hover** | **DIVERGENT:** Marketing brand link has `rounded-md` + focus ring but no hover either. Both missing hover affordance. But marketing layout nav links have `transition-colors hover:text-foreground` |
| Past-due banner link | `underline font-medium transition-colors hover:text-foreground` | Underline + text color | **UNIQUE:** Only in-text link using base `underline` (always visible). All other links either have no underline or `hover:underline` |

#### Navigation
| Element | Desktop (`components/app-desktop-nav.tsx`) | Mobile (`components/mobile-nav.tsx`) |
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

**Visual QA note (2026-02-27):** Browser-based audit flagged that SegmentedControl (grouped container, solid fill for selected) and FilterChip (individual bordered pills) use distinct visual languages on the same page. This is intentional — SegmentedControl is for mutually-exclusive single-select, FilterChip is for multi-select toggles — but unselected FilterChip border contrast (`border-border` = 15% on 3.5% background) is subtle enough that chips may read as non-interactive labels rather than toggle buttons. Consider whether unselected chips need a slightly more prominent resting state.

#### Links
| Element | Classes | Hover Pattern |
|---------|---------|--------------|
| "← Back to Practice" | Button variant="link" + `h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline` | Same as dashboard "View all" — consistent |

---

### Page 6: Practice Session (`/app/practice/[sessionId]`)

**Files:** `app/(app)/app/practice/components/practice-view.tsx`, `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`, `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

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
| Selected | `border-ring` | Ring color highlight. **See Visual QA note below** |
| Correct | `border-success bg-success/10 text-success-foreground` | Green tint |
| Incorrect | `border-destructive bg-destructive/10 text-destructive` | Red tint |
| Disabled (no correctness) | `cursor-not-allowed opacity-50` | Standard |
| Wrong-unselected | `opacity-60` | **DIVERGENT:** Different opacity than disabled (50 vs 60). Inconsistent disabled dimming |

**Visual QA note (2026-02-27):** Browser visual audit flagged two choice-button affordance gaps:

1. **Pre-submission selected state is too subtle.** The selected-but-not-submitted treatment is `border-ring` only — the border shifts from 15% lightness (`--border`) to 40% (`--ring`). This is perceptible but subtle compared to post-submission states which use full background tints (`bg-success/10`, `bg-destructive/10`). The audit reported the selection "requires close attention" to distinguish. Consider adding a light `bg-muted/20` or `bg-ring/10` to the selected-but-not-submitted state for stronger pre-commit affordance.

2. **Hover exists but may be too subtle.** The audit incorrectly reported "zero hover state" — `hover:bg-muted/80` + `hover:border-muted-foreground/30` ARE present when `!disabled` (`choice-button.tsx:29-30`). However, the auditor's failure to perceive the hover visually reinforces the Chunk 1 finding about hover imperceptibility at low opacity values. The `/80` on `bg-background` (3.5% base) produces ~9.5% effective lightness (a ~6% shift) — more perceptible than in-card `/40` but still subtle enough to miss.

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

#### Review Question Navigator (`app/(app)/app/questions/[slug]/components/review-question-navigator.tsx`)
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

#### Bottom Action Bar

| Element | Variant | Extra Classes | Notes |
|---------|---------|---------------|-------|
| "← Previous" | `outline` | `rounded-full` | Disabled when on first question (`disabled:opacity-50`) |
| "Submit" / "Try Again" | `default` | `rounded-full` | Submit when unanswered; Try Again when answered |
| "Next →" | `outline` | `rounded-full` | Standard |
| "Back to [origin]" | `ghost` | `rounded-full` | Ghost variant — no border/background at rest, very subtle in dark mode |

**Visual QA note (2026-02-27):** Browser visual audit flagged three concerns on the question review bottom action bar:

1. **Ghost "Back to [origin]" is very subtle in dark mode.** The `ghost` variant has no border, no background, and no shadow at rest — just text. In dark mode, `text-foreground` (93% lightness) against `bg-background` (3.5% lightness) is readable, but the lack of any container makes it visually recede compared to the adjacent outline buttons. This is working-as-designed per Pattern Registry Part 5 (`ghost` = tertiary/back navigation), but the Chrome agent's perception that it "barely registers" validates that ghost is inherently low-affordance.

2. **Missing bookmark button.** Quick Practice has a bookmark action in its bottom bar, but standalone question review (`/app/questions/[slug]`) does not. Users reviewing a question from history who want to bookmark it must navigate elsewhere. This is a **functional gap**, not a style divergence. See `design-principles.md` §2 action bar table: `History Individual Review | [Try Again] [Back to ...]` — no bookmark by design. May warrant revisiting.

3. **"Previous disabled indistinguishable" — debunked.** The audit reported disabled Previous is "visually indistinguishable from enabled." This is false — `disabled:opacity-50` (in `button.tsx` base styles) drops the button to 50% opacity, providing clear differentiation. Additionally, `disabled:pointer-events-none` removes cursor interaction.

#### Feedback Component (`components/question/feedback.tsx`)
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

#### Buttons
| Element | Variant | Extra Classes | Notes |
|---------|---------|---------------|-------|
| "Manage in Stripe" | `default` | `rounded-full` | Standard primary button — `bg-primary text-primary-foreground`. Browser audit flagged this as "different from every other button" but this is **incorrect**: same `default` variant used by Submit and other primary CTAs throughout the app. The billing page's sparse layout (single card, single button) may make the near-white button feel visually prominent in isolation, but the style is consistent. |

#### Warning/Alert Boxes
| Element | Classes | Notes |
|---------|---------|-------|
| Cancellation warning | `mt-4 rounded-xl border border-warning bg-warning/15 p-4 text-sm text-warning-foreground` | Uses `/15` on warning |
| Past-due banner (layout) | `block border-b border-warning bg-warning/10 px-4 py-3 text-center text-sm text-warning-foreground` | Uses `/10` on warning |
| Question page unanswered reveal | `Card` + `border-warning/50 bg-warning/5 p-4` | Uses `/5` on warning, `/50` on border |
| **Divergence** | Three different warning background opacities (`/5`, `/10`, `/15`) across three files | Should be standardized |

---

### Page 13: Auth Pages (`/sign-in`, `/sign-up`)

**Files:** `app/sign-in/[[...sign-in]]/sign-in-page-client.tsx`, `app/sign-up/[[...sign-up]]/sign-up-page-client.tsx`

| Element | Classes | Notes |
|---------|---------|-------|
| Auth page wrapper `<main>` | `flex min-h-screen items-center justify-center bg-background` | Custom wrapper exists on both sign-in and sign-up pages |
| Dynamic-loading fallback wrapper | `flex min-h-[200px] items-center justify-center` | Shows while Clerk component loads client-side |
| Dynamic-loading text | `text-muted-foreground` | No animation/transition |
| `NEXT_PUBLIC_SKIP_CLERK=true` fallback title | `text-xl font-semibold text-foreground` | Manual fallback UI in both pages |
| `NEXT_PUBLIC_SKIP_CLERK=true` fallback description | `mt-2 text-muted-foreground` | No card container; plain centered text |

---

### Page 14: Checkout Success (`/checkout/success`)

**Files:** `app/(marketing)/checkout/success/page.tsx`, `app/(marketing)/checkout/success/checkout-success-sync.tsx`

| Element | Classes | Notes |
|---------|---------|-------|
| Success-page fallback `<main>` | `flex min-h-[60vh] items-center justify-center` | Only renders if redirect hasn’t fired yet |
| Fallback heading | `text-xl font-semibold text-foreground` | Plain center block, no card |
| Fallback description | `mt-2 text-muted-foreground` | Text-only status UI |

**Audit note:** `app/(marketing)/checkout/success/page.tsx` is mostly orchestration; visible styling is in `checkout-success-sync.tsx`.

---

### Page 15: Error + Not Found Surfaces

**Files:** `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/pricing/error.tsx`, `app/(marketing)/checkout/success/error.tsx`, `app/(app)/app/*/error.tsx`

#### Route Error Wrappers
| File | Styling Notes |
|------|---------------|
| `app/error.tsx` | No direct class strings; delegates to `ErrorBoundaryPage` |
| `app/pricing/error.tsx` | No direct class strings; delegates to `ErrorBoundaryPage` |
| `app/(marketing)/checkout/success/error.tsx` | No direct class strings; delegates to `ErrorBoundaryPage` |
| `app/(app)/app/billing/error.tsx`, `bookmarks/error.tsx`, `dashboard/error.tsx`, `history/error.tsx`, `practice/error.tsx`, `practice/[sessionId]/error.tsx`, `practice/quick/error.tsx`, `questions/[slug]/error.tsx` | Same delegation pattern with route-specific copy |

#### Shared Error Shell (`components/error-boundary-page.tsx`)
| Element | Classes | Notes |
|---------|---------|-------|
| Outer container | `flex min-h-[50vh] items-center justify-center bg-background text-foreground` | Used by route-level error boundaries |
| Content wrapper | `w-full max-w-md space-y-4 px-4 text-center` | Consistent spacing + width cap |
| Heading | `text-xl font-semibold font-heading text-foreground` | `h1` or `h2` based on `includeMainLandmark` |
| Description | `text-sm text-muted-foreground` | Shared muted body copy |
| Digest text | `text-xs text-muted-foreground` | Optional error ID |
| Action row | `flex flex-col justify-center gap-3 sm:flex-row` | Stacks on mobile |

#### Global Error (`app/global-error.tsx`)
| Element | Classes | Notes |
|---------|---------|-------|
| `<body>` | `min-h-[100dvh] bg-background text-foreground` | Full-document fallback |
| Centering wrapper | `flex min-h-[100dvh] items-center justify-center` | Uses full viewport height |
| Content wrapper | `w-full max-w-md space-y-4 px-4 text-center` | Mirrors `ErrorBoundaryPage` layout |
| Heading | `text-2xl font-bold font-heading text-foreground` | Larger than route error shell |

#### Not Found (`app/not-found.tsx`)
| Element | Classes | Notes |
|---------|---------|-------|
| Main wrapper | `flex min-h-[100dvh] items-center justify-center` | Full-height center |
| Content wrapper | `max-w-md space-y-8 p-4 text-center` | Larger vertical spacing than error shell |
| Icon | `size-12 text-muted-foreground` | Decorative `CircleIcon` |
| CTA button | `variant="outline" size="sm" className="mx-auto w-full max-w-48 rounded-full"` | Pill-ish small outline |

#### Inline Error Component (`components/error-card.tsx`)
| Element | Classes | Notes |
|---------|---------|-------|
| Error card wrapper | `rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-sm` | Used throughout app for inline persistent errors |

---

## UI Primitive Audit

### `components/ui/card.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| `Card` default | `bg-card text-card-foreground flex flex-col gap-0 rounded-2xl border p-6 shadow-sm` | Baseline card surface; most pages extend this |

### `components/ui/button.tsx`
| Layer | Classes | Notes |
|-------|---------|-------|
| Base | `inline-flex items-center justify-center gap-2 ... transition-colors ... disabled:pointer-events-none disabled:opacity-50 ... focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` | Transition + focus + disabled baseline |
| `default` | `bg-primary text-primary-foreground shadow-xs hover:bg-primary/90` | Primary action |
| `destructive` | `bg-destructive text-white shadow-xs hover:bg-destructive/90 ... dark:bg-destructive/60` | Dark base differs from light |
| `success` | `bg-success text-success-foreground shadow-xs hover:bg-success/90 ... dark:bg-success/60` | Exists in code; missing from standards variant list |
| `outline` | `border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50` | Uses `input` token in dark mode |
| `secondary` | `bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80` | Standard secondary |
| `ghost` | `hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50` | Uses `accent` token in dark mode |
| `link` | `text-primary underline-offset-4 hover:underline` | Underline-hover strategy |

### `components/ui/input.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| `Input` default | `... dark:bg-input/30 border-input ... transition-[color,box-shadow] ... disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ... focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` | No explicit hover styles; focus + disabled only |

### `components/ui/select.tsx`
| Primitive | Classes | Notes |
|-----------|---------|-------|
| `SelectTrigger` | `border-input ... rounded-md border bg-transparent ... transition-[color,box-shadow] ... focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ... disabled:cursor-not-allowed disabled:opacity-50` | No explicit hover styles |
| `SelectContent` | `bg-popover text-popover-foreground ... rounded-md border shadow-md ... animate-in/out ...` | Popover surface + motion |
| `SelectItem` | `focus:bg-accent focus:text-accent-foreground ... data-[disabled]:opacity-50` | Keyboard focus drives “hover-like” visual |
| `SelectSeparator` | `bg-border ... h-px` | Neutral divider |

### `components/ui/alert-dialog.tsx`
| Primitive | Classes | Notes |
|-----------|---------|-------|
| Overlay | `fixed inset-0 z-50 bg-background/80 backdrop-blur-sm ... fade-in/out` | Dimmed + blurred backdrop |
| Content | `fixed ... max-w-lg ... gap-4 rounded-2xl border border-border bg-card p-6 text-foreground shadow-lg ... zoom-in/out` | Card-like modal surface |
| Actions | `AlertDialogCancel` and `AlertDialogAction` use `buttonVariants` | Inherits full button hover/dark behavior |

### `components/ui/dropdown-menu.tsx`
| Primitive | Classes | Notes |
|-----------|---------|-------|
| Content | `bg-popover text-popover-foreground ... rounded-md border p-1 shadow-md ... animate-in/out` | Popover token surface |
| Item | `focus:bg-accent focus:text-accent-foreground ... data-[disabled]:opacity-50` | Focus-driven highlight |
| Destructive item focus | `data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20` | Has explicit dark override inside UI primitive |
| Separator | `bg-border ... h-px` | Shared neutral divider |

### `components/ui/segmented-control.tsx`
| State | Classes | Notes |
|-------|---------|-------|
| Container | `tabSwitchContainerClasses` | `inline-flex rounded-lg border border-border bg-muted p-1` |
| Base item | `tabSwitchItemBaseClasses` + `disabled:pointer-events-none disabled:opacity-50` | Shared across tabs |
| Active item | `tabSwitchItemActiveClasses` | `bg-primary text-primary-foreground shadow-sm` |
| Inactive item | `tabSwitchItemInactiveClasses` | `text-muted-foreground hover:bg-muted/50 hover:text-foreground` |

### `components/ui/filter-chip.tsx`
| State | Classes |
|-------|---------|
| Base | `inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors` + focus ring + disabled styles |
| Selected | `border-primary bg-primary text-primary-foreground` |
| Unselected | `border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground` |

### `components/ui/metallic-border.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Outer wrapper | `metallic-border inline-flex` | Pulls animated gradient from `app/globals.css` |
| Inner wrapper | `flex-1 bg-background` | Masks center to background token; radius via inline style |

### `components/ui/metallic-cta-button.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Inner content | `flex items-center gap-2 px-8 py-3 text-base font-medium text-foreground` | No hover utility; relies on animated border treatment |
| Wrapper | `MetallicBorder borderRadius={9999} borderWidth={2}` | Pill shape via border component |

### `components/ui/notification-provider.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Toast region | `pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4` | Top-centered stack |
| Toast base | `block rounded-xl border px-4 py-3 text-sm shadow-sm` | Shared toast shell |
| `info` tone | `border-border bg-card text-foreground` | Neutral |
| `success` tone | `border-success/30 bg-success/10 text-foreground` | Success-tinted |
| `error` tone | `border-destructive/40 bg-destructive/10 text-foreground` | Error-tinted |

### `components/ui/tab-switch-styles.ts`
| Constant | Classes | Verification |
|----------|---------|--------------|
| `tabSwitchContainerClasses` | `inline-flex rounded-lg border border-border bg-muted p-1` | Verified |
| `tabSwitchItemBaseClasses` | `rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` | Verified |
| `tabSwitchItemActiveClasses` | `bg-primary text-primary-foreground shadow-sm` | Verified |
| `tabSwitchItemInactiveClasses` | `text-muted-foreground hover:bg-muted/50 hover:text-foreground` | `hover:bg-muted/50` claim is correct |

---

## Loading States

All audited `loading.tsx` files use the shared `PageLoading` primitive:
- `app/(app)/app/dashboard/loading.tsx`
- `app/(app)/app/billing/loading.tsx`
- `app/(app)/app/bookmarks/loading.tsx`
- `app/(app)/app/history/loading.tsx`
- `app/(app)/app/practice/loading.tsx`
- `app/(app)/app/practice/[sessionId]/loading.tsx`
- `app/(app)/app/practice/quick/loading.tsx`
- `app/(app)/app/questions/[slug]/loading.tsx`

`PageLoading` (`components/loading/page-loading.tsx`) styling:
- Wrapper: `animate-pulse space-y-6` + `aria-busy="true"` + `aria-live="polite"`
- Heading skeleton: `h-8 w-48 rounded-md bg-background`
- Card skeleton shell: `space-y-4 rounded-2xl border border-border bg-background p-6`
- Inner lines/buttons: `bg-muted` blocks (`h-4` text lines + `h-10 w-32` action bar)

Route-level variance is only `label` and `cardCount`:
| File | Label | `cardCount` |
|------|-------|-------------|
| `dashboard/loading.tsx` | `Loading dashboard` | 6 |
| `billing/loading.tsx` | `Loading billing` | 2 |
| `bookmarks/loading.tsx` | `Loading bookmarks` | 6 |
| `history/loading.tsx` | `Loading history` | 6 |
| `practice/loading.tsx` | `Loading practice` | 3 |
| `practice/[sessionId]/loading.tsx` | `Loading practice session` | 1 |
| `practice/quick/loading.tsx` | `Loading quick practice` | 3 |
| `questions/[slug]/loading.tsx` | `Loading question` | 1 |

**Consistency result:** High consistency (single primitive), but skeleton cards use `bg-background` instead of `bg-card`, so they are visually flatter than real cards they replace.

---

## Additional App Component Audit

### `components/theme-toggle.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Toggle button | `variant="ghost" size="icon" className="relative rounded-full"` | Inherits ghost hover from Button |
| Sun icon | `size-5 text-muted-foreground transition-colors dark:hidden` | Explicit `dark:` visibility toggle |
| Moon icon | `size-5 text-muted-foreground transition-colors hidden dark:block` | Explicit `dark:` visibility toggle |

### `components/auth-nav.tsx`
| State | Classes | Notes |
|-------|---------|-------|
| Unauthenticated CTA | `Button size="sm" className="rounded-full"` | Pill sign-in button |
| Authenticated primary link | `rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:...` | Text-hover nav link style |

### `components/get-started-cta.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| CTA button class | `rounded-full px-8 py-3 text-base` | Same class for signed-in and signed-out cases |

### `components/markdown/Markdown.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Markdown wrapper | `[&_p+p]:mt-3` | Only paragraph spacing is standardized |
| Missing explicit styles | (none for `a`, `code`, `pre`, `ul`, `ol`, headings) | Markdown rendering depends on ambient typography, causing potential drift |

### `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Navigator card | `Card` + `gap-0 rounded-2xl p-4 shadow-sm` | Dense variant |
| Summary stat cards | `Card` + `gap-0 rounded-2xl p-4 shadow-sm` | Dense variant, 3-column grid |
| Per-question row cards | `Card` + `gap-0 rounded-2xl p-4 shadow-sm` | Non-hover rows with outline action buttons |

### `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Loading review fallback | `Card` + `gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm` | Uses same loading-card pattern as PracticeView |
| Error fallback | `ErrorCard` + outline buttons | No extra custom hover classes beyond Button variants |

### `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Stat cards (4) | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | Mirrors dashboard stats density |
| Breakdown card | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | Contains `SessionBreakdownList` |

### `app/(app)/app/practice/components/incomplete-session-card.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Card shell | `Card` + `gap-0 rounded-2xl p-6 shadow-sm` | Same surface as other practice cards |
| Actions | `Button` default/outline + `rounded-full` | Includes AlertDialog destructive action |

### `app/(app)/app/history/components/history-tab-bar.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Tabs | `tabSwitch*` constants | Visual style delegated entirely to shared tab-switch constants |

### `app/(app)/app/billing/billing-client.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Manage billing button | `Button className="rounded-full"` | No custom hover tokens; variant default |

### `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Current question ring | `ring-2 ring-ring` | Deprecated ring style still present at line 58 |

### `components/question/question-card.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Wrapper | `<Card>` with no class overrides | Inherits `bg-card`/`border`/`p-6` defaults from primitive |
| Choice list | `mt-8 space-y-3` | Spacing pattern consistent with quiz UI |

### `app/(app)/app/shared/components/session-breakdown-list.tsx`
| Element | Classes | Notes |
|---------|---------|-------|
| Link style | `... text-foreground hover:underline focus-visible:...` | Underline-hover pattern |
| Unanswered label | `text-muted-foreground/60` | Only production instance of `/60` muted text |

### Toast Trigger Components
| File | Styling |
|------|---------|
| `app/(app)/app/bookmarks/bookmarks-toast.tsx` | No direct classes; delegates to `notify({ message, tone: 'success' })` |
| `app/(app)/app/practice/[sessionId]/practice-session-toast.tsx` | No direct classes; delegates to `notify({ message, tone: 'info' | 'success' })` |

These components are logic-only; all visual styling is centralized in `components/ui/notification-provider.tsx`.

---

## Cross-Cutting Divergences (Not Page-Specific)

### A. Link Hover Patterns (5 distinct strategies)

| Strategy | Where Used | Pattern |
|----------|-----------|---------|
| **Text color only** | Nav links (desktop, marketing, auth), back links, pricing links | `text-muted-foreground transition-colors hover:text-foreground` |
| **Background color change** | Dashboard rows, history rows, mobile nav inactive | `hover:bg-muted/40` / `hover:bg-accent/40` / `hover:bg-muted` |
| **Underline** | Session breakdown links, bookmarks question links, button variant="link" | `hover:underline` |
| **Opacity** | Pricing banner dismiss | `hover:opacity-70` |
| **No hover affordance** | Marketing brand link, app-header logo link | No `hover:` class |

**Problem:** No clear rule for when to use which. The standards doc covers hoverable cards, but not text-link/brand-link hover strategy.

### B. "headerLinkButtonClasses" Pattern (6 files)

As a named `const headerLinkButtonClasses` in: `app/(app)/app/dashboard/page.tsx`, `app/(app)/app/history/components/history-sessions-tab.tsx`, `app/(app)/app/history/components/history-questions-tab.tsx`

As an identical inline class string in: `app/(app)/app/practice/components/practice-view.tsx:156`, `app/(app)/app/bookmarks/page.tsx:56`, `app/(app)/app/practice/practice-page-client.tsx:35`

```ts
const headerLinkButtonClasses =
  'h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline';
```

**Problem:** This is copy-pasted across 6 separate files (3 as a named const, 3 as inline class strings). Not a shared constant. If the pattern changes, all 6 files need updating.

### C. Border Opacity Values (3 different values)

| Value | Where Used |
|-------|-----------|
| `border-border` (100%) | Card component default, filter card, history question rows, marketing sections |
| `border-border/60` | Dashboard rows, history sessions rows, practice starter details, feedback choice boxes |
| `border-border/40` | History expanded breakdown separator, feedback reference separator |
| Semantic opacities (`/30`, `/40`, `/50`) | `ErrorCard`, toasts, warning reveal card | `border-destructive/30`, `border-success/30`, `border-destructive/40`, `border-warning/50` |

**Problem:** Neutral and semantic border opacity scales are mixed without a documented rationale.

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

**Problem:** `outline` uses `input` for dark hover and `ghost` uses `accent`. These tokens are already different in dark mode (`input` = 15% lightness; `accent` = 11%), so the variants already diverge.

### F. Disabled State Opacity Values

| Value | Where Used |
|-------|-----------|
| `opacity-50` | Button disabled, input disabled, select disabled, dropdown items, filter chip disabled, choice button disabled (no correctness) |
| `opacity-60` | Choice button with `correctness='wrong-unselected'` |

**Problem:** `opacity-60` for wrong-unselected is close to `opacity-50` for disabled. The intent is different (dimmed-but-readable vs disabled), but the 10% gap is barely perceptible.

### G. Warning Background Opacity Values

| Opacity | File | Context |
|---------|------|---------|
| `bg-warning/5` | `app/(app)/app/questions/[slug]/question-page-client.tsx:260` | Unanswered question reveal card |
| `bg-warning/10` | `app/(app)/app/layout.tsx:118` | Past-due banner |
| `bg-warning/15` | `app/(app)/app/billing/page.tsx:90` | Cancellation scheduled alert |

**Problem:** Three different warning background opacities are now documented as a formal tiered scale, but enforcement is still inconsistent across legacy surfaces.

### H. Pricing Page Raw Divs vs Card Component

The pricing page (`app/pricing/pricing-view.tsx`) constructs card-like containers using raw `<div>` elements with manual classes (`rounded-2xl border border-border bg-card p-8 shadow-sm`) instead of the `<Card>` component. This means:
- Any future Card component changes won't propagate
- The styling is close but not identical to `Card` (Card uses `gap-0` which raw divs don't)

### I. Marketing Annual Button Custom Colors

`components/marketing/marketing-home.tsx:231`:
```
bg-foreground py-3 text-sm font-medium text-background hover:bg-foreground/90
```

This completely bypasses the button variant system. It's a one-off color inversion (light-on-dark becomes dark-on-light) that would break if foreground/background tokens change.

### J. Review Question Navigator Ring Style

`app/(app)/app/questions/[slug]/components/review-question-navigator.tsx:58`:
```
ring-2 ring-ring
```

The standards doc explicitly deprecates this pattern:
> Deprecated pattern: `ring-2 ring-ring ring-offset-2` (do NOT use)

The current standard is `ring-[3px] ring-ring/50`. The navigator uses the old ring style without `/50` opacity and with `ring-2` instead of `ring-[3px]`.

### K. Standards Doc Drift vs Implementation (resolved)

| Prior Drift | Previous Source | Current Standard | Current Source |
|-------------|-----------------|------------------|----------------|
| Button variants omitted `success` | Pre-2026-02-27 standards snapshot | Variant list includes `success` | `docs/frontend/standards.md:98` |
| Tab switch base listed `py-1.5` | Pre-2026-02-27 standards snapshot | Base class is `py-2` | `docs/frontend/standards.md:163` |
| Raw `<button>` rule had no app-shell exception | Pre-2026-02-27 standards snapshot | Exception documented for app-shell disclosure toggles | `docs/frontend/standards.md:76` |

**Status:** Resolved in documentation update on 2026-02-27.

### L. Error Surface Density Drift

| Surface | Container Height | Content Spacing | Pattern |
|---------|------------------|-----------------|---------|
| `ErrorBoundaryPage` route errors | `min-h-[50vh]` | `space-y-4` | Shared shell |
| `app/global-error.tsx` | `min-h-[100dvh]` | `space-y-4` | Custom full-document shell |
| `app/not-found.tsx` | `min-h-[100dvh]` | `space-y-8` | Distinct 404 treatment |

**Problem:** Error density and vertical rhythm differ across fallback surfaces without explicit design guidance.

### M. Markdown Styling Gaps

`components/markdown/Markdown.tsx` only applies `[&_p+p]:mt-3` and does not define explicit link/code/list/heading styles.

**Problem:** Markdown-rendered content can inherit inconsistent defaults across contexts, especially for links and code blocks.

### N. Marketing/App Shell Feature Parity

| Feature | App Shell | Marketing Shell | Notes |
|---------|-----------|----------------|-------|
| ThemeToggle | Present (`app/(app)/app/layout.tsx:88`) | **Absent** | Users on marketing pages (`/`, `/pricing`) cannot toggle between light/dark mode. They rely on system preference or must navigate to an app page. |
| Dashboard link | Not shown (`showPrimaryLink: false`) | Shown for entitled users | Intentional — marketing helps users navigate to app |
| Navigation scope | App-only links | Marketing-only links | No cross-linking — app nav has no "Home" or "Pricing", marketing nav has no "Practice" or "History" |

**Problem:** The ThemeToggle absence on marketing pages means users who manually override their theme in-app lose that override when visiting marketing pages (which fall back to system preference via `next-themes`). This is unlikely to cause complaints but is a minor UX seam.

### O. Clerk Dark Mode Visual Seam

Clerk UI is partially themed in `components/providers.tsx` via `appearance` variables, but it still does not perfectly match the app token system:

| Property | App Token / Pattern | Clerk Appearance Config | Difference |
|----------|----------------------|-------------------------|------------|
| Base dark background | `--card: 0 0% 7%` | `colorBackground: #121212` (~7.1%) | Close match at base layer |
| Primary text | `--foreground: 0 0% 93%` | `colorText: #ededed` (~93%) | Close match |
| Secondary text | `--muted-foreground: 0 0% 45%` | `colorTextSecondary: #737373` (~45%) | Close match |
| Border radius | `rounded-2xl` card surfaces (16px) | `borderRadius: 0.75rem` (12px) | Clerk surfaces are visibly sharper than app cards |
| Hover/focus behavior | Context-dependent app scale | Clerk base-theme interactions | Different interaction language |

**Impact:** Low. The seam is now mostly in shape and interaction behavior, not raw color tokens. Clerk surfaces are still visually distinct from app surfaces, but this is acceptable unless a full Clerk appearance customization pass is prioritized.

**Related:** `components/auth-nav.tsx` renders `<UserButton>`; `components/providers.tsx` owns Clerk appearance configuration.

---

## Proposed Fix Sketch

### Phase 1: Standardize the Hover Token (quick win)

Define and enforce the canonical context-dependent hover scale:

```
/* Row inside card */
transition-colors hover:bg-muted/40

/* Standalone row on page background */
transition-colors hover:bg-muted/50

/* Canonical choice/option hover (needs more emphasis) */
transition-colors hover:bg-muted/60
```

Remove all `dark:hover:bg-foreground/*` overrides from page components.

**Files to change:**
- `app/(app)/app/history/components/history-sessions-tab.tsx` — rows: `accent/40` + `dark:` → `muted/40`; remove `dark:` overrides
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

Extract `headerLinkButtonClasses` into a shared constant (e.g., `lib/shared-styles.ts` or add to `tab-switch-styles.ts` as a general style constants file) to eliminate the 6-file copy-paste.

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

9. **Should we define a documented link-hover strategy?** Currently 5 patterns (text color, bg change, underline, opacity, no-hover) with no rule for when to use which.

10. **Should the review question navigator ring be updated to the current standard?** `ring-2 ring-ring` → `ring-[3px] ring-ring/50`.

11. **Should the pricing subscribed-state page be enriched?** Currently a stub with ~400px dead space due to `min-h-screen` + tiny card. Options: (a) remove `min-h-screen`, (b) add plan details / usage stats, (c) accept the sparse layout.

12. **Should standalone question review have a bookmark button?** Quick Practice has one in its action bar; standalone review (`/app/questions/[slug]`) does not. `design-principles.md` §2 says no, but it may be a useful addition.

13. **Should marketing pages have a ThemeToggle?** Currently absent from `MarketingLayout`. Users who set a manual theme in-app lose it on marketing pages.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-27 | Created BS-035 | User reported visual inconsistencies across history, dashboard, and quick practice pages |
| 2026-02-27 | Expanded to exhaustive audit | User requested complete page-by-page divergence inventory covering all 15 routes plus loading/error/auth surfaces |
| 2026-02-27 | Verified and expanded by repo-wide crawl | Agent verified all line numbers, class names, and token references against source; added missing components and pages |
| 2026-02-27 | Integrated Chrome Agent Chunk 3 findings (Pricing, Question Review, Header Nav, Clerk) | 5 new insights documented (dead space, missing bookmark, ghost button subtlety, ThemeToggle absence, Clerk seam), 4 false claims debunked (pricing button hover, Back to Home hover, disabled Previous, navigator "subtle" hover). Score: 3 TRUE, 2 PARTIALLY TRUE, 4 FALSE |
| 2026-02-28 | Promoted active divergences to DEBT-250 implementation plan | Converted D-1..D-15 plus low-severity UX seams into an explicit compliance debt spec with acceptance criteria and tracer-bullet verification |
