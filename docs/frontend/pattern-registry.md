# Pattern Registry

**Last Updated:** 2026-02-28
**Status:** Canonical — all UI changes MUST conform to this registry

Single source of truth for every visual pattern in the app. If a pattern isn't here, don't invent one — add it here first, get approval, then implement.

**Related:**
- [Frontend Standards](./standards.md) — Component APIs, accessibility rules, hook architecture, file naming
- [Design Principles](./design-principles.md) — Navigation zones, action bar composition, state persistence
- [BS-035](../brainstorming/bs-035-card-hover-and-gray-consistency-audit.md) — Audit that identified current divergences from this registry
- [DEBT-250](../debt/debt-250-frontend-visual-divergence-compliance-plan.md) — Implementation plan to resolve active divergences

---

## How to Use This Document

1. **Building new UI?** Find the matching pattern by ID, copy the canonical classes exactly.
2. **Pattern doesn't exist?** Add it here first with a rationale, then implement.
3. **Divergence found?** File it against this doc and fix the code — the registry is the source of truth.
4. **Modifying a pattern?** Update this doc first, then update all consumers.

Every pattern has an **ID** (e.g., `I-1`, `L-2`) for easy cross-referencing in code reviews, specs, and debt tickets.

---

## Part 1: Token Scales

### 1.1 Dark Mode Gray Stack

The foundation of the visual hierarchy. Every surface must sit at its correct layer.

| Layer | Token | Dark Mode Value | Approx Lightness | Role |
|-------|-------|----------------|-------------------|------|
| 0 | `--background` | `0 0% 3.5%` | 3.5% | Page background — the darkest surface |
| 1 | `--card` | `0 0% 7%` | 7% | Card surfaces — one step up from page |
| 2 | `--muted` / `--secondary` / `--accent` | `0 0% 11%` | 11% | Subdued fills, hover targets, tinted backgrounds |
| 3 | `--border` / `--input` | `0 0% 15%` | 15% | Borders, input outlines, separators |
| 4 | `--muted-foreground` | `0 0% 45%` | 45% | Secondary text, labels, timestamps |
| 5 | `--foreground` | `0 0% 93%` | 93% | Primary text, headings |

**Rule:** Surfaces must step UP this stack, never skip layers or go backwards. A hover effect on a card surface (layer 1) targets layer 2 with opacity. A hover on page background (layer 0) also targets layer 2 but needs slightly higher opacity for equivalent perceived contrast.

**Known debt:** `--muted`, `--secondary`, and `--accent` are identical values. `--border` and `--input` are identical values. If these tokens are ever differentiated, all patterns in this registry will need visual regression testing.

### 1.2 Background Opacity Scale

When to use each opacity on `bg-muted` (or equivalent layer-2 token):

| Opacity | Name | Use Case | Effective Dark Lightness |
|---------|------|----------|--------------------------|
| `/20` | Tint | Non-interactive row backgrounds inside cards | ~5% on page, ~8% inside card |
| `/40` | Subtle hover | Row hover inside cards (where card bg already elevates) | ~8.6% inside card |
| `/50` | Standard hover | Row hover on page background; tab-switch inactive hover | ~7.3% on page, ~9% inside card |
| `/60` | Emphasized hover | Choice buttons and direct-action interactive targets | ~9.4% inside card |
| `/80` | **RESERVED — do not use** | Currently on choice-button; being standardized to `/60` | — |
| `/100` | **RESERVED — do not use for hover** | Only for solid fills (e.g., tab-switch container `bg-muted`) | 11% |

**Key insight:** The same opacity produces different perceived contrast depending on the parent surface. `/40` inside a card (7% base) looks similar to `/50` on page background (3.5% base). The scale above accounts for this.

**Decision:** Hover opacity is context-dependent. Use `/40` inside cards, `/50` on page background, `/60` for direct-action targets (choices, chips).

### 1.3 Border Opacity Scale

| Opacity | Name | Use Case |
|---------|------|----------|
| `border-border` (100%) | Full | Card component edges, standalone row edges, page section dividers |
| `border-border/60` | Subdued | Rows nested inside cards (subordinate to card border), badge pills |
| `border-border/40` | Separator | Internal content separators (expanded breakdowns, reference sections) |

**Rule:** A border inside a bordered container must use a lower opacity than its parent.

### 1.4 Semantic Status Background Scale

Three-tier system for warning, success, and destructive backgrounds:

| Tier | Opacity | Name | Use Case | Example |
|------|---------|------|----------|---------|
| 1 | `/5` | Hint | Inline status indicators inside existing containers | Unanswered question reveal card |
| 2 | `/10` | Standard | Banners, toasts, standalone alert surfaces | Past-due banner, error/success toasts |
| 3 | `/15` | Emphasized | Blocking alerts requiring immediate user attention | Cancellation warning, result badges |

Applies uniformly to `bg-warning/`, `bg-success/`, `bg-destructive/` backgrounds.

**Semantic border opacities** for status surfaces:

| Token | Border Opacity | Usage |
|-------|---------------|-------|
| `border-destructive/30` | Subtle | ErrorCard, error toasts |
| `border-destructive/40` | Standard | Error toast (notification-provider) |
| `border-success/30` | Subtle | Success toasts |
| `border-warning/50` | Standard | Warning cards |
| `border-warning` (100%) | Emphasized | Cancellation alert, blocking warnings |

---

## Part 2: Surface Patterns

### S-1: Card Surface

The primary elevated container. Used for grouping related content.

```
bg-card text-card-foreground flex flex-col gap-0 rounded-2xl border p-6 shadow-sm
```

**Source:** `components/ui/card.tsx` — ALWAYS use the `<Card>` component, never raw divs.

| Variant | Override | When |
|---------|----------|------|
| Standard | (none) | Stats, containers, summaries |
| Dense | `p-4` over default `p-6` | Navigator grids, filter panels, compact layouts |
| Warning-tinted | `border-warning/50 bg-warning/5` | Inline status cards (unanswered reveal) |

**Non-interactive cards have NO hover classes.** This is intentional — "less is more." Only genuinely clickable surfaces should respond to interaction.

### S-2: Muted Row (non-interactive)

A tinted row inside a Card, used when the row is not itself clickable but may contain interactive elements.

```
rounded-xl border border-border/60 bg-muted/20 p-3
```

**Used in:** Dashboard unavailable activity rows, practice starter tag groups

**Rule:** The row border (`/60`) must be lower than the parent Card border (100%).

### S-3: Menu Popover Surface

Floating overlay for dropdowns, selects, context menus.

```
bg-popover text-popover-foreground rounded-md border p-1 shadow-md
```

**Source:** `components/ui/dropdown-menu.tsx`, `components/ui/select.tsx`

Items within popovers use `focus:bg-accent focus:text-accent-foreground` — keyboard focus drives the highlight, not hover.

### S-4: Modal Dialog Surface

Blocking dialog surface used by confirmation flows.

**Overlay:**
```
fixed inset-0 z-50 bg-background/80 backdrop-blur-sm
```

**Dialog card:**
```
fixed ... max-w-lg ... rounded-2xl border border-border bg-card p-6 text-foreground shadow-lg
```

**Source:** `components/ui/alert-dialog.tsx`

Action buttons inside dialogs use `buttonVariants` from `components/ui/button.tsx` (not ad-hoc dialog button styles).

---

## Part 3: Interactive Patterns

### I-1: Hoverable Row (inside Card)

A clickable row nested within a `<Card>` container. The card provides the primary surface; the row provides the interaction.

```
block rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Used in:** Dashboard session rows, dashboard activity rows

**Design rationale:** `/40` hover inside a card (base 7% lightness) produces ~8.6% effective lightness — a subtle, satisfying shift. The card surface already elevates the row above page background, so the hover only needs a gentle nudge.

**Must be a `<Link>` element** (entire row is the click target).

**Known divergence:** `history-sessions-tab.tsx` uses delegated row click on `<li>` + nested `<Link>` (tracked in D-1).

### I-2: Hoverable Card Row (standalone)

A clickable row directly on the page background, not inside a Card. Uses Card-like styling since it IS the container.

```
block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-muted/50
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Used in:** History questions tab rows

**Design rationale:** `/50` hover on page background (base 3.5% lightness) produces ~7.3% effective lightness — needs more opacity than I-1 because the base is darker. Uses `rounded-2xl` and `border-border` (full opacity) because it acts as its own container, matching Card radius and border.

**Must be a `<Link>` element.**

### I-3: Choice Button

Direct-action interactive target for answering questions. Needs stronger hover than navigation rows because users are making a deliberate selection.

**Base state:**
```
block w-full rounded-xl border border-border bg-background p-4 text-left shadow-sm transition-colors
focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]
```

**Hover (enabled):**
```
cursor-pointer hover:border-muted-foreground/30 hover:bg-muted/60
```

**Selected:** `border-ring`

> **Affordance concern:** The selected-but-not-submitted state is border-only — no background tint. Visual QA confirmed this can be hard to distinguish at a glance (the border shifts from 15% to 40% lightness, perceptible but subtle compared to post-submission states). If strengthened, add a light `bg-muted/20` without changing the border pattern.

**Correct:** `border-success bg-success/10 text-success-foreground`
**Incorrect:** `border-destructive bg-destructive/10 text-destructive`
**Disabled (no correctness):** `cursor-not-allowed opacity-50`
**Disabled (wrong-unselected):** `opacity-50`

**Design rationale:** `/60` provides a more definitive hover than row hover (`/40` or `/50`) because choices are direct-action targets — the user needs clear feedback that "this is what I'm about to select."

**Note:** Uses `bg-background` (not `bg-card`), so it sits at layer 0. This is intentional — choice buttons are meant to feel like standalone interactive elements, not Card subsections.

### I-4: Filter Chip

Toggle-style filter for tags, modes, difficulty levels.

**Unselected:**
```
border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-accent-foreground
```

**Selected:**
```
border-primary bg-primary text-primary-foreground
```

**Shared base:**
```
inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors
outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
disabled:pointer-events-none disabled:opacity-50
```

**Source:** `components/ui/filter-chip.tsx`

**Design rationale:** Unselected hover uses `/50` (same as standalone row hover) rather than `100%` — full-opacity hover was too aggressive and visually inconsistent with every other interactive element.

### I-5: Segmented Control Item

Tab-switch for mode selection, history tab bar, etc.

**Container:**
```
inline-flex rounded-lg border border-border bg-muted p-1
```

**Item base:**
```
rounded-md px-4 py-2 text-sm font-medium transition-colors
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Active:** `bg-primary text-primary-foreground shadow-sm`
**Inactive:** `text-muted-foreground hover:bg-muted/50 hover:text-foreground`

**Source:** `components/ui/tab-switch-styles.ts` — shared constants consumed by `SegmentedControl` and `HistoryTabBar`.

**Note:** The container is `bg-muted` (solid), so inactive item hover (`bg-muted/50`) appears as a slight intensification. The active item completely overrides with `bg-primary`.

### I-6: Icon Toggle Control (App Shell)

Compact icon-only disclosure toggle used in app chrome (example: mobile nav open/close).

```
p-2 text-muted-foreground transition-colors hover:text-foreground
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Source:** `components/mobile-nav.tsx`

**Rule:** Prefer `<Button size="icon" variant="ghost">` for standard icon actions. Raw `<button>` is acceptable for app-shell disclosure controls when this exact focus/hover treatment and accessible labeling (`aria-label`, `aria-expanded`, `aria-controls`) are present.

---

## Part 4: Link Patterns

### L-1: Nav Link

Navigation links in desktop nav, marketing nav, auth nav, and similar chrome.

```
rounded-md text-muted-foreground transition-colors hover:text-foreground
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Active variant** (desktop): add `text-foreground font-medium` (remove `text-muted-foreground`)
**Active variant** (mobile): add `bg-muted px-3 py-3 text-sm font-medium text-foreground`

**Mobile inactive** adds background hover:
```
block rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground
```

**Design rationale:** Desktop nav uses text-only hover (compact horizontal space). Mobile nav adds background hover (larger touch targets need more visual feedback).

### L-2: Content Link

Links embedded in content areas — session breakdown question lists, bookmark question links, inline references.

```
rounded-sm font-medium text-foreground hover:underline
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Design rationale:** Content links use underline-on-hover because they appear within text-heavy areas where a background color change would be visually noisy. The underline clearly communicates "this is a link" without disrupting the reading flow.

### L-3: Header Action Link

"View all", "Clear filters", pagination controls — secondary actions that appear in card/section headers.

```
h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline
```

**Applied via:** `<Button asChild variant="link" className={headerActionLinkClasses}>`

**Design rationale:** These override the link variant's default `hover:underline` because header action links are navigational controls, not content links. The text color change alone provides sufficient affordance in the context of a card header.

**IMPORTANT:** This class string must be extracted to a shared constant (see Part 10). Currently copy-pasted in 6 files.

### L-4: Brand Link

Logo/brand text links in app header and marketing header.

```
rounded-md text-sm font-semibold text-foreground transition-colors hover:text-foreground/80
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Design rationale:** Brand links are always visible (not muted), so hover dims slightly rather than brightening. This is the opposite direction from nav links (which brighten from muted to foreground).

**Note:** Current code diverges from this pattern:
- Marketing header brand link is missing `text-foreground transition-colors hover:text-foreground/80`.
- App header brand link is missing `rounded-md` + focus ring classes + `transition-colors hover:text-foreground/80`.

### L-5: Banner Inline Link

Inline action link inside status banners/alerts where persistent affordance is required.

```
underline font-medium transition-colors hover:text-foreground
```

**Source:** `app/(app)/app/layout.tsx` (past-due billing banner)

**Design rationale:** In warning banners, persistent underline is preferred over hover-only affordance so the action remains obvious at a glance.

---

## Part 5: Button Conventions

Button variants are defined in `components/ui/button.tsx` via CVA. This section documents **app-level conventions** layered on top.

### Pill Shape Convention

All standalone action buttons in the app use `rounded-full`:

```tsx
<Button className="rounded-full">Submit</Button>
<Button variant="outline" className="rounded-full">← Previous</Button>
```

**Exception:** Buttons inside error states, dialogs, and dense inline contexts keep the default `rounded-md`.

### Variant Usage Guide

| Context | Variant | Example |
|---------|---------|---------|
| Primary page action | `default` + `rounded-full` | "Go to Practice", "Submit", "Subscribe" |
| Secondary action | `outline` + `rounded-full` | "← Previous", "Next →", "Review", "Remove" |
| Tertiary/back navigation | `ghost` + `rounded-full` | "Back to Dashboard", "Back to History" |
| In-card header link | `link` + `headerActionLinkClasses` | "View all", "Clear filters" |
| Destructive confirmation | `destructive` | AlertDialog "Remove bookmark" action |
| Success indicator (navigator) | `success` + `rounded-full` | Correct question dot in navigator |
| End/abandon session | `outline` + `rounded-full` | "End session", "End exam" |
| Error recovery | `outline` (no `rounded-full`) | "Try again", "Return to dashboard" |

### Dark Mode Behavior (built into button.tsx)

| Variant | Dark Override | Notes |
|---------|-------------|-------|
| `outline` | `dark:bg-input/30 dark:border-input dark:hover:bg-input/50` | Uses `input` token (15% lightness) |
| `ghost` | `dark:hover:bg-accent/50` | Uses `accent` token (11% lightness) |
| `destructive` | `dark:bg-destructive/60` | Reduced saturation in dark |
| `success` | `dark:bg-success/60` | Reduced saturation in dark |

**Rule:** These are the ONLY dark-mode overrides for buttons. Page/component code must NEVER add `dark:` classes to buttons. If a button looks wrong in dark mode, fix the variant in `button.tsx`.

### Marketing Button Overrides

The marketing landing page has two custom button treatments that bypass the variant system:

| Button | Custom Classes | Status |
|--------|--------------|--------|
| "View pricing" / "Sign in" pills | `hover:bg-muted` (100% opacity) | **Divergent** — should use `outline` variant or standardize |
| Annual "Get Started" | `bg-foreground text-background hover:bg-foreground/90` | **Divergent** — inverted color button not available as variant |

**Decision needed:** Should a `primary-inverted` variant be added to `button.tsx`, or should the annual button use the existing `default` variant?

### MetallicCtaButton (Marketing Only)

Custom animated-border CTA used at the bottom of the landing page.

```
metallic-border animated gradient (grays #3f3f46 → #a1a1aa, 6s cycle)
├── outer: metallic-border inline-flex (animated border via CSS)
├── inner: bg-background (button face)
└── text: text-foreground + ArrowRight icon
```

**Source:** `components/ui/metallic-cta-button.tsx` + `components/ui/metallic-border.tsx` + CSS in `globals.css:193-208`

**Status:** Documented exception (D-15). Not a standard `Button` variant. Only used in one place — the bottom CTA of the landing page. If landing-page buttons are rationalized (see D-14), this may be replaced with a standard variant.

---

## Part 6: Feedback & Status Patterns

### F-1: Result Badge

Correct/incorrect indicator shown after answer submission.

**Correct:**
```
inline-flex rounded-full px-3 py-1 text-sm font-semibold bg-success/15 text-success
```

**Incorrect:**
```
inline-flex rounded-full px-3 py-1 text-sm font-semibold bg-destructive/15 text-destructive
```

**Source:** `components/question/feedback.tsx`

Uses tier 3 (`/15`) background — these are emphasized status indicators.

### F-2: Warning Surface (3-tier)

| Tier | Classes | Use Case |
|------|---------|----------|
| Hint | `border-warning/50 bg-warning/5 text-foreground` | Unanswered question reveal (inside Card) |
| Standard | `border-warning bg-warning/10 text-warning-foreground` | Past-due banner (layout-level) |
| Emphasized | `border-warning bg-warning/15 text-warning-foreground` | Cancellation scheduled alert |

### F-3: Error Surface (ErrorCard)

Inline persistent error within a page.

```
rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-sm
```

**Source:** `components/error-card.tsx` — has `role="alert"` built in.

**Never manually add `role="alert"`** when using ErrorCard.

### F-4: Toast

Transient feedback notification via `useNotification()`.

**Shell:**
```
block rounded-xl border px-4 py-3 text-sm shadow-sm
```

| Tone | Border + Background |
|------|-------------------|
| `info` | `border-border bg-card text-foreground` |
| `success` | `border-success/30 bg-success/10 text-foreground` |
| `error` | `border-destructive/40 bg-destructive/10 text-foreground` |

**Source:** `components/ui/notification-provider.tsx`

---

## Part 7: Metadata & Decoration

### M-1: Metadata Badge/Pill

Non-interactive labels for mode, difficulty, status.

```
inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-xs font-medium text-muted-foreground
```

**Used in:** Dashboard session mode badge, dashboard activity difficulty badge

**Rule:** Badges are NEVER interactive. If a badge needs to be clickable, it's a FilterChip (I-4), not a badge.

### M-2: Content Separator

Visual dividers within cards or content areas.

| Weight | Classes | Use Case |
|--------|---------|----------|
| Standard | `border-t border-border` | Major section breaks |
| Subtle | `border-t border-border/60` | Between content blocks inside cards |
| Light | `border-t border-border/40` | Internal separators (expanded breakdowns, reference sections) |

### M-3: Loading Skeleton (PageLoading)

Skeleton placeholder shown during Suspense loading.

**Outer:** `animate-pulse space-y-6` + `aria-busy="true"` + `aria-live="polite"`
**Heading bar:** `h-8 w-48 rounded-md bg-background`
**Card skeleton:** `space-y-4 rounded-2xl border border-border bg-background p-6`
**Text lines:** `h-4 bg-muted rounded` (varied widths)
**Action bar:** `h-10 w-32 bg-muted rounded`

**Source:** `components/loading/page-loading.tsx`

**Known issue:** Skeleton cards use `bg-background` instead of `bg-card`, making them visually flatter than the real cards they replace. This is acceptable for skeleton state but should be noted.

### M-4: Choice Badge Circle

The letter label (A, B, C, D) inside choice buttons.

**Default:**
```
flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground
```

**Correct:** `border-success bg-success/15 text-success`
**Incorrect:** `border-destructive bg-destructive/15 text-destructive`

---

## Part 8: State Modifiers

### X-1: Disabled

One universal disabled treatment. No exceptions.

```
disabled:pointer-events-none disabled:opacity-50
```

**Applies to:** Buttons, inputs, selects, filter chips, segmented controls, choice buttons.

**NEVER use `opacity-60`** or any other value. The `opacity-50` is the disabled standard.

### X-2: Focus Ring

One universal focus ring. No exceptions.

**Button component (built-in):**
```
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Non-Button interactive elements:**
```
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**DEPRECATED — do NOT use:**
```
ring-2 ring-ring
ring-2 ring-ring ring-offset-2
focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
```

### X-3: Transitions

Every element with a `hover:` color change MUST have `transition-colors`.

```
transition-colors hover:bg-muted/50      ← correct
hover:bg-muted/50                        ← WRONG (abrupt change)
transition-all hover:bg-muted/50         ← WRONG (animates everything, causes jank)
```

---

## Part 9: Decision Trees

### "I need a list of items"

```
Is the list inside a <Card> container?
├── YES → Use I-1 (Hoverable Row inside Card)
│         rounded-xl, border-border/60, bg-muted/20, hover:bg-muted/40
│         Is the row non-interactive?
│         └── YES → Use S-2 (Muted Row, no hover classes)
└── NO → Is each item a standalone container?
    ├── YES → Use I-2 (Hoverable Card Row standalone)
    │         rounded-2xl, border-border, shadow-sm, hover:bg-muted/50
    └── NO → Use <Card> per item with interactive elements inside
              (bookmarks pattern — Card contains buttons/links)
```

### "I need a hover effect"

```
What is the parent surface?
├── Inside a Card (bg-card, ~7% dark) → hover:bg-muted/40
├── On page background (bg-background, ~3.5% dark) → hover:bg-muted/50
├── Direct-action target (choice, chip) → hover:bg-muted/60
└── Tab-switch inactive → hover:bg-muted/50 (inside bg-muted container)

Token: ALWAYS use `muted`. Never use `accent` or `foreground` for hover.
```

### "I need a link"

```
Where is the link?
├── Navigation chrome (header, sidebar, footer) → L-1 (Nav Link)
│   text color change: text-muted-foreground → hover:text-foreground
├── Card/section header action ("View all") → L-3 (Header Action Link)
│   text color change, no underline, via Button variant="link"
├── Inline status/banner action → L-5 (Banner Inline Link)
│   persistent underline + hover:text-foreground
├── Inside content (breakdown lists, inline refs) → L-2 (Content Link)
│   hover:underline
├── Brand/logo → L-4 (Brand Link)
│   hover:text-foreground/80
└── Standalone CTA → Use Button component (not a link pattern)
```

### "I need a warning/error/success indicator"

```
Is it transient feedback?
├── YES → F-4 (Toast) via useNotification()
└── NO → Is it a persistent inline error?
    ├── YES → F-3 (ErrorCard)
    └── NO → Is it a status indicator?
        ├── Result badge → F-1 (/15 background)
        ├── Warning/alert → F-2 (pick tier: /5 hint, /10 standard, /15 emphasized)
        └── Full-page error → ErrorBoundaryPage component
```

---

## Part 10: Shared Constants (Extraction Candidates)

Patterns that are currently copy-pasted and should be extracted to shared constants.

### Already Shared

| Constant | File | Consumers |
|----------|------|-----------|
| `tabSwitchContainerClasses` | `components/ui/tab-switch-styles.ts` | SegmentedControl, HistoryTabBar |
| `tabSwitchItemBaseClasses` | same | same |
| `tabSwitchItemActiveClasses` | same | same |
| `tabSwitchItemInactiveClasses` | same | same |

### Needs Extraction

| Pattern | Current State | Proposed Constant | Proposed File |
|---------|--------------|-------------------|---------------|
| Header action link classes | Copy-pasted in 6 files (3 as `headerLinkButtonClasses` const, 3 inline) | `headerActionLinkClasses` | `lib/shared-styles.ts` |
| Hoverable row (inside Card) | Inline in dashboard, history sessions | `hoverableRowInsideCardClasses` | `lib/shared-styles.ts` |
| Muted row (non-interactive) | Inline in dashboard, practice starter | `mutedRowClasses` | `lib/shared-styles.ts` |
| Metadata badge/pill | Inline in dashboard (2 instances) | `metadataBadgeClasses` | `lib/shared-styles.ts` |

**Extraction rule:** Extract when 3+ files use the same class string. Below 3, inline is fine.

---

## Part 11: Known Divergences from This Registry

Current codebase violations tracked in [BS-035](../brainstorming/bs-035-card-hover-and-gray-consistency-audit.md). Key items:

| ID | Divergence | Canonical Pattern | Files |
|----|-----------|-------------------|-------|
| D-1 | History sessions row uses delegated `<li>` click + nested `<Link>` and `hover:bg-accent/40` + `dark:hover:bg-foreground/10` | I-1: direct `<Link>` row, `hover:bg-muted/40`, no `dark:` | `history-sessions-tab.tsx` |
| D-2 | History questions row uses `hover:bg-accent/40`, `rounded-2xl`, `border-border` | I-2: `hover:bg-muted/50` | `history-questions-tab.tsx` |
| D-3 | Choice button uses `hover:bg-muted/80` | I-3: `hover:bg-muted/60` | `choice-button.tsx` |
| D-4 | Filter chip uses `hover:bg-accent` (100%) | I-4: `hover:bg-muted/50` | `filter-chip.tsx` |
| D-5 | "View breakdown" button has 3 `dark:` overrides | Remove — let outline variant handle dark mode | `history-sessions-tab.tsx` |
| D-6 | Choice wrong-unselected uses `opacity-60` | X-1: `opacity-50` | `choice-button.tsx` |
| D-7 | Review navigator uses `ring-2 ring-ring` | X-2: `ring-[3px] ring-ring/50` | `review-question-navigator.tsx` |
| D-8 | Brand links do not match L-4 class set (missing hover/transition; app shell also missing rounded/focus classes) | L-4 canonical brand-link classes | `components/marketing/marketing-layout.tsx`, `app/(app)/app/layout.tsx` |
| D-9 | Marketing pricing pills use `hover:bg-muted` (100%) | Should use button variant or `/50` | `marketing-home.tsx` |
| D-10 | Annual pricing button bypasses variant system | Needs decision on variant | `marketing-home.tsx` |
| D-11 | Pricing page uses raw divs instead of `<Card>` | S-1: Use `<Card>` component | `pricing-view.tsx` |
| D-12 | Pricing dismiss uses `hover:opacity-70` | Should use text color or bg hover pattern | `pricing-view.tsx` |
| D-13 | `headerLinkButtonClasses` copy-pasted in 6 files | Extract to `lib/shared-styles.ts` | See Part 10 |
| D-14 | Monthly pricing CTA uses `variant="secondary"` — 4% lightness difference from card surface (`hsl(0 0% 11%)` on `hsl(0 0% 7%)`), near-invisible in dark mode | Use `default` variant, `outline` variant, or custom inverted (like Annual CTA) | `marketing-home.tsx` |
| D-15 | `MetallicCtaButton` is a documented marketing-only exception but still outside standard Button variants | Keep as explicit marketing-only exception or replace with a standard variant | `metallic-cta-button.tsx`, `marketing-home.tsx` |

---

## Appendix: Pattern Quick Reference

Compact lookup for code reviews and implementation.

| ID | Pattern | Canonical Hover | Radius | Border |
|----|---------|----------------|--------|--------|
| S-1 | Card | — (non-interactive) | `rounded-2xl` | `border` |
| S-2 | Muted Row | — (non-interactive) | `rounded-xl` | `border-border/60` |
| S-3 | Menu Popover | — | `rounded-md` | `border` |
| S-4 | Modal Dialog | — | `rounded-2xl` | `border-border` |
| I-1 | Row in Card | `hover:bg-muted/40` | `rounded-xl` | `border-border/60` |
| I-2 | Standalone Row | `hover:bg-muted/50` | `rounded-2xl` | `border-border` |
| I-3 | Choice Button | `hover:bg-muted/60` | `rounded-xl` | `border-border` |
| I-4 | Filter Chip | `hover:bg-muted/50` | `rounded-full` | `border-border` |
| I-5 | Tab Switch Item | `hover:bg-muted/50` | `rounded-md` | — |
| I-6 | Icon Toggle | `hover:text-foreground` | — | — |
| L-1 | Nav Link | `hover:text-foreground` | `rounded-md` | — |
| L-2 | Content Link | `hover:underline` | `rounded-sm` | — |
| L-3 | Header Action Link | `hover:text-foreground` | — | — |
| L-4 | Brand Link | `hover:text-foreground/80` | `rounded-md` | — |
| L-5 | Banner Inline Link | `hover:text-foreground` | — | — |
| F-3 | ErrorCard | — | `rounded-2xl` | `border-destructive/30` |
| F-4 | Toast | — | `rounded-xl` | varies by tone |
| M-1 | Badge/Pill | — | `rounded-full` | `border-border/60` |
