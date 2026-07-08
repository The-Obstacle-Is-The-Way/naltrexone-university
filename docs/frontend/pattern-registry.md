# Pattern Registry

**Last Updated:** 2026-07-07
**Status:** Canonical — all UI changes MUST conform to this registry

Single source of truth for every visual pattern in the app. If a pattern isn't here, don't invent one — add it here first, get approval, then implement.

**Related:**
- [Frontend Standards](./standards.md) — Component APIs, accessibility rules, hook architecture, file naming
- [Design Principles](./design-principles.md) — Navigation zones, action bar composition, state persistence
- [Contrast Policy](./contrast-policy.md) — WCAG AA contrast targets and required-boundary rules
- [BS-035](../_archive/brainstorming/bs-035-card-hover-and-gray-consistency-audit.md) — Audit that identified current divergences from this registry
- [DEBT-250](../_archive/debt/debt-250-frontend-visual-divergence-compliance-plan.md) — Implementation plan and resolution history for frontend divergences

---

## How to Use This Document

1. **Building new UI?** Find the matching pattern by ID, copy the canonical classes exactly.
2. **Pattern doesn't exist?** Add it here first with a rationale, then implement.
3. **Divergence found?** File it against this doc and fix the code — the registry is the source of truth.
4. **Modifying a pattern?** Update this doc first, then update all consumers.
5. **Any new/changed pattern MUST meet contrast targets** (or explicitly document a temporary exception). See `docs/frontend/contrast-policy.md`.

Every pattern has an **ID** (e.g., `I-1`, `L-2`) for easy cross-referencing in code reviews, specs, and debt tickets.

---

## Review Surface Map

Lightweight map of the review-related surfaces that matter for routing and chrome consistency. This is intentionally smaller than a full page registry.

**Maintenance rule:** update this table in the same PR whenever a review surface is added, removed, or changes its route/origin, primary renderer, navigator family, or exit model.

| Surface | Route / Origin | Primary Renderer | Navigator Family | Exit Model | Owner Doc |
|---------|----------------|------------------|------------------|------------|-----------|
| Review & Submit | `/app/practice/[sessionId]` before final exam submit | `ExamReviewView` | None | In-session submit to post-exam review | [BS-061](../_archive/brainstorming/bs-061-review-surface-divergence-audit.md) |
| Post-Exam Review | `/app/practice/[sessionId]` after exam finalization | `PostExamReviewView` | `QuestionNavigator` (callback / in-memory) | In-session `View Summary` / `Finish review` | [BS-061](../_archive/brainstorming/bs-061-review-surface-divergence-audit.md) |
| Session Summary | `/app/practice/[sessionId]` after session completion | `SessionSummaryView` | None | Route exits to Practice / History; `Review your answers` currently routes into summary-origin standalone review (tracked in [BS-061](../_archive/brainstorming/bs-061-review-surface-divergence-audit.md)) | [BS-061](../_archive/brainstorming/bs-061-review-surface-divergence-audit.md) |
| Standalone Review — summary origin | `/app/questions/[slug]?from=summary&mode=review&sessionId=...` | `QuestionView` in `question-page-client.tsx` | `ReviewQuestionNavigator` (`Link` / route) | Route back to practice-session summary | [BS-061](../_archive/brainstorming/bs-061-review-surface-divergence-audit.md), [BS-059](../brainstorming/bs-059-practice-session-action-bar-button-arrangement.md) |
| Standalone Review — history origin | `/app/questions/[slug]?from=history&mode=review&sessionId=...` | `QuestionView` in `question-page-client.tsx` | `ReviewQuestionNavigator` (`Link` / route) | Route back to History | [BS-059](../brainstorming/bs-059-practice-session-action-bar-button-arrangement.md) |
| Standalone Review — dashboard / bookmarks / practice origins | `/app/questions/[slug]?from=dashboard\|bookmarks\|practice...` | `QuestionView` in `question-page-client.tsx` | `ReviewQuestionNavigator` (`Link` / route) | Route back to origin-specific page | [BS-059](../brainstorming/bs-059-practice-session-action-bar-button-arrangement.md) |

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
| 4 | `--muted-foreground` | `0 0% 51.5%` | 51.5% | Secondary text, labels, timestamps |
| 5 | `--foreground` | `0 0% 93%` | 93% | Primary text, headings |

**Rule:** Surfaces must step UP this stack, never skip layers or go backwards. A hover effect on a card surface (layer 1) targets layer 2 with opacity. A hover on page background (layer 0) also targets layer 2 but needs slightly higher opacity for equivalent perceived contrast.

**Known debt:** `--muted`, `--secondary`, and `--accent` are identical values. `--border` and `--input` are identical values. If these tokens are ever differentiated, all patterns in this registry will need visual regression testing.

### 1.1a Light Mode Gray Stack

Light mode uses the same semantic tokens, but the layer ordering is inverted (page background is light, text is dark). Values below are sourced from `app/globals.css` `:root`.

| Layer | Token | Light Mode Value | Approx Lightness | Role |
|-------|-------|------------------|------------------|------|
| 0 | `--background` | `0 0% 100%` | 100% | Page background — the lightest surface |
| 1 | `--card` | `0 0% 100%` | 100% | Card surfaces (no elevation via fill in light mode; relies on border/shadow) |
| 2 | `--muted` / `--secondary` / `--accent` | `210 40% 96.1%` | 96.1% | Subdued fills, hover targets, tinted backgrounds |
| 3 | `--border` / `--input` | `214.3 31.8% 91.4%` | 91.4% | Borders, input outlines, separators |
| 4 | `--muted-foreground` | `215.4 16.3% 46.9%` | 46.9% | Secondary text, labels, timestamps |
| 5 | `--foreground` | `222.2 84% 4.9%` | 4.9% | Primary text, headings |

**Known debt (light mode):** `--muted`, `--secondary`, and `--accent` are identical values. `--border` and `--input` are identical values.

### 1.2 Background Opacity Scale

When to use each opacity on `bg-muted` (or equivalent layer-2 token):

| Opacity | Name | Use Case | Effective Dark Lightness |
|---------|------|----------|--------------------------|
| `/20` | Tint | Non-interactive row backgrounds inside cards | ~5% on page, ~8% inside card |
| `/40` | Subtle hover | Row hover inside cards (where card bg already elevates) | ~8.6% inside card |
| `/50` | Standard hover | Row hover on page background; tab-switch inactive hover | ~7.3% on page, ~9% inside card |
| `/60` | Emphasized hover | Exception-only emphasized hover (no current canonical consumers) | ~9.4% inside card |
| `/80` | **RESERVED — do not use** | Legacy hover intensity slot (no current approved usage) | — |
| `/100` | **RESERVED — do not use for hover** | Only for solid fills (e.g., tab-switch container `bg-muted`) | 11% |

**Key insight:** The same opacity produces different perceived contrast depending on the parent surface. `/40` inside a card (7% base) looks similar to `/50` on page background (3.5% base). The scale above accounts for this.

**Decision:** Hover opacity is context-dependent. Use `/40` inside cards when the pattern is intentionally using the muted/layer-2 hover scale, `/50` on page background when the hover is driven by that same muted/layer-2 scale, and the foreground-ramp tonal row contracts documented below for I-1, I-2, I-3, and I-4. `/60` is exception-only and requires explicit design review.

**Foreground-ramp tonal row scale (parent-aware):**

| Context | Rest fill | Hover fill | Notes |
|---------|-----------|------------|-------|
| In-card tonal row | `bg-foreground/5` | `hover:bg-foreground/[0.08]` | Use when a Card already provides the primary surface (Dashboard I-1 rows). |
| On-page tonal row | `bg-foreground/[0.08]` | `hover:bg-foreground/[0.12]` | Use for standalone navigation rows on `bg-background` (History I-2 rows). Disclosure-primary rows on page background may omit hover entirely while keeping the raised rest fill (History sessions). |

**Light-mode caveat (Decision 12 resolved):** This scale was designed for dark mode where `--muted` at 11% lightness provides ample contrast headroom. In light mode, `--muted` at 96.1% lightness is only 3.9% from white — opacities below `/100` produce imperceptible fill contrast. The system intentionally uses background-fill deltas as the primary hover channel for tonal rows, paired with non-fill affordances such as cursor state, CTA labels, and the shared focus ring. Add border/text/shadow hover reinforcement only when the fill delta is not sufficient for the specific surface.

### 1.3 Border Opacity Scale

| Opacity | Name | Use Case |
|---------|------|----------|
| `border-border` (100%) | Full | Card component edges, standalone row edges, page section dividers |
| `border-border/60` | Subdued | Base/light-mode rows nested inside cards (subordinate to card border), badge pills |
| `border-border/40` | Separator | Internal content separators. Use the question-flow-specific override patterns for feedback reference sections/callouts where dark-mode contrast needs strengthening. |
| `dark:border-foreground/40` | Required dark boundary override | Required interactive boundaries on dark surfaces that fail 3:1 with `border-border/60` |

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
| `border-destructive` | Standard | ErrorCard, error toasts |
| `border-success/60` | Standard | Success toasts |
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

**Default variant (bordered):**
```
rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:border-foreground/40
```

**Used in:** No active consumer. Retained for bordered muted groups that still need explicit container stroke.

**Rule:** The row border (`/60`) must be lower than the parent Card border (100%).

**Practice variant (borderless tonal fill):**
```
group rounded-xl bg-foreground/5
```

**Used in:** Practice starter Topic / Substance / Treatment filter containers

**Design rationale:** Applies the same tonal-fill elevation principle as the dashboard nested-row fix while preserving the wider practice filter spacing. The container owns the tonal surface, but the interactive hit area lives on the summary row: `<summary>` uses `rounded-lg px-4 py-3 transition-colors [&::-webkit-details-marker]:hidden` so the full visible header toggles the disclosure and Safari/WebKit does not render a duplicate native marker next to the custom chevron. Expanded content keeps its own `px-4 pb-3` wrapper below the summary. The `<summary>` label, disclosure behavior, pointer cursor, and keyboard focus ring identify the control; right-side metadata is conditional: when nothing is selected it shows `All included by default`, and when selections exist it shows `{N} selected`. Expanded sections render `({N} selected)` below the chip fieldset as subordinate footer metadata. The fill is supplementary rather than a required boundary. Secondary metadata on this surface uses `text-foreground/60` rather than `text-muted-foreground` to preserve AA contrast on `bg-foreground/5`. The chevron icon uses `size-4 text-foreground/60 transition-transform group-open:rotate-180` on a parent `<details class="group">`. See [DEBT-290](../_archive/debt/debt-290-practice-filter-tonal-fill-elevation.md), [DEBT-292](../_archive/debt/debt-292-filter-section-disclosure-indicator.md), and [DEBT-296](../_archive/debt/debt-296-filter-section-summary-hierarchy-swap.md).

**Dashboard variant (borderless tonal fill):**
```
rounded-xl bg-foreground/5 p-3
```

**Used in:** Dashboard unavailable activity rows (question no longer available)

**Design rationale:** Matches the I-1 dashboard variant's borderless tonal fill approach for visual consistency within the same container. Static rows use the rest fill only — no hover or transition since the row is non-interactive. See [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md) for the full design research.

**Page-background sibling variant:**
```
rounded-2xl bg-foreground/[0.08] p-4
```

**Used in:** History questions unavailable rows, bookmarks unavailable rows

**Design rationale:** Matches the History questions clickable-row family while accounting for the darker page background. The unavailable state is communicated by the copy and metadata; the tonal fill keeps the row in the same visual family without reintroducing legacy border/shadow chrome. When a static sibling still contains a separate action button (for example, bookmark removal), the row itself stays non-interactive and the button remains the only action target. See [DEBT-302](../_archive/debt/debt-302-history-row-fill-and-affordance-cleanup.md) and [DEBT-307](../_archive/debt/debt-307-bookmarks-row-visual-unification.md).

### S-3: Menu Popover Surface

Floating overlay for dropdowns, selects, context menus.

```
bg-popover text-popover-foreground rounded-md border p-1 shadow-md
```

**Source:** `components/ui/dropdown-menu.tsx`, `components/ui/select.tsx`

Items within popovers use `focus:bg-accent focus:text-accent-foreground` — keyboard focus drives the highlight, not hover.

**SelectContent (exact)** — `components/ui/select.tsx:59`:
```text
bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-96 min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border shadow-md
```

**Select viewport padding:** `components/ui/select.tsx:70` uses `p-1`.

**DropdownMenuContent (exact)** — `components/ui/dropdown-menu.tsx:45`:
```text
bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md
```

**DropdownMenuItem (exact)** — `components/ui/dropdown-menu.tsx:77`:
```text
focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
```

**DropdownMenuCheckboxItem / RadioItem (exact)** — `components/ui/dropdown-menu.tsx:95`, `components/ui/dropdown-menu.tsx:131`:
```text
focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
```

**DropdownMenuSubContent (exact)** — `components/ui/dropdown-menu.tsx:233`:
```text
bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg
```

### S-4: Modal Dialog Surface

Blocking dialog surface used by confirmation flows.

**Overlay:**
```
fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
```

**Dialog card:**
```
fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-border bg-card p-6 text-foreground shadow-lg outline-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:w-full
```

**Sources:** `components/ui/alert-dialog.tsx`, `components/ui/dialog.tsx`

General-purpose dialogs reuse the same overlay and card class strings as alert dialogs. If a dialog
needs a scroll-safe mobile variant or any other overlay/card change, document the S-4 variant here
before adding new production UI classes.

Action buttons inside dialogs use `buttonVariants` from `components/ui/button.tsx` (not ad-hoc dialog button styles).

---

## Part 3: Interactive Patterns

### I-1: Hoverable Row (inside Card)

A clickable row nested within a `<Card>` container. The card provides the primary surface; the row provides the interaction.

**Default variant (bordered):**
```
block rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40
dark:border-foreground/40 dark:hover:border-foreground/70
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Used in:** No active consumer. Retained for nested-card rows that still need an explicit stroked inner boundary.

**Design rationale:** `/40` hover inside a card (base 7% lightness) produces ~8.6% effective lightness — a subtle, satisfying shift. The card surface already elevates the row above page background, so the hover only needs a gentle nudge.

**Tonal-fill variant (Dashboard):**
```
block rounded-xl bg-foreground/5 p-3 transition-colors hover:bg-foreground/[0.08]
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Used in:** Dashboard session rows, dashboard activity rows

**Design rationale:** When a parent surface or surrounding layout already establishes hierarchy, bordered inner rows create visual noise. Borderless tonal fill elevation follows Material Design 3's approach: rows are defined by fill shape only (`bg-foreground/5`), with hover producing a monotonic brightness lift (`hover:bg-foreground/[0.08]`). Both rest and hover use the same `foreground` color scale to avoid non-monotonic brightness (mixing scales causes hover inversion — see [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md)). The tonal fill is a supplementary hierarchy hint, not a required boundary per [Contrast Policy §3.2](./contrast-policy.md) — row identification comes from text content, cursor, hover fill, and focus ring.

**History sessions note:** History sessions reuse the same borderless tonal-fill family, but because they sit directly on `bg-background` and are disclosure-primary, the page-background adaptation is `rounded-xl bg-foreground/[0.08] p-3` with no row-level hover or `transition-colors`. The chevron, `cursor-pointer`, nested review Link, and focus ring communicate interaction while the raised rest fill supplies the hierarchy. See [DEBT-302](../_archive/debt/debt-302-history-row-fill-and-affordance-cleanup.md).

**Reuse candidate:** This variant is suitable for any nested-card list pattern where the parent surface already provides hierarchy, or for page-background hybrids that intentionally avoid adding a wrapping Card.

**Must be a `<Link>` element** (entire row is the click target).

**Known structural exception:** `history-sessions-tab.tsx` uses delegated row click on `<li>` + nested `<Link>` to avoid nested link-role conflicts with inner links (`A11Y-1` resolution). DEBT-301 kept that interaction model but realigned the visual tokens to this tonal-fill variant on page background.

### I-2: Hoverable Row (standalone)

A clickable row directly on the page background, not inside a Card.

```
block rounded-2xl bg-foreground/[0.08] p-4 transition-colors hover:bg-foreground/[0.12]
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Used in:** History questions available rows, bookmarks available rows

**Design rationale:** On page background, standalone rows need a stronger foreground-ramp rest fill than in-card rows to achieve the same perceived lift. `bg-foreground/[0.08]` at rest and `hover:bg-foreground/[0.12]` on hover keep the hover step visible against `bg-background` without reintroducing border/shadow chrome. The row reads as interactive via its content, hover lift, and focus ring. See [DEBT-302](../_archive/debt/debt-302-history-row-fill-and-affordance-cleanup.md) and [DEBT-307](../_archive/debt/debt-307-bookmarks-row-visual-unification.md).

**Default structure:** Entire row is a `<Link>` element.

**Multi-action variant (Bookmarks):** When the row also needs a separate secondary action, keep the same visual tokens on a non-focusable container (`<div className="cursor-pointer ...">`), keep the primary title as the explicit `<Link>`, and delegate pointer clicks on the container to the same href. Guard nested interactive descendants with `closest('a,button,input,select,textarea,[role="button"],[role="link"]')` so the title link and secondary button do not double-trigger. Focus rings stay on the explicit controls, not the row container.

### I-3: Choice Button

Direct-action interactive target for answering questions. Choices render inside `QuestionCard` (`bg-card`) and use a hybrid pattern: a tonal child surface plus a required boundary because the row itself is the clickable control.

**Base state:**
```
block w-full rounded-xl border border-foreground/50 bg-background/50 p-4 text-left shadow-sm transition-colors
dark:border-foreground/40 dark:bg-background/50
focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]
```

**Hover (enabled):**
```
cursor-pointer
```

**Hover (unselected only — border + fill):**
```
hover:border-foreground/55 hover:bg-foreground/[0.06] dark:hover:border-foreground/50 dark:hover:bg-foreground/[0.05]
```

**Selected (neutral):** `border-ring bg-foreground/[0.08] dark:border-foreground/70 dark:bg-foreground/[0.12]`

**Correct:** `border-success bg-success/10 text-success`
**Incorrect:** `border-destructive bg-destructive/10 text-destructive`
**Disabled (no correctness):** `cursor-not-allowed opacity-50`
**Wrong-unselected dimming:** do not apply parent opacity to the whole label subtree; keep answer content text at `text-foreground` for WCAG AA legibility.

**Design rationale:** Choice buttons are rendered inside `QuestionCard` (`bg-card`) and follow in-card row hierarchy, not standalone page-surface hierarchy. The row is also the direct-action control, so unlike borderless tonal rows it still needs a clearly compliant boundary per [Contrast Policy §3.2](./contrast-policy.md). In light mode, the older `border-border/60 bg-muted/20` recipe was too quiet on white card surfaces; `border-foreground/50 bg-background/50` keeps the required boundary strong while restoring a clean white rest surface. In dark mode, `dark:bg-background/50` intentionally recesses the row beneath the card's 7% surface to about 5.25% lightness, mirroring the crisp feedback-card treatment instead of reviving the muddy DEBT-312 gray veil. Hover and selected fills switch to foreground-based replacements that are evaluated directly against `bg-card`, not layered on top of the recessed rest fill: dark mode steps `5.25 -> 11.3 -> 17.3`, while light mode stays clean at rest and lifts to subtle foreground tints for hover and selected. Keep the hover border/fill tokens on the unselected branch only so selected neutral rows do not regress when hovered.

**Behavior:** In tutor mode and Quick Practice, pointer activation on a choice commits the answer immediately by invoking the submit flow. Keyboard/AT radio selection (arrow keys, Space, or an activation synthesized without `pointerdown`) only selects the choice and exposes the action-bar `Submit` affordance; `Enter` in the choice fieldset commits that selected-uncommitted choice. In exam mode, selecting a choice only selects/drafts the answer; final commit remains deferred to Review & Submit / exam finalization. The `ChoiceButton` primitive reports pointer vs non-pointer origin, while mode-specific commit wiring lives in `usePracticeQuestionAnswerFlow` and `usePracticeSessionQuestionFlow` ([BS-064](../brainstorming/bs-064-radio-choice-modality-split.md)).

### I-4: Filter Chip

Toggle-style filter for tags, modes, difficulty levels.

**Unselected:**

```text
bg-foreground/[0.07] text-foreground/80 hover:bg-foreground/[0.12] hover:text-foreground
```

**Selected:**

```text
bg-primary text-primary-foreground
```

**Shared base:**

```text
inline-flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
disabled:pointer-events-none disabled:opacity-50
```

**Source:** `components/ui/filter-chip.tsx`

**Design rationale:** FilterChip moves to the I-1 borderless tonal-fill family. Identification rests on text + fill + cursor + hover + focus ring + `aria-pressed`, not on a stroked edge. Shape unified to `rounded-md` to match SegmentedControl items and Button defaults — filter chips are functionally toggle controls, not decorative pills. DEBT-377 redirected this pattern from a font-weight tweak to a chrome fix after visual review showed the per-chip border and `rounded-full` shape were the actual hierarchy problem.
**Status:** Implemented in `components/ui/filter-chip.tsx` (DEBT-290, DEBT-291, DEBT-294, DEBT-295, DEBT-309, DEBT-377).

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

**Note:** The container is `bg-muted` (solid), so inactive item hover (`bg-muted/50`) appears as a slight intensification. The active item completely overrides with `bg-primary`. Do not add `dark:border-foreground/40` back to the shared container; the container border is decorative and the active pill carries the state affordance.

### I-6: Icon Toggle Control (App Shell)

Compact icon-only disclosure toggle used in app chrome (example: mobile nav open/close).

```
p-2.5 text-muted-foreground transition-colors hover:text-foreground
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
**Design rationale:** Use this for compact nav links in header/footer/chrome where text-color hover is sufficient.

### L-2: Content Link

Links embedded in content areas — session breakdown question lists, inline references.

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

**Status:** Extracted to `headerActionLinkClasses` in `lib/shared-styles.ts` (DEBT-259, PR #152). Reuse this constant for all header action links.

### L-4: Brand Link

Logo/brand text links in app header and marketing header.

```
rounded-md text-sm font-semibold text-foreground transition-colors hover:text-foreground/80
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Design rationale:** Brand links are always visible (not muted), so hover dims slightly rather than brightening. This is the opposite direction from nav links (which brighten from muted to foreground).

**Status:** Implemented in both app and marketing headers (DEBT-258, PR #151).

### L-5: Banner Inline Link

Inline action link inside status banners/alerts where persistent affordance is required.

```
underline font-medium transition-colors hover:text-foreground
```

**Source:** `app/(app)/app/layout.tsx` (past-due billing banner)

**Design rationale:** In warning banners, persistent underline is preferred over hover-only affordance so the action remains obvious at a glance.

### L-6: Mobile Menu Link

Full-width mobile navigation items inside drawer/sheet menus.

**Inactive:**
```
block rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors
hover:bg-muted/50 hover:text-foreground
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Active:**
```
block rounded-md bg-muted px-3 py-3 text-sm font-medium text-foreground
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Design rationale:** Mobile menu entries are larger touch targets than desktop nav links, so they use row-style background hover. `/50` keeps parity with the global hover scale and avoids the heavier 100% muted fill. The active state uses full `bg-muted` (100%) — stronger than hover — so the current page is always visually distinguished from hovered items. **Principle: active fill > hover fill.**

---

## Part 5: Button Conventions

Button variants are defined in `components/ui/button.tsx` via CVA. This section documents **app-level conventions** layered on top.

### Button Component (Exact Class Strings)

**Source of truth:** `components/ui/button.tsx:7-38`

**CVA base classes (exact)** — `components/ui/button.tsx:8`:
```text
inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive
```

**Variant classes (exact)** — `components/ui/button.tsx:12-25`:
```text
default: bg-primary text-primary-foreground shadow-xs hover:bg-primary/90
destructive: bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60
success: bg-success text-success-foreground shadow-xs hover:bg-success/90 focus-visible:ring-success/20 dark:focus-visible:ring-success/40 dark:bg-success/60
outline: border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-foreground/40 dark:hover:border-foreground/70 dark:hover:bg-input/50
secondary: bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80
ghost: hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50
link: text-primary underline-offset-4 hover:underline
```

**Size classes (exact)** — `components/ui/button.tsx:27-31`:
```text
default: h-9 px-4 py-2 has-[>svg]:px-3
sm: h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5
lg: h-10 rounded-md px-6 has-[>svg]:px-4
icon: size-9
```

**Active state:** No `active:` utilities are applied currently (browser default only).

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
| Header bail / abandon session | `outline` + `rounded-full` | Header "End session"; future exam abandon actions |
| Tutor terminal session action | `default` + `rounded-full` | Footer "End session" on the last tutor question after feedback |
| Error recovery | `outline` (no `rounded-full`) | "Try again", "Return to dashboard" |

**End session usage:** In tutor sessions, `End session` is always present in the header as the low-friction exit and also appears as the filled footer terminal CTA on the last question after feedback has rendered. The duplicate same-label Q3 state is intentional; both buttons call `onEndSession` (DEBT-378). Exam mode does not expose a header bail button; its header rail owns only the Mark-for-review toggle.

### Active Exam Action Bar

**Source:** `ExamActionBar` in `app/(app)/app/practice/components/practice-view.tsx`

Active exam sessions defer correctness until `Review & Submit`, so the footer is navigation-only. Previous and the forward / terminal CTA stay together in one left cluster to mirror tutor-mode navigation.

| Session position | Left group | Right group | Notes |
|------------------|------------|-------------|-------|
| First question | filled `Next` in `data-testid="exam-action-primary-group"` | none | No empty Previous placeholder; do not render Mark for review in the footer. |
| Middle question | outline `Previous` + filled `Next` in `data-testid="exam-action-primary-group"` | none | Draft selections do not change footer labels. |
| Final question | outline `Previous` + filled `Review & Submit` in `data-testid="exam-action-primary-group"` | none | Preserve the `aria-describedby` text: `Opens review and submit.` |

All active exam footer buttons live in `data-testid="exam-action-primary-group"`; there is no footer right group. `data-testid="exam-action-cta-group"` and `data-testid="exam-action-secondary-group"` are intentionally absent after DEBT-380. Mark for review continues to live in the question header rail.

### Header Rail / Persistent Header Actions

**Source:** header action rail in `PracticeView` (`data-testid="question-header-actions"`)

The page header action rail holds one mode-specific persistent action:

| Mode | Header action | Notes |
|------|---------------|-------|
| Tutor / Quick Practice | outline `End session` when `onEndSession` is provided | This is the low-friction exit and remains independent of the tutor footer terminal CTA. |
| Exam | outline `Mark for review` / `Unmark review` when `onToggleMarkForReview` is provided | Uses `aria-pressed`, disables while marking, while pending, or while the next question is loading. |
| No session action | header action link | Falls back to the page-level back link when no session action is available. |

**Removed tutor affordances:** Active tutor sessions no longer render `Submitting…`, pre-feedback `Next`, or footer `View Summary`. Before feedback, pointer choice activation is the primary action. The footer `Submit` is allowed only for the selected-uncommitted keyboard/AT state introduced by BUG-274; skip-without-answering is handled by the question navigator in active sessions.

### Dark Mode Behavior (built into button.tsx)

| Variant | Dark Override | Notes |
|---------|-------------|-------|
| `outline` | `dark:bg-input/30 dark:border-foreground/40 dark:hover:border-foreground/70 dark:hover:bg-input/50` | Uses explicit dark boundary override for required outlines |
| `ghost` | `dark:hover:bg-accent/50` | Uses `accent` token (11% lightness) |
| `destructive` | `dark:bg-destructive/60` | Reduced saturation in dark |
| `success` | `dark:bg-success/60` | Reduced saturation in dark |

**Rule:** These are the ONLY dark-mode overrides for buttons. Page/component code must NEVER add `dark:` classes to buttons. If a button looks wrong in dark mode, fix the variant in `button.tsx`.

### Marketing Button Overrides (Decision 1 — Resolved)

The marketing landing page CTA strategy was standardized in DEBT-258:

| Button | Treatment | Rationale |
|--------|----------|-----------|
| "View pricing" / "Sign in" pills | `variant="outline"` (standard hover) | Replaced custom `hover:bg-muted` (100% opacity) which was far more aggressive than any other hover |
| Monthly "Get Started" | `variant="outline"` | Previously `variant="secondary"` — 4% lightness difference from card surface (invisible). Outline gives a real border. |
| Annual "Get Started" | `variant="default"` (primary) | Replaced custom `bg-foreground text-background`. In dark mode `--primary` = `--foreground` (zero visual regression). Highest affordance for the promoted plan. |

### Trial CTA Subtext (DEBT-410)

For trial-eligible visitors (not entitled, no subscription row — anonymous visitors included), the pricing-card primary CTAs read "Start 7-day free trial" and carry a one-line post-trial price note directly under the button:

```text
mt-3 text-center text-sm text-muted-foreground
```

**Copy source:** `lib/pricing-data.ts` (`trialCta` / `postTrialNote` fields) — copy lives in data, not in the view.

**Rules:**
- Uses the 12.3 "Card body / dense helper copy" role (`text-sm text-muted-foreground`); no new type role.
- The note is non-interactive metadata for the CTA above it — never a link or button.
- For non-eligible visitors (any prior or current subscription row, e.g. canceled ex-subscribers), the CTA renders the standard "Subscribe Monthly" / "Subscribe Annual" labels and no subtext.

**Source:** `app/pricing/pricing-view.tsx`

### MetallicCtaButton (Marketing Only — D-15 Exception)

Custom animated-border CTA used at the bottom of the landing page.

```
metallic-border animated gradient (grays #3f3f46 → #a1a1aa, 6s cycle)
├── outer: metallic-border inline-flex (animated border via CSS)
├── inner: bg-background (button face)
└── text: text-foreground + ArrowRight icon
```

**Source:** `components/ui/metallic-cta-button.tsx` + `components/ui/metallic-border.tsx` + CSS in `globals.css:193-208`

**Status:** Approved marketing-only exception (Decision 2). One distinctive element at the landing page bottom adds personality without system pollution. Marked with `@debt-exception D-15` in source. Not a standard `Button` variant. Keep scoped to this single marketing slot.

### Third-Party Component Exceptions (Decision 8)

| Component | Owner | Visual Delta | Policy |
|-----------|-------|-------------|--------|
| Clerk auth surfaces (`<SignIn />`, `<SignUp />`, `<UserButton />`) | Clerk SDK | 4px border radius difference (12px vs 16px), internal hover/focus states | Accepted third-party seam. Base colors match via `providers.tsx` appearance config. Do not attempt pixel-match overrides — Clerk's internal CSS hierarchy is undocumented and changes between versions. |

---

## Part 6: Feedback & Status Patterns

### F-1: Result Badge

Correct/incorrect indicator shown after answer submission.

**Correct:**
```
inline-flex self-start rounded-full px-3 py-1 text-sm font-semibold bg-success text-success-foreground dark:bg-success/60
```

**Incorrect:**
```
inline-flex self-start rounded-full px-3 py-1 text-sm font-semibold bg-destructive text-destructive-foreground dark:bg-destructive/60
```

**Source:** `components/question/feedback.tsx`

Uses a solid semantic pill in light mode plus `dark:bg-*/60` in dark mode so verdict text stays readable while the badge remains compact via `self-start`.

### F-2: Warning Surface (3-tier)

| Tier | Classes | Use Case |
|------|---------|----------|
| Hint | `border-warning/50 bg-warning/5 text-foreground` | Unanswered question reveal (inside Card) |
| Standard | `border-warning bg-warning/10 text-warning-foreground` | Past-due banner (layout-level) |
| Emphasized | `border-warning bg-warning/15 text-warning-foreground` | Cancellation scheduled alert |

### F-3: Error Surface (ErrorCard)

Inline persistent error within a page.

**Canonical (target):**
```
rounded-2xl border border-destructive bg-destructive/10 p-6 text-sm text-destructive shadow-sm
```

**Current (COMP-1):**
```
rounded-2xl border border-destructive bg-destructive/10 p-4 text-sm text-destructive shadow-sm
```

**Source:** Current implementation is `components/error-card.tsx` (has `role="alert"` built in).

**Dense override (compact contexts only):** `p-4`

**Never manually add `role="alert"`** when using ErrorCard.

### F-4: Toast

Transient feedback notification via `useNotification()`.

**Region positioning:**
```
pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4
```

**Shell:**
```
block rounded-xl border px-4 py-3 text-sm shadow-sm
```

| Tone | Border + Background |
|------|-------------------|
| `info` | `border-border bg-card text-foreground dark:border-foreground/40` |
| `success` | `border-success/60 bg-success/10 text-foreground` |
| `error` | `border-destructive bg-destructive/10 text-foreground` |

**Source:** `components/ui/notification-provider.tsx`

### F-5: Feedback Answer Card

Display-only answer explanation block shown after submission.

**Correct answer:**
```
rounded-xl border border-success/60 bg-success/5 p-4
```

**Your incorrect answer:**
```
rounded-xl border border-destructive bg-destructive/5 p-4
```

**Other wrong answers:**
```
rounded-xl border border-border/60 bg-background/50 p-4 dark:border-foreground/40
```

**Answer row:**
```
flex items-start gap-3
```

**Feedback answer text:**
```
text-base text-foreground
```

**Feedback explanation text:**
```
text-base text-foreground
```

**Source:** `components/question/feedback.tsx`

**Rule:** These cards are not interactive, but they still separate mutually exclusive answer explanations inside a larger feedback card. Neutral cards therefore need the same dark-mode required-boundary override as other low-contrast in-card rows.

### F-6: Feedback Reference Section

Reference block appended to the bottom of a feedback card.

```
mt-4 border-t border-border/40 pt-3 dark:border-foreground/40
```

**Heading:**
```
text-xs font-semibold uppercase tracking-wide text-muted-foreground
```

**Body:**
```
mt-1 text-sm
```

**Source:** `components/question/feedback.tsx`

**Rule:** The feedback reference body is a feedback-context readability exception. It uses `text-sm` instead of the default content-tier `text-xs` citation treatment because 12px reference text was too small on this dark card surface. The heading remains compact UI chrome.

### F-7: Clinical Pearl Callout

Inline explanatory callout rendered from markdown paragraphs that begin with `**Clinical pearl:**`.

**Container:**
```
mt-3 border-l-2 border-foreground/40 pl-3
```

**Label:**
```
mb-1 text-xs font-medium uppercase tracking-wide text-foreground/60
```

**Content:** Standard markdown paragraph content inside the callout.

**Source:** `components/markdown/Markdown.tsx`

### F-8: Feedback Section Chips

Section-level pills used inside the feedback card. This family has two variants: a semantic success chip for the incorrect-flow correct-answer section, and a neutral structural chip for fallback/explanatory subsections.

**Semantic correct-answer chip (incorrect flow only):**
```
inline-flex rounded-full px-3 py-1 text-sm font-semibold bg-success text-success-foreground dark:bg-success/60
```

**Neutral section chip:**
```
inline-flex rounded-full bg-muted px-3 py-1 text-sm font-semibold text-foreground dark:bg-foreground/10
```

**Used for:** `Correct Answer` (semantic success), `Explanation`, `Why Other Answers Are Wrong`

**Source:** `components/question/feedback.tsx`

**Rule:** The semantic `Correct Answer` chip intentionally borrows the F-1 success-pill palette so the correct-answer section is visually distinct from the preceding incorrect-answer block. Neutral section chips are structural labels, not metadata chrome: keep them title case, `text-sm`, and full `text-foreground` rather than the older uppercase/tracking-wide micro-label treatment. In correct flow, `CorrectAnswerSection` passes `showLabel={false}`, so no section chip renders above the correct-answer card. Do not replace the verdict pill, the Reference label, or the Markdown-driven clinical pearl label with this pattern.

### F-9: Post-Action Rating Footer

Quiet, optional per-question rating chrome rendered after a question review action bar. This pattern is for the SPEC-041 thumbs rating only; it is not a general action-bar extension.

**Wrapper:**

```text
border-t border-border pt-4
```

**Content row:**

```text
flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground
```

**Rules:**
- Reuse M-2 `Standard` (`border-t border-border`) for the full-width hairline separator.
- Keep the footer boxless: no `bg-*` fill, no `Card`, no bordered inset container, and no undocumented opacity values.
- Render interactive targets as `<Button>` instances so the canonical focus ring remains inherited from the Button primitive.
- Preserve `<fieldset>` + `<legend className="sr-only">Rate this question</legend>`, `aria-pressed`, and the `aria-live` status region from the rating control.

**Source:** `components/question/question-rating-footer.tsx`

### F-10: Trial Countdown Banner (layout-level info banner)

Persistent app-shell banner shown while a subscription is `inTrial` (DEBT-410 PR-3). Informational — not a warning — so it deliberately avoids the F-2 warning palette that the past-due banner uses; a 7-day-persistent surface must stay calm.

**Wrapper:**

```text
block border-b border-border bg-card px-4 py-3 text-sm text-muted-foreground
```

**Content row:**

```text
mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3
```

**Countdown phrase:** `font-medium text-foreground` (e.g. "7 days left in trial") — emphasized against the muted wrapper so the number reads at a glance.

**Action:** `<Button type="submit" variant="outline" size="sm" className="rounded-full">` ("Add a card to keep access") inside a `<form>` posting the protected app billing portal action. Button primitive supplies the canonical focus ring; pill shape follows the Pill Shape Convention (Part 5).

**Rules:**
- Semantic tokens only; no opacity-scale values at all (`bg-card` is a solid surface fill), so the banner adds nothing to the source-scan allowlist.
- Light/dark handled entirely by `border-border` / `bg-card` / `text-muted-foreground` / `text-foreground`; no component `dark:` overrides.
- Contrast: reuses the 12.3 "Card body / dense helper copy" pairing (`text-sm text-muted-foreground` on card surface) and full `text-foreground` for the countdown phrase — both established app-wide pairings; no new color pair is introduced, so no new `contrast-policy.md` ledger entry is required.
- Renders in the same `AppLayoutShell` `banner` slot as the past-due banner (banner → header → main ordering); the two are mutually exclusive because `pastDue` and `inTrial` are distinct subscription statuses.
- Server-rendered at page load; no live-region role needed (matches past-due banner precedent).

**Source:** `app/(app)/app/layout.tsx` (trial countdown banner)

---

## Part 7: Metadata & Decoration

### M-1: Metadata Badge/Pill

Non-interactive labels for mode, difficulty, status.

```
inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-xs font-medium text-muted-foreground dark:border-foreground/40
```

**Used in:** Dashboard session mode badge, dashboard activity difficulty badge

**Rule:** Badges are NEVER interactive. If a badge needs to be clickable, it's a FilterChip (I-4), not a badge.

### M-2: Content Separator

Visual dividers within cards or content areas.

| Weight | Classes | Use Case |
|--------|---------|----------|
| Standard | `border-t border-border` | Major section breaks |
| Subtle | `border-t border-border/60` | Between content blocks inside cards |
| Light | `border-t border-border/40` | Internal separators (expanded breakdowns; feedback reference sections use F-6 in dark mode) |

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
flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-foreground/20 bg-foreground/[0.06] text-xs font-semibold leading-none text-foreground dark:border-foreground/60 dark:bg-foreground/20
```

**Used in:** Choice buttons and feedback answer rows

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
├── YES → Use I-1 tonal-fill variant by default
│         rounded-xl, bg-foreground/5, hover:bg-foreground/[0.08]
│         Use the bordered default only when a spec explicitly requires an inner stroke
│         Is the row non-interactive?
│         └── YES → Use S-2 tonal sibling variant (no hover classes)
└── NO → Is each item a standalone container?
    ├── YES → Use I-2 tonal standalone row
    │         rounded-2xl, bg-foreground/[0.08], hover:bg-foreground/[0.12]
    │         Is the row non-interactive?
    │         └── YES → Use S-2 page-background sibling variant
    └── NO → Use a regular <Card> or a page-specific spec
              Do not resurrect the legacy bookmarks card-with-buttons branch
```

### "I need a hover effect"

```
What is the parent surface?
├── Inside a Card, muted-scale row → hover:bg-muted/40
├── Inside a Card, tonal row/direct-action surface → hover:bg-foreground/[0.08]
├── On page background, muted-scale row → hover:bg-muted/50
├── On page background, tonal row → hover:bg-foreground/[0.12]
├── Choice button inside card (I-3) → hover:bg-foreground/[0.06] + hover:border-foreground/55 in light mode; dark:hover:bg-foreground/[0.05] + dark:hover:border-foreground/50 in dark mode (unselected branch only; replacement fills, not layers)
├── `/60` hover tier → exception-only (requires explicit design review)
└── Tab-switch inactive → hover:bg-muted/50 (inside bg-muted container)

Token (neutral surface fills): Use the pattern's scale. `muted` is for muted-scale rows/containers; `foreground` is for tonal-row families such as I-1, I-2, I-3, and I-4.
Border hovers in remediated dark-mode interactive rows/buttons typically use `dark:hover:border-foreground/70`. I-3 choice buttons are the deliberate exception at `/50` because the recessed `dark:bg-background/50` rest surface already creates stronger separation; the softer hover border keeps the lift distinct from the darker selected stack without over-brightening the full row.
Avoid introducing new `hover:bg-accent*` outside `components/ui/` (button variants use `accent` by design). Only use `foreground`-based hover fills where the pattern spec explicitly calls for them.
```

### "I need a link"

```
Where is the link?
├── Mobile drawer/sheet menu item → L-6 (Mobile Menu Link)
│   row-style hover: hover:bg-muted/50 + hover:text-foreground
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
        ├── Informational layout-level banner → F-10 (neutral border/card tokens, no status tint)
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
| `headerActionLinkClasses` | `lib/shared-styles.ts` | Dashboard, History (sessions + questions), Practice, Bookmarks (7 files, DEBT-259/PR #152) |

### Needs Extraction

| Pattern | Current State | Proposed Constant | Proposed File |
|---------|--------------|-------------------|---------------|
| Hoverable row (inside Card) | Inline in dashboard, history sessions | `hoverableRowInsideCardClasses` | `lib/shared-styles.ts` |
| Muted row (non-interactive) | Inline in dashboard, practice starter | `mutedRowClasses` | `lib/shared-styles.ts` |
| Metadata badge/pill | Inline in dashboard (2 instances) | `metadataBadgeClasses` | `lib/shared-styles.ts` |

**Extraction rule:** Extract when 3+ files use the same class string. Below 3, inline is fine.

---

## Part 11: Known Divergences from This Registry

Approved exceptions tracked in [DEBT-250](../_archive/debt/debt-250-frontend-visual-divergence-compliance-plan.md):

| ID | Divergence | Status | Files |
|----|-----------|--------|-------|
| D-15 | `MetallicCtaButton` remains outside standard Button variants by explicit policy | Approved marketing-only exception (`@debt-exception D-15`) | `metallic-cta-button.tsx`, `marketing-home.tsx` |

**Resolved (historical):** All 31 items from DEBT-250 are now resolved or documented as approved exceptions:
- `D-1` through `D-10`, `D-12`, `D-14`, `D-16`, `D-17` — code fixes via DEBT-251 through DEBT-258 (PRs #149–#151)
- `D-11` — pricing page converted to `<Card>` components (DEBT-259, PR #152)
- `D-13` — `headerActionLinkClasses` extracted to `lib/shared-styles.ts` (DEBT-259, PR #152)
- `COMP-1`, `A11Y-1`, `A11Y-2`, `STRUCT-1`, `AFFORD-1`, `LIGHT-3` — code fixes via DEBT-251–258
- `UX-1` (pricing dead space), `UX-2` (standalone bookmark — no change by design), `UX-3` (ThemeToggle added to marketing), `UX-4` (Clerk seam — accepted third-party exception) — DEBT-260, PR #152
- `TOUCH-1`, `TOUCH-2` — targeted touch target fixes (DEBT-261, PR #152)
- `LIGHT-1` — light-mode opacity asymmetry accepted and documented (DEBT-262, Decision 12)
- `LIGHT-2` — success/destructive token contrast fixed in `globals.css` (DEBT-263, PR #153)

Clerk auth-surface radius/interaction differences are an accepted third-party seam and not a local styling target (Decision 8).

---

## Part 12: Typography System

### 12.1 Font Families

Three Google Fonts loaded via `next/font/google` in `app/layout.tsx`:

| Class | Font Family | Fallback Chain | Weights | Role |
|-------|------------|----------------|---------|------|
| _(body default)_ | Manrope | Arial, Helvetica, sans-serif | All (variable) | Body text, UI labels, all default text |
| `font-heading` | Instrument Sans | Manrope, system-ui, sans-serif | All (variable) | Page headings (H1, H2, H3), card section titles |
| `font-display` | Plus Jakarta Sans | Manrope, system-ui, sans-serif | 700, 800 only | Large numeric values, stat card numbers, pricing amounts |

**Source:** Font loading in `app/layout.tsx:13-22`. CSS classes in `app/globals.css:240-249`. Body font-family in `app/globals.css:82-86`.

**Rule:** Never use `font-sans` or other Tailwind font utilities. The three classes above are the only font-family selectors.

### 12.2 Heading Conventions

**App page H1 (standard):**
```
text-2xl font-bold font-heading tracking-tight text-foreground
```
Used on: Dashboard, History, Bookmarks, Billing, Practice, Question Review, Exam Review, Session Summary.

**Marketing/standalone H1:**
```
text-4xl font-bold font-heading tracking-tight text-foreground
```
Used on: Pricing page, Not Found page.

**Marketing hero H1:**
```
font-display text-5xl font-bold tracking-tight md:text-7xl
```
Used on: Landing page hero (uses `font-display` instead of `font-heading`).

**Marketing section H2:**
```
font-heading text-3xl font-bold tracking-tight md:text-4xl
```

**Utility page H1 (auth, error, checkout):**
```
text-xl font-semibold font-heading tracking-tight text-foreground
```
Deliberately smaller — these are centered narrow-width contexts.

**Global error H1:**
```
text-2xl font-bold font-heading tracking-tight text-foreground
```

### 12.3 Text Size Roles

| Role | Classes | Used For |
|------|---------|----------|
| Page / section subtitle (standard UI) | `text-base text-muted-foreground` | Authenticated app pages, centered utility pages, standard marketing section ledes |
| Page subtitle (marketing hero) | `text-lg text-muted-foreground` | Pricing page hero, marketing hero |
| Card section heading | `text-sm font-medium text-foreground` | "Subscription", "Start a session", section titles |
| Card body / dense helper copy | `text-sm text-muted-foreground` | Dense card content text, compact utility/error copy |
| Compact stat labels | `text-xs text-muted-foreground` | Exam review stat cards (intentional compact tier) |
| Badge / pill text | `text-xs font-medium text-muted-foreground` | Tags, counts |
| Marketing CTA label | `text-base font-medium` | Hero / pricing primary CTAs |
| Text input content | `text-base md:text-sm` | Shared `Input` primitive mobile zoom safeguard |
| Question stem | `text-base text-foreground` | Question card body |
| Error ID | `text-xs text-muted-foreground` | Error pages |
| Reference label | `text-xs font-semibold uppercase tracking-wide text-muted-foreground` | Feedback reference section |

### 12.4 Stat Card Tiers

Two distinct stat card presentations:

| Tier | Number Size | Card Padding | Label Size | Label Margin | Used In |
|------|------------|-------------|------------|-------------|---------|
| Full | `text-3xl font-bold font-display` | `p-6` | `text-sm` | `mt-2` | Dashboard, Session Summary |
| Compact | `text-2xl font-bold font-display` | `p-4` | `text-xs` | `mt-1` | Exam Review |

---

## Part 13: Spacing Conventions

### 13.1 Page-Level Container

Default responsive container pattern (app + marketing shells):
```
mx-auto max-w-7xl px-4 sm:px-6 lg:px-8
```

**Exceptions:** Centered utility pages (sign-in/up fallback, global error, error boundary, not found, checkout success) use their own centered layouts and do not use this container.

**Vertical padding:**
- App layout content area: `py-8`
- Marketing/pricing standalone: `py-16`
- Marketing section spacing: varies per section design

### 13.2 Page Section Spacing

**Default:** `space-y-6` at app page root containers.

**Known exceptions (denser stacks):** Some tab panels and error-state fallbacks use `space-y-4` (e.g., `app/(app)/app/history/components/history-sessions-tab.tsx:118`, `app/(app)/app/history/components/history-questions-tab.tsx:420`, `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:126`).

### 13.3 Card Padding Tiers

| Tier | Padding | Usage |
|------|---------|-------|
| Standard | `p-6` | All content cards (stats, sections, practice, bookmarks empty state) |
| Dense | `p-4` | Compact cards (exam review stats, filter bars, question list items, navigator) |
| Showcase | `p-8` | Marketing pricing cards, pricing page plan cards |

**Rule:** `p-3` is for inner list items within cards (dashboard recent lists, feedback choices), never on `<Card>` directly.

### 13.4 Grid Gap Scale

| Gap | Usage |
|-----|-------|
| `gap-3` | Dense filter bar grids |
| `gap-4` | Standard card grids (stats, features, section layouts) |
| `gap-6` | Marketing pricing card grid |
| `gap-8` | Pricing page plan grid |

### 13.5 List Spacing Scale

| Spacing | Tier | Usage |
|---------|------|-------|
| `space-y-2` | Dense | In-card lists (dashboard recent, session breakdown, history sessions) |
| `space-y-3` | Standard | Item lists (exam review questions, pricing features, choices) |
| `space-y-4` | Card-level | Card-like item lists (history questions, bookmarks, practice sections) |

### 13.6 Max-Width Scale

| Width | Purpose | Examples |
|-------|---------|---------|
| `max-w-7xl` (1280px) | Full-page layouts | App layout, marketing layout |
| `max-w-4xl` | Hero content | Marketing hero section |
| `max-w-3xl` | Featured sections | Marketing pricing grid, CTA section |
| `max-w-2xl` | Centered content | Pricing cards, subtitles, feature headings |
| `max-w-lg` | Dialogs | Alert dialog |
| `max-w-md` | Error pages | Not Found, Global Error, Error Boundary |
| `max-w-sm` | Toasts | Notification toast |

---

## Part 14: Shadow & Elevation Scale

Four tiers, cleanly separated by element type:

| Level | Class | Usage | Elements |
|-------|-------|-------|----------|
| Micro | `shadow-xs` | Form controls | Button (all variants except ghost/link), Input, Select trigger |
| Surface | `shadow-sm` | Cards and surfaces | Card (built-in default), ErrorCard, ChoiceButton, Toast, TabSwitch active |
| Popup | `shadow-md` | Floating menus | Select content, DropdownMenu content |
| Modal | `shadow-lg` | Blocking overlays | AlertDialog, DropdownMenu sub-content |

**Rule:** Never use `shadow`, `shadow-xl`, or `shadow-2xl`. The four tiers above are the complete scale.

**Note:** The `<Card>` component includes `shadow-sm` in its base class. Callers do not need to pass `shadow-sm` explicitly (though many currently do — it's harmless but redundant).

### 14.1 Z-index Conventions (Current)

| Layer | Class | Used By | Source |
|------|-------|---------|--------|
| Overlays + popovers | `z-50` | AlertDialog overlay/content, SelectContent, DropdownMenu content/sub-content | `components/ui/alert-dialog.tsx:39`, `components/ui/alert-dialog.tsx:57`, `components/ui/select.tsx:59`, `components/ui/dropdown-menu.tsx:45`, `components/ui/dropdown-menu.tsx:233` |
| Notifications | `z-50` | Toast region | `components/ui/notification-provider.tsx:125` |

**Known limitation:** Since all overlays and toasts share `z-50`, a toast fired while a dialog is open can render behind the dialog overlay. Tracked as out-of-scope in DEBT-250.

---

## Part 15: Animation & Transition Conventions

### 15.1 Transition Rules

| Transition | When to Use |
|-----------|-------------|
| `transition-colors` | Any element with `hover:` color/background change. **Universal default.** |
| `transition-[color,box-shadow]` | Form controls (Input, Select trigger) — animates both color and focus ring |

**Never use:** `transition-all` (causes jank by animating everything), `transition-opacity`, `transition-transform`.

**Duration:** No `duration-*` classes anywhere. All transitions use the Tailwind default (150ms). This is a deliberate design choice for snappy interactions.

### 15.2 Custom Animations (globals.css)

| Animation | Class/Selector | Duration | Usage | Locations |
|-----------|---------------|----------|-------|-----------|
| `metallic-shift` | `.metallic-border` | 6s ease infinite | Animated gradient border | `MetallicCtaButton` (1 location) |
| `fade-in-up` | `.animate-fade-in-up` | 0.6s ease-out | Staggered entrance for marketing impact stats | `marketing-home.tsx:109` (1 location) |

### 15.3 Radix UI Animations (tw-animate-css)

The `tw-animate-css` library (imported in `globals.css:7`) provides enter/exit animation utilities consumed by Radix-based UI primitives:

| Utility | Purpose | Consumers |
|---------|---------|-----------|
| `animate-in` / `animate-out` | Enter/exit animation wrapper | Select, DropdownMenu, AlertDialog |
| `fade-in-0` / `fade-out-0` | Opacity 0→1 / 1→0 | Same |
| `zoom-in-95` / `zoom-out-95` | Scale 0.95→1 / 1→0.95 | Select, AlertDialog |
| `slide-in-from-top-2`, `slide-in-from-bottom-2`, etc. | Directional slide | Select, DropdownMenu |

**Note:** `animate-pulse` (for skeleton loading shimmer in M-3) is a built-in Tailwind utility, not from `tw-animate-css`.

### 15.4 Reduced Motion

All custom CSS animations are properly disabled under `prefers-reduced-motion: reduce` (`globals.css:226-238`):
- `scroll-behavior: smooth` → `auto`
- `.metallic-border` animation → `none`
- `.animate-fade-in-up` animation → `none`

The `tw-animate-css` library handles its own reduced-motion support internally.

---

## Part 16: Responsive Breakpoint Strategy

### 16.1 Breakpoints in Use

| Prefix | Breakpoint | Usage |
|--------|-----------|-------|
| `sm:` | 640px | Widely used — grid columns, flex direction, padding |
| `md:` | 768px | Marketing pages + `Input` text size only |
| `lg:` | 1024px | Container padding, grid column layouts |
| `xl:` / `2xl:` | — | **Not used anywhere.** `max-w-7xl` (1280px) makes these unnecessary |

### 16.2 Responsive Patterns

**Container padding (universal):**
```
px-4 sm:px-6 lg:px-8
```

**Stack-to-row (mobile-first):**
```
flex flex-col sm:flex-row
```
Used for: header action bars, card content layouts, button groups.

**Show/hide (navigation):**
- Desktop nav: `hidden sm:flex`
- Mobile nav: `sm:hidden`

### 16.3 Two-Tier Breakpoint Strategy

- **App pages:** `sm:` + `lg:` only (skip `md:`)
- **Marketing pages:** `sm:` + `md:` + `lg:`

This is intentional — marketing pages have richer responsive layouts (multi-column features, pricing grids) while app pages are simpler single/dual column layouts.

---

## Part 17: Form Input Patterns

### Input Component

The `<Input>` component (`components/ui/input.tsx`) is the single form input primitive. All text/number inputs MUST use it.

**Base classes:**
```
border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs
transition-[color,box-shadow] outline-none md:text-sm
```

**Dark mode:** `dark:bg-input/30 dark:border-foreground/40` (subtle dark background tint + required boundary override)

**Focus:** `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`

**Validation:** `aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive`

**Disabled:** `disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50`

**Placeholder:** `placeholder:text-muted-foreground` (centralized — no other placeholder styles exist)

**Selection:** `selection:bg-primary selection:text-primary-foreground`

**File input pseudo-element:** `file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium`

**Exact `className` strings (current)** — `components/ui/input.tsx:11-13`:
```text
file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input dark:border-foreground/40 flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive
```

**Note:** Uses `transition-[color,box-shadow]` (not `transition-colors`) because form controls animate both color and the focus ring box-shadow.

### Select Component

The `<Select>` component (`components/ui/select.tsx`) is the single select/menu form primitive.

**Trigger base classes:**
```
border-input dark:border-foreground/40 data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex h-9 w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2
```

**Content surface:** Uses S-3 (Popover Surface) + Radix enter/exit animations (Part 15.3).

**Item base classes (keyboard focus highlight):**
```
focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
```

**Note:** Like `<Input>`, uses `transition-[color,box-shadow]` on the trigger because focus rings animate via box-shadow.

---

## Part 18: Accessibility Patterns

### 18.1 Landmarks

All route pages render a `<main id="main-content" tabIndex={-1}>` landmark **except** `app/global-error.tsx` (Next.js global error renders its own `<html>/<body>` and does not use `app/layout.tsx`).

A global skip-to-content link in `app/layout.tsx:38-43` targets the main landmark:
```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
>
  Skip to content
</a>
```

All `<nav>` elements (8 total) have `aria-label`. Marketing page `<section>` elements have `aria-label` or `aria-labelledby`.

### 18.2 Live Regions

Page-level Suspense loading uses the shared `<PageLoading>` component with `aria-busy="true"` + `aria-live="polite"` on its wrapper (`components/loading/page-loading.tsx`).

Inline loading states use the `<output>` HTML element with `aria-live="polite"`:
```tsx
<output aria-live="polite">Loading question...</output>
```

**Note:** The `<output>` element has implicit `role="status"` and `aria-live="polite"`, so the explicit `aria-live` is technically redundant but harmless.

### 18.3 ARIA State Conventions

| Attribute | Usage Pattern |
|-----------|--------------|
| `aria-current="page"` | Active nav links, active tab bar items |
| `aria-current="step"` | Current question in navigator dots |
| `aria-pressed` | SegmentedControl, FilterChip, bookmark/mark-for-review toggles |
| `aria-expanded` + `aria-controls` | Mobile nav toggle button |
| `role="alert"` | ErrorCard, pricing error banner, inline error messages |
| `role="status"` | Feedback card, non-error notification toasts |

### 18.4 Icon Accessibility

Decorative Lucide icons set `aria-hidden="true"`. Icon-only controls provide an accessible name via either `aria-label` or visually hidden text (for example, `<span className="sr-only">`).

**Icon sizing scale:**
| Size | Class | Usage |
|------|-------|-------|
| 16px | `size-4` | Standard inline (buttons, menus, controls) |
| 20px | `size-5` | Standalone (theme toggle) |
| 24px | `size-6` | Prominent standalone (nav hamburger, feature icons) |
| 48px | `size-12` | Decorative hero-level (404 page) |

### 18.5 Global Defaults (globals.css)

Two global defaults set in `@layer base` (`globals.css:169-176`):
```css
* { @apply border-border outline-ring/50; }
body { @apply bg-background text-foreground; }
```

The `outline-ring/50` ensures all elements default to the ring token for outline color. The `border-border` ensures all borders default to the border token.

Additionally, `html { scroll-behavior: smooth; }` (`globals.css:178-180`) enables smooth scrolling globally, properly disabled under `prefers-reduced-motion: reduce`.

---

## Part 19: CSS Infrastructure

### 19.1 Tailwind Version

The project uses **Tailwind CSS v4** with CSS-first configuration (`@theme` block in `globals.css`). There is no `tailwind.config.js`; source detection is controlled from `app/globals.css`, including the DEBT-409 `@source not "../docs"` exclusion that prevents documentation examples from entering generated production CSS. The CSS `@theme` is the authoritative source for theme tokens.

### 19.2 Unused Tokens

13 CSS custom properties are defined but never referenced in any component:
- `chart-1` through `chart-5` — shadcn/ui scaffolding defaults
- `sidebar-background`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring` — shadcn/ui scaffolding defaults

These should be removed in a cleanup pass.

### 19.3 Dead CSS

The `scrollbar-hidden` utility class (`globals.css:251-258`) is defined but has zero usages in any `.tsx` file.

---

## Appendix: Pattern Quick Reference

Compact lookup for code reviews and implementation.

| ID | Pattern | Canonical Hover | Radius | Border |
|----|---------|----------------|--------|--------|
| S-1 | Card | — (non-interactive) | `rounded-2xl` | `border` |
| S-2 | Muted Row | — (non-interactive) | `rounded-xl` | Default: `border-border/60 dark:border-foreground/40`; tonal variants may omit border |
| S-3 | Menu Popover | — | `rounded-md` | `border` |
| S-4 | Modal Dialog | — | `rounded-2xl` | `border-border` |
| I-1 | Row in Card | `hover:bg-foreground/[0.08]` | `rounded-xl` | tonal-fill variant omits border |
| I-2 | Standalone Row | `hover:bg-foreground/[0.12]` | `rounded-2xl` | tonal-fill variant omits border |
| I-3 | Choice Button | `hover:bg-foreground/[0.06] hover:border-foreground/55` (+ `dark:hover:bg-foreground/[0.05] dark:hover:border-foreground/50`) | `rounded-xl` | `border-foreground/50 dark:border-foreground/40` |
| I-4 | Filter Chip | `hover:bg-foreground/[0.12] hover:text-foreground` | `rounded-md` | borderless tonal fill |
| I-5 | Tab Switch Item | `hover:bg-muted/50` | `rounded-md` | Container uses `border-border` |
| I-6 | Icon Toggle | `hover:text-foreground` | — | — |
| L-1 | Nav Link | `hover:text-foreground` | `rounded-md` | — |
| L-2 | Content Link | `hover:underline` | `rounded-sm` | — |
| L-3 | Header Action Link | `hover:text-foreground` | — | — |
| L-4 | Brand Link | `hover:text-foreground/80` | `rounded-md` | — |
| L-5 | Banner Inline Link | `hover:text-foreground` | — | — |
| L-6 | Mobile Menu Link | `hover:bg-muted/50` | `rounded-md` | — |
| F-3 | ErrorCard | — | `rounded-2xl` | `border-destructive` |
| F-4 | Toast | — | `rounded-xl` | varies by tone |
| M-1 | Badge/Pill | — | `rounded-full` | `border-border/60` |
