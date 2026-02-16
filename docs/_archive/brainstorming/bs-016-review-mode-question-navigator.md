# BS-016: Color-Coded Question Navigator in Review Mode

**Status:** Resolved
**Resolved:** 2026-02-15
**Date:** 2026-02-14
**Updated:** 2026-02-15
**Triggered by:** UX comparison of active session view (question navigator grid) vs review mode (linear previous/next only)
**Scope:** Review mode lacks the question navigator grid, forcing linear traversal to find incorrect answers in a completed session
**Related:** [SPEC-027](../specs/spec-027-session-review-navigation.md) (Session Review Navigation — implemented), [BS-009](../_archive/brainstorming/bs-009-session-review-navigation-gap.md) (Session Review Navigation Gap — archived)

---

## Open Questions

1. **Reuse or fork the component?** The existing `QuestionNavigator` (in `exam-review-view.tsx`) uses state-based navigation (`onNavigateQuestion` callback). Review mode uses URL-based navigation (each question is a separate route). Should we adapt the existing component to support both modes, or create a review-specific variant?
2. **Color palette?** Green/red is universal for correct/incorrect, but what shade works in both light and dark themes without clashing with existing UI tokens? Should we use the existing `destructive` and `success` variant tokens or add new ones?
3. **"Review Incorrect Only" filter?** UWorld and NBME offer a button to show only incorrect questions. Should the navigator support filtering, or is visual scanning sufficient for sessions of 20 questions?
4. **Fourth state for "marked for review"?** The active session navigator already shows a small dot for marked-for-review questions. Should this carry through to the review grid (e.g., AMBOSS uses yellow for "correct but used hints")?
5. **Mobile layout?** The active navigator uses 5 columns on mobile. For a 20-question session this is 4 rows — acceptable. For 40-question sessions this grows to 8 rows. Should the grid be collapsible on mobile?
6. **Where does the navigator live?** In `QuestionView` (the review question page)? Or as a standalone floating/sticky element? The active session `QuestionNavigator` sits at the top of `PracticeView` via the `topContent` slot.

---

## The Problem

When a user finishes a 20-question practice session and enters review mode, their primary goal is almost always: **find and study the questions I got wrong.** The current review UI forces them to click "Next →" up to 19 times sequentially to locate, say, question 17 which they missed.

Meanwhile, during the _active_ session, users see a question navigator grid — numbered pill-shaped buttons 1 through 20 — with random access to any question. This navigation disappears entirely in review mode, replaced by bare "← Previous" / "Next →" links.

### What Exists Today — Visual Inventory

_(All screenshots captured 2026-02-15 via Playwright against localhost:3000)_

**1. Active Tutor Session** (`/app/practice/[sessionId]`)
- Header: "Tutor Session" + "End session" button
- Description: "Question X of Y — Explanations shown after each answer."
- `topContent` slot renders `QuestionNavigator` when navigator data is loaded
- QuestionNavigator: responsive grid (5 cols mobile / 8 tablet / 10 desktop)
- Below: `QuestionCard` with stem + 4 choice labels (A/B/C/D)
- Below: Submit, Next Question, Bookmark, Mark for review (exam only)
- After submit (tutor mode): `Feedback` card (green border = correct, red = incorrect)

**2. Exam Review View** (`/app/practice/[sessionId]` — after answering all questions)
- Header: "Review Questions" + description
- 3 stat cards: Answered, Unanswered, Marked
- `QuestionNavigator` grid with 3 visual states:
  - `default` variant (dark bg): current question
  - `secondary` variant (gray bg): answered
  - `outline` variant (white bg, border): unanswered
  - Primary-colored dot (`bg-primary`): marked for review
- Question list with stem previews + "Open question" buttons
- "Submit exam" button with confirmation dialog

**3. Session Summary** (`/app/practice/[sessionId]` — after session ends)
- Header: "Session Summary" + "Here's how you did."
- 4 stat cards: Answered, Correct, Accuracy %, Duration
- `SessionBreakdownList`: numbered questions with stem previews
  - Green "Correct" / Red "Incorrect" / Gray "Unanswered" text labels (not badge components)
  - Each question links to `/app/questions/[slug]?from=practice&mode=review&sessionId=...`
- Buttons: Back to Dashboard, View in History, Start another session

**4. Review Mode Question Page** (`/app/questions/[slug]?from=history&mode=review&sessionId=...`)
- Header: "Question" + "Back to History" link
- Subtitle: "Reviewing a question from your history."
- `SessionNavigationBar`: "← Previous | Question X of Y | Next →"
  - Links use `toQuestionRoute(slug, { from, mode, sessionId, historyHref })`
  - ← Previous hidden when at first question
  - Next → hidden when at last question
- `QuestionCard` with choices (shows correctness colors when previously answered)
- `Feedback` card (when previous attempt is loaded)
- **NO question navigator grid** — this is the gap

**5. History — Sessions Tab** (`/app/history?tab=sessions`)
- List of completed sessions with mode, score, accuracy%, duration, date
- "View breakdown" toggle button per session (inline expand, not navigation)
- Expanded: `SessionBreakdownList` with question links

**6. History — Questions Tab** (`/app/history?tab=questions`)
- Filter dropdowns (`<select>`): Result (All/Correct/Incorrect), Difficulty, Tag, Source
- Long scrollable list of all attempted questions with colored result labels (text, not badges)
- Each question links to review mode

**7. Practice Setup** (`/app/practice`)
- Mode: Tutor / Exam segmented control
- Questions count input
- Status: Unanswered / Incorrect / Bookmarked segmented control
- Difficulty: All / Easy / Medium / Hard
- Tag accordion selectors (Exam Section, Substance, Topic, Treatment). *(Diagnosis accordion appears only when diagnosis tags exist in the available tags list.)*
- "Start session" button

### Task Mismatch

The linear pattern makes sense for _taking_ a session (you proceed through questions in order). It does not match the review task, where users are triaging — scanning for red, drilling into specific failures. Forcing sequential traversal through correct answers to reach incorrect ones is pure friction with zero learning value.

### Industry Precedent

Competitor research confirms this is the established convention in medical education question banks:

- **UWorld**: Color-coded question list panel in review — green (correct), red (incorrect), white (omitted). Click any number to jump.
- **AMBOSS**: Four-color system — green (correct), yellow (correct with hint), red (incorrect), gray (unanswered).
- **NBME**: Navigator grid in review with "Review All" vs "Review Incorrect" filtering. Their newer interface restricted navigation to linear-only, and users found it so frustrating that some resorted to external tools to skip through questions.
- **Lecturio**: Performance overview with color-coded accuracy indicators per subject.

### Clean Architecture Analysis

The review page already fetches `GetPracticeSessionReviewOutput` which contains per-question `isCorrect`, `isAnswered`, and `markedForReview` state. The presentation layer has all the data — it simply doesn't render the navigator component. Uncle Bob's principle of keeping presentation honest applies: the UI should show users what it knows, not hide available information behind unnecessary sequential access.

## Impact

- **High friction for the primary review task**: Finding incorrect answers requires O(n) clicks instead of O(1)
- **Inconsistency**: Active session has rich navigation; review mode regresses to bare linear links
- **Missed at-a-glance performance summary**: The navigator grid doubles as a visual heat map (mostly green = good session, lots of red = focused study needed)

---

## Component Architecture Deep-Dive

### Existing Components and Their Contracts

**`QuestionNavigator`** — `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:24-85`
```typescript
// Props:
review: GetPracticeSessionReviewOutput     // Full session review data
currentQuestionId: string | null            // Highlights current question
onNavigateQuestion: (questionId: string) => void  // State-based callback (NOT URL)

// Rendering:
- Card with "Question navigator" heading
- Grid: grid-cols-5 / sm:grid-cols-8 / lg:grid-cols-10
- Each Button: rounded-full, variant based on status
  - default (current), secondary (answered), outline (unanswered)
- Disabled when !row.isAvailable
- aria-label with status description
- Primary-colored dot for markedForReview (span with `bg-primary` — navy in light, light gray in dark)
```

**`SessionNavigationBar`** — `app/(app)/app/questions/[slug]/question-page-client.tsx:97-155`
```typescript
// Props:
navigation: SessionNavigation  // { questions[], currentIndex, sessionId, from }
historyHref?: string           // Encoded history URL for back navigation

// Rendering:
- flex items-center justify-between
- "← Previous" Link | "Question X of Y" span | "Next →" Link
- Links use toQuestionRoute(slug, { from, mode: 'review', sessionId, historyHref })
- text-sm font-medium text-muted-foreground with hover:text-foreground
```

**`SessionNavigation` type** — `app/(app)/app/questions/[slug]/question-page-logic.ts:15-24`
```typescript
{
  questions: ReadonlyArray<{
    slug: string;
    order: number;           // 1-based
    isCorrect: boolean | null;  // ← THE KEY: correctness data IS available
  }>;
  currentIndex: number;
  sessionId: string;
  from: QuestionOrigin;  // 'dashboard' | 'bookmarks' | 'practice' | 'history'
}
```

**`useQuestionPageController`** — `app/(app)/app/questions/[slug]/use-question-page-controller.ts:48-259`
```typescript
// How SessionNavigation is built:
// 1. On mount, if sessionId provided, calls getPracticeSessionReview({ sessionId })
// 2. Filters to available questions only (.isAvailable === true)
// 3. Maps to { slug, order, isCorrect }
// 4. Caches by sessionId in sessionQuestionsBySessionIdRef (Map)
// 5. Finds currentIndex by matching slug
// 6. Returns sessionNavigation: SessionNavigation | null
```

**`GetPracticeSessionReviewOutput`** — `src/application/use-cases/get-practice-session-review.ts:40-47`
```typescript
{
  sessionId: string;
  mode: 'tutor' | 'exam';
  totalCount: number;
  answeredCount: number;
  markedCount: number;
  rows: PracticeSessionReviewRow[];  // isCorrect, isAnswered, markedForReview, slug, etc.
}
```

**`QuestionView`** — `app/(app)/app/questions/[slug]/question-page-client.tsx:174-289`
```typescript
// The review mode question page. Layout:
// 1. Header: "Question" + backHref link
// 2. Subtitle from getOriginUi()
// 3. SessionNavigationBar (if sessionNavigation exists)  ← Navigator grid would go HERE
// 4. QuestionCard (stem + choices)
// 5. Feedback (if submitResult exists)
// 6. Action buttons (Submit / Try Again / Back)
```

### UI Component Library

| Component | File | Notes |
|-----------|------|-------|
| `Button` | `components/ui/button.tsx` | CVA variants: default, destructive, outline, secondary, ghost, link. Sizes: default (h-9), sm (h-8), lg (h-10), icon (size-9) |
| `Card` | `components/ui/card.tsx` | `<div data-slot="card">` with `bg-card text-card-foreground flex flex-col gap-0 rounded-2xl border p-6 shadow-sm` (then merged with `className` via `twMerge`) |
| `QuestionCard` | `components/question/question-card.tsx` | Stem + ChoiceButton fieldset |
| `ChoiceButton` | `components/question/choice-button.tsx` | Radio label with correctness coloring: `border-success bg-success/10` (correct), `border-destructive bg-destructive/10` (incorrect) |
| `Feedback` | `components/question/feedback.tsx` | Card with `border-success bg-success/10` or `border-destructive bg-destructive/10` |

### Color Token Inventory

| Token | Light Mode | Dark Mode | Current Usage |
|-------|-----------|-----------|---------------|
| `--success` | `142 72% 35%` (forest green) | `142 70% 42%` (brighter green) | Feedback borders, choice correctness |
| `--success-foreground` | `0 0% 100%` (white) | `0 0% 98%` (near-white) | Text on success backgrounds |
| `--destructive` | `0 84% 60%` (bright red) | `0 72% 51%` (darker red) | Feedback borders, incorrect choices |
| `--destructive-foreground` | `210 40% 98%` (near-white) | `0 0% 93%` (light gray) | Text on destructive backgrounds |
| `--warning` | `38 92% 50%` (amber) | `38 92% 56%` (brighter amber) | Available but unused in navigator |
| `--primary` | `222.2 47.4% 11.2%` (dark navy) | `0 0% 93%` (light gray) | Default button bg, mark-for-review dot |
| `--secondary` | `210 40% 96.1%` (light blue-gray) | `0 0% 11%` (dark gray) | Answered button bg |

### Button Variant CSS (abridged from `buttonVariants` — see `components/ui/button.tsx` for full classes including dark mode overrides)

```
default:     bg-primary text-primary-foreground shadow-xs hover:bg-primary/90
destructive: bg-destructive text-white shadow-xs hover:bg-destructive/90 ... dark:bg-destructive/60
outline:     border bg-background shadow-xs hover:bg-accent ... dark:bg-input/30
secondary:   bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80
ghost:       hover:bg-accent hover:text-accent-foreground ... dark:hover:bg-accent/50
link:        text-primary underline-offset-4 hover:underline
```

**Key insight:** Button already has `destructive` variant (red bg, white text). There is NO `success` button variant — we would need to add one, or use custom classes.

---

## Three Implementation Options

### Option A: Extend `QuestionNavigator` with URL-Based Review Mode

**Approach:** Add a `mode` prop and conditional rendering to the existing `QuestionNavigator`. In review mode, render `<Link>` elements instead of `<Button onClick>`, and use correctness-based coloring instead of answered/unanswered coloring.

**Component API change:**
```typescript
// Current:
<QuestionNavigator
  review={reviewData}
  currentQuestionId={questionId}
  onNavigateQuestion={(id) => navigate(id)}
/>

// Extended:
<QuestionNavigator
  review={reviewData}
  currentQuestionId={questionId}
  // Active session mode (existing):
  onNavigateQuestion={(id) => navigate(id)}
  // OR Review mode (new):
  mode="review"
  questionLinks={navigation.questions.map(q => ({
    slug: q.slug,
    href: toQuestionRoute(q.slug, { from, mode: 'review', sessionId, historyHref })
  }))}
/>
```

**Color mapping in review mode:**
```
isCorrect === true   → success variant (green bg, white text)
isCorrect === false  → destructive variant (red bg, white text)
isCorrect === null   → outline variant (neutral border)
isCurrent            → ring-2 ring-ring highlight overlay
```

**Where it renders:** Inside `QuestionView`, between the subtitle and `SessionNavigationBar`. The `QuestionView` receives `sessionNavigation` which already contains `isCorrect` per question.

**Files changed:**
1. `exam-review-view.tsx` — Add mode prop, conditional Link/Button rendering, correctness variants
2. `question-page-client.tsx` — Import `QuestionNavigator`, render above `SessionNavigationBar`
3. `button.tsx` — Add `success` variant: `bg-success text-success-foreground shadow-xs hover:bg-success/90`
4. `use-question-page-controller.ts` — No change (data already available)

**Pros:**
- One source of truth for grid layout and responsive breakpoints
- Grid responsiveness (5/8/10 cols) is already battle-tested
- Existing accessibility labels are reusable
- Fewer files to maintain

**Cons:**
- Mixing two navigation paradigms (state callback vs URL links) in one component
- The component becomes more complex with conditional rendering
- `review` data shape from exam flow (`GetPracticeSessionReviewOutput.rows`) differs from the review mode data shape (`SessionNavigation.questions[]`) — would need a shared adapter
- Risk of regression in active session flow when modifying shared component

**Estimated scope:** ~200 lines changed across 3-4 files

---

### Option B: New `ReviewQuestionNavigator` Component (Recommended)

**Approach:** Create a dedicated `ReviewQuestionNavigator` that accepts `SessionNavigation` data (already available in the controller) and renders a color-coded grid of `<Link>` elements. Keep `QuestionNavigator` untouched.

**Component API:**
```typescript
<ReviewQuestionNavigator
  questions={sessionNavigation.questions}
  currentIndex={sessionNavigation.currentIndex}
  sessionId={sessionNavigation.sessionId}
  from={sessionNavigation.from}
  historyHref={historyHref}
/>
```

**Implementation:**
```typescript
// app/(app)/app/questions/[slug]/components/review-question-navigator.tsx
function ReviewQuestionNavigator({ questions, currentIndex, sessionId, from, historyHref }) {
  return (
    <Card className="gap-0 rounded-2xl p-4 shadow-sm">
      <div className="text-sm font-medium text-foreground">Question navigator</div>
      <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
        {questions.map((q, i) => {
          const isCurrent = i === currentIndex;
          const variant = q.isCorrect === true ? 'success'
            : q.isCorrect === false ? 'destructive'
            : 'outline';
          return (
            <Button
              key={q.slug}
              asChild={!isCurrent}     // Current question is not a link
              variant={variant}
              className={cn('relative rounded-full', isCurrent && 'ring-2 ring-ring')}
              aria-label={`Question ${q.order}: ${
                q.isCorrect === true ? 'Correct' :
                q.isCorrect === false ? 'Incorrect' : 'Unanswered'
              }${isCurrent ? ', Current' : ''}`}
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

**Where it renders:** Inside `QuestionView` in `question-page-client.tsx`, after the header/subtitle, before the `SessionNavigationBar`:

```
Header: "Question" + "Back to History"
Subtitle: "Reviewing a question from your history."
[ReviewQuestionNavigator]        ← NEW
[← Previous | Question X of Y | Next →]
[QuestionCard]
[Feedback]
[Try Again | Back to History]
```

**Files changed:**
1. **New:** `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` — ~60 lines
2. `question-page-client.tsx` — Import and render `ReviewQuestionNavigator` when `sessionNavigation` exists
3. `components/ui/button.tsx` — Add `success` variant
4. `use-question-page-controller.ts` — No change

**Pros:**
- Clean separation of concerns — active session navigator and review navigator have different responsibilities
- Takes `SessionNavigation` directly (the data already available in the controller)
- No risk of regressing the active session flow
- Simpler component — no mode branching, no adapter between data shapes
- Easy to test in isolation (unit test with `renderToStaticMarkup`)

**Cons:**
- Grid layout is duplicated (responsive breakpoints, gap, Card wrapper)
- If active navigator grid changes, review navigator must be updated manually

**Mitigation for duplication:** Extract a shared `NavigatorGrid` layout component that both use:
```typescript
// shared/navigator-grid.tsx
function NavigatorGrid({ children }: { children: React.ReactNode }) {
  return (
    <Card className="gap-0 rounded-2xl p-4 shadow-sm">
      <div className="text-sm font-medium text-foreground">Question navigator</div>
      <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
        {children}
      </div>
    </Card>
  );
}
```

**Estimated scope:** ~100 lines new code, ~20 lines modified

---

### Option C: Inline Navigator in `SessionNavigationBar` (Compact)

**Approach:** Instead of a full grid above the question, embed a compact horizontal strip of colored dots/circles inside the existing `SessionNavigationBar`, between the "← Previous" and "Next →" links. This replaces the "Question X of Y" text with a visual strip.

**Visual mockup:**
```
← Previous  [●][●][●][○][●][●][●][●][●][●]  Next →
             G  G  R  -  G  R  G  G  G  G
                       ^current (ring highlight)
```

**Implementation:** Modify `SessionNavigationBar` to accept the `questions` array and render small colored circles (12-16px) instead of the text counter. Each circle is a `<Link>`.

**Pros:**
- Minimal UI footprint — no additional Card/grid, fits in existing nav bar
- No new component file
- Works well for small sessions (5-10 questions)

**Cons:**
- Becomes cramped for 20+ questions — 20 circles at 16px + 4px gap = 400px, fine on desktop but tight on mobile
- 40-question sessions would overflow — requires horizontal scroll or wrapping, both ugly
- Circles are too small for reliable touch targets (fails WCAG 2.5.8 Target Size (Minimum) 24×24; also far below WCAG 2.5.5 Target Size (Enhanced) 44×44)
- Loses the numbered labels — users can't identify question 17 without counting
- Conflates two concerns: sequential navigation (prev/next) and random access (jump to any)

**Verdict:** Not recommended. The compact format sacrifices usability for the exact use case we're solving: quickly identifying and jumping to incorrect questions.

---

## Recommended: Option B (New `ReviewQuestionNavigator`)

**Rationale:**

1. **Separation of concerns.** The active session navigator and review navigator serve different user tasks, use different navigation paradigms (state vs URL), and consume different data shapes. Forcing them into one component violates SRP.

2. **Data alignment.** `ReviewQuestionNavigator` takes `SessionNavigation.questions[]` directly — the exact data the controller already provides. No adapter needed. `QuestionNavigator` takes `GetPracticeSessionReviewOutput` with full row objects — a richer shape designed for the exam review screen.

3. **Risk isolation.** The active session's `QuestionNavigator` is battle-tested with exam mode, mark-for-review, tutor mode, etc. Modifying it risks subtle regressions. A new component can be developed and tested independently.

4. **Clean Architecture.** Uncle Bob says "separate things that change for different reasons." The review navigator changes when we add features like "Review Incorrect Only" filtering. The active navigator changes when we add features like "Skip question" or "Timer per question." These are independent reasons for change.

5. **Minimal scope.** ~100 lines of new code, one new file, trivial integration point.

---

## Data Flow (Option B)

```
User clicks question from History Sessions breakdown
  ↓
/app/questions/[slug]?from=history&mode=review&sessionId=xxx&historyHref=...
  ↓
page.tsx (server component)
  → extracts slug, from, mode, sessionId, historyHref from searchParams
  → passes to QuestionPageClient
  ↓
QuestionPageClient
  → calls useQuestionPageController({ slug, mode, from, sessionId })
  ↓
useQuestionPageController (lines 94-164)
  → sees sessionId is provided
  → calls getPracticeSessionReview({ sessionId })
  → filters to available questions, maps to { slug, order, isCorrect }
  → caches in sessionQuestionsBySessionIdRef
  → sets sessionNavigation = { questions, currentIndex, sessionId, from }
  ↓
QuestionView receives sessionNavigation
  → renders ReviewQuestionNavigator (NEW)
    → each button: success/destructive/outline based on isCorrect
    → each non-current button: <Link href=toQuestionRoute(...)>
    → current button: highlighted with ring, not clickable
  → renders SessionNavigationBar (EXISTING, unchanged)
    → "← Previous | Question X of Y | Next →"
  → renders QuestionCard, Feedback, action buttons
  ↓
User clicks red button #7
  → navigates to /app/questions/[new-slug]?from=history&mode=review&sessionId=xxx&historyHref=...
  → controller finds cached questions, computes new currentIndex
  → navigator re-renders with #7 highlighted
```

### Key Implementation Detail: `success` Button Variant

The `Button` component (`components/ui/button.tsx`) currently has no `success` variant. We need to add one:

```typescript
// In buttonVariants.variants.variant:
success: 'bg-success text-success-foreground shadow-xs hover:bg-success/90 focus-visible:ring-success/20 dark:focus-visible:ring-success/40',
```

This follows the existing `destructive` variant structure (same utility "shape", swapping `success` tokens for `destructive` tokens). The `success` and `success-foreground` CSS variables are already defined in `globals.css` for both light and dark modes.

---

## Mobile Layout Analysis

### Current Grid (Active Session Navigator)

| Viewport | Columns | 5 questions | 20 questions | 40 questions |
|----------|---------|-------------|--------------|--------------|
| Mobile (<640px) | 5 | 1 row | 4 rows | 8 rows |
| Tablet (640-1024px) | 8 | 1 row | 3 rows | 5 rows |
| Desktop (>1024px) | 10 | 1 row | 2 rows | 4 rows |

### Height Estimates (h-9 = 36px per button, gap-2 = 8px, card p-4 + heading + mt-3 ≈ 64px overhead)

- **5-question sessions:** 1 row everywhere — ~100px total card height. Trivial.
- **20-question sessions (typical):** 4 rows on mobile → grid: (4×36)+(3×8) = 168px + ~64px overhead ≈ **232px** total. Acceptable — comparable to a feedback card. The at-a-glance benefit outweighs the vertical cost.
- **40-question sessions (rare):** 8 rows on mobile → grid: (8×36)+(7×8) = 344px + ~64px overhead ≈ **408px**. This is significant. Two mitigations:
  1. **Collapsible:** Wrap in a disclosure (`<details>` or custom) that defaults to expanded but can be collapsed.
  2. **Scroll region:** `max-h-[160px] overflow-y-auto` — shows ~5 rows with scroll indicator.

**Recommendation for v1:** Ship without collapsing. 20-question sessions are the norm. Monitor usage and add collapsing if 40+ sessions become common.

---

## Accessibility Considerations

1. **ARIA labels:** Each button gets `aria-label="Question {order}: {Correct|Incorrect|Unanswered}{, Current}"`.
2. **`aria-current="step"`** on the current question button (WAI-ARIA step pattern).
3. **Color is not the only indicator:** The `aria-label` conveys correctness for screen readers. For color-blind users, the difference between success (green bg, white text) and destructive (red bg, white text) is visible because lightness differs significantly (35% vs 60% in light mode). The outline variant (no fill) is visually distinct from both.
4. **Touch targets:** Each button is `h-9` (36px) with `rounded-full` and `gap-2` (8px) spacing between buttons. The 36px target exceeds the WCAG 2.5.8 Level AA minimum (24px). Does not meet WCAG 2.5.5 Level AAA (44px) — acceptable for v1.
5. **Keyboard navigation:** `<Link>` elements are natively focusable. Tab order follows DOM order (left-to-right, top-to-bottom). The existing `focus-visible:ring` styles apply.
6. **Reduced motion:** No animations in the navigator grid.

---

## Performance Considerations

1. **No new data fetching.** The `SessionNavigation.questions[]` array is already loaded by `useQuestionPageController` and cached in `sessionQuestionsBySessionIdRef`. The navigator simply maps over it.
2. **No new network requests.** `<Link>` elements use Next.js client-side navigation — no full page reload.
3. **Render cost.** 20 `<Link>` buttons in a grid is trivial. Even 40 buttons add negligible render time.
4. **Bundle size.** The new component is ~60 lines. The `success` variant adds ~1 line to `buttonVariants`. Negligible impact.

---

## Visual Mockup (Text)

### Review Mode Question Page (After Implementation)

```
┌─────────────────────────────────────────────────────────────────┐
│  Question                                    Back to History    │
│  Reviewing a question from your history.                        │
│                                                                 │
│  ┌─ Question navigator ──────────────────────────────────────┐  │
│  │ [1:✓] [2:✓] [3:✗] [4:✓] [5:✓]                           │  │
│  │ [6:✓] [7:✗] [8:✓] [9:✓] [10:○]                          │  │
│  │ [11:✓] [12:✓] [13:✓] [14:✗] [15:✓]                      │  │
│  │ [16:✓] [17:✓] [18:✓] [19:✓] [20:✓]                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ← Previous          Question 3 of 20              Next →       │
│                                                                 │
│  ┌─ Question Card ───────────────────────────────────────────┐  │
│  │  A 29-year-old patient asks about starting naltrexone...  │  │
│  │                                                           │  │
│  │  (A) [selected, red border] A full opioid agonist...     │  │
│  │  (B) A partial opioid agonist...                          │  │
│  │  (C) [correct, green border] An opioid antagonist...     │  │
│  │  (D) A benzodiazepine...                                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Feedback (red border) ───────────────────────────────────┐  │
│  │  Incorrect                                                │  │
│  │  Explanation: Naltrexone is a competitive opioid...       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [Try Again]  Back to History                                   │
└─────────────────────────────────────────────────────────────────┘

Legend:
  [3:✗] = Red filled (bg-destructive) — incorrect, current (ring-2)
  [1:✓] = Green filled (bg-success) — correct
  [10:○] = Outline (border only) — unanswered
```

---

## Verification

1. New `renderToStaticMarkup` test (`review-question-navigator.test.tsx`):
   - Renders correct/incorrect/unanswered buttons with appropriate variants
   - Current question has `aria-current="step"` and ring highlight
   - Non-current questions render as `<a>` with correct href
   - Current question does NOT render as a link
2. New browser-mode test (`review-question-navigator.browser.spec.tsx`):
   - Clicking a navigator button navigates to the correct question URL
   - `historyHref` is preserved through navigation
   - Navigating updates the highlighted button
3. Existing tests for `SessionNavigationBar` remain passing (no changes to that component)
4. Existing tests for `QuestionNavigator` remain passing (no changes to that component)
5. Manual: complete a session → history → view breakdown → click question → see colored grid → click red buttons → verify navigation round-trips

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-14 | Proceed with navigator grid in review mode (not scrollable list) | Grid preserves the clean one-at-a-time view while adding random access; matches UWorld/AMBOSS convention |
| 2026-02-14 | Keep previous/next links alongside grid | Grid is for jumping in; arrows are for stepping through adjacent questions |
| 2026-02-14 | Defer "Review Incorrect Only" filter to v2 | Visual scanning is sufficient for typical 20-question sessions; reassess if users request it |
| 2026-02-15 | **Option B recommended** (new `ReviewQuestionNavigator`) | Separation of concerns, data alignment with existing `SessionNavigation` type, risk isolation from active session flow |
| 2026-02-15 | Add `success` variant to `Button` | Follows existing `destructive` pattern; `--success` CSS tokens already defined in light and dark themes |
| 2026-02-15 | Defer mobile collapsing to post-v1 | 20-question sessions (4 rows on mobile) are acceptable; monitor for 40+ sessions |

---

## Related Files

### Primary (Will Change)

| File | Role | Change |
|------|------|--------|
| `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` | **NEW** | The review navigator component |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | QuestionView | Import and render ReviewQuestionNavigator |
| `components/ui/button.tsx` | Button variants | Add `success` variant |

### Data Layer (No Changes)

| File | Role | Why No Change |
|------|------|---------------|
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | SessionNavigation type | Already has `isCorrect` per question |
| `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | Controller | Already fetches and caches session review data |
| `src/application/use-cases/get-practice-session-review.ts` | Use case | Already returns per-question correctness |
| `lib/routes.ts` | toQuestionRoute | Already handles all query params including historyHref |

### Reference (Unchanged, For Context)

| File | Role |
|------|------|
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | Existing QuestionNavigator (state-based, active session) |
| `app/(app)/app/shared/components/session-breakdown-list.tsx` | Session breakdown list (history context) |
| `app/(app)/app/practice/components/practice-view.tsx` | PracticeView with topContent slot |
| `app/(app)/app/history/components/history-sessions-tab.tsx` | History sessions with breakdown toggle |
