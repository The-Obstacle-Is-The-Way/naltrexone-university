# Practice Page

**Page:** `/app/practice`
**Source:** `app/(app)/app/practice/page.tsx` (server) → `practice-page-client.tsx` (client)
**Last Updated:** 2026-03-10

---

## Page Structure

Top to bottom:

1. **Page heading** — "Practice" h1 + subtitle + "Back to Dashboard" header action link
2. **Incomplete session card** (conditional) — Resume/abandon CTA when an in-progress session exists
3. **Incomplete session error** (conditional) — `<ErrorCard>` when session check fails and an error message is available
4. **Session starter card** — The main form: mode, questions count, status, difficulty, tag filters, availability message, start button
5. **Session starter placeholder** (conditional) — Static placeholder card shown whenever the real starter is hidden

The lower stack is not mutually exclusive:
- If `incompleteSession` exists, the incomplete-session card renders and the starter placeholder still renders beneath it.
- If `incompleteSessionStatus === 'error'`, the error card renders and the starter placeholder renders beneath it.
- Only the real starter card is mutually exclusive with the placeholder (`shouldShowSessionStarter` gates that split).

---

## Component Inventory

### Page-Level Elements

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Page heading | `<h1>` | — | `practice-page-client.tsx:25` | `text-2xl font-bold font-heading tracking-tight text-foreground` |
| Subtitle | `<p>` | — | `practice-page-client.tsx:28` | `text-base text-muted-foreground` |
| Header action link | `<Button variant="link">` + `<Link>` | L-3 | `practice-page-client.tsx:33` | Uses `headerActionLinkClasses` from `lib/shared-styles.ts` |

### Incomplete Session Card

**Source:** `app/(app)/app/practice/components/incomplete-session-card.tsx`
**Condition:** Shown when `sessionControls.incompleteSession` is truthy. The placeholder card still renders beneath it because the starter itself is hidden.

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Container | `<Card>` | S-1 | `incomplete-session-card.tsx:29` | `gap-0 rounded-2xl p-6 shadow-sm` — flat, non-interactive |
| Heading | `<div>` | — | `:32` | `text-sm font-medium text-foreground` — "Continue session" |
| Metadata | `<div>` | — | `:35` | `text-sm text-muted-foreground` — "{mode} • {answered}/{total} answered" |
| Resume button | `<Button>` + `<Link>` | — | `:41` | `rounded-full`, default variant, links to session route |
| Abandon button | `<Button variant="outline">` | — | `:48` | `rounded-full`, triggers `AlertDialog` |
| Abandon dialog | `<AlertDialog>` | — | `:46–78` | Standard shadcn alert dialog with destructive action |

### Incomplete Session Error

**Condition:** Shown when `incompleteSessionStatus === 'error'` and `incompleteSessionError` is truthy. The placeholder card still renders beneath it because the starter itself is hidden.

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Error card | `<ErrorCard>` | F-3 | `practice-page-client.tsx:55` | `p-4` override, displays error message |

### Session Starter Placeholder

**Condition:** Shown whenever `shouldShowSessionStarter` is false: while `incompleteSessionStatus` is `'loading'` or `'error'`, or when an incomplete session exists.

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Container | `<Card>` | S-1 | `practice-page-client.tsx:84` | `gap-0 rounded-2xl border-border p-6` — static placeholder |
| Text | `<div>` | — | `:86–94` | Contextual message: "Loading session status…", "Resume or abandon…", or "Unable to load…" |

### Session Starter Card (Main Form)

**Source:** `app/(app)/app/practice/components/practice-session-starter.tsx`
**Condition:** Shown when no incomplete session exists and session check is complete.

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Container | `<Card>` | S-1 | `practice-session-starter.tsx:100` | `gap-0 rounded-2xl border-border p-6`, id=`practice-session-starter` |
| Heading | `<h2>` | — | `:102` | `text-base font-semibold text-foreground` — "Start a session" |
| Description | `<div>` | — | `:105` | `text-sm text-muted-foreground` — mode explanation |

#### Mode Selector

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Label | `<div>` | — | `:114` | `text-sm font-medium text-foreground` — "Mode" |
| Control | `<SegmentedControl>` | I-5 | `:115` | Options: Tutor, Exam. Uses shared `tabSwitchContainerClasses` |

#### Questions Input

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Label | `<label>` | — | `:127` | `text-sm font-medium text-foreground` — "Questions", `htmlFor="session-count-input"` |
| Input | `<Input>` | — | `:133` | `type="number"`, `w-24 border-0 bg-foreground/5 dark:bg-foreground/5 shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`, min=`SESSION_COUNT_MIN`, max=`SESSION_COUNT_MAX`, value renders from the raw string state and clamps back to the canonical numeric count on blur |

#### Status Selector

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Label | `<div>` | — | `:147` | `text-sm font-medium text-foreground` — "Status" |
| Control | `<SegmentedControl>` | I-5 | `:149` | Options: Unanswered, Incorrect, Bookmarked |

#### Difficulty Selector

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Label | `<div>` | — | `:164` | `text-sm font-medium text-foreground` — "Difficulty" |
| Control | `<SegmentedControl>` | I-5 | `:166` | Options: All, Easy, Medium, Hard |

#### Tag Filter Sections (Topic / Substance / Treatment)

Three collapsible `<details>` elements, one per tag kind. Only rendered when `tagLoadStatus === 'idle'` and tags exist for that kind.

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Container | `<details>` | S-2 (practice variant, tonal fill) | `:209–242` | `group rounded-xl bg-foreground/5` |
| Summary header | `<summary>` | — | `:213` | `flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground transition-colors [&::-webkit-details-marker]:hidden` + focus ring |
| Section label | `<span>` | — | `:214` | "Topic" / "Substance" / "Treatment" |
| Summary right cluster | `<span>` | — | `:215` | `flex items-center gap-2` — groups conditional summary metadata + chevron |
| Summary metadata | `<span>` | — | `:216` | `text-xs font-normal text-foreground/60` — `All included by default` when `selectedCount === 0`, otherwise `{N} selected` |
| Disclosure chevron | `<ChevronDown>` | — | `:221` | `h-4 w-4 text-foreground/60 transition-transform group-open:rotate-180` |
| Expanded content wrapper | `<div>` | — | `:224` | `px-4 pb-3` — keeps body spacing after summary owns the clickable padding |
| Chip fieldset | `<fieldset>` | — | `:225` | `flex flex-wrap gap-2 border-0 p-0 m-0`, `aria-label={label}` |
| Filter chips | `<FilterChip>` | I-4 | `:230` | Multi-select toggle buttons (see below) |
| Footer count | `<div>` | — | `:238` | `text-xs text-foreground/60` — `({N} selected)` below the chip group |

#### Tag Loading/Error States

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Loading | `<output>` | — | `:191` | `text-sm text-muted-foreground`, `aria-live="polite"` — "Loading tags…" |
| Error | `<div role="alert">` | — | `:196` | `text-sm text-destructive` — "Tags unavailable." |

#### Footer (Availability + Start)

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Availability message | `<output>` | — | `:247` | `text-sm text-muted-foreground sm:mr-auto`, `aria-live="polite"` — "825 questions available." |
| Start button | `<Button>` | — | `:254` | `rounded-full`, disabled when no questions match or session starting |
| Start error | `<div role="alert">` | — | `:267` | `text-sm text-destructive` — session start error message |

---

## Shared Component Detail

### FilterChip (`components/ui/filter-chip.tsx`)

Toggle-style pill button. Uses `aria-pressed` for selected state.

| State | Classes |
|-------|---------|
| **Base** | `inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors` |
| **Focus** | `outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` |
| **Disabled** | `disabled:pointer-events-none disabled:opacity-50` |
| **Unselected** | `border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.10] dark:border-foreground/40` |
| **Selected** | `border-primary bg-primary text-primary-foreground` |

### SegmentedControl (`components/ui/segmented-control.tsx`)

Single-select tab-style control. Uses shared `tabSwitchContainerClasses` from `tab-switch-styles.ts`.

| Part | Classes |
|------|---------|
| **Container** | `inline-flex rounded-lg border border-border bg-muted p-1` |
| **Item base** | `rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` |
| **Active** | `bg-primary text-primary-foreground shadow-sm` |
| **Inactive** | `text-muted-foreground hover:bg-muted/50 hover:text-foreground` |

### Input (`components/ui/input.tsx`)

Standard shadcn input primitive. The Questions instance in the starter card overrides the base border/shadow/fill to `border-0 bg-foreground/5 dark:bg-foreground/5 shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`. The explicit `dark:bg-foreground/5` is required to override the base component's `dark:bg-input/30`, which would otherwise leak through and produce a different shade than the sibling filter sections.

| Key tokens | Value |
|-----------|-------|
| Starter fill override | `bg-foreground/5 dark:bg-foreground/5` |
| Starter border override | `border-0` |
| Spinner hiding | `[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none` |
| Focus | `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` |

---

## Surface Hierarchy

```
bg-background (Layer 0 — page)
  └─ <Card> bg-card (Layer 1 — session starter / incomplete session / placeholder)
       ├─ SegmentedControl bg-muted (Layer 2 — Mode/Status/Difficulty)
       │    └─ Active item bg-primary (Layer 3)
       │    └─ Inactive items transparent (inherit Layer 2)
       ├─ Input bg-foreground/5 (Layer 2 — Questions count)
       └─ <details> bg-foreground/5 (Layer 2 — tag filter containers)
            └─ FilterChip bg-foreground/[0.07] + border                 ← Layer 3 rest
            └─ FilterChip bg-primary (selected)                           ← Layer 3+, high contrast
```

---

## Data Flow

- Client component (`PracticePageClient`) calls `usePracticeSessionControls()` hook
- Hook checks for incomplete sessions on mount via `getIncompletePracticeSession()`
- Tags loaded on mount via `getAvailableTags()`
- Available question count fetched reactively when filters change via `getAvailableQuestionCount()`
- Session start calls `startPracticeSession()`, which navigates to the practice session route on success
- All async operations use `fireAndForget()` wrapper for error logging

### State machine

```
Page load
  → incompleteSessionStatus: 'loading'
  → Check for incomplete session
    → Found → Show IncompleteSessionCard + placeholder (hide starter)
      → Resume → Navigate to session
      → Abandon → Delete session, show starter
    → Not found → Show PracticeSessionStarter
    → Error → Show ErrorCard + placeholder
```

### Filter state (`PracticeFilters`)

```typescript
type PracticeFilters = {
  tagSlugs: string[];            // Multi-select (FilterChip)
  difficulty: QuestionDifficulty | null;  // Single-select (SegmentedControl), null = "All"
  status: QuestionProgressStatus;         // Single-select (SegmentedControl)
};
```

---

## Dark Mode Tokens

### SegmentedControl (I-5)

| Part | Token | Computed (dark) | Notes |
|------|-------|----------------|-------|
| Container bg | `bg-muted` | #1C1C1C | Slightly lighter than card |
| Container border | `border-border` | #262626 | Decorative — active pill provides identification (see [contrast-policy.md](../contrast-policy.md) §2) |
| Active pill bg | `bg-primary` | #EDEDED | High contrast |
| Active pill text | `text-primary-foreground` | #090909 | Dark on light |
| Inactive text | `text-muted-foreground` | #838383 | ~4.6:1 on muted — passes AA |
| Inactive hover | `hover:bg-muted/50` | Effectively neutral on the solid `bg-muted` container | The more noticeable hover cue is `hover:text-foreground` |

### FilterChip (I-4)

| State | Token | Computed (dark) | Contrast vs parent | Notes |
|-------|-------|----------------|-------------------|-------|
| Unselected border | `border-foreground/45` + `dark:border-foreground/40` | #707070 (dark override) | ~3.40:1 vs current `bg-foreground/5` parent (`#1D1D1D`) | Passes 3:1 in dark mode; light-mode base token is `border-foreground/45` |
| Unselected fill | `bg-foreground/[0.07]` | ~#2C2C2C on the current `bg-foreground/5` parent | ~1.21:1 vs parent | Adds rest-state surface depth without replacing the border as the required boundary |
| Unselected text | `text-foreground` | #EDEDED | ~11.93:1 vs chip fill | Full-weight interactive label hierarchy with ample AA margin |
| Unselected hover | `hover:bg-foreground/[0.10]` | ~#323232 on the current `bg-foreground/5` parent | — | Foreground-based hover ramp stays monotonic and remains visibly above the 7% rest fill |
| Selected fill | `bg-primary` | #EDEDED | — | High contrast |
| Selected text | `text-primary-foreground` | #090909 | ~17:1 vs primary | AA pass |
| Selected border | `border-primary` | #EDEDED | — | Matches fill |

### Filter Container (`<details>`)

| Token | Computed (dark) | Contrast vs card (#121212) | Notes |
|-------|----------------|---------------------------|-------|
| `bg-foreground/5` | #1D1D1D (rgb 29) | 1.11:1 | Subtle tonal lift — matches dashboard nested-row rest state |
| Count/helper text `text-foreground/60` | #9A9A9A | ~5.99:1 vs `bg-foreground/5` | Secondary metadata stays AA-compliant on the tonal surface |

### Input

| Token | Computed (dark) | Notes |
|-------|----------------|-------|
| `dark:bg-input/30` | ~#181818 | Subtle fill on card |
| `dark:border-foreground/40` | #6A6A6A | Same heavy border treatment |

---

## Practice Filter Resolution History
Resolved on 2026-03-09 and later refined by [DEBT-291](../../_archive/debt/debt-291-filter-chip-light-mode-border-contrast.md), [DEBT-292](../../_archive/debt/debt-292-filter-section-disclosure-indicator.md), [DEBT-294](../../_archive/debt/debt-294-filter-chip-fill-depth-and-cursor.md), and [DEBT-295](../../_archive/debt/debt-295-filter-chip-unselected-text-weight.md). The current shipped state is:

| Element | Shipped state | Effect |
|---------|---------------|--------|
| Filter container (`<details>`) | `bg-foreground/5` (no border) | Border removed, tonal fill defines the nested surface |
| FilterChip unselected fill | `bg-foreground/[0.07]` | Adds rest-state depth above the tonal parent without replacing the border as the required boundary |
| FilterChip unselected text | `text-foreground` | Promotes chip labels to primary interactive hierarchy while raising contrast to ~11.93:1 dark / ~15.54:1 light |
| FilterChip unselected hover | `hover:bg-foreground/[0.10]` | Monotonic foreground-based hover ramp above the 7% rest fill |
| Filter summary metadata text | `text-foreground/60` | Keeps zero-state outcome copy / nonzero summary counts secondary but AA-compliant on `bg-foreground/5` |
| Filter footer count text | `text-foreground/60` | Keeps expanded-state `({N} selected)` subordinate without falling below AA on the tonal parent |
| FilterChip base cursor | `cursor-pointer` | Restores the expected browser affordance for clickable chips |
| Filter summary hover | none | Removed the imperceptible `hover:bg-foreground/[0.03]` summary tint; chevron + pointer cursor carry disclosure affordance |

Elements **not** changing: SegmentedControl (all three instances), Input, Card container, Button, header action link, incomplete session card, error states.

---

## Related Documentation

- [Frontend Standards](../standards.md) — Design tokens, Card component standard
- [Pattern Registry](../pattern-registry.md) — S-1 (Card Surface), S-2 (Muted Row), I-4 (Filter Chip), I-5 (Segmented Control)
- [Contrast Policy](../contrast-policy.md) — WCAG AA targets
- [Quick Practice Audit](./quick-practice.md) — Dark mode audit of the question-answering view (separate page)
- [DEBT-290](../../_archive/debt/debt-290-practice-filter-tonal-fill-elevation.md) — Practice filter container tonal fill elevation
- [DEBT-289](../../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md) — Dashboard tonal fill elevation (precedent)
