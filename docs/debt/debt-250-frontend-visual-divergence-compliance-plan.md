# DEBT-250: Frontend Visual Divergence Compliance Plan

**Status:** Active
**Priority:** P2
**Date:** 2026-02-28
**Owner:** Frontend/UI
**Related:** [BS-035](../brainstorming/bs-035-card-hover-and-gray-consistency-audit.md), [Pattern Registry](../frontend/pattern-registry.md), [Frontend Standards](../frontend/standards.md), [Design Principles](../frontend/design-principles.md)

---

## Description

BS-035 audited every route, component, and shared primitive for visual consistency. A follow-up deep sweep audited CSS, Tailwind config, typography, spacing, shadows, animations, z-index, responsive breakpoints, icons, and accessibility patterns. Together they identified:

- **16 code divergences** (D-1 through D-16) — places where source code uses classes that violate the Pattern Registry
- **1 high-severity structural issue** — expanded breakdown visual hierarchy collapse (not a D-item, but the highest-severity finding)
- **1 medium-severity affordance concern** — choice button selected state subtlety
- **4 low-severity UX seams** — pricing dead space, missing bookmark, missing ThemeToggle, Clerk styling seam
- **1 typography inconsistency** (D-17) — auth/error page headings missing `font-heading` and `tracking-tight`
- **1 component default inconsistency** (COMP-1) — ErrorCard default padding mismatched with usage
- **1 accessibility gap** (A11Y-1) — interactive `<li>` rows missing ARIA role

This spec is **self-contained**. Every item includes the exact file, line number, current class string, and target class string. No cross-referencing required.

---

## Required Decisions (Blockers)

These questions must be answered before the corresponding implementation items can proceed. Each maps to one or more BS-035 open questions.

### Decision 1: Marketing Pricing CTA Strategy

**Blocks:** D-9, D-10, D-14
**BS-035 questions:** #6, #7

The landing page has 5 distinct button treatments on one page. Three need resolution:

| Button | Current | Problem |
|--------|---------|---------|
| "View pricing" / "Sign in" pills | `outline` variant + `hover:bg-muted` (100%) | 100% opacity hover is far more aggressive than any other hover in the app |
| Monthly "Get Started" | `variant="secondary"` | 4% lightness difference from card surface in dark mode — near-invisible |
| Annual "Get Started" | Custom `bg-foreground text-background hover:bg-foreground/90` | Bypasses variant system entirely |

**Recommended:** Monthly = `outline` variant (standard hover). Annual = `default` variant (primary, highest affordance). Remove `outlinePillClasses` custom hover. Document in Pattern Registry Part 5.

**Alternative:** Keep inverted annual CTA and add `inverted` variant to `button.tsx`. Monthly = `outline`.

### Decision 2: MetallicCtaButton Policy

**Blocks:** D-15
**BS-035 question:** #7 (partial)

`MetallicCtaButton` is a custom animated-border CTA used exactly once (bottom of landing page). It's outside the `Button` variant system.

**Recommended:** Keep as a documented marketing-only exception. No expansion to other pages. Add `/* @debt-exception D-15 */` comment in source.

**Alternative:** Remove metallic components, replace with standard `Button variant="default"`.

### Decision 3: Marketing ThemeToggle Parity

**Blocks:** UX-3
**BS-035 question:** #13

App shell has `<ThemeToggle />` in the header. Marketing shell does not. Users who manually override their theme in-app lose that override on marketing pages.

**Recommended:** Add `<ThemeToggle />` to `components/marketing/marketing-layout.tsx` header.

**Alternative:** Keep absent and document as intentional ("marketing uses system preference only").

### Decision 4: Expanded Breakdown Background

**Blocks:** STRUCT-1
**BS-035 questions:** #2, #3

When a history session card is expanded, the breakdown content sits inside the same `bg-muted/20` container with no visual separation. The "Review session" button (`outline` variant) nearly disappears.

**Recommended:** Add a subtle inset background to the expanded area:
```tsx
<div className="mt-3 -mx-1 space-y-2 rounded-lg bg-background/60 border border-border/30 p-3">
```

**Alternative:** Use `bg-card` for the expanded area (matches parent card surface but creates no separation — less effective).

**Sub-question:** Should "Review session" be promoted from `outline` to `default` variant for better visibility? **Recommended:** Yes — it's the primary action in the expanded context.

### Decision 5: Choice Button Selected State

**Blocks:** AFFORD-1
**BS-035 question:** #1 (partial)

The selected-but-not-submitted choice state uses `border-ring` only — no background tint. The border shifts from 15% to 40% lightness, which is perceptible but subtle compared to post-submission states.

**Recommended:** Add `bg-muted/20` to the selected state for stronger affordance while keeping the border pattern.

**Alternative:** Accept current behavior as sufficient.

### Decision 6: Pricing Subscribed-State Layout

**Blocks:** UX-1
**BS-035 question:** #11

The pricing root container uses `min-h-screen` (`app/pricing/pricing-view.tsx:37`). For subscribed users, the content is a tiny centered card (~200px), leaving ~400px of blank space.

**Recommended:** Remove `min-h-screen` from the pricing root. The outer `MarketingLayout` already uses `min-h-[100dvh]` to push the footer down.

**Alternative:** Enrich the subscribed state with plan details, usage stats, or renewal date.

### Decision 7: Standalone Question Review Bookmark

**Blocks:** UX-2
**BS-035 question:** #12

Quick Practice has a bookmark button in its action bar. Standalone question review (`/app/questions/[slug]`) does not. `design-principles.md` §2 says no bookmark by design.

**Recommended:** Keep as-is (no bookmark). The standalone review is for focused reading, not collection-building.

**Alternative:** Add bookmark button to standalone review action bar.

### Decision 8: Clerk Visual Seam

**Blocks:** UX-4
**BS-035 question:** (none — identified in Chunk 3)

Clerk surfaces use `borderRadius: 0.75rem` (12px) vs app's `rounded-2xl` (16px). Hover/focus behavior differs. Base colors are close due to `providers.tsx` appearance config.

**Recommended:** Accept the seam explicitly. The mismatch is minor and Clerk appearance customization adds ongoing maintenance burden.

**Alternative:** Add full Clerk appearance token mapping in `components/providers.tsx` to match app tokens exactly.

### Decision 9: Token Differentiation

**Blocks:** Nothing (optional future work)
**BS-035 question:** #4

`--muted`, `--accent`, and `--secondary` are identical (`0 0% 11%` in dark mode). `--border` and `--input` are identical (`0 0% 15%`). This means `hover:bg-accent/40` and `hover:bg-muted/40` produce the same output today.

**Recommended:** Defer. Standardize on `muted` token first (this spec). Token differentiation is a separate, larger effort requiring visual regression testing across all pages.

### Decision 10: Mobile Nav Hover Strategy

**Blocks:** D-16
**BS-035 questions:** #9

Mobile nav inactive links currently use `hover:bg-muted` (100% opacity), while desktop/app nav and other link patterns use text-only hover or partial-opacity background hover.

**Recommended:** Keep a dedicated mobile-menu row pattern but normalize hover to `hover:bg-muted/50 hover:text-foreground` (not 100% fill). Document as Pattern Registry `L-6`.

**Alternative:** Make mobile nav match `L-1` text-only hover with no background.

**Desktop/mobile strategy note:** Desktop nav uses text-only hover (L-1: `hover:text-foreground`, no background change). Mobile nav uses background + text hover (L-6: `hover:bg-muted/50 hover:text-foreground`). This is **intentional by design** — mobile entries are larger touch targets that benefit from a background fill to communicate tappability. Desktop nav links are compact inline text where background hover would be visually noisy. Do not attempt to unify these strategies.

---

## BS-035 Open Question Coverage (1-13)

| BS-035 Question | Resolution in This Spec |
|---|---|
| #1 Choice hover/selection intensity | Decision 5 + D-3 + AFFORD-1 |
| #2 Expanded breakdown background | Decision 4 + STRUCT-1 |
| #3 Review-session button prominence | Decision 4 (sub-question) + STRUCT-1 |
| #4 Token differentiation | Decision 9 (explicit defer) |
| #5 Standards update order | Phase 6 (docs synchronized after code changes) |
| #6 Filter-chip `hover:bg-accent` intent | D-4 + Decision 1 |
| #7 Marketing CTA strategy + metallic exception | Decisions 1 and 2 + D-9/D-10/D-14/D-15 |
| #8 Pricing raw divs vs Card | D-11 |
| #9 Link-hover strategy taxonomy | Decision 10 + D-12 + D-16 |
| #10 Review navigator ring style | D-7 |
| #11 Pricing subscribed-state dead space | Decision 6 + UX-1 |
| #12 Standalone review bookmark gap | Decision 7 + UX-2 |
| #13 Marketing ThemeToggle parity | Decision 3 + UX-3 |

---

## Phase 1: Core Interaction Consistency

Foundation fixes for hover tokens, state modifiers, and focus rings. No decisions required — all have clear canonical targets.

---

### D-1: History Sessions Row Hover Token + Dark Override

**Severity:** Medium
**Pattern:** I-1 (Hoverable Row inside Card)

**Current** — `app/(app)/app/history/components/history-sessions-tab.tsx:185`:
```
cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:hover:bg-foreground/10
```

**Target:**
```
cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Changes:**
1. `hover:bg-accent/40` → `hover:bg-muted/40` (standardize on `muted` token)
2. Remove `dark:hover:bg-foreground/10` (no page-level `dark:` overrides per standards)

**Verify:** `rg -n 'hover:bg-accent|dark:hover:bg-foreground' 'app/(app)/app/history/components/history-sessions-tab.tsx'` returns 0 matches.

**Visual QA note:** Chrome agent testing confirmed that `/40` inside cards (7% base → ~8.6% effective = 1.6pp shift) is at the perceptual threshold in dark mode. Kept because: (a) the user explicitly prefers dashboard subtlety over aggressive hover, (b) the card surface already elevates the row above page background, so the row doesn't need to "announce" itself, (c) bumping to `/50` would make in-card hover identical to standalone-row hover, collapsing the visual hierarchy. If this proves problematic after implementation, bump to `/50` — a one-token change.

**Secondary cleanup:** The session summary `<Link>` inside the row (`history-sessions-tab.tsx:220`) uses `hover:text-foreground` on an element already styled `text-foreground` — a no-op hover. When D-1 is fixed (row interaction model changes), verify this inner link's hover is either removed or changed to something perceptible.

---

### D-2: History Questions Row Hover Token

**Severity:** Medium
**Pattern:** I-2 (Hoverable Card Row, standalone)

**Current** — `app/(app)/app/history/components/history-questions-tab.tsx:464`:
```
block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Target:**
```
block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Changes:**
1. `hover:bg-accent/40` → `hover:bg-muted/50` (standalone rows on page background use `/50`)

**Verify:** `rg -n 'hover:bg-accent' 'app/(app)/app/history/components/history-questions-tab.tsx'` returns 0 matches.

---

### D-3: Choice Button Hover Opacity

**Severity:** Medium
**Pattern:** I-3 (Choice Button)

**Current** — `components/question/choice-button.tsx:30`:
```
cursor-pointer hover:border-muted-foreground/30 hover:bg-muted/80
```

**Target:**
```
cursor-pointer hover:border-muted-foreground/30 hover:bg-muted/60
```

**Changes:**
1. `hover:bg-muted/80` → `hover:bg-muted/60` (direct-action targets use `/60`, not `/80`)

**Verify:** `rg -n 'hover:bg-muted/80' components/question/choice-button.tsx` returns 0 matches.

---

### D-4: Filter Chip Hover Opacity

**Severity:** Medium
**Pattern:** I-4 (Filter Chip)

**Current** — `components/ui/filter-chip.tsx:28`:
```
border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground
```

**Target:**
```
border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-accent-foreground
```

**Changes:**
1. `hover:bg-accent` (100%!) → `hover:bg-muted/50` (standard interactive hover)

**Verify:** `rg -n 'hover:bg-accent' components/ui/filter-chip.tsx` returns 0 matches.

---

### D-5: View Breakdown Button Dark Overrides

**Severity:** Low
**Pattern:** Part 5 rule — no `dark:` overrides outside `components/ui/`

**Current** — `app/(app)/app/history/components/history-sessions-tab.tsx:244`:
```
rounded-full transition-colors dark:border-foreground/30 dark:bg-foreground/10 dark:hover:bg-foreground/25
```

**Target:**
```
rounded-full
```

**Changes:**
1. Remove `transition-colors dark:border-foreground/30 dark:bg-foreground/10 dark:hover:bg-foreground/25`
2. The button already uses `variant="outline"` which provides its own dark mode behavior (`dark:bg-input/30 dark:border-input dark:hover:bg-input/50` from `button.tsx`)

**Note:** After removing the overrides, visually verify the outline button is still distinguishable inside the `bg-muted/20` row. If not, the fix belongs in `button.tsx`, not here.

**Verify:** `rg -n 'dark:(?:border|bg|hover:bg)-foreground' 'app/(app)/app/history/components/history-sessions-tab.tsx'` returns 0 matches.

---

### D-6: Choice Wrong-Unselected Opacity

**Severity:** Low
**Pattern:** X-1 (Disabled — `opacity-50` universal)

**Current** — `components/question/choice-button.tsx:33`:
```
correctness === 'wrong-unselected' && 'opacity-60',
```

**Target:**
```
correctness === 'wrong-unselected' && 'opacity-50',
```

**Changes:**
1. `opacity-60` → `opacity-50` (align with universal disabled/dimmed treatment)

**Verify:** `rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' 'opacity-60' components/question` returns 0 matches (production code only).

---

### D-7: Review Navigator Ring Style

**Severity:** Low
**Pattern:** X-2 (Focus Ring — `ring-[3px] ring-ring/50`)

**Current** — `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx:58`:
```
isCurrent && 'ring-2 ring-ring',
```

**Target:**
```
isCurrent && 'ring-[3px] ring-ring/50',
```

**Changes:**
1. `ring-2` → `ring-[3px]` (standard width)
2. `ring-ring` → `ring-ring/50` (standard opacity)

**Verify:** `rg -n 'ring-2 ring-ring' 'app/(app)/app/questions/[slug]/components/review-question-navigator.tsx'` returns 0 matches.

---

### D-12: Pricing Dismiss Hover Strategy

**Severity:** Low
**Pattern:** Link hover must use text-color or bg-color, never `opacity`

**Current** — `app/pricing/pricing-view.tsx:75`:
```
ml-4 rounded-md text-current hover:opacity-70 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Target:**
```
ml-4 rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Changes:**
1. `text-current hover:opacity-70` → `text-muted-foreground transition-colors hover:text-foreground` (L-1 nav link hover pattern)
2. Add `transition-colors` (X-3 rule — every hover needs a transition)

**Verify:** `rg -n 'hover:opacity' app/pricing` returns 0 matches.

---

### D-16: Mobile Nav Inactive Hover Intensity

**Severity:** Medium
**Pattern:** L-6 (Mobile Menu Link)
**Requires:** Decision 10

**Current** — `components/mobile-nav.tsx:75`:
```
block rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Target** (recommended):
```
block rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Changes:**
1. `hover:bg-muted` (100%) → `hover:bg-muted/50` (align mobile menu row affordance to canonical hover scale)

**Verify:** `rg -n 'hover:bg-muted[\" ]' components/mobile-nav.tsx` returns 0 matches (inactive links).

**Active state note:** The active (current page) mobile nav link uses `bg-muted` (100%) at `components/mobile-nav.tsx:74`. This matches Pattern Registry L-6 active and is intentional: **active fill > hover fill**.

---

### D-17: Auth/Error Page Heading Inconsistency

**Severity:** Low
**Pattern:** Undocumented (now Pattern Registry Part 12 — Typography System)

All app pages use `text-2xl font-bold font-heading tracking-tight text-foreground` for H1. Five utility/error pages diverge:

| Page | File:Line | Current Classes | Missing |
|------|-----------|----------------|---------|
| Sign In | `app/sign-in/[[...sign-in]]/sign-in-page-client.tsx:25` | `text-xl font-semibold text-foreground` | `font-heading`, `tracking-tight`, wrong size/weight |
| Sign Up | `app/sign-up/[[...sign-up]]/sign-up-page-client.tsx:25` | `text-xl font-semibold text-foreground` | `font-heading`, `tracking-tight`, wrong size/weight |
| Checkout Success | `app/(marketing)/checkout/success/checkout-success-sync.tsx:283` | `text-xl font-semibold text-foreground` | `font-heading`, `tracking-tight`, wrong size/weight |
| Global Error | `app/global-error.tsx:29` | `text-2xl font-bold font-heading text-foreground` | `tracking-tight` |
| Error Boundary | `components/error-boundary-page.tsx:39` | `text-xl font-semibold font-heading text-foreground` | `tracking-tight`, wrong size/weight |

**Note:** Sign In/Up H1s only render when `NEXT_PUBLIC_SKIP_CLERK=true` (dev/test fallback). In production, Clerk renders its own H1. Checkout Success is a transient "Finalizing..." state that redirects automatically.

**Target:** Normalize all to the standard app heading pattern, **but at `text-xl font-semibold`** for utility pages (these are deliberately smaller than full app pages — they're centered, narrow-width contexts):
```
text-xl font-semibold font-heading tracking-tight text-foreground
```

For Global Error (which already uses `text-2xl font-bold font-heading`), just add `tracking-tight`:
```
text-2xl font-bold font-heading tracking-tight text-foreground
```

**Changes:**
1. Sign In, Sign Up, Checkout Success: add `font-heading tracking-tight`
2. Global Error: add `tracking-tight`
3. Error Boundary: add `tracking-tight`

**Verify:** `rg -n 'font-semibold text-foreground' app/sign-in app/sign-up app/global-error.tsx components/error-boundary-page.tsx` — every match should include `font-heading tracking-tight`.

---

### COMP-1: ErrorCard Default Padding Mismatch

**Severity:** Medium
**Pattern:** F-3 (ErrorCard)

The `ErrorCard` component defaults to `p-4`, but the majority of call sites override it to `p-6`.

**13 total call sites** (excluding tests):

| # | File | className | Effective Padding |
|---|------|-----------|-------------------|
| 1 | `bookmarks/page.tsx:218` | `"p-6"` | p-6 (override) |
| 2 | `bookmarks/page.tsx:258` | `"p-6"` | p-6 (override) |
| 3 | `dashboard/page.tsx:134` | `"mt-4"` | p-4 (default) |
| 4 | `dashboard/page.tsx:289` | `"p-6"` | p-6 (override) |
| 5 | `billing/page.tsx:150` | `"p-6"` | p-6 (override) |
| 6 | `question-page-client.tsx:222` | `"p-6"` | p-6 (override) |
| 7 | `practice-page-client.tsx:58` | _(none)_ | p-4 (default) |
| 8 | `practice-session-page-view.tsx:127` | `"p-6"` | p-6 (override) |
| 9 | `practice-session-page-view.tsx:194` | `"p-4"` | p-4 (explicit) |
| 10 | `practice-view.tsx:168` | `"p-6"` | p-6 (override) |
| 11 | `practice-view.tsx:193` | `"p-6"` | p-6 (override) |
| 12 | `history-sessions-tab.tsx:88` | _(none)_ | p-4 (default) |
| 13 | `history-questions-tab.tsx:121` | _(none)_ | p-4 (default) |

**Summary:** 8 use `p-6`, 5 use `p-4` (3 via default, 1 via `mt-4` only, 1 explicit).

**Current** — `components/error-card.tsx:15`:
```
rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-sm
```

**Target:**
```
rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive shadow-sm
```

**Changes:**
1. Change `p-4` to `p-6` in the ErrorCard component definition
2. Remove `className="p-6"` from the 8 override call sites (now redundant)
3. Add explicit `className="p-4"` to the 4 compact-context sites that currently rely on the default:
   - `dashboard/page.tsx:134` — change `className="mt-4"` → `className="mt-4 p-4"`
   - `practice-page-client.tsx:58` — add `className="p-4"`
   - `history-sessions-tab.tsx:88` — add `className="p-4"`
   - `history-questions-tab.tsx:121` — add `className="p-4"`
4. Keep `practice-session-page-view.tsx:194` as-is (already explicit `className="p-4"`)

**Net result:** 8 overrides removed, 3 explicit `p-4` added. The default now matches the majority usage.

**Verify:** `rg -n 'ErrorCard.*p-6' app` returns 0 matches. `rg -n "p-6" components/error-card.tsx` returns 1 match (the default).

---

### A11Y-1: History Sessions Clickable Row Missing ARIA Role

**Severity:** Medium
**Blocks:** D-1 (related — D-1 addresses the hover pattern on the same element)

**Problem:** History session rows use `<li tabIndex={0} onClick onKeyDown>` with a delegated click handler and nested `<Link tabIndex={-1}>`. Screen readers announce these as "list item" rather than conveying interactivity.

**Current** — `app/(app)/app/history/components/history-sessions-tab.tsx:178-181`:
```tsx
<li
  key={row.sessionId}
  tabIndex={isRowInteractive ? 0 : undefined}
  className={
```

**Target:**
```tsx
<li
  key={row.sessionId}
  role={isRowInteractive ? 'link' : undefined}
  tabIndex={isRowInteractive ? 0 : undefined}
  className={
```

**Changes:**
1. Add `role="link"` when the row is interactive (`isRowInteractive`)

**Note:** This fix should be applied together with D-1 (which changes the hover classes on the same element). The ideal long-term fix is to make the entire `<li>` a `<Link>` component (eliminating the delegated click pattern), but that requires more refactoring and is tracked as a known debt in Pattern Registry I-1.

**Verify:** `rg -n 'role="link"' 'app/(app)/app/history/components/history-sessions-tab.tsx'` returns 1 match.

---

## Phase 2: Structural & Affordance Fixes

Items that require decisions but have clear recommended paths. These are the highest-impact visual issues.

---

### STRUCT-1: Expanded Breakdown Visual Hierarchy

**Severity:** HIGH (highest in entire audit)
**Requires:** Decision 4
**BS-035 Section:** Root Cause Analysis §4, Proposed Fix Sketch Phase 2

**Problem:** When a history session card is expanded via "View breakdown", the expanded content area sits inside the same `bg-muted/20` container with only a `border-t border-border/40` separator. The separator is nearly invisible (40% opacity on 15% gray = ~6% effective). The "Review session" outline button nearly disappears against the muted background.

**Current** — `app/(app)/app/history/components/history-sessions-tab.tsx:255` (expanded breakdown area container):
```tsx
<div className="mt-3 space-y-2 border-t border-border/40 pt-3">
```

**Review session button (current)** — `app/(app)/app/history/components/history-sessions-tab.tsx:257`:
```tsx
<Button asChild variant="outline" className="rounded-full">
```

**Target** (recommended):
```tsx
<div className="mt-3 -mx-1 space-y-2 rounded-lg border border-border/30 bg-background/60 p-3">
  <Button asChild variant="default" className="rounded-full">
```

**Changes:**
1. Replace `border-t border-border/40 pt-3` with `rounded-lg border border-border/30 bg-background/60 p-3` (create visual inset)
2. Add `-mx-1` for slight visual nesting
3. Consider promoting "Review session" from `outline` to `default` variant (Decision 4 sub-question)

**Verify:** Visually confirm expanded breakdown is distinguishable from parent card. "Review session" button is the most prominent element in the expanded area.

---

### AFFORD-1: Choice Button Selected State

**Severity:** Medium
**Requires:** Decision 5
**BS-035 Section:** Cross-cutting M, Pattern Registry I-3 affordance concern

**Problem:** When a user selects a choice before submitting, the only visual change is `border-ring` (border shifts from 15% to 40% lightness). No background tint. Chrome agent visual audit confirmed this is "hard to distinguish at a glance."

**Current** — `components/question/choice-button.tsx:34` (selected, pre-submission outer wrapper):
```
border-ring
```

**Target** (recommended):
```
border-ring bg-muted/20
```

**Changes:**
1. Add `bg-muted/20` to the selected (pre-submission) state

**Verify:** Select a choice without submitting. The selected choice should have a visible background tint distinguishing it from unselected choices, even in dark mode.

---

## Phase 3: Brand & Marketing Alignment

Items affecting marketing pages. Most require Decision 1 and/or Decision 2.

---

### D-8: Brand Link L-4 Alignment

**Severity:** Medium
**Pattern:** L-4 (Brand Link)

Two brand links exist. Neither fully matches the canonical L-4 pattern: `rounded-md text-sm font-semibold text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`

**Marketing brand link** — `components/marketing/marketing-layout.tsx:16-17`:
```tsx
const brandLinkClass =
  'rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';
```
**Missing:** `text-foreground transition-colors hover:text-foreground/80`

**App brand link** — `app/(app)/app/layout.tsx:80`:
```
text-sm font-semibold text-foreground
```
**Missing:** `rounded-md transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`

**Target for both:**
```
rounded-md text-sm font-semibold text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Recommendation:** Extract to a shared constant (e.g., `brandLinkClasses` in `lib/shared-styles.ts`) since both headers use it.

**Verify:** Both brand links have identical classes. Hovering dims text from 93% to ~74% lightness.

---

### D-9: Marketing Outline Pill Hover

**Severity:** Medium
**Requires:** Decision 1
**Pattern:** Button variant conventions (Part 5)

**Current** — `components/marketing/marketing-home.tsx:57-58`:
```tsx
const outlinePillClasses =
  'h-auto rounded-full border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-muted';
```
Used on "View pricing" (line 87) and "Sign in" (line 257).

**Target** (recommended — remove custom class overrides, let variant handle it):
```tsx
// Remove outlinePillClasses const entirely.
// Use: <Button variant="outline" className="h-auto rounded-full px-6 py-3 text-sm font-medium">
```

**Changes:**
1. Remove `border-border bg-card text-foreground hover:bg-muted` overrides
2. Let `outline` variant's built-in hover (`hover:bg-accent` / `dark:hover:bg-input/50`) handle interaction
3. Keep only sizing/shape overrides: `h-auto rounded-full px-6 py-3 text-sm font-medium`

**Verify:** "View pricing" and "Sign in" use standard outline hover. No `hover:bg-muted` at 100% opacity anywhere in marketing.

---

### D-10: Annual CTA Variant Bypass

**Severity:** Medium
**Requires:** Decision 1

**Current** — `components/marketing/marketing-home.tsx:229-234`:
```tsx
<Button
  asChild
  className="mt-8 h-auto w-full rounded-full bg-foreground py-3 text-sm font-medium text-background hover:bg-foreground/90"
>
```
No `variant` prop — defaults to `"default"` but overrides all its colors.

**Target** (recommended — use `default` variant as-is):
```tsx
<Button
  asChild
  className="mt-8 h-auto w-full rounded-full py-3 text-sm font-medium"
>
```

**Changes:**
1. Remove `bg-foreground text-background hover:bg-foreground/90`
2. Let `default` variant provide `bg-primary text-primary-foreground hover:bg-primary/90`

**Alternative** (if inverted look is desired): Add `inverted` variant to `button.tsx` and use it explicitly.

**Verify:** Annual "Get Started" uses variant-provided colors with standard hover behavior.

---

### D-11: Pricing Page Raw Divs → Card Component

**Severity:** Low
**Pattern:** S-1 (Card Surface)

**Current** — `app/pricing/pricing-view.tsx` has 4 raw card-like divs:

| Line | Current Classes | Context |
|------|----------------|---------|
| 85 | `mx-auto mt-16 max-w-2xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm` | Entitled state card |
| 102 | `mx-auto mt-16 max-w-2xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm` | Needs-attention card |
| 126 | `rounded-2xl border border-border bg-card p-8 shadow-sm` | Monthly plan card |
| 151 | `rounded-2xl border-2 border-primary bg-card p-8 shadow-sm` | Annual plan card |

**Target:** Replace each with `<Card>` component + layout overrides:
```tsx
// Lines 85, 102:
<Card className="mx-auto mt-16 max-w-2xl p-8 text-center">

// Line 126:
<Card className="p-8">

// Line 151:
<Card className="border-2 border-primary p-8">
```

**Note:** `<Card>` provides `bg-card text-card-foreground rounded-2xl border shadow-sm` by default, plus `gap-0` (which raw divs lack). Verify no layout shift from `gap-0`.

**Verify:** `rg -n 'rounded-2xl border(?:-2)? border-(?:border|primary) bg-card p-8' app/pricing/pricing-view.tsx` returns 0 matches (status banner `p-4` is allowed).

---

### D-14: Monthly CTA Invisible in Dark Mode

**Severity:** HIGH
**Requires:** Decision 1

**Current** — `components/marketing/marketing-home.tsx:202-208`:
```tsx
<Button
  asChild
  variant="secondary"
  className="mt-8 h-auto w-full rounded-full py-3 text-sm font-medium"
>
```

`variant="secondary"` renders `bg-secondary` = `hsl(0 0% 11%)` on `bg-card` = `hsl(0 0% 7%)`. That's a 4% lightness difference. The button boundary effectively disappears in dark mode.

**Target** (recommended):
```tsx
<Button
  asChild
  variant="outline"
  className="mt-8 h-auto w-full rounded-full py-3 text-sm font-medium"
>
```

**Changes:**
1. `variant="secondary"` → `variant="outline"` (outline has visible border + distinct dark hover)

**Verify:** Monthly "Get Started" button has a visible border in dark mode. Lightness contrast between button and card surface is >10%.

---

### D-15: MetallicCtaButton Exception

**Severity:** Low
**Requires:** Decision 2

**Current** — `components/marketing/marketing-home.tsx:254-256`:
```tsx
<MetallicCtaButton href={ROUTES.PRICING}>
  Get Started
</MetallicCtaButton>
```

Source files: `components/ui/metallic-cta-button.tsx`, `components/ui/metallic-border.tsx`, CSS in `app/globals.css:183-208`.

**Target** (recommended): Keep as documented exception. Add comment:
```tsx
{/* @debt-exception D-15: Marketing-only metallic CTA. Do not expand to other pages. */}
<MetallicCtaButton href={ROUTES.PRICING}>
  Get Started
</MetallicCtaButton>
```

**Verify:** MetallicCtaButton is used in exactly 1 location. Pattern Registry Part 5 documents it as an explicit exception.

---

## Phase 4: Shared Constant Extraction

---

### D-13: headerLinkButtonClasses Deduplication

**Severity:** Low (code health, not visual)

The exact same class string appears in 6 files:

```
h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline
```

| # | File | Line | Form |
|---|------|------|------|
| 1 | `app/(app)/app/dashboard/page.tsx` | 33-34 | Named `const headerLinkButtonClasses` |
| 2 | `app/(app)/app/history/components/history-sessions-tab.tsx` | 24-25 | Named `const headerLinkButtonClasses` |
| 3 | `app/(app)/app/history/components/history-questions-tab.tsx` | 35-36 | Named `const headerLinkButtonClasses` |
| 4 | `app/(app)/app/practice/components/practice-view.tsx` | 156 | Inline `className` string |
| 5 | `app/(app)/app/bookmarks/page.tsx` | 56 | Inline `className` string |
| 6 | `app/(app)/app/practice/practice-page-client.tsx` | 35 | Inline `className` string |

**Target:**

1. Create `lib/shared-styles.ts`:
```tsx
/** Header action links ("View all", "Clear filters") — Pattern Registry L-3 */
export const headerActionLinkClasses =
  'h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline';
```

2. In each of the 6 files, replace local const/inline string with:
```tsx
import { headerActionLinkClasses } from '@/lib/shared-styles';
```

**Also extract** (if 3+ consumers exist at time of implementation):
- `brandLinkClasses` (L-4 — created as part of D-8 fix)
- `hoverableRowInsideCardClasses` (I-1 — currently inline in dashboard + history)
- `mutedRowClasses` (S-2 — currently inline in dashboard + practice starter)

**Implementation note:** The current class string omits `transition-colors` — this works today because all 6 consumers apply it to `<Button variant="link">`, whose base class includes `transition-colors`. When extracting, consider adding `transition-colors` to the constant for safety in case it's ever used outside a `<Button>` context. The L-3 pattern has `hover:text-foreground`, which per X-3 requires a transition.

**Verify:** `rg -n 'headerLinkButtonClasses' app` returns 0 matches (old name removed). `rg -n 'headerActionLinkClasses' app` returns 6 app-file matches.

---

## Phase 5: Low-Severity UX Seams

Each item requires a decision. If the decision is "accept as-is," document that and close.

---

### UX-1: Pricing Subscribed-State Dead Space

**Severity:** Low
**Requires:** Decision 6

**Current** — `app/pricing/pricing-view.tsx:37`:
```
min-h-screen bg-background py-16
```

**Target** (recommended): Remove `min-h-screen`:
```
bg-background py-16
```

The outer `MarketingLayout` already uses `min-h-[100dvh]` to push the footer down.

---

### UX-2: Standalone Question Review Bookmark Gap

**Severity:** Low
**Requires:** Decision 7

**Current:** `app/(app)/app/questions/[slug]/question-page-client.tsx:311` renders the bottom action bar (`data-testid="bottom-action-bar"`) with Previous/Submit/Next/back actions only — no bookmark control.

**Target** (recommended): No code change. Document in `design-principles.md` §2 that standalone review intentionally excludes bookmark.

---

### UX-3: Marketing Shell Missing ThemeToggle

**Severity:** Low
**Requires:** Decision 3

**Current** — `components/marketing/marketing-layout.tsx:1` and `components/marketing/marketing-layout.tsx:42`: No `ThemeToggle` import, and the header action area only renders `{authNav}`.

**Target** (recommended): Add `<ThemeToggle />` to marketing header, matching app shell placement.

---

### UX-4: Clerk Dark Mode Visual Seam

**Severity:** Low
**Requires:** Decision 8

**Current:** Clerk appearance is configured with `borderRadius: '0.75rem'` (`components/providers.tsx:22`, `components/providers.tsx:33`) while the app uses `rounded-2xl` (16px) for Cards and major surfaces. Hover/focus behavior differs from app patterns.

**Target** (recommended): No code change. Accept as documented trade-off. Add a note to Pattern Registry Part 5 under "Marketing Button Overrides" or create a new "Third-Party Component Exceptions" section.

---

## Phase 6: Documentation Sync

After all code changes are complete, update docs in lockstep.

### Updates required:

1. **Pattern Registry Part 11** — Remove resolved D-items from the divergence table. Only unresolved items or approved exceptions should remain.

2. **Pattern Registry Part 4** — Add/confirm `L-6` (mobile menu link) and ensure mobile-nav classes map to that pattern.

3. **BS-035** — Update line number references and class strings to match post-fix source. Add decision log entries recording each decision outcome.

4. **Standards §17** — Update the divergence ID range to reflect only remaining items. If all resolved, remove the cross-reference section or mark as "historical."

5. **Pattern Registry Part 5** — Document the final CTA strategy (Decision 1 outcome). If an `inverted` variant was added, document it.

6. **Pattern Registry Part 10** — Update "Needs Extraction" table to reflect completed extractions. Move completed items to "Already Shared."

7. **Design Principles §2** — If Decision 7 results in a bookmark addition, update the action bar composition table.

---

## Execution Order

```
Phase 1 (no decisions needed — can start immediately)
├── D-1: History sessions hover token + A11Y-1 (role="link")
├── D-2: History questions hover token
├── D-3: Choice button hover opacity
├── D-4: Filter chip hover opacity
├── D-5: View breakdown dark overrides
├── D-6: Choice wrong-unselected opacity
├── D-7: Review navigator ring
├── D-12: Pricing dismiss hover
├── D-17: Auth/error page heading consistency
└── COMP-1: ErrorCard default padding

Phase 1.5 (needs Decision 10)
└── D-16: Mobile nav hover intensity

Phase 2 (needs Decisions 4, 5)
├── STRUCT-1: Expanded breakdown hierarchy  ← highest severity
└── AFFORD-1: Choice selected state

Phase 3 (needs Decision 1, optionally 2)
├── D-8: Brand link L-4 alignment
├── D-9: Marketing outline pill hover
├── D-10: Annual CTA variant bypass
├── D-11: Pricing raw divs → Card
├── D-14: Monthly CTA visibility         ← high severity
└── D-15: MetallicCtaButton exception

Phase 4 (no decisions needed)
└── D-13: headerLinkButtonClasses extraction

Phase 5 (needs Decisions 3, 6, 7, 8)
├── UX-1: Pricing dead space
├── UX-2: Review bookmark gap
├── UX-3: Marketing ThemeToggle
└── UX-4: Clerk seam

Phase 6 (after all code changes)
└── Documentation sync
```

**Critical path:** Decisions 1 and 4 are the most important blockers. Phase 1 can proceed immediately; D-16 depends on Decision 10 and can run in parallel with Phases 2-5 planning.

---

## Acceptance Criteria

### Code

- [ ] No non-UI neutral-surface hovers use `accent` token (`hover:bg-accent*`) in production code outside `components/ui/` (tests excluded)
- [ ] No `dark:hover:bg-foreground/*` or `dark:bg-foreground/*` in page/component code (only in `components/ui/`)
- [ ] No `hover:opacity-70` for link affordance anywhere in codebase
- [ ] No `opacity-60` for interactive dimmed states in production code (all use `opacity-50`; tests may mention prior behavior)
- [ ] No `ring-2 ring-ring` without `/50` opacity (all use `ring-[3px] ring-ring/50`)
- [ ] No `hover:bg-muted/80` (choice hover standardized to `/60`)
- [ ] No `hover:bg-muted` (100% fill) in non-UI code for neutral surface hover (mobile nav, marketing outline pills, etc.)
- [ ] `headerActionLinkClasses` exists as one shared constant; all 6 consumers import it
- [ ] Marketing + app brand links both match L-4 canonical class set
- [ ] Mobile nav inactive links use `hover:bg-muted/50` (not `hover:bg-muted`)
- [ ] All pricing card-like surfaces use `<Card>` component
- [ ] Expanded breakdown area has distinct visual separation from parent card
- [ ] Monthly pricing CTA is clearly visible in dark mode (>10% lightness contrast from card surface)
- [ ] All auth/error page H1s include `font-heading tracking-tight`
- [ ] ErrorCard default is `p-6`; no call sites pass `className="p-6"`
- [ ] Interactive history session `<li>` rows have `role="link"` when clickable

### Documentation

- [ ] Pattern Registry Part 11 contains only unresolved items or documented exceptions
- [ ] BS-035 line references match post-fix source
- [ ] All 10 decisions are recorded with outcomes in BS-035 decision log
- [ ] Pattern Registry Part 5 documents final CTA strategy
- [ ] Pattern Registry Part 10 reflects completed extractions

---

## Verification Tracer Bullets

### Per-file checks (grep-able)

| File | Must NOT contain | Must contain |
|------|-----------------|-------------|
| `app/(app)/app/history/components/history-sessions-tab.tsx` | `hover:bg-accent`, `dark:hover:bg-foreground`, `dark:border-foreground`, `dark:bg-foreground`, `headerLinkButtonClasses` (local) | `hover:bg-muted/40`, `import { headerActionLinkClasses }` |
| `app/(app)/app/history/components/history-questions-tab.tsx` | `hover:bg-accent`, `headerLinkButtonClasses` (local) | `hover:bg-muted/50`, `import { headerActionLinkClasses }` |
| `components/question/choice-button.tsx` | `hover:bg-muted/80`, `opacity-60` | `hover:bg-muted/60`, `opacity-50` |
| `components/ui/filter-chip.tsx` | `hover:bg-accent` (unselected) | `hover:bg-muted/50` |
| `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` | `ring-2 ring-ring` (without `/50`) | `ring-[3px] ring-ring/50` |
| `components/marketing/marketing-home.tsx` | `hover:bg-muted` at 100%, `bg-foreground text-background` (unless Decision 1 keeps inverted) | Standard variant-provided colors |
| `app/pricing/pricing-view.tsx` | `hover:opacity-70`, `rounded-2xl border(?:-2)? border-(?:border|primary) bg-card p-8` | `<Card>` component imports |
| `components/mobile-nav.tsx` | `hover:bg-muted` (inactive links) | `hover:bg-muted/50` |
| `components/marketing/marketing-layout.tsx` | — | L-4 brand link classes, `ThemeToggle` (if Decision 3 approved) |
| `app/(app)/app/layout.tsx` | — | L-4 brand link classes |
| `app/(app)/app/dashboard/page.tsx` | `headerLinkButtonClasses` (local const) | `import { headerActionLinkClasses }` |
| `app/(app)/app/practice/components/practice-view.tsx` | inline header link classes | `import { headerActionLinkClasses }` |
| `app/(app)/app/bookmarks/page.tsx` | inline header link classes | `import { headerActionLinkClasses }` |
| `app/(app)/app/practice/practice-page-client.tsx` | inline header link classes | `import { headerActionLinkClasses }` |
| `components/error-card.tsx` | `p-4` (default padding) | `p-6` |
| `app/sign-in/[[...sign-in]]/sign-in-page-client.tsx` | H1 without `font-heading tracking-tight` | `font-heading tracking-tight` |
| `app/sign-up/[[...sign-up]]/sign-up-page-client.tsx` | H1 without `font-heading tracking-tight` | `font-heading tracking-tight` |
| `app/(marketing)/checkout/success/checkout-success-sync.tsx` | H1 without `font-heading tracking-tight` | `font-heading tracking-tight` |
| `app/global-error.tsx` | H1 without `tracking-tight` | `tracking-tight` |
| `components/error-boundary-page.tsx` | H1/H2 without `tracking-tight` | `tracking-tight` |

### Cross-codebase checks

```bash
# No non-UI accent hover backgrounds in production code (UI primitives may use accent by design)
rg -n --glob '!components/ui/**' --glob '!**/*.test.*' --glob '!**/*.spec.*' 'hover:bg-accent' app components
# Expected: 0 matches

# No page-level dark: color overrides
rg -n 'dark:.*(?:bg|border)-foreground' app
# Expected: 0 matches

# No opacity hover for links (production code only)
rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' 'hover:opacity' app components
# Expected: 0 matches

# Shared constant migration complete
rg -n 'headerLinkButtonClasses' app
# Expected: 0 matches (old name gone)

# One definition + six app consumers
rg -n 'export const headerActionLinkClasses' lib/shared-styles.ts
rg -n 'headerActionLinkClasses' \
  'app/(app)/app/dashboard/page.tsx' \
  'app/(app)/app/history/components/history-sessions-tab.tsx' \
  'app/(app)/app/history/components/history-questions-tab.tsx' \
  'app/(app)/app/practice/components/practice-view.tsx' \
  'app/(app)/app/bookmarks/page.tsx' \
  'app/(app)/app/practice/practice-page-client.tsx'
# Expected: 1 definition match; 6 app-file matches

# Mobile nav hover no longer uses 100% muted fill
rg -n 'hover:bg-muted[\" ]' components/mobile-nav.tsx
# Expected: 0 matches

# ErrorCard default is p-6, no call sites override
rg -n 'ErrorCard.*p-6' app
# Expected: 0 matches (no overrides needed)

# All H1/H2 headings include font-heading and tracking-tight
rg -n 'font-semibold.*text-foreground' app/sign-in app/sign-up app/global-error.tsx components/error-boundary-page.tsx
# Expected: all matches include font-heading tracking-tight

# Interactive li rows have role
rg -n 'role="link"' 'app/(app)/app/history/components/history-sessions-tab.tsx'
# Expected: 1 match
```

### Visual checks (manual or screenshot diff)

1. **History sessions tab:** Hover a session row in dark mode. Background shift should be subtle but visible (~8.6% effective lightness).
2. **History sessions tab:** Expand a breakdown. Content area should be visually distinct from the row. "Review session" button should be the most prominent element.
3. **Choice button:** Hover a choice in dark mode. Background shift should be noticeable but not aggressive.
4. **Choice button:** Select a choice without submitting. Selected choice should be clearly distinguishable from unselected.
5. **Filter chip:** Hover an unselected filter chip. Background shift should match other hover patterns in intensity.
6. **Landing page pricing:** Monthly "Get Started" button must be clearly visible in dark mode.
7. **Brand links:** Both app and marketing brand links should dim slightly on hover.
8. **Mobile nav inactive links:** Hovering each entry should produce a partial muted fill (`/50`), not a full 100% muted block.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Visual regressions in history, pricing, question review | High-traffic routes look broken | Screenshot diff before/after each phase. Test dark AND light mode. |
| Marketing CTA changes reduce conversion affordance | Business impact | Gate behind Decision 1. A/B test if possible. |
| Shared-constant extraction causes import churn | PR noise, merge conflicts | Keep constant names narrow. Extract in a single commit. |
| Expanded breakdown fix changes layout flow | History page visual shift | Test with 1-question and 10-question breakdowns. Verify no overflow. |
| Clerk appearance customization adds maintenance | Future Clerk SDK updates may break | Only pursue if Decision 8 explicitly approves. Default: accept seam. |
| Phase 1 changes look identical today (muted=accent) | Feels like pointless churn | This is future-proofing. If tokens are ever differentiated (Decision 9), non-standardized code will break. |

---

## Out of Scope (Tracked Separately)

These BS-035 findings are informational or deferred. They are NOT implementation items in this spec:

| Item | BS-035 Section | Reason for Exclusion |
|------|---------------|---------------------|
| Token differentiation (`muted` vs `accent` vs `secondary`) | Root Cause §1, Open Question #4 | Separate, larger effort. Requires visual regression testing across all pages. Deferred per Decision 9. |
| Button dark mode strategy within `button.tsx` (outline=`input`, ghost=`accent`) | Cross-cutting E | By-design differentiation, not a divergence. Documented in Pattern Registry Part 5. |
| Warning background 3-tier enforcement | Cross-cutting G | Already documented as formal scale (F-2). No specific violations identified — monitoring only. |
| Error surface density drift (`min-h-[50vh]` vs `min-h-[100dvh]`) | Cross-cutting L | Minor inconsistency across error pages. Not user-facing enough to prioritize. |
| Markdown styling gaps | Cross-cutting M | `Markdown.tsx` lacks explicit link/code/heading styles. Tangential to visual consistency audit. Separate feature request if needed. |
| Skeleton card `bg-background` vs `bg-card` | Loading States section | Accepted — skeleton state intentionally flatter than real cards. |
| Neutral border opacity 3-tier scale (100% / 60% / 40%) | Cross-cutting C | By design. Pattern Registry §1.3 documents this as the canonical scale: 100% for card/section edges, 60% for subordinate rows, 40% for internal separators. Not a divergence — it IS the system. |
| Row vs Card background pattern differences | Cross-cutting D + Fix Sketch Phase 5 | By design. Dashboard/history use I-1 rows-in-Card, history-questions use I-2 standalone rows, bookmarks use Card-with-internal-links. The Pattern Registry decision tree (Part 9) explicitly guides which pattern to use based on context. These serve different UI purposes and should not be unified. |
| Bookmarks vs history-questions interaction model | Page 11 Key Observation | By design. Bookmarks use non-hoverable `<Card>` containers with interactive buttons inside (question may be reviewed OR unbookmarked — two distinct actions). History-questions rows are single-action links (the whole row is the click target). Different interaction requirements dictate different patterns. |
| `text-muted-foreground/60` unique usage | Page 9 (line 460) + session-breakdown-list | One instance in `SessionBreakdownList` for "Unanswered" labels. Unique opacity on a text token, but acceptable as a semantic de-emphasis — these labels are less important than other muted text. Too narrow to warrant a pattern or D-item. |
| Review pill missing explicit tokens | Page 10 (line 490) | The history tab "Review" pill relies on inherited text/border defaults rather than explicit tokens. This works because the defaults are correct for its context. Adding explicit tokens would be defensive but not a fix for a visible problem. |
| `bg-background/50` in feedback component | Page 8 Feedback (line 432) | Choice explanation boxes in `feedback.tsx` use `bg-background/50` — a unique treatment. This creates a subtle "recessed" effect inside the already-tinted correct/incorrect choice card, which is the intended visual result. Not a divergence pattern. |
| Past-due banner link unique underline | Page 3 Header (line 256) | Already documented as Pattern Registry L-5 (Banner Inline Link). The always-visible underline is correct for in-banner action links where persistent affordance is required. |
| Ghost button low affordance (back navigation) | Page 8 Visual QA note 1 | By design per Pattern Registry Part 5. Ghost buttons intentionally have minimal visual weight — they're for tertiary navigation ("Back to Dashboard") where the button should not compete with primary page actions. Visual QA confirmed the low affordance but validated it matches intent. |
| Desktop vs mobile nav hover strategy split | Page 3 Navigation (lines 259-263) | By design. Desktop nav uses text-only hover (L-1) because links are compact inline text. Mobile nav uses background+text hover (L-6) because entries are full-width touch targets needing stronger tappability feedback. Decision 10 covers mobile intensity but the strategic split is intentional, not a divergence. |
| FilterChip resting-state border contrast | Page 5 Visual QA note (line 318) | Visual QA flagged that unselected FilterChip border (`border-border` = 15% on 3.5% background) might read as non-interactive. D-4 fixes the hover, but the resting-state border is acceptable — filter chips always appear in groups with a visible "active" comparison, and the selected state (`border-primary bg-primary`) provides clear toggle feedback. |
| `<summary>` missing hover affordance | Page 5 Practice Starter (line 316) | The `<summary>` element in practice starter tag groups has `cursor-pointer` but no `hover:` class. Very low severity — the element has a visible disclosure triangle and cursor change. Could add `hover:text-foreground` in a future polish pass. |
| Button dark mode (outline vs ghost) uses different tokens | Cross-cutting E, BS-035 severity: Medium | Rated Medium in BS-035 severity assessment but classified as out-of-scope here because the difference (`outline` = `input` 15%, `ghost` = `accent/50` 11%) is an intentional design choice, not a bug. Outline buttons need more visual weight (borders + fill) to communicate "secondary action." Ghost buttons are deliberately understated. The differentiation is documented in Pattern Registry Part 5. The Medium severity rating in BS-035 reflects the *noticeability* of the difference, not that it needs fixing. |
| `<summary>` `outline-none` vs `focus-visible:outline-none` | Additional Audit | `practice-session-starter.tsx:215` uses `outline-none` (unconditional) instead of the canonical `focus-visible:outline-none`. Functionally identical since `focus-visible:ring-*` already replaces the outline. Could be normalized in a future polish pass. |
| 13 unused CSS tokens (`chart-1`–`chart-5`, `sidebar-*` ×8) | CSS/Tailwind deep sweep | shadcn/ui scaffolding defaults never removed from `globals.css` `@theme` block and `:root`/`.dark` variable definitions. Zero `.tsx` references. Infrastructure cleanup — not a visual divergence. |
| Dual Tailwind v3 config + v4 `@theme` block | CSS/Tailwind deep sweep | `tailwind.config.js` (v3) coexists with CSS `@theme` (v4). Color and radius definitions are duplicated. The CSS `@theme` is authoritative; the JS config is legacy. Migration debt, not visual. |
| `scrollbar-hidden` dead CSS | CSS/Tailwind deep sweep | Class defined in `globals.css:251-258` but never applied in any `.tsx` file. Dead code — should be removed in a cleanup pass. |
| All overlays share `z-50` | Shadow/Z-index deep sweep | Select, DropdownMenu, AlertDialog, and NotificationToast all use `z-50`. If a notification fires while a dialog is open, it renders behind the dialog overlay. No user-visible bug today (dialog overlay covers the viewport), but could cause issues in edge cases. Architectural concern, not visual consistency. |
| Duplicate dark variant declarations | CSS/Tailwind deep sweep | `globals.css` line 5 (`@custom-variant dark`) and line 9 (`@variant dark`) both declare the dark variant. Migration artifact from Tailwind v3 to v4 — only one is needed. |
| `aria-busy` inconsistent usage | Accessibility deep sweep | `PageLoading` uses `aria-busy="true"` on its `aria-live` region; 8 other `<output aria-live="polite">` loading states (plus 1 count-display `<output>`) do not. Accessibility polish, not visual. |
| No explicit `cursor-pointer` on FilterChip/SegmentedControl | Accessibility deep sweep | Both are `<button>` elements relying on browser default cursor behavior. Browser defaults are correct for native buttons. `cursor-pointer` only needed on non-button interactive elements (`<label>`, `<li>`, `<summary>`). |
| Redundant `shadow-sm` on `<Card>` instances | Shadow deep sweep | ~30 `<Card className="... shadow-sm">` instances across app pages. The `<Card>` component's base class already includes `shadow-sm`. Harmless no-op — removal is cosmetic cleanup only. |
| History heading wrapper uses `space-y-1` vs `mt-1` | Typography deep sweep | `history-page-client.tsx:33` wraps heading in `<div className="space-y-1">` with no `mt-1` on subtitle. All other pages use bare `<div>` + `mt-1` on `<p>`. Functionally identical (both produce 0.25rem gap). Structural inconsistency, not visual. |

---

## Coverage Assurance (React + shadcn Sweep)

Audit date: 2026-02-28.

### shadcn / `components/ui/*` coverage

All non-test files under `components/ui/` are explicitly covered by BS-035 + Standards + Pattern Registry:

- `alert-dialog.tsx`
- `button.tsx`
- `card.tsx`
- `dropdown-menu.tsx`
- `filter-chip.tsx`
- `input.tsx`
- `metallic-border.tsx`
- `metallic-cta-button.tsx`
- `notification-provider.tsx`
- `segmented-control.tsx`
- `select.tsx`
- `tab-switch-styles.ts`

### React component coverage status

All non-test files under `components/` are referenced by filename in frontend docs.

Route-level `app/**` wrappers not always cited by filename were reviewed for visual impact:

| File | Visual styling present? | Status |
|---|---|---|
| `app/pricing/pricing-client.tsx` | Yes (`SubscribeButton` sizing classes only) | Covered by pricing CTA conventions; no separate divergence |
| `app/(app)/app/history/history-page-client.tsx` | Yes (page heading wrapper classes) | Consistent with existing page heading pattern; no separate divergence |
| `app/(app)/app/practice/quick/quick-practice-client.tsx` | Minimal (`mt-4` wrapper) | Layout-only; no divergence |
| `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` | No meaningful styling (composition wrapper) | Non-visual orchestrator |
| `app/(app)/app/practice/[sessionId]/hooks/practice-session-page-controller.browser.probes.tsx` | Browser probe fixture | Test-only support surface; excluded from production UI audit |

### Conclusion

No additional shadcn primitives are missing from documentation.
No additional production React UI divergence category was discovered beyond `D-1` through `D-17` (plus `COMP-1` and `A11Y-1`, tracked in this spec).
