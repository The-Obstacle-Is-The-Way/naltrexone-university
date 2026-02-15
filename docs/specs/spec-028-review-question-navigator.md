# SPEC-028: Review Question Navigator (Color-Coded Grid)

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Presentation
**Date:** 2026-02-15
**Depends On:** SPEC-027 (Session Review Navigation — implemented)
**Brainstorming:** `docs/brainstorming/bs-016-review-mode-question-navigator.md` (Option B selected)

---

## 1. Problem

When reviewing a completed practice session, the user's primary goal is: **find and study the questions I got wrong.** The current review UI (implemented by SPEC-027) provides only linear "← Previous / Next →" navigation. For a 20-question session, finding question 17 requires clicking "Next →" up to 16 times.

Meanwhile, during the *active* session, users see a `QuestionNavigator` grid — numbered buttons with random-access to any question. This navigation disappears entirely in review mode.

The data for color-coded correctness is already available. `SessionNavigation.questions[]` contains `isCorrect: boolean | null` per question. The presentation layer has the data — it simply doesn't render a navigator component.

### Industry Precedent

- **UWorld**: Color-coded question list panel in review (green/red/white)
- **AMBOSS**: Four-color system (green/yellow/red/gray)
- **NBME**: Navigator grid with "Review All" vs "Review Incorrect" filtering

---

## 2. Decisions (No Optionality)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Reuse `QuestionNavigator` or new component? | **New `ReviewQuestionNavigator`** (Option B) | Different navigation paradigms (state callback vs URL links), different data shapes (`GetPracticeSessionReviewOutput` vs `SessionNavigation`). Separation of concerns, zero regression risk to active session. |
| Color scheme? | **`success`/`destructive`/`outline`** button variants | Matches existing `ChoiceButton` and `Feedback` coloring. `success`/`destructive` CSS tokens already defined in `globals.css`. |
| Add `success` variant to `Button`? | **Yes** | Follows the existing `destructive` variant structure (bg/text/shadow/hover + focus-visible ring override), swapping in `success` tokens. CSS variables `--success` and `--success-foreground` already exist. |
| Current question styling? | **`ring-2 ring-ring` + `aria-current="step"` + not a link** | Consistent with focus ring pattern. Current question is already displayed — clicking it would be a no-op. |
| Grid layout? | **`grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10`** | Matches existing `QuestionNavigator` grid exactly. |
| Where does it render? | **Inside `QuestionView`, between header/subtitle and `SessionNavigationBar`** | Natural reading order: grid overview → linear nav → question content. |
| Mobile collapsing? | **Not in v1** | 20-question sessions (4 rows on mobile; grid-only height ~168px) are acceptable. Defer collapsing if 40+ sessions become common. |
| "Review Incorrect Only" filter? | **Not in v1** | Visual scanning of colored grid is sufficient for typical 20-question sessions. |

---

## 3. Architecture

### 3.1 Data Flow

```
useQuestionPageController (already implemented by SPEC-027)
  → getPracticeSessionReview({ sessionId })
  → filters to available questions, maps to { slug, order, isCorrect }
  → caches in sessionQuestionsBySessionIdRef
  → returns sessionNavigation: SessionNavigation | null
    ↓
QuestionView receives sessionNavigation (already wired by SPEC-027)
  → renders ReviewQuestionNavigator (NEW)         ← THIS SPEC
    → each button: success/destructive/outline based on isCorrect
    → each non-current button: <Link> with toQuestionRoute(...)
    → current button: highlighted with ring, not clickable
  → renders SessionNavigationBar (EXISTING, unchanged)
    → "← Previous | Question X of Y | Next →"
```

### 3.2 Component Hierarchy (Review Mode Question Page)

```
QuestionPageClient
  └─ QuestionView
       ├─ Header ("Question" + back link)
       ├─ Subtitle ("Reviewing a question from your history.")
       ├─ ReviewQuestionNavigator        ← NEW (this spec)
       ├─ SessionNavigationBar           (SPEC-027, unchanged)
       ├─ QuestionCard
       ├─ Feedback
       └─ Action buttons
```

### 3.3 No Backend Changes

This spec is **presentation-only**. No domain, application, adapter, or data layer changes. All required data (`SessionNavigation.questions[].isCorrect`) is already fetched, cached, and passed through by SPEC-027.

---

## 4. Detailed Design

### 4.1 New File: `ReviewQuestionNavigator`

**File:** `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx`

**Props:**

```typescript
import type { SessionNavigation } from '../question-page-logic';

type ReviewQuestionNavigatorProps = {
  navigation: SessionNavigation;
  historyHref?: string;
};
```

**Implementation:**

```typescript
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toQuestionRoute } from '@/lib/routes';
import type { SessionNavigation } from '../question-page-logic';

function getVariant(isCorrect: boolean | null): 'success' | 'destructive' | 'outline' {
  if (isCorrect === true) return 'success';
  if (isCorrect === false) return 'destructive';
  return 'outline';
}

function getStatusLabel(isCorrect: boolean | null): string {
  if (isCorrect === true) return 'Correct';
  if (isCorrect === false) return 'Incorrect';
  return 'Unanswered';
}

export function ReviewQuestionNavigator({
  navigation,
  historyHref,
}: ReviewQuestionNavigatorProps) {
  const { questions, currentIndex, sessionId, from } = navigation;

  return (
    <Card className="gap-0 rounded-2xl p-4 shadow-sm">
      <div className="text-sm font-medium text-foreground">
        Question navigator
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
        {questions.map((q, i) => {
          const isCurrent = i === currentIndex;
          const variant = getVariant(q.isCorrect);
          const statusLabel = getStatusLabel(q.isCorrect);

          return (
            <Button
              key={q.slug}
              asChild={!isCurrent}
              variant={variant}
              className={cn('relative rounded-full', isCurrent && 'ring-2 ring-ring')}
              aria-label={`Question ${q.order}: ${statusLabel}${isCurrent ? ', Current' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isCurrent ? (
                <span>{q.order}</span>
              ) : (
                <Link href={toQuestionRoute(q.slug, { from, mode: 'review', sessionId, historyHref })}>
                  {q.order}
                </Link>
              )}
            </Button>
          );
        })}
      </div>
    </Card>
  );
}
```

**Key design decisions:**
- `asChild={!isCurrent}`: Current question renders as a `<button>` (not clickable link). All others render as `<a>` via Radix Slot.
- `aria-label` includes correctness state for screen readers.
- `aria-current="step"` follows WAI-ARIA step pattern for the current item.
- `historyHref` is passed through to preserve History back-link state (DEBT-217).

### 4.2 Modified File: `Button` — Add `success` Variant

**File:** `components/ui/button.tsx`
**Line:** Insert immediately after `destructive` (currently `components/ui/button.tsx:14-15`)

**Add:**

```typescript
success:
  'bg-success text-success-foreground shadow-xs hover:bg-success/90 focus-visible:ring-success/20 dark:focus-visible:ring-success/40',
```

This follows the existing `destructive` variant structure (same utility "shape", swapping `success` tokens for `destructive` tokens). Current `destructive` variant (at `components/ui/button.tsx:14-15`):

```typescript
destructive:
  'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
```

The `--success` and `--success-foreground` CSS variables are already defined in `app/globals.css`:
- Light: `--success: 142 72% 35%`, `--success-foreground: 0 0% 100%`
- Dark: `--success: 142 70% 42%`, `--success-foreground: 0 0% 98%`

### 4.3 Modified File: `QuestionView` — Render Navigator

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx`
**Lines 199-204** (the existing `SessionNavigationBar` conditional)

**Before:**

```tsx
{props.sessionNavigation ? (
  <SessionNavigationBar
    navigation={props.sessionNavigation}
    historyHref={props.historyHref}
  />
) : null}
```

**After:**

```tsx
{props.sessionNavigation ? (
  <>
    <ReviewQuestionNavigator
      navigation={props.sessionNavigation}
      historyHref={props.historyHref}
    />
    <SessionNavigationBar
      navigation={props.sessionNavigation}
      historyHref={props.historyHref}
    />
  </>
) : null}
```

**Import to add at top of file:**

```typescript
import { ReviewQuestionNavigator } from './components/review-question-navigator';
```

---

## 5. Files Summary

### New Files

| File | Lines (est.) | Role |
|------|-------------|------|
| `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` | ~60 | Review navigator grid component |
| `app/(app)/app/questions/[slug]/components/review-question-navigator.test.tsx` | ~180 | Unit tests (renderToStaticMarkup) |

### Modified Files

| File | Change |
|------|--------|
| `components/ui/button.tsx` | Add `success` variant (~1 line) |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Import + render `ReviewQuestionNavigator` above `SessionNavigationBar` (~6 lines) |

### Unchanged Files (Data Layer — Already Provides Everything)

| File | Why No Change |
|------|---------------|
| `question-page-logic.ts` | `SessionNavigation.questions[].isCorrect` already exists |
| `use-question-page-controller.ts` | Already fetches, caches, and returns `sessionNavigation` |
| `get-practice-session-review.ts` | Already returns per-question `isCorrect` |
| `lib/routes.ts` | `toQuestionRoute` already accepts `from`, `mode`, `sessionId`, `historyHref` |
| `exam-review-view.tsx` | Existing `QuestionNavigator` is untouched — zero regression risk |

---

## 6. Test Plan

### 6.1 Unit Tests — `ReviewQuestionNavigator`

**File:** `app/(app)/app/questions/[slug]/components/review-question-navigator.test.tsx`

Pattern: `// @vitest-environment jsdom` + `renderToStaticMarkup` + `DOMParser` (matching `question-page-client.test.tsx`).

```
ReviewQuestionNavigator:
  Variant coloring:
    - renders success variant for correct questions (isCorrect=true)
    - renders destructive variant for incorrect questions (isCorrect=false)
    - renders outline variant for unanswered questions (isCorrect=null)

  Current question:
    - highlights current question with ring-2 ring-ring classes
    - sets aria-current="step" on the current question
    - does NOT render current question as a link

  Non-current questions:
    - renders non-current questions as links
    - generates correct href via toQuestionRoute with from, mode, sessionId
    - preserves historyHref in generated links

  Accessibility:
    - includes "Question {order}: Correct" aria-label for correct questions
    - includes "Question {order}: Incorrect" aria-label for incorrect questions
    - includes "Question {order}: Unanswered" aria-label for unanswered questions
    - appends ", Current" to aria-label for the current question

  Grid layout:
    - renders the correct number of buttons matching questions array length
    - displays question order numbers as button text

  Heading:
    - renders "Question navigator" heading text
```

### 6.2 Unit Tests — `Button` `success` Variant

**File:** `components/ui/button.test.tsx` (add to existing)

```
Button:
  - renders with success variant classes (bg-success text-success-foreground)
```

### 6.3 Unit Tests — `QuestionView` Integration

**File:** `app/(app)/app/questions/[slug]/question-page-client.test.tsx` (add to existing)

```
QuestionView:
  - renders ReviewQuestionNavigator when sessionNavigation is present
  - does not render ReviewQuestionNavigator when sessionNavigation is null
  - renders navigator with correct/incorrect/unanswered color coding
```

### 6.4 E2E Tests

**File:** `tests/e2e/session-review-navigation.spec.ts` (extend existing SPEC-027 E2E)

Add assertions to the existing "Session Summary → sequential review" test:

```
Existing test extension:
  - verify question navigator grid is visible on review question page
  - verify navigator contains colored buttons (correct/incorrect variants)
  - verify current question button has ring highlight
  - click a navigator button to jump to a different question
  - verify URL updates to the clicked question
  - verify navigator re-renders with new current question highlighted
```

### 6.5 Browser-Mode Tests (Optional)

**File:** `app/(app)/app/questions/[slug]/components/review-question-navigator.browser.spec.tsx`

Only needed if interactive behavior (click navigation, URL update, cache reuse) requires async state transitions that `renderToStaticMarkup` cannot cover. The component is stateless and renders `<Link>` elements, so unit tests should be sufficient. Browser-mode test is deferred unless unit test coverage proves insufficient.

---

## 7. Implementation Order

```
Phase 1: Button Variant (Foundation)
  1. Write Button success variant test (RED)
  2. Add success variant to buttonVariants in button.tsx (GREEN)

Phase 2: ReviewQuestionNavigator Component (TDD)
  3. Create review-question-navigator.test.tsx with all tests (RED)
  4. Create review-question-navigator.tsx with implementation (GREEN)
  5. Refactor if needed

Phase 3: QuestionView Integration
  6. Add QuestionView integration tests to question-page-client.test.tsx (RED)
  7. Import and render ReviewQuestionNavigator in QuestionView (GREEN)

Phase 4: Verification
  8. Run: pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build
  9. Run: pnpm test:e2e (extend existing session-review-navigation.spec.ts)
```

---

## 8. Acceptance Criteria

### Navigator Grid

- [ ] Review mode question page shows a "Question navigator" card with a color-coded grid when `sessionNavigation` is present
- [ ] Correct questions (`isCorrect === true`) render with `success` variant (green background, white text)
- [ ] Incorrect questions (`isCorrect === false`) render with `destructive` variant (red background, white text)
- [ ] Unanswered questions (`isCorrect === null`) render with `outline` variant (border only, no fill)
- [ ] Current question is highlighted with `ring-2 ring-ring` and is NOT a clickable link
- [ ] Non-current questions are clickable links that navigate to the target question in review mode
- [ ] Grid is responsive: 5 columns mobile, 8 tablet, 10 desktop

### Button Variant

- [ ] `Button` component supports `variant="success"` with `bg-success text-success-foreground` styling
- [ ] Success variant works correctly in both light and dark modes

### Accessibility

- [ ] Each button has `aria-label` with format: "Question {order}: {Correct|Incorrect|Unanswered}{, Current}"
- [ ] Current question has `aria-current="step"`
- [ ] All link buttons are keyboard-focusable with visible focus ring
- [ ] Touch targets meet WCAG 2.5.8 Target Size (Minimum) (24×24): buttons are `h-9` (~36px) and wide enough via `px-4` (≈80px). *(They do not meet WCAG 2.5.5 Target Size (Enhanced) 44×44 — acceptable for v1.)*

### Data Preservation

- [ ] `historyHref` is preserved in navigator links (DEBT-217 compatibility)
- [ ] `from`, `mode=review`, and `sessionId` are all included in navigator link URLs
- [ ] Navigating via grid button reuses cached session data (no redundant API call)

### No Regressions

- [ ] `SessionNavigationBar` (← Previous / Next →) still renders below the navigator grid
- [ ] Active session `QuestionNavigator` in `exam-review-view.tsx` is completely unchanged
- [ ] Non-session flows (History → Questions, Bookmarks, Dashboard) show no navigator grid
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build` all pass

---

## 9. Non-Goals (Explicitly Out of Scope)

- **"Review Incorrect Only" filter** — Click to show only red buttons. Deferred to v2 if users request it.
- **Collapsible grid on mobile** — 20-question sessions produce 4 rows (~168px grid-only). Acceptable. Monitor for 40+ sessions.
- **Marked-for-review indicator** — The active session navigator shows a primary-colored dot (`bg-primary`) for marked questions. Review mode doesn't need this since the exam is over.
- **Shared `NavigatorGrid` layout component** — Extracting a shared grid wrapper between `QuestionNavigator` and `ReviewQuestionNavigator`. Nice-to-have refactor, not required for v1. Both grids use the same Tailwind classes.
- **Modifying `QuestionNavigator` (Option A)** — Rejected. Different navigation paradigms (state vs URL), different data shapes, regression risk.
- **Inline dot navigator (Option C)** — Rejected. Too compact for 20+ questions, fails WCAG 2.5.8 Target Size (Minimum) (24×24), loses numbered labels.

---

## 10. Risk Assessment

**Risk: Low.**

- **Presentation-only** — No backend, domain, or application layer changes.
- **Additive** — New component rendered conditionally. Zero impact on non-session flows.
- **Zero regression surface** — Existing `QuestionNavigator` in `exam-review-view.tsx` is untouched.
- **Data already available** — `SessionNavigation.questions[].isCorrect` is fetched, cached, and passed through by SPEC-027. No new data fetching.
- **Small scope** — ~60 lines new component, ~1 line button variant, ~6 lines integration. Estimated total: ~70 lines of production code.
- **CSS tokens pre-exist** — `--success`, `--success-foreground` already defined in `globals.css` for both light and dark modes. No design system changes needed.

---

## 11. Related

- **BS-016** (Brainstorming) — Full visual inventory, three implementation options, Option B recommendation, component architecture deep-dive
- **SPEC-027** (Session Review Navigation) — The sequential navigation infrastructure this spec builds on. Provides `SessionNavigation` type, controller caching, and `SessionNavigationBar`.
- **SPEC-023** (Question Review Mode) — The review mode infrastructure that renders pre-populated feedback
