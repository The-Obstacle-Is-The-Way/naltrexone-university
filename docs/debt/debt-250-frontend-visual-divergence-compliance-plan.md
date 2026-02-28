# DEBT-250: Frontend Visual Divergence Compliance Plan

**Status:** Active
**Priority:** P2
**Date:** 2026-02-28
**Owner:** Frontend/UI
**Related:** [BS-035](../brainstorming/bs-035-card-hover-and-gray-consistency-audit.md), [Pattern Registry](../frontend/pattern-registry.md), [Frontend Standards](../frontend/standards.md), [Design Principles](../frontend/design-principles.md)

---

## Description

BS-035 audited every route, component, and shared primitive for visual consistency. It identified:

- **15 code divergences** (D-1 through D-15) — places where source code uses classes that violate the Pattern Registry
- **1 high-severity structural issue** — expanded breakdown visual hierarchy collapse (not a D-item, but the highest-severity finding)
- **1 medium-severity affordance concern** — choice button selected state subtlety
- **4 low-severity UX seams** — pricing dead space, missing bookmark, missing ThemeToggle, Clerk styling seam

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

The pricing root container uses `min-h-screen` (`pricing-view.tsx:37`). For subscribed users, the content is a tiny centered card (~200px), leaving ~400px of blank space.

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

---

## Phase 1: Core Interaction Consistency

Foundation fixes for hover tokens, state modifiers, and focus rings. No decisions required — all have clear canonical targets.

---

### D-1: History Sessions Row Hover Token + Dark Override

**Severity:** Medium
**Pattern:** I-1 (Hoverable Row inside Card)

**Current** — `history-sessions-tab.tsx:185`:
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

**Verify:** `grep -n 'hover:bg-accent' history-sessions-tab.tsx` returns 0 matches. `grep -n 'dark:hover:bg-foreground' history-sessions-tab.tsx` returns 0 matches.

---

### D-2: History Questions Row Hover Token

**Severity:** Medium
**Pattern:** I-2 (Hoverable Card Row, standalone)

**Current** — `history-questions-tab.tsx:464`:
```
block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Target:**
```
block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Changes:**
1. `hover:bg-accent/40` → `hover:bg-muted/50` (standalone rows on page background use `/50`)

**Verify:** `grep -n 'hover:bg-accent' history-questions-tab.tsx` returns 0 matches.

---

### D-3: Choice Button Hover Opacity

**Severity:** Medium
**Pattern:** I-3 (Choice Button)

**Current** — `choice-button.tsx:30`:
```
cursor-pointer hover:border-muted-foreground/30 hover:bg-muted/80
```

**Target:**
```
cursor-pointer hover:border-muted-foreground/30 hover:bg-muted/60
```

**Changes:**
1. `hover:bg-muted/80` → `hover:bg-muted/60` (direct-action targets use `/60`, not `/80`)

**Verify:** `grep -n 'muted/80' choice-button.tsx` returns 0 matches.

---

### D-4: Filter Chip Hover Opacity

**Severity:** Medium
**Pattern:** I-4 (Filter Chip)

**Current** — `filter-chip.tsx:28`:
```
border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground
```

**Target:**
```
border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-accent-foreground
```

**Changes:**
1. `hover:bg-accent` (100%!) → `hover:bg-muted/50` (standard interactive hover)

**Verify:** `grep -n 'hover:bg-accent' filter-chip.tsx` returns 0 matches.

---

### D-5: View Breakdown Button Dark Overrides

**Severity:** Low
**Pattern:** Part 5 rule — no `dark:` overrides outside `components/ui/`

**Current** — `history-sessions-tab.tsx:244`:
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

**Verify:** `grep -n 'dark:' history-sessions-tab.tsx` returns 0 matches for color/bg overrides.

---

### D-6: Choice Wrong-Unselected Opacity

**Severity:** Low
**Pattern:** X-1 (Disabled — `opacity-50` universal)

**Current** — `choice-button.tsx:33`:
```
correctness === 'wrong-unselected' && 'opacity-60',
```

**Target:**
```
correctness === 'wrong-unselected' && 'opacity-50',
```

**Changes:**
1. `opacity-60` → `opacity-50` (align with universal disabled/dimmed treatment)

**Verify:** `grep -rn 'opacity-60' components/question/` returns 0 matches.

---

### D-7: Review Navigator Ring Style

**Severity:** Low
**Pattern:** X-2 (Focus Ring — `ring-[3px] ring-ring/50`)

**Current** — `review-question-navigator.tsx:58`:
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

**Verify:** `grep -rn 'ring-2' app/(app)/app/questions/` returns 0 matches.

---

### D-12: Pricing Dismiss Hover Strategy

**Severity:** Low
**Pattern:** Link hover must use text-color or bg-color, never `opacity`

**Current** — `pricing-view.tsx:75`:
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

**Verify:** `grep -rn 'hover:opacity' app/pricing/` returns 0 matches.

---

## Phase 2: Structural & Affordance Fixes

Items that require decisions but have clear recommended paths. These are the highest-impact visual issues.

---

### STRUCT-1: Expanded Breakdown Visual Hierarchy

**Severity:** HIGH (highest in entire audit)
**Requires:** Decision 4
**BS-035 Section:** Root Cause Analysis §4, Proposed Fix Sketch Phase 2

**Problem:** When a history session card is expanded via "View breakdown", the expanded content area sits inside the same `bg-muted/20` container with only a `border-t border-border/40` separator. The separator is nearly invisible (40% opacity on 15% gray = ~6% effective). The "Review session" outline button nearly disappears against the muted background.

**Current** — `history-sessions-tab.tsx` (expanded breakdown area, after the session summary row):
```tsx
<div className="mt-3 space-y-2 border-t border-border/40 pt-3">
  <Button variant="outline" ... >Review session</Button>
  <SessionBreakdownList ... />
</div>
```

**Target** (recommended):
```tsx
<div className="mt-3 -mx-1 space-y-2 rounded-lg border border-border/30 bg-background/60 p-3">
  <Button variant="default" ... >Review session</Button>
  <SessionBreakdownList ... />
</div>
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

**Current** — `choice-button.tsx` (selected state):
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

**Marketing brand link** — `marketing-layout.tsx:16-17`:
```tsx
const brandLinkClass =
  'rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';
```
**Missing:** `text-foreground transition-colors hover:text-foreground/80`

**App brand link** — `layout.tsx:80`:
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

**Current** — `marketing-home.tsx:57-58`:
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

**Current** — `marketing-home.tsx:229-234`:
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

**Current** — `pricing-view.tsx` has 4 raw card-like divs:

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

**Verify:** `grep -n 'rounded-2xl border.*bg-card' pricing-view.tsx` returns 0 matches (all replaced with `<Card>`).

---

### D-14: Monthly CTA Invisible in Dark Mode

**Severity:** HIGH
**Requires:** Decision 1

**Current** — `marketing-home.tsx:202-208`:
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

**Current** — `marketing-home.tsx:254-256`:
```tsx
<MetallicCtaButton href={ROUTES.PRICING}>
  Get Started
</MetallicCtaButton>
```

Source files: `components/ui/metallic-cta-button.tsx`, `components/ui/metallic-border.tsx`, CSS in `globals.css:183-208`.

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

**Verify:** `grep -rn 'headerLinkButtonClasses' app/` returns 0 matches (old name removed). `grep -rn 'headerActionLinkClasses' app/` returns 6 matches (new shared import).

---

## Phase 5: Low-Severity UX Seams

Each item requires a decision. If the decision is "accept as-is," document that and close.

---

### UX-1: Pricing Subscribed-State Dead Space

**Severity:** Low
**Requires:** Decision 6

**Current** — `pricing-view.tsx:37`:
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

**Current:** `app/(app)/app/questions/[slug]/question-page-client.tsx` has no bookmark button in its action bar.

**Target** (recommended): No code change. Document in `design-principles.md` §2 that standalone review intentionally excludes bookmark.

---

### UX-3: Marketing Shell Missing ThemeToggle

**Severity:** Low
**Requires:** Decision 3

**Current** — `components/marketing/marketing-layout.tsx`: No `ThemeToggle` import or rendering.

**Target** (recommended): Add `<ThemeToggle />` to marketing header, matching app shell placement.

---

### UX-4: Clerk Dark Mode Visual Seam

**Severity:** Low
**Requires:** Decision 8

**Current:** Clerk's `borderRadius: 0.75rem` (12px) vs app's `rounded-2xl` (16px). Hover/focus behavior differs from app patterns.

**Target** (recommended): No code change. Accept as documented trade-off. Add a note to Pattern Registry Part 5 under "Marketing Button Overrides" or create a new "Third-Party Component Exceptions" section.

---

## Phase 6: Documentation Sync

After all code changes are complete, update docs in lockstep.

### Updates required:

1. **Pattern Registry Part 11** — Remove resolved D-items from the divergence table. Only unresolved items or approved exceptions should remain.

2. **BS-035** — Update line number references and class strings to match post-fix source. Add decision log entries recording each decision outcome.

3. **Standards §17** — Update the divergence ID range to reflect only remaining items. If all resolved, remove the cross-reference section or mark as "historical."

4. **Pattern Registry Part 5** — Document the final CTA strategy (Decision 1 outcome). If an `inverted` variant was added, document it.

5. **Pattern Registry Part 10** — Update "Needs Extraction" table to reflect completed extractions. Move completed items to "Already Shared."

6. **Design Principles §2** — If Decision 7 results in a bookmark addition, update the action bar composition table.

---

## Execution Order

```
Phase 1 (no decisions needed — can start immediately)
├── D-1: History sessions hover token
├── D-2: History questions hover token
├── D-3: Choice button hover opacity
├── D-4: Filter chip hover opacity
├── D-5: View breakdown dark overrides
├── D-6: Choice wrong-unselected opacity
├── D-7: Review navigator ring
└── D-12: Pricing dismiss hover

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

**Critical path:** Decisions 1 and 4 are the most important blockers. Phase 1 can proceed in parallel with decision-making for Phases 2-5.

---

## Acceptance Criteria

### Code

- [ ] No `hover:bg-accent` anywhere in app code (all standardized to `hover:bg-muted/*`)
- [ ] No `dark:hover:bg-foreground/*` or `dark:bg-foreground/*` in page/component code (only in `components/ui/`)
- [ ] No `hover:opacity-70` for link affordance anywhere in codebase
- [ ] No `opacity-60` for interactive dimmed states (all use `opacity-50`)
- [ ] No `ring-2 ring-ring` without `/50` opacity (all use `ring-[3px] ring-ring/50`)
- [ ] No `hover:bg-muted/80` (choice hover standardized to `/60`)
- [ ] No `hover:bg-muted` or `hover:bg-accent` at 100% opacity for interactive hover (only for solid fills like tab-switch container)
- [ ] `headerActionLinkClasses` exists as one shared constant; all 6 consumers import it
- [ ] Marketing + app brand links both match L-4 canonical class set
- [ ] All pricing card-like surfaces use `<Card>` component
- [ ] Expanded breakdown area has distinct visual separation from parent card
- [ ] Monthly pricing CTA is clearly visible in dark mode (>10% lightness contrast from card surface)

### Documentation

- [ ] Pattern Registry Part 11 contains only unresolved items or documented exceptions
- [ ] BS-035 line references match post-fix source
- [ ] All 9 decisions are recorded with outcomes in BS-035 decision log
- [ ] Pattern Registry Part 5 documents final CTA strategy
- [ ] Pattern Registry Part 10 reflects completed extractions

---

## Verification Tracer Bullets

### Per-file checks (grep-able)

| File | Must NOT contain | Must contain |
|------|-----------------|-------------|
| `history-sessions-tab.tsx` | `hover:bg-accent`, `dark:hover:bg-foreground`, `dark:border-foreground`, `dark:bg-foreground`, `headerLinkButtonClasses` (local) | `hover:bg-muted/40`, `import { headerActionLinkClasses }` |
| `history-questions-tab.tsx` | `hover:bg-accent`, `headerLinkButtonClasses` (local) | `hover:bg-muted/50`, `import { headerActionLinkClasses }` |
| `choice-button.tsx` | `hover:bg-muted/80`, `opacity-60` | `hover:bg-muted/60`, `opacity-50` |
| `filter-chip.tsx` | `hover:bg-accent` (unselected) | `hover:bg-muted/50` |
| `review-question-navigator.tsx` | `ring-2 ring-ring` (without `/50`) | `ring-[3px] ring-ring/50` |
| `marketing-home.tsx` | `hover:bg-muted` at 100%, `bg-foreground text-background` (unless Decision 1 keeps inverted) | Standard variant-provided colors |
| `pricing-view.tsx` | `hover:opacity-70`, `rounded-2xl border.*bg-card` (raw divs) | `<Card>` component imports |
| `marketing-layout.tsx` | — | L-4 brand link classes, `ThemeToggle` (if Decision 3 approved) |
| `layout.tsx` (app) | — | L-4 brand link classes |
| `dashboard/page.tsx` | `headerLinkButtonClasses` (local const) | `import { headerActionLinkClasses }` |
| `practice-view.tsx` | inline header link classes | `import { headerActionLinkClasses }` |
| `bookmarks/page.tsx` | inline header link classes | `import { headerActionLinkClasses }` |
| `practice-page-client.tsx` | inline header link classes | `import { headerActionLinkClasses }` |

### Cross-codebase checks

```bash
# No accent token used for hover backgrounds
grep -rn 'hover:bg-accent' app/ components/ --include='*.tsx' | grep -v node_modules
# Expected: 0 matches (or only inside components/ui/ if variant-level)

# No page-level dark: color overrides
grep -rn 'dark:.*bg-foreground' app/ --include='*.tsx'
# Expected: 0 matches

# No opacity hover for links
grep -rn 'hover:opacity' app/ components/ --include='*.tsx'
# Expected: 0 matches

# Shared constant is the single source
grep -rn 'headerLinkButtonClasses' app/ --include='*.tsx'
# Expected: 0 matches (old name gone)

grep -rn 'headerActionLinkClasses' app/ lib/ --include='*.ts' --include='*.tsx'
# Expected: 7 matches (1 definition + 6 imports)
```

### Visual checks (manual or screenshot diff)

1. **History sessions tab:** Hover a session row in dark mode. Background shift should be subtle but visible (~8.6% effective lightness).
2. **History sessions tab:** Expand a breakdown. Content area should be visually distinct from the row. "Review session" button should be the most prominent element.
3. **Choice button:** Hover a choice in dark mode. Background shift should be noticeable but not aggressive.
4. **Choice button:** Select a choice without submitting. Selected choice should be clearly distinguishable from unselected.
5. **Filter chip:** Hover an unselected filter chip. Background shift should match other hover patterns in intensity.
6. **Landing page pricing:** Monthly "Get Started" button must be clearly visible in dark mode.
7. **Brand links:** Both app and marketing brand links should dim slightly on hover.

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
