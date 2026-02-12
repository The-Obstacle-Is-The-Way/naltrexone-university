# SPEC-027: Session Review Navigation (Sequential Nav + Attempt Identity)

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Feature
**Date:** 2026-02-12
**Depends On:** SPEC-023 (Question Review Mode)
**Brainstorming:**
- `docs/brainstorming/bs-009-session-review-navigation-gap.md` — Session context, prev/next navigation
- `docs/brainstorming/bs-010-review-mode-attempt-identity-gap.md` — Attempt identity in review mode

---

## 1. Two Problems, One Spec

### Problem A: Session Context Is Lost (BS-009)

After completing a practice session, reviewing wrong answers requires ~36 clicks to review 6 questions. Should be ~12.

**Root causes:**
1. "Back to Practice" goes to `/app/practice` (session starter), not `/app/practice/{sessionId}` (session summary). The URL carries no `sessionId`.
2. The question page has no concept of sibling questions. No "Next question" / "Previous question" navigation.
3. Session context is not carried through the URL. `SessionBreakdownList` generates links with no `sessionId` parameter.

### Problem B: Wrong Attempt Shown in Review (BS-010)

When a user has attempted the same question multiple times, review mode always shows the most recent attempt — not the one the user clicked to review.

**Root causes:**
1. No `attemptId` in the URL. `toQuestionRoute()` only accepts `from` and `mode`.
2. Dashboard Recent Activity has `row.attemptId` (used as React `key`) but doesn't pass it to the URL.
3. `getPreviousAttempt` always calls `findLatestByUserAndQuestion` — no way to fetch a specific attempt.

### Why Combined

Both problems share the same root cause: **`toQuestionRoute()` carries insufficient context.** Both fixes extend the same URL function, the same link generation sites, and the same question page component. Implementing them separately would require touching the same files twice.

---

## 2. Decisions (No Optionality)

| Question | Decision | Rationale |
|----------|----------|-----------|
| URL approach vs. dedicated review page? | **URL approach** | Reuses existing question page + SPEC-023 review mode. No new pages. Lower effort. |
| Which params to add to `toQuestionRoute`? | **`sessionId` + `attemptId`** (both optional) | `sessionId` for sequential navigation, `attemptId` for correct attempt data |
| Back link behavior with `sessionId`? | **`from=practice` → `/app/practice/{sessionId}`; `from=history` → `/app/history?tab=sessions`** | Returns to the originating session context, not the generic landing page |
| How to fetch session question list? | **New controller action `getSessionQuestionList`** | Reuses `GetPracticeSessionReviewUseCase` data |
| Position indicator? | **"Question X of Y"** | Standard UX pattern; data is available from session |
| "Next wrong answer" filter? | **Not in v1** | Nice-to-have; simple prev/next is sufficient for first iteration |
| `attemptId` format in URL? | **UUID** | Same format as all other IDs. Acceptable URL length. |
| Should `getPreviousAttempt` validate attempt ownership? | **Yes** | Verify `attempt.userId === input.userId` to prevent data leakage |

---

## 3. Architecture

### 3.1 URL Format

**Session-originated review (from Session Summary or History Sessions):**

```
/app/questions/{slug}?from=practice&mode=review&sessionId={uuid}
/app/questions/{slug}?from=history&mode=review&sessionId={uuid}
```

**Attempt-specific review (from Dashboard Recent Activity):**

```
/app/questions/{slug}?from=dashboard&mode=review&attemptId={uuid}
```

**Combined (session breakdown with attempt context — future enhancement):**

```
/app/questions/{slug}?from=practice&mode=review&sessionId={uuid}&attemptId={uuid}
```

### 3.2 Data Flow — Session Navigation

```
SessionBreakdownList (with sessionId prop)
  ↓ generates: /app/questions/{slug}?from=practice&mode=review&sessionId={uuid}
  ↓
Question Page Server Component
  ↓ extracts: slug, from, mode, sessionId from searchParams
  ↓
QuestionPageClient
  ↓ passes sessionId to useQuestionPageController
  ↓
useQuestionPageController
  ↓ if sessionId: calls getSessionQuestionList(sessionId) on mount
  ↓ receives: ordered list of { slug, order, isCorrect } for the session
  ↓
QuestionView
  ↓ renders: "← Previous | Question 3 of 20 | Next →"
  ↓ back link: "/app/practice/{sessionId}" (not "/app/practice")
```

### 3.3 Data Flow — Attempt Identity

```
Dashboard Recent Activity
  ↓ generates: /app/questions/{slug}?from=dashboard&mode=review&attemptId={uuid}
  ↓
Question Page Server Component
  ↓ extracts: slug, from, mode, attemptId from searchParams
  ↓
QuestionPageClient
  ↓ passes attemptId to useQuestionPageController
  ↓
useQuestionPageController
  ↓ calls getPreviousAttempt({ questionId, attemptId }) — fetches specific attempt
  ↓
QuestionView
  ↓ renders: the correct attempt's data (not the most recent)
```

### 3.4 Entry Points Updated

| Entry Point | Change | Params Added |
|-------------|--------|-------------|
| Session Summary → Breakdown | Pass `sessionId` to `SessionBreakdownList` | `sessionId` |
| History → Sessions → Breakdown | Pass `sessionId` to `SessionBreakdownList` | `sessionId` |
| Dashboard → Recent Activity | Pass `attemptId` to `toQuestionRoute` | `attemptId` |
| History → Questions | **No change** — question-level, not session-level | — |
| Bookmarks | **No change** — not session-scoped | — |

---

## 4. Detailed Design

### 4.1 Routes: `toQuestionRoute`

**File:** `lib/routes.ts`

**Before:**

```typescript
export function toQuestionRoute(
  slug: string,
  options?: {
    from?: QuestionOrigin;
    mode?: QuestionMode;
  },
): string
```

**After:**

```typescript
export function toQuestionRoute(
  slug: string,
  options?: {
    from?: QuestionOrigin;
    mode?: QuestionMode;
    sessionId?: string;
    attemptId?: string;
  },
): string {
  const base = `${ROUTES.APP_QUESTIONS}/${slug}`;
  const params = new URLSearchParams();
  if (options?.from) params.set('from', options.from);
  if (options?.mode) params.set('mode', options.mode);
  if (options?.sessionId) params.set('sessionId', options.sessionId);
  if (options?.attemptId) params.set('attemptId', options.attemptId);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
```

### 4.2 Session Breakdown List

**File:** `app/(app)/app/shared/components/session-breakdown-list.tsx`

**Before:**

```typescript
export function SessionBreakdownList({
  rows,
  from = 'practice',
}: {
  rows: PracticeSessionReviewRow[];
  from?: QuestionOrigin;
})
```

**After:**

```typescript
export function SessionBreakdownList({
  rows,
  from = 'practice',
  sessionId,
}: {
  rows: PracticeSessionReviewRow[];
  from?: QuestionOrigin;
  sessionId?: string;
}) {
  // ...
  <Link href={toQuestionRoute(row.slug, { from, mode: 'review', sessionId })} ... />
}
```

### 4.3 Session Summary View

**File:** `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

Pass `sessionId` to `SessionBreakdownList`:

```tsx
// The sessionId is available from the page's dynamic route params
<SessionBreakdownList rows={summaryReview.rows} sessionId={sessionId} />
```

This requires the `SessionSummaryView` component to receive `sessionId` as a prop. Currently it receives `summary: EndPracticeSessionOutput` which does not include `sessionId`. Two approaches:

**Option A:** Add `sessionId` as a separate prop to `SessionSummaryView`.
**Option B:** Include `sessionId` in `EndPracticeSessionOutput`.

**Decision: Option A** — the session ID is already available from the URL route param (`/app/practice/[sessionId]`). The parent page component can pass it directly. No use case changes needed.

```typescript
export function SessionSummaryView({
  summary,
  review,
  reviewLoadState,
  sessionId,           // ← NEW
}: {
  summary: EndPracticeSessionOutput;
  review?: GetPracticeSessionReviewOutput | null;
  reviewLoadState?: LoadState;
  sessionId?: string;  // ← NEW
})
```

### 4.4 History Sessions Tab

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx`

Pass `sessionId` to `SessionBreakdownList` when rendering an expanded session's breakdown:

```tsx
<SessionBreakdownList
  rows={breakdown.rows}
  from="history"
  sessionId={session.sessionId}     // ← NEW
/>
```

The session ID is already available in the sessions tab data (each row has a `sessionId`).

### 4.5 Dashboard Recent Activity

**File:** `app/(app)/app/dashboard/page.tsx`

Pass `attemptId` to question links:

**Before (lines 209-212):**

```tsx
<Link
  href={toQuestionRoute(row.slug, {
    from: 'dashboard',
    mode: 'review',
  })}
```

**After:**

```tsx
<Link
  href={toQuestionRoute(row.slug, {
    from: 'dashboard',
    mode: 'review',
    attemptId: row.attemptId,        // ← NEW
  })}
```

`row.attemptId` is already available (used as the `<li key>` on line 207).

### 4.6 Question Page Server Component

**File:** `app/(app)/app/questions/[slug]/page.tsx`

Extract `sessionId` and `attemptId` from searchParams alongside existing `from` and `mode`.

### 4.7 Question Page Client

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx`

**New props for `QuestionPageClient`:**

```typescript
export default function QuestionPageClient({
  slug,
  from,
  mode,
  sessionId,     // ← NEW
  attemptId,     // ← NEW
}: {
  slug: string;
  from?: string;
  mode?: string;
  sessionId?: string;
  attemptId?: string;
})
```

Pass to `useQuestionPageController`:

```typescript
const controller = useQuestionPageController({
  slug,
  mode: parseQuestionMode(mode),
  sessionId,
  attemptId,
});
```

**Back link behavior change — `getOriginUi`:**

```typescript
function getOriginUi(
  origin: QuestionOrigin | null,
  sessionId?: string,
): { backHref: string; backLabel: string; subtitle: string } {
  const resolvedOrigin = origin ?? 'dashboard';

  if (resolvedOrigin === 'practice') {
    return {
      backHref: sessionId
        ? toPracticeSessionRoute(sessionId)    // ← back to session summary
        : ROUTES.APP_PRACTICE,
      backLabel: sessionId ? 'Back to Session' : 'Back to Practice',
      subtitle: 'Review a question from your practice history.',
    };
  }

  if (resolvedOrigin === 'history') {
    return {
      backHref: sessionId
        ? `${ROUTES.APP_HISTORY}?tab=sessions`  // ← back to sessions tab
        : ROUTES.APP_HISTORY,
      backLabel: 'Back to History',
      subtitle: 'Reviewing a question from your history.',
    };
  }

  // ... rest unchanged
}
```

**Session navigation UI — `QuestionView`:**

Add `sessionNavigation` prop:

```typescript
export type SessionNavigation = {
  questions: Array<{ slug: string; order: number; isCorrect: boolean | null }>;
  currentIndex: number;
  sessionId: string;
  from: QuestionOrigin;
};

export type QuestionViewProps = {
  // ... existing props
  sessionNavigation?: SessionNavigation | null;
};
```

Render prev/next navigation when session context is available:

```tsx
{props.sessionNavigation ? (
  <SessionNavigationBar
    navigation={props.sessionNavigation}
  />
) : null}
```

**`SessionNavigationBar` component** (inline in the same file or extracted):

```tsx
function SessionNavigationBar({ navigation }: { navigation: SessionNavigation }) {
  const { questions, currentIndex, sessionId, from } = navigation;
  const prev = currentIndex > 0 ? questions[currentIndex - 1] : null;
  const next = currentIndex < questions.length - 1 ? questions[currentIndex + 1] : null;
  const total = questions.length;

  return (
    <div className="flex items-center justify-between">
      {prev ? (
        <Link
          href={toQuestionRoute(prev.slug, { from, mode: 'review', sessionId })}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Previous
        </Link>
      ) : <span />}

      <span className="text-sm text-muted-foreground">
        Question {currentIndex + 1} of {total}
      </span>

      {next ? (
        <Link
          href={toQuestionRoute(next.slug, { from, mode: 'review', sessionId })}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Next →
        </Link>
      ) : <span />}
    </div>
  );
}
```

### 4.8 Question Page Controller Hook

**File:** `app/(app)/app/questions/[slug]/use-question-page-controller.ts`

**Input changes:**

```typescript
export type UseQuestionPageControllerInput = {
  slug: string;
  mode?: QuestionMode | null;
  sessionId?: string;       // ← NEW
  attemptId?: string;       // ← NEW
};
```

**Session question list fetching:**

When `sessionId` is present, fetch the session's question list on mount:

```typescript
const [sessionNavigation, setSessionNavigation] =
  useState<SessionNavigation | null>(null);

useEffect(() => {
  if (!input.sessionId) return;

  startTransition(() => {
    void getSessionQuestionList({ sessionId: input.sessionId! })
      .then((result) => {
        if (!result.ok || !isMounted.current) return;
        const questions = result.data.questions;
        const currentIndex = questions.findIndex((q) => q.slug === input.slug);
        if (currentIndex === -1) return;
        setSessionNavigation({
          questions,
          currentIndex,
          sessionId: input.sessionId!,
          from: /* parsed from origin */ 'practice',
        });
      });
  });
}, [input.sessionId, input.slug, isMounted]);
```

**Attempt-specific review:**

When `attemptId` is present, pass it to `loadPreviousAttempt`:

```typescript
useEffect(() => {
  if (input.mode !== 'review') return;
  if (loadState.status !== 'ready') return;
  if (!question) return;

  startTransition(() => {
    void loadPreviousAttempt({
      questionId: question.questionId,
      attemptId: input.attemptId,              // ← NEW (optional)
      getPreviousAttemptFn: getPreviousAttempt,
      setSelectedChoiceId,
      setSubmitResult,
      isMounted,
    });
  });
}, [input.mode, input.attemptId, loadState.status, question, isMounted]);
```

### 4.9 Controller: `getSessionQuestionList`

**File:** `src/adapters/controllers/question-view-controller.ts` (or `practice-controller.ts`)

New action that returns the session's ordered question list for navigation:

```typescript
const GetSessionQuestionListInputSchema = z
  .object({
    sessionId: z.string().min(1),
  })
  .strict();

export type SessionQuestionListOutput = {
  questions: Array<{
    slug: string;
    order: number;
    isCorrect: boolean | null;
  }>;
};

export const getSessionQuestionList = createAction({
  schema: GetSessionQuestionListInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    const review = await d.getPracticeSessionReviewUseCase.execute({
      userId,
      sessionId: input.sessionId,
    });
    return {
      questions: review.rows
        .filter((row): row is AvailablePracticeSessionReviewRow => row.isAvailable)
        .map((row) => ({
          slug: row.slug,
          order: row.order,
          isCorrect: row.isCorrect,
        })),
    };
  },
});
```

This reuses the existing `GetPracticeSessionReviewUseCase` — no new use cases needed.

### 4.10 Use Case: `GetPreviousAttemptUseCase` — Attempt-Specific Lookup

**File:** `src/application/use-cases/get-previous-attempt.ts`

**Before:**

```typescript
export type GetPreviousAttemptInput = {
  userId: string;
  questionId: string;
};
```

**After:**

```typescript
export type GetPreviousAttemptInput = {
  userId: string;
  questionId: string;
  attemptId?: string;          // ← NEW (optional)
};
```

**Execution logic:**

```typescript
async execute(input: GetPreviousAttemptInput): Promise<GetPreviousAttemptOutput | null> {
  const attempt = input.attemptId
    ? await this.attempts.findByIdAndUserId(input.attemptId, input.userId)
    : await this.attempts.findLatestByUserAndQuestion(input.userId, input.questionId);

  if (!attempt) return null;
  // ... rest unchanged
}
```

**Authorization:** When `attemptId` is provided, the repository method `findByIdAndUserId` validates that the attempt belongs to the requesting user.

### 4.11 Repository Port: Attempt Lookup by ID

**File:** `src/application/ports/attempt-repository.ts`

Add method to `AttemptSingleQuestionReader`:

```typescript
export interface AttemptSingleQuestionReader {
  findLatestByUserAndQuestion(
    userId: string,
    questionId: string,
  ): Promise<AttemptRecord | null>;

  findByIdAndUserId(                         // ← NEW
    attemptId: string,
    userId: string,
  ): Promise<AttemptRecord | null>;
}
```

### 4.12 Repository Implementation: Drizzle

**File:** `src/adapters/repositories/drizzle-attempt-repository.ts`

Add `findByIdAndUserId`:

```typescript
async findByIdAndUserId(
  attemptId: string,
  userId: string,
): Promise<AttemptRecord | null> {
  const [row] = await this.db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1);
  return row ? this.toAttemptRecord(row) : null;
}
```

### 4.13 Controller: `getPreviousAttempt` — Accept `attemptId`

**File:** `src/adapters/controllers/question-view-controller.ts`

Update input schema:

```typescript
const GetPreviousAttemptInputSchema = z
  .object({
    questionId: z.string().min(1),
    attemptId: z.string().min(1).optional(),    // ← NEW
  })
  .strict();
```

Pass through to use case:

```typescript
export const getPreviousAttempt = createAction({
  schema: GetPreviousAttemptInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getPreviousAttemptUseCase.execute({
      userId,
      questionId: input.questionId,
      attemptId: input.attemptId,              // ← NEW
    });
  },
});
```

---

## 5. Files Summary

### New Files

None. All changes are to existing files.

### Modified Files

| File | Change |
|------|--------|
| `lib/routes.ts` | Add `sessionId` and `attemptId` to `toQuestionRoute` |
| `lib/routes.test.ts` | Test new URL params |
| `app/(app)/app/shared/components/session-breakdown-list.tsx` | Accept and pass `sessionId` prop |
| `app/(app)/app/shared/components/session-breakdown-list.test.tsx` | Test `sessionId` in generated hrefs |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | Accept and pass `sessionId` prop |
| `app/(app)/app/history/components/history-sessions-tab.tsx` | Pass `sessionId` to `SessionBreakdownList` |
| `app/(app)/app/dashboard/page.tsx` | Pass `attemptId` to `toQuestionRoute` |
| `app/(app)/app/questions/[slug]/page.tsx` | Extract `sessionId`, `attemptId` from searchParams |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Accept `sessionId`/`attemptId`, render session navigation, fix back link |
| `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | Fetch session question list, pass `attemptId` to `getPreviousAttempt` |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | Update `loadPreviousAttempt` to accept optional `attemptId` |
| `src/adapters/controllers/question-view-controller.ts` | Add `getSessionQuestionList` action; update `getPreviousAttempt` schema |
| `src/adapters/controllers/question-view-controller.test.ts` | Test new action and `attemptId` passthrough |
| `src/application/use-cases/get-previous-attempt.ts` | Accept optional `attemptId`, fetch by ID when provided |
| `src/application/use-cases/get-previous-attempt.test.ts` | Test attempt-specific lookup |
| `src/application/ports/attempt-repository.ts` | Add `findByIdAndUserId` to `AttemptSingleQuestionReader` |
| `src/adapters/repositories/drizzle-attempt-repository.ts` | Implement `findByIdAndUserId` |
| `src/application/test-helpers/fakes/fake-repositories.ts` | Add `findByIdAndUserId` to `FakeAttemptRepository` |

---

## 6. Test Plan

### 6.1 Unit Tests (Vitest)

#### Routes

**File:** `lib/routes.test.ts`

```
toQuestionRoute:
  - includes sessionId param when provided
  - includes attemptId param when provided
  - includes both sessionId and attemptId when both provided
  - omits sessionId and attemptId when not provided (backward compat)
```

#### Session Breakdown List

**File:** `app/(app)/app/shared/components/session-breakdown-list.test.tsx`

```
- includes sessionId in href when sessionId prop is provided
- omits sessionId from href when sessionId prop is not provided
```

#### Question Page Client

**File:** `app/(app)/app/questions/[slug]/question-page-client.test.tsx` (or existing test file)

```
getOriginUi:
  - returns "/app/practice/{sessionId}" back link when from=practice and sessionId present
  - returns "/app/practice" back link when from=practice and no sessionId
  - returns "/app/history?tab=sessions" back link when from=history and sessionId present
  - returns "Back to Session" label when sessionId present and from=practice

SessionNavigationBar:
  - renders previous link when not first question
  - renders next link when not last question
  - renders position indicator "Question X of Y"
  - does not render previous link on first question
  - does not render next link on last question
  - does not render when sessionNavigation is null
```

#### Get Previous Attempt Use Case

**File:** `src/application/use-cases/get-previous-attempt.test.ts`

```
- fetches latest attempt when attemptId is not provided (existing behavior)
- fetches specific attempt when attemptId is provided
- returns null when attemptId does not exist
- returns null when attemptId belongs to different user (authorization)
```

#### Question View Controller

**File:** `src/adapters/controllers/question-view-controller.test.ts`

```
getSessionQuestionList:
  - returns ordered question list for valid session
  - returns UNAUTHENTICATED when not logged in
  - returns NOT_FOUND when session does not exist
  - excludes unavailable questions from list

getPreviousAttempt:
  - passes attemptId to use case when provided
  - omits attemptId when not provided (backward compat)
```

### 6.2 Integration Tests

**File:** `tests/integration/repositories.integration.test.ts`

```
findByIdAndUserId:
  - returns attempt when ID and userId match
  - returns null when ID exists but userId does not match
  - returns null when ID does not exist
```

### 6.3 E2E Tests (Playwright)

**File:** `tests/e2e/session-review-navigation.spec.ts` (NEW)

```
Session Summary → Sequential Review:
  - complete a tutor session with 2 questions
  - click first question from session summary breakdown
  - verify URL contains sessionId param
  - verify back link goes to /app/practice/{sessionId}
  - verify "Next →" link is present
  - verify "Question 1 of 2" position indicator
  - click "Next →"
  - verify "← Previous" link is present
  - verify "Question 2 of 2" position indicator

History → Session Review:
  - navigate to History → Sessions → expand breakdown
  - click a question from breakdown
  - verify URL contains sessionId param
  - verify back link contains /app/history

Non-session flows unchanged:
  - navigate to History → Questions → click a question
  - verify NO session navigation (no prev/next, no position indicator)
```

---

## 7. Implementation Order

```
Phase 1: URL Infrastructure
  1. Add sessionId and attemptId to toQuestionRoute (RED → GREEN)
  2. Write tests for toQuestionRoute with new params

Phase 2: Attempt Identity (Application + Adapter Layer)
  3. Add findByIdAndUserId to AttemptSingleQuestionReader port
  4. Implement findByIdAndUserId in FakeAttemptRepository (RED → GREEN)
  5. Write get-previous-attempt.test.ts for attemptId lookup (RED)
  6. Update GetPreviousAttemptUseCase to accept attemptId (GREEN)
  7. Implement findByIdAndUserId in DrizzleAttemptRepository
  8. Write integration test for findByIdAndUserId (RED → GREEN)

Phase 3: Session Question List (Controller)
  9. Write question-view-controller.test.ts for getSessionQuestionList (RED)
  10. Implement getSessionQuestionList action (GREEN)
  11. Update getPreviousAttempt controller to accept attemptId

Phase 4: Link Generation (Frontend — Entry Points)
  12. Update SessionBreakdownList to accept/pass sessionId (RED → GREEN)
  13. Update SessionSummaryView to pass sessionId
  14. Update HistorySessionsTab to pass sessionId
  15. Update Dashboard Recent Activity to pass attemptId

Phase 5: Question Page (Frontend — Consumer)
  16. Update question page server component to extract sessionId, attemptId
  17. Update QuestionPageClient to accept and pass new params
  18. Update useQuestionPageController to fetch session question list
  19. Update loadPreviousAttempt to pass attemptId
  20. Write tests for getOriginUi with sessionId (RED)
  21. Update getOriginUi back link behavior (GREEN)
  22. Write tests for SessionNavigationBar (RED)
  23. Implement SessionNavigationBar (GREEN)

Phase 6: Verification
  24. Run: pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build
  25. Run: pnpm test:e2e
```

---

## 8. Acceptance Criteria

### Session Navigation (BS-009)

- [ ] Session Summary breakdown links include `sessionId` in the URL
- [ ] History Sessions breakdown links include `sessionId` in the URL
- [ ] Question page shows "← Previous | Question X of Y | Next →" when `sessionId` is present
- [ ] Previous/Next links preserve session context (`sessionId`, `from`, `mode=review`)
- [ ] "Back to Session" link goes to `/app/practice/{sessionId}` when `from=practice`
- [ ] "Back to History" link goes to `/app/history?tab=sessions` when `from=history` with `sessionId`
- [ ] Non-session flows are unchanged (no navigation bar when `sessionId` is absent)

### Attempt Identity (BS-010)

- [ ] Dashboard Recent Activity links include `attemptId` in the URL
- [ ] Clicking an older attempt shows that attempt's data (not the most recent)
- [ ] When `attemptId` is absent, `getPreviousAttempt` still fetches the latest (backward compat)
- [ ] Attempt ownership is validated — cannot view another user's attempt via `attemptId`

### General

- [ ] All existing links without `sessionId`/`attemptId` still work exactly as before
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build` all pass

---

## 9. Non-Goals (Explicitly Out of Scope)

- **Dedicated session review page** (`/app/practice/{sessionId}/review`) — Phase 2 enhancement if URL approach proves insufficient
- **"Next wrong answer" filter** — Skipping to the next incorrect question. Nice-to-have for v2.
- **Cross-session navigation** — "Next question" from Dashboard or History Questions tab. Out of scope; this is specifically for session-context review.
- **Reattempt mode from session review** — Whether a "Try Again" from session review creates a new attempt associated with the session. Open design question for the future.
- **Back-link state preservation for History** — Making "Back to History" re-expand the right session breakdown requires URL state management not worth the complexity in v1.
- **Session Breakdown attempt IDs** — `PracticeSessionReviewRow` does not currently include per-question attempt IDs. Adding this (so session breakdown links carry `attemptId`) is a future enhancement that requires extending the use case. For v1, session breakdown links carry `sessionId` only — the review will show the latest attempt per question, which is acceptable because within a single session each question is typically attempted once.

---

## 10. What This Fixes

| Before | After |
|--------|-------|
| Click question from session → review → "Back to Practice" → session LOST | Click question → review → "Back to Session" → session summary |
| No way to go to next question during review | "Next →" link navigates to next question, preserving session context |
| Reviewing 6 wrong answers: ~36 clicks | Reviewing 6 wrong answers: ~12 clicks (open first + 5 "Next") |
| No position indication | "Question 3 of 20" shown during review |
| Dashboard: click old attempt → see newest attempt's data | Dashboard: click old attempt → see that attempt's data |

---

## 11. Risk Assessment

**Risk: Low-Medium.**

- **Additive only** — doesn't change any existing behavior. URLs without `sessionId`/`attemptId` work exactly as before.
- **No new pages** — reuses existing question page with SPEC-023 review mode.
- **Session data is already available** — `GetPracticeSessionReviewUseCase` provides everything the navigation bar needs.
- **One new repository method** — `findByIdAndUserId` is a simple primary key lookup with ownership check.
- **Frontend complexity is contained** — the `SessionNavigationBar` is a stateless presentational component.

---

## 12. Related

- **BS-009** (Brainstorming) — Session review navigation gap analysis, Playwright validation (9/10 checks failed), Approach A design
- **BS-010** (Brainstorming) — Attempt identity gap analysis, root cause (Dashboard `row.attemptId` unused, `getPreviousAttempt` always fetches latest)
- **SPEC-023** (Question Review Mode) — The review mode infrastructure that this spec builds on
- **SPEC-024** (Question Status Filter) — Provides the Practice-based "Incorrect" reattempt path, making session review purely read-only
- **E2E:** `tests/e2e/audit-history-spec.spec.ts` — Playwright audit confirming all 9 navigation gaps
