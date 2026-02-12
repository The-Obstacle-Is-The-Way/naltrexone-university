# SPEC-023: Question Review Mode

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented
**Layer:** Feature
**Date:** 2026-02-11
**Depends On:** SPEC-012 (Core Question Loop), SPEC-021 (History Page Restructure), SPEC-022 (Question Log)
**Brainstorming:** `docs/_archive/brainstorming/bs-008-question-review-mode-gap.md`

---

## 1. Executive Summary

Every entry point that says "review" — Dashboard Recent Activity, History "Review" button, Session Breakdown — opens a fresh unanswered form with zero memory of the user's previous attempt. The question loads with its stem and choices, but no choice is pre-selected, no feedback is shown, and the Submit button appears as if the user has never seen this question before. The UI says "Reviewing a question from your history" but presents a blank slate.

This spec adds a **review mode** to the question detail page (`/app/questions/[slug]`) that pre-populates the user's previous answer and shows the explanation immediately on load — the same visual state that currently appears only after submitting a new answer. No new components are needed; the existing `QuestionCard`, `ChoiceButton`, and `Feedback` components already support all required visual states (green/red borders, disabled choices, explanation rendering). Review mode simply initializes these components with data from a previous attempt instead of starting blank.

The user can switch from review mode to a fresh re-attempt via the existing "Try Again" button.

---

## 2. Decisions (No Optionality)

| Question | Decision | Rationale |
|----------|----------|-----------|
| How to trigger review mode? | **Explicit `?mode=review` URL param** | Explicit is better than implicit. Entry points control behavior. Easy to test. |
| What if `mode=review` but no previous attempt? | **Fall back to attempt mode silently** | No error — user just sees a fresh form. Handles crafted URLs gracefully. |
| Which attempt to show? | **Most recent attempt for this user + question** | Simple, predictable. "What did I last answer?" Not a full attempt history view. |
| Should review mode create a new attempt? | **No** | Review is read-only. Only the "Try Again" → Submit flow creates attempts. |
| Should disabled choices use `opacity-50`? | **No opacity when correctness borders are shown** | The green/red borders are sufficient signal. `opacity-50` makes the "settled" post-submit state look broken. |
| Subtitle text in review mode | **Keep existing origin-based subtitles** | "Reviewing a question from your history." is accurate once review mode actually shows the review. No date context in v1. |
| New use case or extend existing? | **New use case: `GetPreviousAttemptUseCase`** | Clean separation. Single responsibility. Doesn't bloat `SubmitAnswerUseCase`. |
| Where to put the new server action? | **`question-view-controller.ts`** | Both `getQuestionBySlug` and `getPreviousAttempt` serve the question detail page. Same controller. |
| Review mode for exam sessions with hidden explanations? | **Always show explanation in review** | Once a session is over, the user should see explanations. Review mode is post-session by definition. |

---

## 3. Architecture

### 3.1 Data Flow

```
URL: /app/questions/[slug]?from=history&mode=review
                              │
page.tsx (server)             │
  ↓ extracts slug, from, mode│
  ↓ passes to QuestionPageClient
                              │
question-page-client.tsx      │
  ↓ parseQuestionOrigin(from) │
  ↓ useQuestionPageController({ slug, mode })
                              │
use-question-page-controller  │
  ↓ useEffect → loadQuestion(slug)     ← existing
  ↓ useEffect → loadPreviousAttempt()  ← NEW (only when mode=review)
  ↓   calls getPreviousAttempt({ questionId })
  ↓   if data exists:
  ↓     setSelectedChoiceId(data.selectedChoiceId)
  ↓     setSubmitResult(data as SubmitAnswerOutput)
  ↓   → QuestionCard renders with pre-selected choice + correctness borders
  ↓   → Feedback renders immediately (submitResult is non-null)
  ↓   → "Try Again" button shown instead of "Submit"
```

### 3.2 Mode Determination

```
?mode=review + previous attempt exists  → REVIEW MODE (pre-populated)
?mode=review + no previous attempt      → ATTEMPT MODE (fresh form, fallback)
no mode param                           → ATTEMPT MODE (fresh form, current behavior)
```

### 3.3 Entry Points — URL Changes

| Entry Point | Current URL | New URL |
|-------------|-------------|---------|
| Dashboard Recent Activity | `?from=dashboard` | `?from=dashboard&mode=review` |
| History Questions (correct question links) | `?from=history` | `?from=history&mode=review` |
| History Questions (incorrect question links) | `?from=history` | `?from=history` (unchanged) |
| History Sessions Breakdown click | `?from=history` | `?from=history&mode=review` |
| Practice Session Summary click | `?from=practice` | `?from=practice&mode=review` |
| Bookmarks click | `?from=bookmarks` | `?from=bookmarks` (unchanged) |

**Note:** The History Questions tab has **two** links per row (stem/title link + action button). Keep them in sync:
- Correct rows: both links include `mode=review`
- Incorrect rows: both links omit `mode`

### 3.4 Reuse Strategy

| Component | Reuse | Change Needed |
|-----------|-------|---------------|
| `QuestionCard` | 100% reuse | None — already supports `correctChoiceId` + `selectedChoiceId` |
| `ChoiceButton` | 100% reuse | 1-line CSS: remove `opacity-50` when correctness borders are shown |
| `Feedback` | 100% reuse | None — renders from `submitResult` props |
| `QuestionView` | 100% reuse | None — renders based on `submitResult` state |
| `buildShuffledChoiceViews` | Reuse in new use case | Same userId-seeded shuffle for consistent choice order |

---

## 4. Detailed Design

### 4.1 Repository Port

**File:** `src/application/ports/attempt-repository.ts`

Add new reader interface after `AttemptAllQuestionsReader`:

```typescript
export interface AttemptSingleQuestionReader {
  /**
   * Return the user's most recent attempt for a specific question.
   * Used by review mode to reconstruct the post-submit state.
   */
  findLatestByUserAndQuestion(
    userId: string,
    questionId: string,
  ): Promise<Attempt | null>;
}
```

Extend `AttemptRepository`:

```typescript
export interface AttemptRepository
  extends AttemptWriter,
    AttemptHistoryReader,
    AttemptSessionReader,
    AttemptStatsReader,
    AttemptAllQuestionsReader,
    AttemptSingleQuestionReader,    // ← NEW
    AttemptMostRecentAnsweredAtReader {}
```

### 4.2 Repository Implementation

**File:** `src/adapters/repositories/drizzle-attempt-repository.ts`

Add method:

```typescript
async findLatestByUserAndQuestion(
  userId: string,
  questionId: string,
): Promise<Attempt | null> {
  const [row] = await this.db
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.questionId, questionId),
      ),
    )
    .orderBy(desc(attempts.answeredAt), desc(attempts.id))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    questionId: row.questionId,
    practiceSessionId: row.practiceSessionId,
    selectedChoiceId: row.selectedChoiceId,
    isCorrect: row.isCorrect,
    timeSpentSeconds: row.timeSpentSeconds,
    answeredAt: row.answeredAt,
  };
}
```

### 4.3 Fake Repository

**File:** `src/application/test-helpers/fakes/fake-repositories.ts`

Add to `FakeAttemptRepository`:

```typescript
async findLatestByUserAndQuestion(
  userId: string,
  questionId: string,
): Promise<Attempt | null> {
  const matching = this.attempts.filter(
    (a) => a.userId === userId && a.questionId === questionId,
  );
  if (matching.length === 0) return null;

  matching.sort((a, b) => {
    const byDate = b.answeredAt.getTime() - a.answeredAt.getTime();
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });

  return matching[0];
}
```

### 4.4 Use Case

**File:** `src/application/use-cases/get-previous-attempt.ts` ← NEW

```typescript
import type { Logger } from '@/src/application/ports/logger';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import { ApplicationError } from '../errors';
import type { AttemptSingleQuestionReader } from '../ports/attempt-repository';
import { buildShuffledChoiceViews } from '../shared/shuffled-choice-views';
import type { ChoiceExplanation } from './submit-answer';

export type GetPreviousAttemptInput = {
  userId: string;
  questionId: string;
};

export type GetPreviousAttemptOutput = {
  attemptId: string;
  selectedChoiceId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  explanationMd: string | null;
  choiceExplanations: ChoiceExplanation[];
  answeredAt: string; // ISO 8601
};

export class GetPreviousAttemptUseCase {
  constructor(
    private readonly attempts: AttemptSingleQuestionReader,
    private readonly questions: QuestionRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: GetPreviousAttemptInput,
  ): Promise<GetPreviousAttemptOutput | null> {
    const attempt = await this.attempts.findLatestByUserAndQuestion(
      input.userId,
      input.questionId,
    );

    if (!attempt) return null;

    const question = await this.questions.findPublishedById(
      attempt.questionId,
    );

    if (!question) {
      this.logger.warn(
        { questionId: attempt.questionId },
        'Previous attempt references missing question',
      );
      return null;
    }

    const correctChoice = question.choices.find((c) => c.isCorrect);
    if (!correctChoice) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Question ${question.id} has no correct choice`,
      );
    }

    const choiceExplanations: ChoiceExplanation[] = buildShuffledChoiceViews(
      question,
      input.userId,
    ).map((view) => ({
      choiceId: view.choiceId,
      displayLabel: view.displayLabel,
      textMd: view.textMd,
      isCorrect: view.isCorrect,
      explanationMd: view.explanationMd,
    }));

    return {
      attemptId: attempt.id,
      selectedChoiceId: attempt.selectedChoiceId,
      isCorrect: attempt.isCorrect,
      correctChoiceId: correctChoice.id,
      explanationMd: question.explanationMd,
      choiceExplanations,
      answeredAt: attempt.answeredAt.toISOString(),
    };
  }
}
```

### 4.5 Controller

**File:** `src/adapters/controllers/question-view-controller.ts`

Add new action alongside existing `getQuestionBySlug`:

```typescript
const GetPreviousAttemptInputSchema = z
  .object({
    questionId: z.string().min(1),
  })
  .strict();

export const getPreviousAttempt = createAction({
  schema: GetPreviousAttemptInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getPreviousAttemptUseCase.execute({
      userId,
      questionId: input.questionId,
    });
  },
});
```

Update deps type:

```typescript
export type QuestionViewControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  questionRepository: QuestionRepository;
  getPreviousAttemptUseCase: {                     // ← NEW
    execute: (
      input: GetPreviousAttemptInput,
    ) => Promise<GetPreviousAttemptOutput | null>;
  };
};
```

### 4.6 Container Wiring

**File:** `lib/container/types.ts`

Add to `UseCaseFactories`:

```typescript
createGetPreviousAttemptUseCase: () => GetPreviousAttemptUseCase;
```

**File:** `lib/container/use-cases.ts`

Add factory:

```typescript
createGetPreviousAttemptUseCase: () =>
  new GetPreviousAttemptUseCase(
    repositories.createAttemptRepository(),
    repositories.createQuestionRepository(),
    primitives.logger,
  ),
```

**File:** `lib/container/controllers.ts`

Update `createQuestionViewControllerDeps`:

```typescript
createQuestionViewControllerDeps: () => ({
  authGateway: gateways.createAuthGateway(),
  checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
  questionRepository: repositories.createQuestionRepository(),
  getPreviousAttemptUseCase: useCases.createGetPreviousAttemptUseCase(), // ← NEW
}),
```

### 4.7 Routes

**File:** `lib/routes.ts`

Add mode type and update `toQuestionRoute`:

**Back-compat note:** Keep the existing `QuestionOrigin` union members as-is (including the legacy `'review'` origin used by older bookmarked question URLs). `mode` is additive.

```typescript
export type QuestionMode = 'review';

export function toQuestionRoute(
  slug: string,
  options?: {
    from?: QuestionOrigin;
    mode?: QuestionMode;
  },
): string {
  const base = `${ROUTES.APP_QUESTIONS}/${slug}`;
  const params = new URLSearchParams();
  if (options?.from) params.set('from', options.from);
  if (options?.mode) params.set('mode', options.mode);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
```

### 4.8 Question Page — Server Component

**File:** `app/(app)/app/questions/[slug]/page.tsx`

Update to extract `mode` from search params:

```typescript
export default async function QuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string | string[]; mode?: string | string[] }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const from =
    typeof resolvedSearchParams?.from === 'string'
      ? resolvedSearchParams.from
      : undefined;
  const mode =
    typeof resolvedSearchParams?.mode === 'string'
      ? resolvedSearchParams.mode
      : undefined;
  return <QuestionPageClient slug={slug} from={from} mode={mode} />;
}
```

### 4.9 Question Page — Client Component

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx`

Add mode parsing and pass to controller:

```typescript
function parseQuestionMode(value: string | undefined): QuestionMode | null {
  if (value === 'review') return value;
  return null;
}

export default function QuestionPageClient({
  slug,
  from,
  mode,
}: {
  slug: string;
  from?: string;
  mode?: string;
}) {
  const controller = useQuestionPageController({
    slug,
    mode: parseQuestionMode(mode),
  });
  return <QuestionView {...controller} origin={parseQuestionOrigin(from)} />;
}
```

### 4.10 Question Page — Controller Hook

**File:** `app/(app)/app/questions/[slug]/use-question-page-controller.ts`

Update input type:

```typescript
export type UseQuestionPageControllerInput = {
  slug: string;
  mode?: QuestionMode | null;
};
```

Add review mode loading after `loadQuestion` completes:

```typescript
// After existing loadQuestion useEffect:
useEffect(() => {
  if (input.mode !== 'review') return;
  if (loadState.status !== 'ready') return;
  if (!question) return;

  // Only load previous attempt once per question load
  startTransition(() => {
    void loadPreviousAttempt({
      questionId: question.questionId,
      getPreviousAttemptFn: getPreviousAttempt,
      setSelectedChoiceId,
      setSubmitResult,
      isMounted,
    });
  });
}, [input.mode, loadState.status, question, isMounted]);
```

### 4.11 Question Page — Logic (State Machine)

**File:** `app/(app)/app/questions/[slug]/question-page-logic.ts`

Add new function:

```typescript
export async function loadPreviousAttempt(input: {
  questionId: string;
  getPreviousAttemptFn: (
    input: unknown,
  ) => Promise<ActionResult<GetPreviousAttemptOutput | null>>;
  setSelectedChoiceId: (choiceId: string | null) => void;
  setSubmitResult: (result: SubmitAnswerOutput | null) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  const isMounted = input.isMounted ?? (() => true);

  let res: ActionResult<GetPreviousAttemptOutput | null>;
  try {
    res = await input.getPreviousAttemptFn({
      questionId: input.questionId,
    });
  } catch {
    // Silently fall back to attempt mode — review is best-effort
    return;
  }
  if (!isMounted()) return;

  if (!res.ok || !res.data) {
    // No previous attempt or error — stay in attempt mode
    return;
  }

  const data = res.data;
  input.setSelectedChoiceId(data.selectedChoiceId);
  input.setSubmitResult({
    attemptId: data.attemptId,
    isCorrect: data.isCorrect,
    correctChoiceId: data.correctChoiceId,
    explanationMd: data.explanationMd,
    choiceExplanations: data.choiceExplanations,
  });
}
```

### 4.12 Choice Button — Disabled Opacity Fix

**File:** `components/question/choice-button.tsx`

Change the disabled styling to not apply `opacity-50` when correctness borders are shown:

**Before:**
```typescript
disabled && 'cursor-not-allowed opacity-50'
```

**After:**
```typescript
disabled && 'cursor-not-allowed',
disabled && !correctness && 'opacity-50',
```

This means:
- Disabled during loading → `cursor-not-allowed opacity-50` (unchanged visual)
- Disabled after submit/review:
  - choices with correctness highlighting (`correct`/`incorrect`) → `cursor-not-allowed` only (green/red borders are sufficient)
  - neutral unselected choices may remain dimmed (acceptable v1)

### 4.13 Entry Point — Dashboard Recent Activity

**File:** `app/(app)/app/dashboard/page.tsx`

Update `toQuestionRoute` calls in Recent Activity section to include `mode: 'review'`:

```typescript
href={toQuestionRoute(row.slug, { from: 'dashboard', mode: 'review' })}
```

### 4.14 Entry Point — History Questions Tab

**File:** `app/(app)/app/history/components/history-questions-tab.tsx`

Update the History Questions row links to differentiate **Review** vs **Reattempt**:
- **Correct rows:** both the **stem/title link** and the **"Review" button** include `mode: 'review'`
- **Incorrect rows:** both links remain in attempt mode (no `mode` param)

```typescript
const href = row.isCorrect
  ? toQuestionRoute(row.slug, { from: 'history', mode: 'review' })
  : toQuestionRoute(row.slug, { from: 'history' });

// Stem/title link:
href={href}

// Action button:
href={href}
aria-label={`${row.isCorrect ? 'Review' : 'Reattempt'} question: ${row.stemMd}`}
```

### 4.15 Entry Point — Session Breakdown List

**File:** `app/(app)/app/shared/components/session-breakdown-list.tsx`

Update question links to include `mode: 'review'`:

```typescript
href={toQuestionRoute(row.slug, { from, mode: 'review' })}
```

---

## 5. Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src/application/use-cases/get-previous-attempt.ts` | Use case: retrieve previous attempt for review mode |
| `src/application/use-cases/get-previous-attempt.test.ts` | Use case unit tests |

### Modified Files

| File | Change |
|------|--------|
| `src/application/ports/attempt-repository.ts` | Add `AttemptSingleQuestionReader` interface, extend `AttemptRepository` |
| `src/adapters/repositories/drizzle-attempt-repository.ts` | Add `findLatestByUserAndQuestion` method |
| `src/application/test-helpers/fakes/fake-repositories.ts` | Add fake `findLatestByUserAndQuestion` |
| `src/application/use-cases/index.ts` | Add `GetPreviousAttemptUseCase` exports |
| `src/adapters/controllers/question-view-controller.ts` | Add `getPreviousAttempt` action, update deps |
| `lib/container/types.ts` | Add `createGetPreviousAttemptUseCase` to factories |
| `lib/container/use-cases.ts` | Add factory |
| `lib/container/controllers.ts` | Wire new use case into `createQuestionViewControllerDeps` |
| `lib/container.test.ts` | Add assertion for new deps |
| `lib/routes.ts` | Add `QuestionMode` type, update `toQuestionRoute` signature |
| `lib/routes.test.ts` | Add test for `mode` param in `toQuestionRoute` |
| `app/(app)/app/questions/[slug]/page.tsx` | Extract `mode` from searchParams |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Add `mode` prop, `parseQuestionMode`, pass to controller |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Add tests for review mode rendering |
| `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | Accept `mode`, load previous attempt when `mode=review` |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | Add `loadPreviousAttempt` function |
| `app/(app)/app/questions/[slug]/question-page-logic.test.ts` | Add tests for `loadPreviousAttempt` |
| `components/question/choice-button.tsx` | Remove `opacity-50` when correctness borders shown |
| `components/question/ChoiceButton.test.tsx` | Update disabled styling assertions |
| `app/(app)/app/dashboard/page.tsx` | Add `mode: 'review'` to Recent Activity links |
| `app/(app)/app/dashboard/page.test.tsx` | Update link href assertions |
| `app/(app)/app/history/components/history-questions-tab.tsx` | Add `mode: 'review'` to correct-question links (stem + "Review" action), keep incorrect links as reattempt |
| `app/(app)/app/history/components/history-questions-tab.test.tsx` | Update link href assertions |
| `app/(app)/app/shared/components/session-breakdown-list.tsx` | Add `mode: 'review'` to question links |
| `app/(app)/app/shared/components/session-breakdown-list.test.tsx` | Update link href assertions |

---

## 6. Test Plan

### 6.1 Unit Tests (Vitest)

#### Get Previous Attempt Use Case

**File:** `src/application/use-cases/get-previous-attempt.test.ts`

```
- returns null when user has no attempts for the question
- returns previous attempt data with correct choice, explanation, and choice explanations
- returns the most recent attempt when multiple attempts exist for the same question
- returns null and logs warning when question is missing (orphaned attempt)
- returns explanationMd from the question entity (always shows explanation in review)
- uses buildShuffledChoiceViews for consistent choice order
- propagates repository failures
```

#### Question Page Logic — loadPreviousAttempt

**File:** `app/(app)/app/questions/[slug]/question-page-logic.test.ts`

Add tests:

```
loadPreviousAttempt:
  - sets selectedChoiceId and submitResult when previous attempt exists
  - does not set state when previous attempt returns null (no previous attempt)
  - does not set state when server action returns error
  - does not set state when server action throws
  - does not set state when component is unmounted
```

#### Question Page Logic — canSubmitQuestionAnswer (unchanged behavior)

Verify existing tests still pass — `canSubmitQuestionAnswer` returns `false` when `submitResult` is non-null (which is the case in review mode). This correctly prevents re-submission.

#### Routes — toQuestionRoute

**File:** `lib/routes.test.ts`

Add tests:

```
toQuestionRoute:
  - returns URL with mode=review param when mode is provided
  - returns URL with both from and mode params when both provided
  - returns URL without mode param when mode is undefined
```

#### Question Page Client — Review Mode Rendering

**File:** `app/(app)/app/questions/[slug]/question-page-client.test.tsx`

Add tests:

```
// @vitest-environment jsdom
QuestionView:
  - renders Feedback component when submitResult is pre-populated (review mode)
  - renders "Try Again" button instead of "Submit" when submitResult is pre-populated
  - renders selected choice with correctness borders when review data provided
  - does not render Submit button when submitResult is set
```

#### Choice Button — Disabled Opacity

**File:** `components/question/ChoiceButton.test.tsx`

Update test:

```
// @vitest-environment jsdom
- does not apply opacity-50 when disabled with correctness (post-submit/review state)
- applies opacity-50 when disabled without correctness (loading state)
```

#### Entry Point Link Assertions

**File:** `app/(app)/app/dashboard/page.test.tsx`

```
- Recent Activity links include mode=review param
```

**File:** `app/(app)/app/history/components/history-questions-tab.test.tsx`

```
- Correct question stem/title link href includes mode=review
- "Review" action link href includes mode=review
- Incorrect question stem/title link href does NOT include mode=review
- "Reattempt" action link href does NOT include mode=review
```

**File:** `app/(app)/app/shared/components/session-breakdown-list.test.tsx`

```
- question links include mode=review param
```

### 6.2 Integration Tests

**File:** `tests/integration/repositories.integration.test.ts`

Add tests for new repository method:

```
findLatestByUserAndQuestion:
  - returns null when user has no attempts for the question
  - returns the most recent attempt when multiple exist
  - returns attempt with correct fields (selectedChoiceId, isCorrect, etc.)
  - returns null for a different user's attempts
```

### 6.3 E2E Tests (Playwright)

**File:** `tests/e2e/review-mode-audit.spec.ts`

Update existing tests and add new ones:

```
UPDATE: "question page always shows blank form regardless of entry point"
  → Rename: "review mode pre-populates previous answer from dashboard and history"
  → After creating an incorrect attempt:
    - Navigate to Dashboard → click Recent Activity link
    - Assert URL contains mode=review
    - Assert Feedback component IS visible (role="alert" with Correct/Incorrect)
    - Assert a radio button IS checked (pre-selected choice)
    - Assert "Try Again" button visible, "Submit" button absent
    - Repeat from History → Questions → "Review" button

UPDATE: "session breakdown links to blank question page"
  → Rename: "session breakdown links to review mode"
  → Assert Feedback visible, radio checked, Try Again visible

NEW: "review mode Try Again resets to fresh attempt form"
  → Navigate via review mode
  → Click "Try Again"
  → Assert Feedback component is hidden
  → Assert all radio buttons are unchecked
  → Assert Submit button is visible

UPDATE: "review and reattempt buttons in history produce different URLs"
  → Assert "Review" links contain mode=review
  → Assert "Reattempt" links do NOT contain mode=review
```

---

## 7. Implementation Order

```
Phase 1: Backend (Repository + Use Case)
  1. Add AttemptSingleQuestionReader interface to attempt-repository.ts
  2. Extend AttemptRepository to include AttemptSingleQuestionReader
  3. Implement findLatestByUserAndQuestion in DrizzleAttemptRepository
  4. Add fake implementation to FakeAttemptRepository
  5. Write get-previous-attempt.test.ts (RED)
  6. Create GetPreviousAttemptUseCase (GREEN)
  7. Update use-cases/index.ts barrel exports
  8. Add getPreviousAttempt action to question-view-controller.ts
  9. Update QuestionViewControllerDeps type
  10. Wire container: types.ts, use-cases.ts, controllers.ts
  11. Update lib/container.test.ts for new deps

Phase 2: Frontend — Routes + Question Page
  12. Add QuestionMode to lib/routes.ts, update toQuestionRoute
  13. Write lib/routes.test.ts updates (RED → GREEN)
  14. Update page.tsx server component to extract mode param
  15. Update question-page-client.tsx (mode prop, parseQuestionMode)
  16. Write question-page-logic.test.ts for loadPreviousAttempt (RED)
  17. Add loadPreviousAttempt to question-page-logic.ts (GREEN)
  18. Update use-question-page-controller.ts (mode input, review effect)
  19. Update question-page-client.test.tsx for review mode rendering
  20. Update choice-button.tsx (remove opacity-50 in correctness state)
  21. Update ChoiceButton.test.tsx

Phase 3: Entry Points
  22. Update dashboard/page.tsx (add mode: 'review' to Recent Activity links)
  23. Update dashboard/page.test.tsx
  24. Update history-questions-tab.tsx (correct-question links use mode=review, incorrect-question links unchanged)
  25. Update history-questions-tab.test.tsx
  26. Update session-breakdown-list.tsx (add mode: 'review')
  27. Update session-breakdown-list.test.tsx

Phase 4: E2E + Verification
  28. Update tests/e2e/review-mode-audit.spec.ts
  29. Run: pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build
  30. Run: pnpm test:e2e (against dev server)
```

---

## 8. Acceptance Criteria

- [ ] Clicking a question from Dashboard Recent Activity opens review mode with previous answer shown
- [ ] Clicking a correct question in History Questions tab (stem/title link or "Review" action) opens review mode
- [ ] Clicking an incorrect question in History Questions tab (stem/title link or "Reattempt" action) opens fresh attempt mode (no review)
- [ ] Clicking a question from Session Breakdown opens review mode
- [ ] Review mode shows: user's previous choice highlighted, correct choice with green border, Feedback component with explanation, "Try Again" button
- [ ] Review mode does NOT show: Submit button
- [ ] Review mode does NOT create a new attempt row
- [ ] "Try Again" in review mode resets to fresh attempt form (blank choices, Submit button, no Feedback)
- [ ] `?mode=review` with no previous attempt gracefully falls back to attempt mode
- [ ] Disabled choices with correctness highlighting (green/red state) do NOT have `opacity-50`
- [ ] Disabled choices during loading still have `opacity-50`
- [ ] Bookmarks entry point does NOT use review mode (stays as fresh attempt)
- [ ] All existing E2E tests pass (with updates)
- [ ] New E2E tests cover review mode flow + Try Again reset
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build` all pass

---

## 9. Non-Goals (Explicitly Out of Scope)

- **Session-level review page** — A full page showing all questions + answers from a completed session. Separate future spec. This spec covers question-level review only.
- **Date context in subtitle** — "You answered this incorrectly on Feb 11, 2026." Nice-to-have, deferred. Current subtitles are accurate enough once review mode shows actual review content.
- **Attempt history per question** — Only the most recent attempt is shown. Full attempt history ("See all 3 attempts") is a separate feature.
- **Session-scoped attempt selection** — Review mode always shows the most recent attempt for the question, even when entered from a specific session breakdown. Selecting a specific session’s answer (by `sessionId`/`attemptId`) is a separate feature.
- **Question bank reset** — Clearing previous attempts to attempt fresh. Separate feature.
- **Review mode for bookmarks** — Bookmarks are for re-practicing, not reviewing. `from=bookmarks` stays as attempt mode.
- **Animated transition between review and attempt mode** — "Try Again" instantly resets state. No animation needed.
- **Server-side rendering of review state** — Review data is loaded client-side after the question loads. SSR of review state would require passing attempt data through the server component, which adds complexity for minimal benefit.

---

## 10. Known Limitations (v1)

| Limitation | Description | Mitigation |
|------------|-------------|------------|
| Two sequential server calls | `getQuestionBySlug` then `getPreviousAttempt` — not batched | Both are fast queries. Could combine into a single action later. Keeping them separate preserves single responsibility. |
| Brief flash of blank form | In review mode, the form renders blank for a moment before previous attempt data loads | The loading state already shows "Loading question..." spinner. The previous attempt loads immediately after the question. Flash is minimal (<100ms on typical connections). |
| No visual distinction for review mode page | The page looks identical to post-submit state | This is intentional — review mode IS the post-submit state, just pre-populated. The subtitle text provides context. |
| Not session-scoped | Entering review mode from a session breakdown still shows the **most recent** attempt for that question (may differ from that session’s answer if the user reattempted later) | Future enhancement: allow `attemptId`/`sessionId` targeting to show a specific attempt instead of "latest". |
| Exam-mode leakage | If the latest attempt was created inside an **active exam session**, review mode can reveal explanations (this spec does not check `PracticeSession.endedAt`) | Future enhancement: gate review mode when the latest attempt belongs to an un-ended exam session; v1 accepts this trade-off for simplicity. |

---

## 11. Related

- **SPEC-012** (Core Question Loop) — The question detail page, submit answer flow, and Feedback component. This spec extends its page with review mode.
- **SPEC-021** (History Page Restructure) — History Sessions/Questions tabs and entry points.
- **SPEC-022** (Question Log) — "Review"/"Reattempt" button differentiation in History Questions tab. This spec makes them produce different URLs.
- **Brainstorming:** `bs-008-question-review-mode-gap.md` (archived) — Problem discovery, code path trace, Chrome agent UX audit, Playwright validation. All findings in this spec are grounded in that validated analysis.
- **E2E:** `tests/e2e/review-mode-audit.spec.ts` — Playwright tests validating the current gap (will be updated to validate the fix).
