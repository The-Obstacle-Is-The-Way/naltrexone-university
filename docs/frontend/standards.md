# Frontend Standards

**Last Updated:** 2026-02-08

Canonical reference for all frontend patterns, component usage, accessibility, and styling conventions. Every UI change MUST be consistent with this document. If a pattern isn't documented here, don't invent one — add it here first.

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
**ALWAYS** use `<Button>` for interactive click targets. Never render raw `<button>` outside `components/ui/`.

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

**Variants:** `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
**Sizes:** `default` (h-9), `sm` (h-8), `lg` (h-10), `icon` (size-9)

**Disabled styling standard:** `disabled:pointer-events-none disabled:opacity-50` — all interactive elements MUST use `opacity-50`, never `opacity-60`.

### Card

**Component:** `components/ui/card.tsx`
**ALWAYS** use the `Card` component for card-like containers. Never build card-like divs manually.

```tsx
// Standard card (note: override defaults to match project convention)
<Card className="gap-0 rounded-2xl p-6 shadow-sm">
  <content />
</Card>
```

The Card component's built-in defaults (`gap-6 rounded-xl py-6`) differ from how the project actually uses cards. Until the Card defaults are updated, always apply `className="gap-0 rounded-2xl p-6 shadow-sm"`.

**Sub-components:** `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction` — use when appropriate, but most cards in this project use `Card` + direct children without sub-components.

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

### Dead Components (DO NOT USE)

The following shadcn/ui components were scaffolded but are **never imported** by any production code. They are dead code and should be removed:
- `components/ui/avatar.tsx` — 0 consumers
- `components/ui/dropdown-menu.tsx` — 0 consumers
- `components/ui/radio-group.tsx` — 0 consumers (app uses custom `ChoiceButton` instead)
- `components/ui/label.tsx` — 0 consumers (app uses plain HTML labels)

Their colocated test files are also dead: `avatar.test.tsx`, `dropdown-menu.test.tsx`, `radio-group.test.tsx`, `label.test.tsx`.

The `buttonVariants` export from `button.tsx` is also never imported externally — only `Button` is used.

### FilterChip / SegmentedControl

These are purpose-built UI primitives in `components/ui/`. They correctly use raw `<button>` internally — this is acceptable since they ARE the component layer.

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
```
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

For non-Button interactive elements that need focus rings, apply:
```
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Do NOT use the legacy pattern:**
```
/* DEPRECATED — do not use */
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
```

Every interactive element MUST have a visible focus indicator. Text links, icon buttons, nav items — no exceptions.

---

## 4. Typography

### Page headings

| Context | Pattern |
|---------|---------|
| App page h1 | `text-2xl font-bold font-heading tracking-tight text-foreground` |
| Marketing hero h1 | `font-display text-5xl font-bold tracking-tight md:text-7xl` |
| Marketing section h2 | `font-heading text-3xl font-bold tracking-tight md:text-4xl` |
| Error page heading | `text-xl font-semibold text-foreground` (use `<h2>` in route errors, `<h1>` in global-error) |

### Heading hierarchy

Headings MUST follow a strict hierarchy: `h1` > `h2` > `h3`. Never skip levels (e.g., h1 directly to h3).

Every page MUST have exactly one `h1`.

### Stat numbers

Use `text-3xl font-bold font-display text-foreground` for prominent statistics. Smaller/denser contexts may use `text-2xl`.

### Body text

| Context | Pattern |
|---------|---------|
| Labels / secondary text | `text-sm text-muted-foreground` |
| Card headings | `text-sm font-medium text-foreground` |
| Error details (digest) | `text-xs text-muted-foreground` |

---

## 5. Spacing & Layout

### Outer container

All app pages use the layout-provided container:
```
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

### Hoverable cards (stat cards)

Standard hover treatment:
```
transition-colors hover:border-border/80 hover:bg-muted/50
```

Do not use `transition-all` for cards. Do not use different hover opacities (`/50` vs `/80`) for the same pattern.

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

Every route MUST have an `error.tsx`. All error boundaries follow this template:

```tsx
'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/routes';
import { REPORT_ISSUE_URL } from '@/lib/support';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[route/error]', error); }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-background text-foreground">
      <div className="mx-auto max-w-md space-y-6 px-4 text-center">
        <h2 className="text-xl font-semibold">Context-specific title</h2>
        <p className="text-sm text-muted-foreground">Context-specific message.</p>
        {error.digest && <p className="text-xs text-muted-foreground">Error ID: {error.digest}</p>}
        <div className="flex flex-col gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline"><Link href={ROUTES.APP_DASHBOARD}>Back to Dashboard</Link></Button>
          <Button asChild variant="outline"><a href={REPORT_ISSUE_URL} target="_blank" rel="noreferrer noopener">Report issue</a></Button>
        </div>
      </div>
    </div>
  );
}
```

Three action buttons: Try Again, contextual navigation, Report Issue. Always in that order.

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

Use an `AlertDialog` from Radix UI (to be added to `components/ui/`).

---

## 11. Accessibility

### Interactive element labeling

Every interactive element MUST have a discernible accessible name:
- Buttons with visible text: text is sufficient
- Icon-only buttons: add `aria-label`
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
- The `Feedback` component (correct/incorrect answer): MUST have `role="alert"` or `aria-live="assertive"`
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

---

## 12. Hook Architecture

### Size limits

Hooks SHOULD NOT exceed 150 lines. Hooks over 200 lines are god hooks and must be split.

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
| `app/` pages | `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` |
| Hooks | `use-kebab-case.ts` | `use-practice-session-controls.ts` |
| Tests | Colocated, same name + `.test.ts(x)` or `.browser.spec.tsx` |

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
- Do NOT add explicit `dark:` variants in page/component code — only in `components/ui/` primitives
- The Clerk theme (`providers.tsx`) is hardcoded to dark — this is a known limitation

---

## 17. Known Violations

Issues documented below are tracked as tech debt. Fix them as you encounter the files. Each is tagged with severity.

### P1 — Must fix before UI/UX refactor

| ID | File(s) | Issue |
|----|---------|-------|
| FE-002 | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts` (304 lines) | God hook: 8 state vars, 3 LoadState trackers. Split summary, navigator, and review concerns. |

### P2 — Fix during UI/UX refactor

| ID | File(s) | Issue |
|----|---------|-------|
| FE-007 | `pricing-client.tsx` | 1 raw `<button>` element; replace with `Button` component. (`pricing-view.tsx` now uses `Button` throughout.) |
| FE-008 | `components/get-started-cta.tsx`, `components/auth-nav.tsx`, `components/marketing/marketing-home.tsx`, `app/not-found.tsx`, `app/pricing/pricing-view.tsx` | 11+ raw styled `<Link>` elements as buttons; replace with `<Button asChild><Link>`. |
| FE-009 | `components/marketing/marketing-home.tsx` | Card-like divs instead of `Card` component; 10 instances (4 stats, 4 features, 2 pricing). |
| FE-010 | `components/question/QuestionCard.tsx`, `ChoiceButton.tsx`, `Feedback.tsx` | Card-like divs instead of `Card`; also PascalCase filenames (should be kebab-case). |
| FE-011 | Many files (see focus ring audit) | Two competing focus ring patterns: Button's `ring-[3px] ring-ring/50` vs hand-rolled `ring-2 ring-ring ring-offset-2`. Converge to one. |
| FE-012 | `app/pricing/pricing-view.tsx` (line 65), `metallic-cta-button.tsx`, `auth-nav.tsx`, `get-started-cta.tsx`, `bookmarks/page.tsx`, `review/page.tsx`, `practice-view.tsx`, `question-page-client.tsx` | Missing focus-visible rings on interactive text links. |
| FE-013 | `pricing-client.tsx`, `ChoiceButton.tsx` | Disabled opacity `60` instead of standard `50`. |
| FE-015 | 9 error boundary files | Copy-pasted template; extract shared `ErrorBoundaryPage` component. |
| FE-016 | `components/ui/card.tsx` | Default `rounded-xl gap-6 py-6` is never used; every consumer overrides to `rounded-2xl gap-0 p-6`. Update defaults. |
| FE-017 | `components/loading/page-loading.tsx` | Skeleton uses `rounded-xl`; actual cards use `rounded-2xl`. Mismatch. |
| FE-018 | `components/ui/metallic-border.tsx`, `notification-provider.tsx` | Manual string concatenation instead of `cn()`. |
| FE-019 | `components/ui/metallic-cta-button.tsx` | External `<a>` missing `target="_blank"`. |
| FE-020 | `app/(app)/app/practice/[sessionId]/` | Missing `error.tsx` — errors bubble to parent with misleading message. |
| FE-021 | No page except root layout | No per-page metadata. All tabs show same title. |
| FE-022 | Dashboard stat cards vs session-summary stat cards | Different hover treatments (`transition-all` vs `transition-colors`, `/80` vs `/50` opacity). |
| FE-023 | `not-found.tsx` (line 28), `pricing-view.tsx` (lines 67, 75), `layout.tsx` (line 119) | `hover:` color changes without `transition-colors`. |
| FE-024 | `pricing-view.tsx` | Missing `font-heading` on h1, missing `font-display` on price numbers. |
| FE-025 | `metallic-cta-button.tsx`, `marketing-home.tsx`, `theme-toggle.tsx` | Icon sizing uses `h-X w-X` instead of `size-X`. |

### P3 — Fix as encountered

| ID | File(s) | Issue |
|----|---------|-------|
| FE-026 | `bookmarks/page.tsx`, `review/page.tsx`, `practice-session-history-panel.tsx`, `exam-review-view.tsx` | Repeated button labels without `aria-label` context for screen readers. |
| FE-027 | `components/question/Feedback.tsx` | Missing `role="alert"` — screen readers not notified of correct/incorrect result. |
| FE-028 | Entire app | No confirmation dialogs for destructive actions (abandon session, remove bookmark, submit exam). |
| FE-029 | Entire app | Toast system used by only 1 consumer; underused for success feedback. |
| FE-030 | Bookmarks page | Bookmark removal has no success feedback (item silently disappears). |
| FE-031 | `app/questions/[slug]/question-page-client.tsx` | 240 lines with ~90 lines of inline hook logic; should extract to a `useQuestionPageController` hook. |
| FE-032 | `components/providers.tsx` | Clerk theme hardcoded to dark mode; won't adapt to light mode toggle. |
| FE-033 | No marketing layout | `/pricing` renders without marketing header/footer; `/` has its own shell. No shared marketing layout. |
| FE-034 | Empty states (bookmarks, review, practice history) | No helpful CTA — just "No X yet." text without guiding user action. |
| FE-035 | `app/(marketing)/checkout/success/checkout-success-sync.tsx` (405 lines) | Inline Stripe logic, type guards, validation, retry logic extracted from page.tsx but still not going through Clean Architecture layers. Extract to a server action or use case. |
| FE-036 | `components/ui/avatar.tsx`, `dropdown-menu.tsx`, `radio-group.tsx`, `label.tsx` | 4 dead shadcn/ui components with 0 production consumers. Delete along with their colocated test files. |
| FE-037 | `components/theme-toggle.tsx` | Uses raw `<button>` instead of `<Button>` component; violates the "ALWAYS use `<Button>` for interactive click targets" rule. |
| FE-038 | `components/ui/card.tsx` sub-components | `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction` are defined but never imported by any consumer — all 12 Card consumers use `Card` + direct children only. Consider removing unused sub-components. |

---

## Appendix: Component Inventory

### `components/ui/` (design system primitives)

| File | Component(s) | Has `data-slot` | Uses `cn()` | Uses `cva` |
|------|-------------|-----------------|-------------|-----------|
| `avatar.tsx` | Avatar, AvatarImage, AvatarFallback | Yes | Yes | No | **DEAD — 0 consumers** |
| `button.tsx` | Button | Yes | Yes | Yes |
| `card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction | Yes | Yes | No |
| `dropdown-menu.tsx` | DropdownMenu, DropdownMenuTrigger, DropdownMenuItem, etc. | Yes | Yes | No | **DEAD — 0 consumers** |
| `filter-chip.tsx` | FilterChip | **No** | Yes | **No** |
| `input.tsx` | Input | Yes | Yes | No |
| `label.tsx` | Label | Yes | Yes | No | **DEAD — 0 consumers** |
| `metallic-border.tsx` | MetallicBorder | **No** | **No** | No |
| `metallic-cta-button.tsx` | MetallicCtaButton | No | No | No |
| `notification-provider.tsx` | NotificationProvider, useNotification | **No** | **No** | No |
| `radio-group.tsx` | RadioGroup, RadioGroupItem | Yes | Yes | No | **DEAD — 0 consumers** |
| `segmented-control.tsx` | SegmentedControl | **No** | Yes | **No** |

### `components/` (shared non-primitive)

| File | Component(s) | Purpose |
|------|-------------|---------|
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
| `question/QuestionCard.tsx` | QuestionCard | Question stem + choices display |
| `question/ChoiceButton.tsx` | ChoiceButton | Radio-style answer choice |
| `question/Feedback.tsx` | Feedback | Correct/incorrect answer feedback |
| `markdown/Markdown.tsx` | Markdown | Markdown renderer |
