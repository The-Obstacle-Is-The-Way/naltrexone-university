# Frontend Standards

**Last Updated:** 2026-03-15

Canonical reference for all frontend patterns, component usage, accessibility, and styling conventions. Every UI change MUST be consistent with this document. If a pattern isn't documented here, don't invent one — add it here first.

**See also:**
- [Pattern Registry](./pattern-registry.md) — Single source of truth for every visual pattern: hover opacities, link strategies, surface hierarchy, token scales, decision trees
- [Design Principles](./design-principles.md) — Layout composition patterns, navigation zones, action bar conventions, state persistence expectations
- [Contrast Policy](./contrast-policy.md) — Canonical WCAG AA contrast targets and rules
- [Bookmark Surface Policy](./bookmark-surface-policy.md) — Where bookmark appears/doesn't and why (decision tree for new surfaces)

---

## Table of Contents

1. [Design Tokens](#1-design-tokens)
2. [Component Standards](#2-component-standards)
3. [Focus Ring Standard](#3-focus-ring-standard)
4. [Typography](#4-typography)
5. [Spacing & Layout](#5-spacing--layout)
6. [Border Radius](#6-border-radius)
7. [Loading States](#7-loading-states)
8. [Error Handling](#8-error-handling)
9. [Empty States](#9-empty-states)
10. [Toasts & User Feedback](#10-toasts--user-feedback)
11. [Accessibility](#11-accessibility)
12. [Hook Architecture](#12-hook-architecture)
13. [File Naming](#13-file-naming)
14. [Route & Navigation](#14-route--navigation)
15. [Page Metadata](#15-page-metadata)
16. [Dark Mode](#16-dark-mode)
17. [Known Violations](#17-known-violations)

---

## 1. Design Tokens

**Source of truth:** `app/globals.css` (CSS custom properties) + `@theme` block (Tailwind mapping).

### Semantic color tokens (ALWAYS use these)

| Token | Usage |
|-------|-------|
| `background` / `foreground` | Page background, primary text |
| `card` / `card-foreground` | Card surfaces |
| `primary` / `primary-foreground` | Primary buttons, links, CTAs |
| `secondary` / `secondary-foreground` | Secondary buttons |
| `muted` / `muted-foreground` | Subdued backgrounds, secondary text |
| `accent` / `accent-foreground` | Hover states, highlights |
| `destructive` / `destructive-foreground` | Errors, destructive actions |
| `success` / `success-foreground` | Correct answers, positive states |
| `warning` / `warning-foreground` | Billing alerts, past-due banners |
| `border` | All borders |
| `input` | Input field borders |
| `ring` | Focus rings |
| `popover` / `popover-foreground` | Popover surfaces (Radix) |
| `chart-1` through `chart-5` | Chart color palette |
| `sidebar-*` family | Sidebar backgrounds, text, accents, borders, rings |

### NEVER use

- Raw hex colors (`#fff`, `#121212`) in `.tsx` files — use semantic tokens
- Raw Tailwind palette colors (`zinc-400`, `slate-700`, `gray-200`) — use semantic tokens
- Exception: Clerk's `appearance.variables` API requires hex (see `providers.tsx`)

### Regression guard

`components/theme-token-regression.test.tsx` actively blocks raw palette usage in key components. Add new components to this test.

---

## 2. Component Standards

### Button

**Component:** `components/ui/button.tsx`
**ALWAYS** use `<Button>` for interactive click targets by default. Raw `<button>` is allowed only inside `components/ui/` primitives and app-shell disclosure toggles that follow Pattern Registry `I-6`.

```tsx
// Standard button
<Button variant="default">Submit</Button>

// Link styled as button
<Button asChild variant="outline">
  <Link href={ROUTES.APP_DASHBOARD}>Back to Dashboard</Link>
</Button>

// External link as button
<Button asChild variant="outline">
  <a href={url} target="_blank" rel="noreferrer noopener">Report issue</a>
</Button>

// Icon button
<Button variant="ghost" size="icon" aria-label="Toggle theme">
  <SunIcon />
</Button>
```

**Variants:** `default`, `destructive`, `success`, `outline`, `secondary`, `ghost`, `link`
**Sizes:** `default` (h-9), `sm` (h-8), `lg` (h-10), `icon` (size-9)

**Disabled styling standard:** `disabled:pointer-events-none disabled:opacity-50` — all interactive elements MUST use `opacity-50`, never `opacity-60`.

### Card

**Component:** `components/ui/card.tsx`
**ALWAYS** use the `Card` component for card-like containers. Never build card-like divs manually.

```tsx
// Standard card
<Card>
  <content />
</Card>
```

Cards in this project generally use `Card` + direct children, with layout/spacing handled via Tailwind classes.

### ErrorCard

**Component:** `components/error-card.tsx`
**Use for:** Inline persistent error messages within a page.

```tsx
<ErrorCard>Could not load your subscription data.</ErrorCard>
```

Has `role="alert"` built in. Do not add `role="alert"` manually.

### Link

**ALWAYS** use `<Link>` from `next/link` for internal navigation. Raw `<a>` is acceptable ONLY for:
- External URLs (always add `target="_blank" rel="noreferrer noopener"`)
- Skip-to-content anchor (`<a href="#main-content">`)
- Inside `global-error.tsx` (Next.js router unavailable)

For links that should look like buttons, use `<Button asChild><Link>`.

### Input

Use the shared `components/ui/input.tsx` for text inputs. Raw `<input>` is acceptable ONLY for:
- `type="hidden"` fields
- Visually-hidden semantic inputs (`className="sr-only"`)

### Unused Components (0 current consumers)

Current repo snapshot has one `components/ui/` primitive with 0 production imports:
- `components/ui/dropdown-menu.tsx` — **KEEP.** Explicitly required in `master_spec.md` SLICE-0 checklist. Needed for future progressive-disclosure filters and app-shell navigation patterns.

`avatar.tsx`, `radio-group.tsx`, and `label.tsx` are no longer present in `components/ui/`.

The `buttonVariants` CVA export from `button.tsx` is intrinsic to the Button module (powers `asChild` pattern used in 20+ files). Do not remove.

### FilterChip / SegmentedControl

These are purpose-built UI primitives in `components/ui/`. They correctly use raw `<button>` internally — this is acceptable since they ARE the component layer.

### Tab-Switch Visual Standard

All tab-switch / segmented-control components MUST use shared visual constants from `components/ui/tab-switch-styles.ts`.

| Constant | Classes | Usage |
|----------|---------|-------|
| `tabSwitchContainerClasses` | `inline-flex rounded-lg border border-border bg-muted p-1` | Outer wrapper |
| `tabSwitchItemBaseClasses` | `rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` | Every tab item |
| `tabSwitchItemActiveClasses` | `bg-primary text-primary-foreground shadow-sm` | Selected item |
| `tabSwitchItemInactiveClasses` | `text-muted-foreground hover:bg-muted/50 hover:text-foreground` | Unselected items |

Semantic structure (element types, ARIA attributes) is component-specific:
- Button-based segmented controls: `<fieldset>` + `<button>` + `aria-pressed`
- Link-based tab bars: `<nav>` + `<Link>` + `aria-current`

Do not create new tab-switch components without consuming these constants.

### NotificationProvider

**Component:** `components/ui/notification-provider.tsx`
**Use for:** Transient success/error feedback (toasts).
**Consumer hook:** `useNotification()`

```tsx
const { notify } = useNotification();
notify({ message: 'Bookmarked!', tone: 'success' });
notify({ message: 'Failed to save', tone: 'error' });
```

Tones: `info` (default), `success`, `error`.

### Icons

**Library:** Lucide React
**Sizing standard:** Use `size-X` shorthand (e.g., `size-4`, `size-5`, `size-6`). Do NOT use `h-X w-X` separately.

```tsx
// Correct
<ArrowRight className="size-4" />

// Wrong
<ArrowRight className="h-4 w-4" />
```

---

## 3. Focus Ring Standard

**The project has ONE focus ring pattern. Use the Button component's built-in ring and do not hand-roll focus styles.**

The `Button` component provides:

```text
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

For non-Button interactive elements that need focus rings, apply:

```text
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Do NOT use the legacy pattern:**

```text
/* DEPRECATED — do not use */
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
```

Every interactive element MUST have a visible focus indicator. Text links, icon buttons, nav items — no exceptions.

---

## 4. Typography

**Canonical policy:** [Typography Policy](./typography-policy.md) — Two-pipeline model (hardcoded UI text vs content), content tier system, Markdown component rules.

This section covers **hardcoded UI text** sizing. For content text (question stems, choices, explanations, references), see the Typography Policy.

### Page headings

| Context | Pattern |
|---------|---------|
| App page h1 | `text-2xl font-bold font-heading tracking-tight text-foreground` |
| Marketing hero h1 | `font-display text-5xl font-bold tracking-tight md:text-7xl` |
| Marketing section h2 | `font-heading text-3xl font-bold tracking-tight md:text-4xl` |
| Error/utility page heading | `text-xl font-semibold font-heading tracking-tight text-foreground` (route errors use `<h2>` unless `includeMainLandmark`; `global-error.tsx` uses `text-2xl font-bold font-heading tracking-tight text-foreground`). |

### Subtitles and supporting copy

| Context | Pattern |
|---------|---------|
| Standard page/section subtitle | `text-base text-muted-foreground` |
| Marketing hero/pricing subtitle | `text-lg text-muted-foreground` |

### Heading hierarchy

Headings MUST follow a strict hierarchy: `h1` > `h2` > `h3`. Never skip levels (e.g., h1 directly to h3).

Every page MUST have exactly one `h1`.

### Card title elements

Card titles MUST use heading elements (`<h2>` or `<h3>` depending on page outline), not `<div>`. This ensures screen reader users can navigate by heading to find card sections.

**Correct:**
```tsx
<Card>
  <h2 className="text-sm font-medium text-foreground">Recent sessions</h2>
  ...
</Card>
```

**Incorrect:**
```tsx
<Card>
  <div className="text-sm font-medium text-foreground">Recent sessions</div>
  ...
</Card>
```

Reference pattern: `exam-review-view.tsx` uses `<h2>` for "Question navigator".

### Stat numbers

Use `text-3xl font-bold font-display text-foreground` for prominent statistics. Smaller/denser contexts may use `text-2xl`.

### Body text

| Context | Pattern |
|---------|---------|
| Labels / secondary text | `text-sm text-muted-foreground` |
| Page/section supporting copy | `text-base text-muted-foreground` |
| Card headings | `text-sm font-medium text-foreground` |
| Error details (digest) | `text-xs text-muted-foreground` |
| Content text (Markdown) | See [Typography Policy](./typography-policy.md) — three-tier system (primary `text-base`, secondary `text-sm`, tertiary `text-xs`) |

Do not rely on inherited browser `1rem` for page/section subtitles or helper copy. If the intent is 16px supporting copy, say `text-base` explicitly.

---

## 5. Spacing & Layout

### Outer container

All app pages use the layout-provided container:

```text
mx-auto max-w-7xl px-4 sm:px-6 lg:px-8
```

Do NOT add your own container wrapper — the `(app)/app/layout.tsx` handles this.

### Card padding

Standard: `p-6`. Use `p-4` only for intentionally dense/compact views (e.g., exam review navigator).

### Section spacing

- Between page sections: `space-y-6`
- Card grids: `gap-4`
- Button groups: `gap-3`
- Form fields: `gap-2` to `gap-4`

### Label-to-control spacing

All label + control pairs (e.g., a text label above a segmented control, select, or input) MUST use a `space-y-2` parent wrapper. Do not use bare `<div>` with `mt-2` on the control — it produces the same visual result but creates inconsistent markup that makes refactoring fragile.

```tsx
// Correct — space-y-2 wrapper
<div className="space-y-2">
  <label className="text-sm font-medium">Difficulty</label>
  <SegmentedControl ... />
</div>

// Incorrect — mt-2 on control
<div>
  <label className="text-sm font-medium">Difficulty</label>
  <div className="mt-2">
    <SegmentedControl ... />
  </div>
</div>
```

### Flex alignment with mixed-height children

When flex children have noticeably different intrinsic heights, use `items-start` or `items-baseline` — not `items-center`. Reserve `items-center` for cases where children are the same height.

```tsx
// Correct — different-height children
<div className="flex sm:flex-row sm:items-start gap-4">
  <div>Multi-line text block</div>
  <Button>Action</Button>
</div>

// Incorrect — items-center with different heights causes misalignment
<div className="flex sm:flex-row sm:items-center gap-4">
  <div>Multi-line text block</div>
  <Button>Action</Button>
</div>
```

Reference pattern: `choice-button.tsx` correctly uses `items-start` with a fixed-height circle + variable-height markdown.

### Interactive row/card hover

Hover opacity is context-dependent. Use the Pattern Registry (`Part 1.2`, `I-1` through `I-4`) as canonical:

| Context | Canonical Pattern |
|---------|-------------------|
| Inside card surface (muted-scale row) | `transition-colors hover:bg-muted/40` |
| On page background (muted-scale row) | `transition-colors hover:bg-muted/50` |
| Tonal row / direct-action target | Use the component-specific Pattern Registry entry. Dashboard-style in-card tonal rows use `hover:bg-foreground/[0.08]`; standalone tonal rows use `hover:bg-foreground/[0.12]`; choice buttons use `hover:bg-foreground/[0.06] hover:border-foreground/55` in light mode and `dark:hover:bg-foreground/[0.05] dark:hover:border-foreground/50` on the unselected branch; filter chips use `hover:bg-foreground/[0.12] hover:border-foreground/60`. |

Rules:
- Use the pattern's neutral fill scale. `muted` is for muted-scale rows/containers; `foreground` is for tonal-row families and direct-action surfaces whose registry entry calls for a foreground ramp.
- For ChoiceButton (I-3), treat hover fills as replacements on `bg-card`, not layers over the rest `bg-background/50` surface. `hover:bg-*` overrides the rest background token in CSS.
- Do not use `transition-all` for hover color changes
- Link-only underline hovers (`hover:underline`) are a separate link pattern (see Pattern Registry Part 4)

---

## 6. Border Radius

| Element | Radius |
|---------|--------|
| Cards | `rounded-2xl` |
| Buttons (app) | `rounded-full` (override Button's `rounded-md` default) |
| Buttons (forms/actions) | `rounded-md` (Button default) |
| Loading skeletons | `rounded-2xl` (MUST match the cards they replace) |
| Toasts | `rounded-xl` |
| Inputs | `rounded-md` (Input default) |
| Chips / pills | `rounded-full` |

---

## 7. Loading States

### Page-level loading (Suspense)

Every route under `(app)/app/` MUST have a `loading.tsx` using the shared `PageLoading` component:

```tsx
import { PageLoading } from '@/components/loading/page-loading';

export default function Loading() {
  return <PageLoading label="Loading billing" cardCount={2} />;
}
```

`PageLoading` provides `aria-busy="true"`, `aria-live="polite"`, and `sr-only` label automatically.

### Inline loading

Use `<output>` with `aria-live="polite"`:

```tsx
<output aria-live="polite">Loading question...</output>
```

The `<output>` element has implicit `role="status"` — do not add it manually.

### Button loading

Change button text and disable during pending:

```tsx
<Button disabled={isPending}>
  {isPending ? 'Processing...' : 'Subscribe'}
</Button>
```

---

## 8. Error Handling

### Error boundaries (`error.tsx`)

Every route MUST have an `error.tsx`. All error boundaries use the shared `ErrorBoundaryPage` component:

**Component:** `components/error-boundary-page.tsx`

```tsx
'use client';
import { ErrorBoundaryPage } from '@/components/error-boundary-page';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorBoundaryPage
      error={error}
      reset={reset}
      title="Context-specific title"
      description="Context-specific message."
      links={[{ href: ROUTES.APP_DASHBOARD, label: 'Back to Dashboard' }]}
      logPrefix="app/(app)/app/route-name/error.tsx:"
    />
  );
}
```

`ErrorBoundaryPage` renders three action buttons: Try Again, contextual navigation link(s), Report Issue — always in that order. Pass `includeMainLandmark` when the error boundary replaces the page's `<main>` element (uses `<h1>` instead of `<h2>`).

### Inline errors

Use `ErrorCard` for standalone inline errors. Use bare `<div role="alert" className="text-sm text-destructive">` for lightweight inline errors within cards.

Both MUST have `role="alert"`.

---

## 9. Empty States

Empty states SHOULD include a helpful CTA guiding the user to take action:

```tsx
// Good
<Card className="gap-0 rounded-2xl p-6 shadow-sm">
  <p className="text-sm text-muted-foreground">No bookmarks yet.</p>
  <Button asChild variant="outline" className="mt-4">
    <Link href={ROUTES.APP_PRACTICE}>Start practicing</Link>
  </Button>
</Card>

// Insufficient
<Card className="gap-0 rounded-2xl p-6 shadow-sm">
  <p className="text-sm text-muted-foreground">No bookmarks yet.</p>
</Card>
```

---

## 10. Toasts & User Feedback

### When to use toasts

| Action | Feedback type |
|--------|--------------|
| Bookmark toggled (practice) | Toast: "Bookmarked!" / "Removed" |
| Bookmark removed (bookmarks page) | Toast (not page reload) |
| Session started | Navigation to session page |
| Session ended | Summary view renders |
| Answer submitted | Inline Feedback component |
| Billing portal opened | Redirect to Stripe |
| Destructive action | Confirmation dialog first, then toast on success |

### Confirmation dialogs

Destructive actions MUST show a confirmation dialog before executing:
- Abandon incomplete session
- Remove bookmark (bookmarks page)
- Submit/end exam session

Use `AlertDialog` from `components/ui/alert-dialog.tsx` (Radix UI wrapper). Currently used in bookmarks page, exam review, and incomplete session card.

---

## 11. Accessibility

### Interactive element labeling

Every interactive element MUST have a discernible accessible name:
- Buttons with visible text: text is sufficient
- Icon-only buttons: provide `aria-label` **or** visually hidden text (for example, `<span className="sr-only">`)
- Repeated buttons in lists (e.g., "Remove", "Reattempt"): add `aria-label` with context

```tsx
// Bad — screen reader hears "Remove, Remove, Remove..."
<Button type="submit">Remove</Button>

// Good — screen reader hears "Remove bookmark: Question about naltrexone"
<Button type="submit" aria-label={`Remove bookmark: ${stemPreview}`}>Remove</Button>
```

### Feedback announcement

- `ErrorCard` has `role="alert"` (assertive) — correct
- Inline errors: MUST have `role="alert"`
- The `Feedback` component (correct/incorrect answer): uses `role="status"` (polite) — correct
- Loading regions: MUST have `aria-live="polite"` (PageLoading and `<output>` handle this)

### Heading levels

- Every page MUST have exactly one `h1`
- Heading levels MUST be sequential (h1 > h2 > h3, no skipping)
- Error boundary pages use `h2` (they render inside a layout with an h1)
- `global-error.tsx` uses `h1` (it replaces the entire document)

### Focus management

After error recovery ("Try again"), focus SHOULD move to the result (the new content or error). Use a `ref` + `useEffect` to programmatically focus.

### Forms

- Forms with multiple controls: add `aria-label` to the `<form>`
- Single-button forms: button text provides context (acceptable)

### Touch target sizes

**Policy (decided 2026-03-12):** The project explicitly accepts the current shared component heights at their existing sizes. The 44px WCAG 2.1 SC 2.5.5 recommendation is AAA (aspirational), not AA (required). Current AA compliance is not affected.

| Component | Current effective height | Status |
|-----------|------------------------|--------|
| `Button` (default) | 36px (`h-9`) | Accepted |
| `SegmentedControl` button | ~36px (`py-2`) | Accepted |
| `FilterChip` button | ~34px (`py-1.5` + border) | Accepted |

**Rationale:** This is a desktop-first educational application. Bumping shared components to 44px has a wide blast radius (every page with buttons, chips, or segmented controls changes) for marginal mobile ergonomics gain. The current sizes provide adequate tap targets for the app's primary usage context.

**Future consideration:** If mobile usage grows significantly, consider adding responsive padding (e.g., `py-1.5 sm:py-1.5` → `py-2.5 sm:py-1.5`) to shared components so mobile gets larger tap targets without affecting desktop layout. This would be a targeted change rather than a blanket height increase.

### Contrast (WCAG AA)

**Canonical rules:** `docs/frontend/contrast-policy.md`

All UI must meet WCAG AA contrast targets for:
- SC 1.4.3 (text): 4.5:1 for normal text, 3.0:1 for large text
- SC 1.4.11 (non-text): 3.0:1 for required UI boundaries and state indicators

---

## 12. Hook Architecture

### Size limits

Hooks SHOULD NOT exceed 150 lines. Hooks over 200 lines are godlike hooks and must be split.

### State pattern

Use the `LoadState` discriminated union for all async state:

```typescript
type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };
```

Do NOT use bare `'idle' | 'loading' | 'error'` string enums with a separate `error: string | null` state. Do NOT define a second `LoadState` without `'idle'`.

### Server action calls

All server actions return `ActionResult<T>`. The standard call pattern:

```typescript
let res: ActionResult<T>;
try {
  res = await someAction({ ... });
} catch (error) {
  if (!isMounted()) return;
  setLoadState({ status: 'error', message: getThrownErrorMessage(error) });
  return;
}
if (!isMounted()) return;
if (!res.ok) {
  setLoadState({ status: 'error', message: getActionResultErrorMessage(res) });
  return;
}
// success path
```

### Return values

All hooks return objects (not tuples). Properties should be named descriptively.

### Duplication

Logic shared between `/practice` and `/practice/[sessionId]` (question loading, answer submission, bookmark state) MUST be extracted to shared functions or a shared hook. Do not copy-paste between session and non-session variants.

---

## 13. File Naming

| Location | Convention | Example |
|----------|-----------|---------|
| `components/ui/` | kebab-case | `button.tsx`, `filter-chip.tsx` |
| `components/` (shared) | kebab-case | `error-card.tsx`, `theme-toggle.tsx` |
| `components/question/` | kebab-case | `question-card.tsx`, `choice-button.tsx` |
| `app/` pages | reserved entrypoint names | `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` |
| Hooks | `use-kebab-case.ts` | `use-practice-session-controls.ts` |
| Tests | colocated, same name + suffix | `*.test.ts(x)`, `*.browser.spec.tsx` |

**PascalCase filenames are NOT used in this project.** If you see `QuestionCard.tsx`, it should be `question-card.tsx`.

---

## 14. Route & Navigation

### Route constants

**Source of truth:** `lib/routes.ts`

ALWAYS use `ROUTES.*` constants and helper functions for links. NEVER hardcode route strings in `.tsx` files.

```tsx
// Correct
<Link href={ROUTES.APP_DASHBOARD}>Dashboard</Link>
<Link href={toPracticeSessionRoute(sessionId)}>View session</Link>

// Wrong
<Link href="/app/dashboard">Dashboard</Link>
```

### Navigation links

- App nav items: defined in `components/app-nav-items.ts`
- Desktop nav: `components/app-desktop-nav.tsx`
- Mobile nav: `components/mobile-nav.tsx`
- Both source from the same `APP_NAV_ITEMS` constant

### Exam answer secrecy routing rule

Before adding or changing any question-review link (`mode=review`, `attemptId`, `sessionId`), verify the destination cannot expose active-exam correctness/explanations.

- Canonical source: `docs/practice-engine/exam-answer-secrecy-policy.md`
- Do not ship route/link changes that bypass that policy via alternate identifier paths.

### App Shell Header

**Source:** `app/(app)/app/layout.tsx:75-97`

- Header: `relative border-b border-border bg-background`
- Inner container: `mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8`
- Sticky/z-index: not sticky; no explicit `z-*`
- Brand link follows Pattern Registry `L-4`: `rounded-md text-sm font-semibold text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`

### Marketing Shell Header

**Source:** `components/marketing/marketing-layout.tsx:22-56`

- Header: `border-b border-border bg-background`
- Inner container: `mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8`
- Desktop nav: `hidden items-center gap-4 text-sm sm:flex`
- Mobile nav: `mt-3 flex items-center gap-4 text-sm sm:hidden`
- Marketing header includes `ThemeToggle` (UX-3 resolved in DEBT-260 / PR #152)

### Transitions on interactive elements

Every element with a `hover:` color change MUST also have `transition-colors`:

```tsx
// Correct
className="text-muted-foreground transition-colors hover:text-foreground"

// Wrong — abrupt color change
className="text-muted-foreground hover:text-foreground"
```

---

## 15. Page Metadata

Every page SHOULD export metadata for distinct browser tab titles and SEO:

```tsx
// In a server component page.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard - Addiction Boards',
};
```

Format: `{Page Name} - Addiction Boards`

---

## 16. Dark Mode

Dark mode is implemented via CSS custom properties in `.dark` class (globals.css). The semantic token system handles light/dark switching automatically.

**Rules:**
- Use semantic tokens (`bg-background`, `text-foreground`, `bg-card`, etc.) — they adapt automatically
- Do NOT add explicit `dark:` color overrides in page/component code — keep dark color logic in `components/ui/` primitives
- Structural visibility toggles (`dark:hidden`, `dark:block`) are acceptable when needed for theme-specific icon/content swaps
- Clerk appearance follows the app theme via `providers.tsx`

---

## 17. Known Violations

Issues documented below are tracked as tech debt in `docs/debt/index.md` (Frontend Debt section). Items with individual resolution docs live at `docs/debt/debt-NNN-*.md`. Fix them as you encounter the files. Each is tagged with severity.

### P1 — Must fix before UI/UX refactor

*No P1 items.*

### P2 — Fix during UI/UX refactor

Three hooks exceed the 200-line "god hook" threshold (§12):

| Hook | Lines | File |
|------|-------|------|
| `useQuestionPageController` | 370 | `app/(app)/app/questions/[slug]/use-question-page-controller.ts` |
| `usePracticeSessionQuestionFlow` | 238 | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts` |
| `useQuestionFlowCore` | 263 | `app/(app)/app/practice/shared/use-question-flow-core.ts` |

Contrast compliance gaps (WCAG AA) are documented in `docs/brainstorming/bs-042-contrast-consistency-and-wcag-compliance-audit.md` and governed by `docs/frontend/contrast-policy.md`.

### P3 — Fix as encountered

| ID | Summary | File(s) |
|----|---------|---------|
| — | Visual divergences from BS-035 audit are resolved. Only approved exception `D-15` (MetallicCtaButton) remains. See Pattern Registry Part 11 for historical record. | `docs/frontend/pattern-registry.md` |
| — | History sessions expanded breakdown UI remains functionally correct but is under active redesign review for hierarchy/density/navigation clarity (BS-036). | `app/(app)/app/history/components/history-sessions-tab.tsx`, `app/(app)/app/shared/components/session-breakdown-list.tsx`, `docs/brainstorming/bs-036-history-breakdown-ux-redesign.md` |
| — | `Markdown.tsx` uses PascalCase filename (violates §13 kebab-case convention) | `components/markdown/Markdown.tsx` |

---

## Appendix: Component Inventory

### `components/ui/` (design system primitives)

| File | Component(s) | Has `data-slot` | Uses `cn()` | Uses `cva` | Notes |
|------|-------------|-----------------|-------------|------------|-------|
| `button.tsx` | Button | Yes | Yes | Yes | |
| `card.tsx` | Card | Yes | Yes | No | |
| `dropdown-menu.tsx` | DropdownMenu, DropdownMenuTrigger, DropdownMenuItem, etc. | Yes | Yes | No | **0 consumers — KEEP (spec-mandated)** |
| `filter-chip.tsx` | FilterChip | **No** | Yes | **No** | |
| `input.tsx` | Input | Yes | Yes | No | |
| `select.tsx` | Select, SelectTrigger, SelectContent, SelectItem, etc. | Yes | Yes | No | Radix UI wrapper |
| `metallic-border.tsx` | MetallicBorder | **No** | Yes | No | |
| `metallic-cta-button.tsx` | MetallicCtaButton | No | No | No | |
| `notification-provider.tsx` | NotificationProvider, useNotification | **No** | Yes | No | |
| `alert-dialog.tsx` | AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction | Yes | Yes | No | Radix UI wrapper |
| `segmented-control.tsx` | SegmentedControl | **No** | Yes | **No** | |
| `tab-switch-styles.ts` | (style constants only) | **No** | No | **No** | Shared by SegmentedControl + HistoryTabBar |

### `components/` (shared non-primitive)

| File | Component(s) | Purpose |
|------|-------------|---------|
| `error-boundary-page.tsx` | ErrorBoundaryPage | Reusable error boundary content (Try again + nav links + Report issue) |
| `error-card.tsx` | ErrorCard | Inline error alert |
| `get-started-cta.tsx` | GetStartedCta | Marketing CTA |
| `auth-nav.tsx` | AuthNav | Auth-aware nav buttons |
| `app-nav-items.ts` | APP_NAV_ITEMS | Nav link definitions (shared by desktop + mobile) |
| `app-desktop-nav.tsx` | AppDesktopNav | Desktop horizontal top nav |
| `mobile-nav.tsx` | MobileNav | Mobile hamburger nav |
| `theme-toggle.tsx` | ThemeToggle | Dark/light mode toggle |
| `providers.tsx` | Providers | ClerkProvider + NotificationProvider wrapper |
| `theme-provider.tsx` | ThemeProvider | next-themes wrapper |
| `loading/page-loading.tsx` | PageLoading | Skeleton loading for pages |
| `marketing/marketing-home.tsx` | MarketingHome shell + sections | Landing page |
| `question/question-card.tsx` | QuestionCard | Question stem + choices display |
| `question/choice-button.tsx` | ChoiceButton | Radio-style answer choice |
| `question/feedback.tsx` | Feedback | Correct/incorrect answer feedback |
| `markdown/Markdown.tsx` | Markdown | Markdown renderer |
