# Practice Page

**Page:** `/app/practice`
**Source:** `app/(app)/app/practice/page.tsx` (server) → `practice-page-client.tsx` (client)
**Last Updated:** 2026-05-06

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
| Container | `<Card>` | S-1 | `practice-session-starter.tsx:106` | `gap-0 rounded-2xl border-border p-6` |
| Heading | `<h2>` | — | `:108` | `text-base font-semibold text-foreground` — "Start a session" |
| Description | `<div>` | — | `:111` | `text-sm text-muted-foreground` — mode explanation |

#### Mode Selector

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Label | `<div>` | — | `:122` | `text-sm font-medium text-foreground` — "Mode" |
| Control | `<SegmentedControl>` | I-5 | `:126` | Options: Tutor, Exam. Uses shared `tabSwitchContainerClasses` |

#### Questions Input

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Label | `<label>` | — | `:141` | `text-sm font-medium text-foreground` — "Questions", `htmlFor={sessionCountInputId}` |
| Control shell | `compactControlShellClasses` | I-5 container family | `control-shell-styles.ts` | Shared compact shell: `inline-flex rounded-lg border border-border bg-muted p-1` |
| Input | `<Input>` | — | `practice-session-starter.tsx:146` | `type="number"`, `w-16 rounded-md border-0 bg-transparent dark:bg-transparent px-4 py-2 text-center text-sm font-medium shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`, min=`SESSION_COUNT_MIN`, max=`SESSION_COUNT_MAX`, value renders from the raw string state and clamps back to the canonical numeric count on blur |

#### Status Selector

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Label | `<div>` | — | `:166` | `text-sm font-medium text-foreground` — "Status" |
| Control | `<SegmentedControl>` | I-5 | `:170` | Options: Unanswered, Incorrect, Bookmarked |

#### Difficulty Selector

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Label | `<div>` | — | `:187` | `text-sm font-medium text-foreground` — "Difficulty" |
| Control | `<SegmentedControl>` | I-5 | `:191` | Options: All, Easy, Medium, Hard |

#### Tag Filter Sections (Topic / Substance / Treatment)

Three collapsible `<details>` elements, one per tag kind. Only rendered when `tagLoadStatus === 'idle'` and tags exist for that kind.

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Container | `<details>` | S-2 (practice variant, tonal fill) | `:234–268` | `group rounded-xl bg-foreground/5` |
| Summary header | `<summary>` | — | `:238` | `flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground transition-colors [&::-webkit-details-marker]:hidden` + focus ring |
| Section label | `<span>` | — | `:239` | "Topic" / "Substance" / "Treatment" |
| Summary right cluster | `<span>` | — | `:240` | `flex items-center gap-2` — groups conditional summary metadata + chevron |
| Summary metadata | `<span>` | — | `:241` | `text-xs font-normal text-foreground/60` — `All included by default` when `selectedCount === 0`, otherwise `{N} selected` |
| Disclosure chevron | `<ChevronDown>` | — | `:246` | `size-4 text-foreground/60 transition-transform group-open:rotate-180` |
| Expanded content wrapper | `<div>` | — | `:249` | `px-4 pb-3` — keeps body spacing after summary owns the clickable padding |
| Chip fieldset | `<fieldset>` | — | `:250` | `flex flex-wrap gap-2 border-0 p-0 m-0`, `aria-label={label}` |
| Filter chips | `<FilterChip>` | I-4 | `:255` | Multi-select toggle buttons (see below) |
| Footer count | `<div>` | — | `:264` | `text-xs text-foreground/60` — `({N} selected)` below the chip group |

#### Tag Loading/Error States

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Loading | `<output>` | — | `:214` | `text-sm text-muted-foreground`, `aria-live="polite"` — "Loading tags…" |
| Error | `<div role="alert">` | — | `:219` | `text-sm text-destructive` — "Tags unavailable." |

#### Footer (Availability + Start)

| Element | Component / Pattern | Pattern ID | Source | Notes |
|---------|-------------------|------------|--------|-------|
| Availability message | `<output>` | — | `:277` | `text-sm text-muted-foreground sm:mr-auto`, `aria-live="polite"` — "825 questions available." |
| Start button | `<Button>` | — | `:283` | `rounded-full`, disabled when no questions match or session starting |
| Start error | `<div role="alert">` | — | `:296` | `text-sm text-destructive` — session start error message |

---

## Shared Component Detail

### FilterChip (`components/ui/filter-chip.tsx`)

Toggle-style filter button. Uses `aria-pressed` for selected state. DEBT-377 changed this control from decorative pill geometry to `rounded-md` so filter chips match the rectangular control vocabulary used by SegmentedControl and form controls.

| State | Classes |
|-------|---------|
| **Base** | `inline-flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors` |
| **Focus** | `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` |
| **Disabled** | `disabled:pointer-events-none disabled:opacity-50` |
| **Unselected** | `bg-foreground/[0.07] text-foreground/80 hover:bg-foreground/[0.12] hover:text-foreground` |
| **Selected** | `bg-primary text-primary-foreground` |

### SegmentedControl (`components/ui/segmented-control.tsx`)

Single-select tab-style control. Uses shared `tabSwitchContainerClasses` from `tab-switch-styles.ts`.

| Part | Classes |
|------|---------|
| **Container** | `inline-flex rounded-lg border border-border bg-muted p-1` |
| **Item base** | `rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` |
| **Active** | `bg-primary text-primary-foreground shadow-sm` |
| **Inactive** | `text-muted-foreground hover:bg-muted/50 hover:text-foreground` |

### Questions Input Shell (`components/ui/control-shell-styles.ts` + `components/ui/input.tsx`)

The Questions control now uses the shared compact shell instead of a standalone tonal-fill input. The shell owns the visible surface; the inner input stays transparent.

| Key tokens | Value |
|-----------|-------|
| Shell | `inline-flex rounded-lg border border-border bg-muted p-1` |
| Input fill | `bg-transparent dark:bg-transparent` |
| Input border override | `border-0` |
| Width | `w-16` |
| Spinner hiding | `[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none` |
| Focus | `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` |

---

## Active Session Action Bar

**Source:** `TutorActionBar` and the `PracticeView` mode switch in `app/(app)/app/practice/components/practice-view.tsx`

Tutor mode uses click-to-commit answer choices. The footer therefore no longer owns the answer submission action.
Tutor footer shape is derived from `hasPreviousQuestion` / `hasNextQuestion`; the first/middle/last wording below describes position, not a fixed three-question session.

| State | Tutor footer left cluster | Tutor footer right cluster | Notes |
|-------|---------------------------|----------------------------|-------|
| First question pre-feedback (`!hasPreviousQuestion`) | none | none | Empty primary group is suppressed; the choice card is the only primary action. |
| Middle/last question pre-feedback (`hasPreviousQuestion`) | `Previous` | none | No `Submit`, no `Submitting…`, no pre-feedback `Next`, no footer `View Summary`. |
| First/middle question post-feedback (`hasNextQuestion`) | `Previous` when available + filled `Next` | `Bookmark` (`sm:ml-auto`) | Feedback unlocks sequential navigation. |
| Last question post-feedback (`!hasNextQuestion`) | `Previous` when available + filled `End session` | `Bookmark` (`sm:ml-auto`) | Header `End session` stays visible; the same-label header + footer terminal duplicate is intentional and both call `onEndSession`. |

Exam mode keeps answers draft-only until exam review/finalization. Its active footer keeps sequential navigation in a single left cluster:

| State | Exam footer left cluster | Exam footer right cluster | Notes |
|-------|--------------------------|---------------------------|-------|
| First question | filled `Next` in `data-testid="exam-action-primary-group"` | none | No empty Previous placeholder. |
| Middle question | `Previous` + filled `Next` in `data-testid="exam-action-primary-group"` | none | Draft selections do not change footer labels. |
| Last question | `Previous` + filled `Review & Submit` in `data-testid="exam-action-primary-group"` | none | Keeps the hidden `Opens review and submit.` description for assistive tech. |

Exam footers do not render `Mark for review`; that toggle belongs to the header rail.

### Header Rail

**Source:** `PracticeView` header action rail (`data-testid="question-header-actions"`)

Tutor mode renders the persistent outline `End session` action in the header whenever `onEndSession` is available. Exam mode renders the persistent outline `Mark for review` / `Unmark review` toggle in the same rail whenever `onToggleMarkForReview` is available, with `aria-pressed` reflecting review state and disabled state following mark-in-flight, pending, and question-loading states.

### Choice Click Semantics

**Sources:** `useQuestionFlowCore` → `onSelectChoice` callback, `usePracticeQuestionAnswerFlow` → wrapped `onSelectChoice` callback, `usePracticeSessionQuestionFlow` → session-aware `onSelectChoice` callback

`useQuestionFlowCore.onSelectChoice` is mode-agnostic and returns whether a selection actually changed. Quick Practice / ad-hoc practice wraps that return value and immediately commits the explicit clicked `choiceId`. Active tutor sessions do the same, while active exam sessions stop after selection so answers remain draft-only until Review & Submit / exam finalization.

This preserves the shared choice-button primitive while making the orchestration honest by mode: tutor teaches immediately; exam defers correctness until the exam is submitted.

---

## Surface Hierarchy

```
bg-background (Layer 0 — page)
  └─ <Card> bg-card (Layer 1 — session starter / incomplete session / placeholder)
       ├─ SegmentedControl bg-muted (Layer 2 — Mode/Status/Difficulty)
       │    └─ Active item bg-primary (Layer 3)
       │    └─ Inactive items transparent (inherit Layer 2)
       ├─ Compact control shell bg-muted + border-border (Layer 2 — Questions count)
       │    └─ Input bg-transparent (inherits shell surface)
       └─ <details> bg-foreground/5 (Layer 2 — tag filter containers)
            └─ FilterChip bg-foreground/[0.07] borderless tonal fill       ← Layer 3 rest
            └─ FilterChip bg-primary (selected)                            ← Layer 3+, high contrast
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
| Unselected fill | `bg-foreground/[0.07]` | ~#2C2C2C on the current `bg-foreground/5` parent | ~1.21:1 vs parent | Borderless tonal-fill surface; identification comes from text, cursor, hover fill/text lift, focus ring, and `aria-pressed` |
| Unselected text | `text-foreground/80` | ~#C6C6C6 | ~8.18:1 vs chip fill | Dimmed rest text lets unselected chips recede while remaining well above AA |
| Unselected hover | `hover:bg-foreground/[0.12] hover:text-foreground` | ~#363636 on the current `bg-foreground/5` parent | — | Foreground-based hover ramp stays monotonic above the 7% rest fill; text restores full foreground on interaction |
| Selected fill | `bg-primary` | #EDEDED | — | High contrast |
| Selected text | `text-primary-foreground` | #090909 | ~17:1 vs primary | AA pass |

### Filter Container (`<details>`)

| Token | Computed (dark) | Contrast vs card (#121212) | Notes |
|-------|----------------|---------------------------|-------|
| `bg-foreground/5` | #1D1D1D (rgb 29) | 1.11:1 | Subtle tonal lift — matches dashboard nested-row rest state |
| Count/helper text `text-foreground/60` | #9A9A9A | ~5.99:1 vs `bg-foreground/5` | Secondary metadata stays AA-compliant on the tonal surface |

### Questions Input Shell

| Token | Computed (dark) | Notes |
|-------|----------------|-------|
| Shell `bg-muted` | #1C1C1C | Shared compact control surface |
| Shell `border-border` | #262626 | Decorative container edge |
| Inner input `bg-transparent` | Transparent | Lets the shell own the surface instead of introducing a second fill |

---

## Practice Filter Resolution History
Resolved on 2026-03-09 and later refined by [DEBT-291](../../_archive/debt/debt-291-filter-chip-light-mode-border-contrast.md), [DEBT-292](../../_archive/debt/debt-292-filter-section-disclosure-indicator.md), [DEBT-294](../../_archive/debt/debt-294-filter-chip-fill-depth-and-cursor.md), and [DEBT-295](../../_archive/debt/debt-295-filter-chip-unselected-text-weight.md). The current shipped state is:

| Element | Shipped state | Effect |
|---------|---------------|--------|
| Filter container (`<details>`) | `bg-foreground/5` (no border) | Border removed, tonal fill defines the nested surface |
| FilterChip base shape | `rounded-md` | Aligns functional filter toggles with SegmentedControl and form-control shape vocabulary |
| FilterChip unselected fill | `bg-foreground/[0.07]` | Borderless tonal-fill rest surface above the tonal parent; fill is supplementary, not a required boundary |
| FilterChip unselected text | `text-foreground/80` | Lets unselected chip labels recede while keeping normal text contrast at ~8.18:1 dark / ~9.67:1 light |
| FilterChip unselected hover | `hover:bg-foreground/[0.12]` + `hover:text-foreground` | Monotonic foreground-based hover ramp above the 7% rest fill plus text-strength lift on interaction |
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
