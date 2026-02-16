# SPEC-030: Question View UX Unification — State Persistence, Navigation, and Action Bar Consistency

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented
**Layer:** Feature
**Date:** 2026-02-16
**Depends On:** SPEC-027 (Session Review Navigation), SPEC-028 (Review Question Navigator)
**Brainstorming:** [BS-018](../brainstorming/bs-018-question-view-ux-unification.md) — Question View UX Unification

---

## 1. Three Problems, One Spec

### Problem A: Tutor Mode Loses Answered State on Revisit (BS-018 §Concern 2)

**Severity: High.** In Tutor Mode, when a user answers a question, navigates away, then returns — the UI restores the selected choice and locks the question, but the correctness feedback is missing (no green/red highlighting, no explanation panel).

**Root cause:** `syncQuestionStateFromDraftOrSession()` in `use-question-flow-core.ts:125-153` restores `selectedChoiceId` and `isAnswered` from `NextQuestion.session`, but `submitResult` (which carries `correctChoiceId`, `explanationMd`, `choiceExplanations`) is cleared by `runLoadQuestionFlow` and never restored. The `NextQuestion` type lacks these fields.

**Why History Review works:** The question review page uses `loadPreviousAttempt()` which fetches a full `SubmitAnswerOutput` from the database, populating both `selectedChoiceId` and `submitResult`.

### Problem B: No Previous Button in Session-Based Practice (BS-018 §Concern 5)

**Severity: Medium.** The practice bottom bar has "Next Question" but no "Previous Question." The only way to go back is via the Question Navigator grid (random-access). There is no sequential back-step in the bottom action bar where the user's attention lands after reading content.

### Problem C: Navigation and Action Bar Inconsistency in Review (BS-018 §Concerns 1, 3, 4)

**Severity: Medium/Low.** In History Session Review, the inline "← Previous / Question X of Y / Next →" row sits between the navigator grid and question content. The user must scroll back up after reading explanations to advance. Meanwhile, the bottom action bar only has [Try Again] [Back to History], with no sequential navigation. For unanswered review questions, the bottom bar shows only [Submit] — no Back link, no sequential nav.

### Why Combined

All three problems touch overlapping files: `practice-view.tsx` (action bar), `use-question-flow-core.ts` (state sync), `get-next-question.ts` (backend type), and `question-page-client.tsx` (review layout). Problem A is the prerequisite for Problem B — there's no point adding Previous if the state is lost on revisit. Problem C is a natural follow-on that completes the bottom-bar-as-navigation-zone pattern.

---

## 2. Decisions (No Optionality)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Fix approach for state persistence? | **Backend enhancement** (extend `NextQuestion`) | Authoritative; avoids client-only cache; aligns with how History Review already works. Data exists server-side. |
| Include explanation data for exam mode? | **Tutor mode only** | Exam mode hides explanations until review. Sending correct answers over the wire during an active exam session is a security concern. |
| Add Previous to which modes? | **Tutor + Exam** | Real exams (USMLE, bar) allow backtracking. The navigator grid already provides random-access back-navigation; a bottom-bar Previous is just more convenient. |
| Add Previous to Quick Practice? | **No** | Quick Practice has no session context, no navigator grid, no question ordering. Each question is independent. |
| Move inline nav to bottom bar? | **Yes** | Users scroll down to read explanations; placing Next at the bottom avoids the scroll-back-up problem. |
| Keep "Question X of Y" label? | **Yes, as non-interactive status text** | Rendered in the **top navigation zone** (below the navigator grid) so users get context without a second clickable nav row. |
| Extract shared `QuestionActionBar` component? | **No** | Button sets differ enough that a shared component adds more complexity than it saves. Keep inline but consistent. |
| Where to place Previous/Next in review action bar? | **Before existing buttons** | `[← Previous] [Next →] [Try Again] [Back to History]` — sequential nav first, then actions. |

---

## 3. Architecture

### 3.1 Problem A: Backend Enhancement — `NextQuestion.session.previousSubmission`

```
GetNextQuestionUseCase.executeForSession()
  ↓ already fetches full Question entity (line 152)
  ↓ already has PracticeSessionQuestionState with latestSelectedChoiceId (line 147)
  ↓
  IF latestSelectedChoiceId exists AND mode === 'tutor':
    ↓ build previousSubmission from Question entity
    ↓ include: correctChoiceId, explanationMd, choiceExplanations
  ↓
  NextQuestion.session.previousSubmission → sent to client
  ↓
syncQuestionStateFromDraftOrSession()
  ↓ already restores selectedChoiceId + isAnswered
  ↓ NEW: also constructs SubmitAnswerOutput from previousSubmission
  ↓ calls setSubmitResult() → triggers Feedback rendering
```

### 3.2 Problem B: Previous Button in Practice

```
PracticeSessionPageView
  ↓ has navigator (GetPracticeSessionReviewOutput) with ordered question list
  ↓ has currentQuestionId from props.question
  ↓ computes previousQuestionId: nearest previous *available* row in navigator data
  ↓
  passes onPreviousQuestion to PracticeView
  ↓
PracticeView action bar
  ↓ renders [← Previous] button (disabled when index === 0 or navigator not loaded)
  ↓ onClick → onPreviousQuestion() → onNavigateQuestion(previousQuestionId)
  ↓ triggers loadNextQuestion with specific questionId → same flow as navigator grid click
```

### 3.3 Problem C: Review Navigation Relocation

```
QuestionView (question-page-client.tsx)
  ↓
  BEFORE: ReviewQuestionNavigator + SessionNavigationBar (inline Previous/Next) + QuestionCard + Feedback + [Try Again] [Back]
  ↓
  AFTER:  ReviewQuestionNavigator + "Question X of Y" status + QuestionCard + Feedback + [← Previous] [Next →] [Try Again] [Back]
  ↓
  SessionNavigationBar removed from between grid and content
  Previous/Next links added to bottom action bar
  "Question X of Y" kept as non-interactive status text below the navigator grid
```

---

## 4. Detailed Design

### 4.1 Extend `NextQuestion` Type

**File:** `src/application/use-cases/get-next-question.ts`

Import `ChoiceExplanation` from `submit-answer.ts`:

```typescript
import type { ChoiceExplanation } from './submit-answer';
```

Add a dedicated type for the restored submission payload:

```typescript
export type PreviousSubmission = {
  correctChoiceId: string | null;
  explanationMd: string | null;
  choiceExplanations: ChoiceExplanation[];
};
```

Add `previousSubmission` to the `session` type:

```typescript
export type NextQuestion = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: QuestionDifficulty;
  choices: PublicChoice[];
  session: null | {
    sessionId: string;
    mode: PracticeMode;
    index: number;
    total: number;
    isMarkedForReview?: boolean;
    latestSelectedChoiceId?: string | null;
    latestIsCorrect?: boolean | null;
    previousSubmission?: PreviousSubmission;   // ← NEW
  };
};
```

### 4.2 Populate `previousSubmission` in Use Case

**File:** `src/application/use-cases/get-next-question.ts`

In `executeForSession`, after fetching the question (line 152), when the question was previously answered **in tutor mode**, include the submission data:

```typescript
const isAnswered = typeof targetState.latestSelectedChoiceId === 'string';
const isTutor = session.mode === 'tutor';

return {
  questionId: question.id,
  slug: question.slug,
  stemMd: question.stemMd,
  difficulty: question.difficulty,
  choices: this.mapChoicesForOutput(question, userId),
  session: {
    sessionId: session.id,
    mode: session.mode,
    index: targetIndex,
    total: session.questionIds.length,
    isMarkedForReview: targetState.markedForReview,
    latestSelectedChoiceId: targetState.latestSelectedChoiceId,
    latestIsCorrect: targetState.latestIsCorrect,
    previousSubmission:
      isAnswered && isTutor
        ? this.buildPreviousSubmission(question, userId)
        : undefined,
  },
};
```

Add the helper method:

```typescript
private buildPreviousSubmission(
  question: Question,
  userId: string,
): PreviousSubmission {
  const correctChoice = question.choices.find((c) => c.isCorrect);
  if (!correctChoice) {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      `Question ${question.id} has no correct choice`,
    );
  }

  return {
    correctChoiceId: correctChoice.id,
    explanationMd: question.explanationMd,
    choiceExplanations: buildShuffledChoiceViews(question, userId).map(
      (choice) => ({
        choiceId: choice.choiceId,
        displayLabel: choice.displayLabel,
        textMd: choice.textMd,
        isCorrect: choice.isCorrect,
        explanationMd: choice.explanationMd,
      }),
    ),
  };
}
```

**Important:** `choiceExplanations` MUST be built with `buildShuffledChoiceViews(question, userId)` so the `displayLabel` mapping matches the shuffled `choices` returned by `GetNextQuestion` for the `QuestionCard`.

### 4.3 Restore `submitResult` on Revisit (Frontend)

**File:** `app/(app)/app/practice/shared/use-question-flow-core.ts`

Update `syncQuestionStateFromDraftOrSession` to also restore `submitResult` when `previousSubmission` is available:

```typescript
const syncQuestionStateFromDraftOrSession = useCallback(
  (nextQuestion: NextQuestion | null) => {
    if (!nextQuestion) {
      setSelectedChoiceId(null);
      setIsAnswered(false);
      setSubmitResult(null);                    // ← NEW: also clear submitResult
      return;
    }

    const sessionSelectedChoiceId =
      nextQuestion.session?.latestSelectedChoiceId;
    if (typeof sessionSelectedChoiceId === 'string') {
      setSelectedChoiceId(sessionSelectedChoiceId);
      setIsAnswered(true);

      // NEW: Restore full submission state for previously-answered tutor questions
      const prev = nextQuestion.session?.previousSubmission;
      if (prev) {
        const sessionIsCorrect = nextQuestion.session?.latestIsCorrect ?? null;
        const isCorrect =
          typeof sessionIsCorrect === 'boolean'
            ? sessionIsCorrect
            : typeof prev.correctChoiceId === 'string'
              ? prev.correctChoiceId === sessionSelectedChoiceId
              : false;

        setSubmitResult({
          attemptId: 'restored', // not available from NextQuestion; not used by PracticeView
          isCorrect,
          correctChoiceId: prev.correctChoiceId,
          explanationMd: prev.explanationMd,
          choiceExplanations: prev.choiceExplanations,
        });
      } else {
        setSubmitResult(null);
      }

      updateDraftSelectedChoices((draft) => {
        if (!draft.has(nextQuestion.questionId)) return draft;
        const next = new Map(draft);
        next.delete(nextQuestion.questionId);
        return next;
      });
      return;
    }

    setSelectedChoiceId(
      draftSelectedChoicesRef.current.get(nextQuestion.questionId) ?? null,
    );
    setIsAnswered(false);
    setSubmitResult(null);                      // ← NEW: clear when not answered
  },
  [updateDraftSelectedChoices, setSubmitResult],  // ← add setSubmitResult to deps
);
```

**Key detail:** `setSubmitResult` is a stable `useCallback` with `[]` deps, so adding it to the dependency array does not cause re-render loops.

### 4.4 Add Previous Button to Practice

**File:** `app/(app)/app/practice/components/practice-view.tsx`

Add `onPreviousQuestion` prop:

```typescript
export type PracticeViewProps = {
  // ... existing props
  onPreviousQuestion?: () => void;      // ← NEW
  hasPreviousQuestion?: boolean;        // ← NEW
};
```

Add button to action bar (before Submit):

```typescript
{props.question ? (
  <div className="flex flex-wrap items-center gap-3">
    {props.onPreviousQuestion ? (
      <Button
        type="button"
        variant="outline"
        className="rounded-full"
        disabled={
          !props.hasPreviousQuestion ||
          props.isPending ||
          props.loadState.status === 'loading'
        }
        onClick={props.onPreviousQuestion}
      >
        ← Previous
      </Button>
    ) : null}

    <Button type="button" className="rounded-full" ...>
      Submit
    </Button>
    {/* ... rest unchanged */}
  </div>
) : null}
```

### 4.5 Wire Previous in `PracticeSessionPageView`

**File:** `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`

Compute `previousQuestionId` from navigator data and pass callback:

```typescript
import { useMemo, useCallback } from 'react';

// Inside PracticeSessionPageView:
const currentQuestionId = props.question?.questionId ?? null;

const previousQuestionId = useMemo(() => {
  if (!navigator || !currentQuestionId) return null;
  const currentIdx = navigator.rows.findIndex(
    (r) => r.questionId === currentQuestionId,
  );
  if (currentIdx <= 0) return null;

  for (let i = currentIdx - 1; i >= 0; i -= 1) {
    const row = navigator.rows[i];
    if (!row) continue;
    if (!row.isAvailable) continue;
    return row.questionId;
  }

  return null;
}, [navigator, currentQuestionId]);

const onPreviousQuestion = useCallback(() => {
  if (previousQuestionId && props.onNavigateQuestion) {
    props.onNavigateQuestion(previousQuestionId);
  }
}, [previousQuestionId, props.onNavigateQuestion]);
```

Pass to `PracticeView`:

```tsx
<PracticeView
  // ... existing props
  onPreviousQuestion={props.onNavigateQuestion ? onPreviousQuestion : undefined}
  hasPreviousQuestion={previousQuestionId !== null}
/>
```

### 4.6 Move Review Navigation to Bottom Action Bar

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx`

**Step 1: Replace inline `SessionNavigationBar` with a status-only label**

Remove the `SessionNavigationBar` component (lines 98-156) from between the navigator grid and question content. Replace with a non-interactive "Question X of Y" label:

```tsx
{props.sessionNavigation ? (
  <>
    <ReviewQuestionNavigator
      navigation={props.sessionNavigation}
      historyHref={props.historyHref}
    />
    <p className="text-center text-sm text-muted-foreground">
      Question {props.sessionNavigation.currentIndex + 1} of{' '}
      {props.sessionNavigation.questions.length}
    </p>
  </>
) : null}
```

**Step 2: Add Previous/Next links to the bottom action bar**

Compute prev/next from `sessionNavigation`:

```tsx
const navPrev =
  props.sessionNavigation && props.sessionNavigation.currentIndex > 0
    ? props.sessionNavigation.questions[props.sessionNavigation.currentIndex - 1]
    : null;
const navNext =
  props.sessionNavigation &&
  props.sessionNavigation.currentIndex <
    props.sessionNavigation.questions.length - 1
    ? props.sessionNavigation.questions[
        props.sessionNavigation.currentIndex + 1
      ]
    : null;
```

Update the bottom action bar:

```tsx
<div className="flex flex-col gap-3 sm:flex-row">
  {/* Sequential navigation (session review only) */}
  {navPrev ? (
    <Button asChild variant="outline" className="rounded-full">
      <Link
        href={toQuestionRoute(navPrev.slug, {
          from: props.sessionNavigation!.from,
          mode: 'review',
          sessionId: props.sessionNavigation!.sessionId,
          historyHref: props.historyHref,
        })}
      >
        ← Previous
      </Link>
    </Button>
  ) : null}

  {navNext ? (
    <Button asChild variant="outline" className="rounded-full">
      <Link
        href={toQuestionRoute(navNext.slug, {
          from: props.sessionNavigation!.from,
          mode: 'review',
          sessionId: props.sessionNavigation!.sessionId,
          historyHref: props.historyHref,
        })}
      >
        Next →
      </Link>
    </Button>
  ) : null}

  {/* Existing action buttons */}
  {!props.submitResult ? (
    <Button type="button" className="rounded-full" ...>
      Submit
    </Button>
  ) : (
    <Button variant="outline" className="rounded-full" ...>
      Try Again
    </Button>
  )}

  {props.sessionNavigation || props.submitResult ? (
    <Button asChild variant="ghost" className="rounded-full">
      <Link href={originUi.backHref}>{originUi.backLabel}</Link>
    </Button>
  ) : null}
</div>
```

**Step 3: Fix unanswered review fallback action bar**

When `sessionNavigation` exists but `submitResult` is null (unanswered question in session review), the user currently sees only [Submit]. After this change, they'll see sequential navigation (as available) plus [Submit] and [Back to …] in the bottom bar.

No additional code needed beyond rendering the Back button independently of `submitResult`; sequential nav + Back appear in both answered and unanswered states.

### 4.7 Remove `SessionNavigationBar` Component

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx`

Delete the entire `SessionNavigationBar` function (lines 98-156). Its Previous/Next links are now in the bottom action bar (§4.6). The "Question X of Y" label is inlined as a simple `<p>` tag (§4.6 Step 1).

---

## 5. Files Summary

### Modified Files

| File | Change |
|------|--------|
| `src/application/use-cases/get-next-question.ts` | Add `previousSubmission` to `NextQuestion.session` type; populate in tutor mode when question was previously answered |
| `src/application/use-cases/get-next-question.test.ts` | Test `previousSubmission` population: tutor+answered, tutor+unanswered, exam+answered |
| `app/(app)/app/practice/shared/use-question-flow-core.ts` | Update `syncQuestionStateFromDraftOrSession` to restore `submitResult` from `previousSubmission` |
| `app/(app)/app/practice/shared/use-question-flow-core.browser.spec.tsx` | Test state restoration with and without `previousSubmission` |
| `app/(app)/app/practice/components/practice-view.tsx` | Add `← Previous` button, `onPreviousQuestion` + `hasPreviousQuestion` props |
| `app/(app)/app/practice/components/practice-view.test.tsx` | Test Previous button rendering and disabled states |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | Test Previous click behavior |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` | Compute `previousQuestionId` from navigator data; wire `onPreviousQuestion` |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` | Test Previous callback wiring |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Remove `SessionNavigationBar`; add Previous/Next to bottom action bar; add "Question X of Y" status label |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Update tests: remove SessionNavigationBar assertions, add bottom-bar nav assertions |

### No New Files

All changes are to existing files.

---

## 6. Test Plan

### 6.1 Unit Tests — Backend

**File:** `src/application/use-cases/get-next-question.test.ts`

```
previousSubmission (tutor state persistence):
  - includes previousSubmission when question was answered in tutor mode
  - previousSubmission contains correctChoiceId from question data
  - previousSubmission contains explanationMd from question data
  - previousSubmission contains choiceExplanations with display labels
  - does NOT include previousSubmission when question is unanswered
  - does NOT include previousSubmission in exam mode even when answered
  - does NOT include previousSubmission for filters-based (Quick Practice) questions
```

### 6.2 Unit Tests — Frontend State

**File:** `app/(app)/app/practice/shared/use-question-flow-core.browser.spec.tsx`

```
syncQuestionStateFromDraftOrSession:
  - restores submitResult when previousSubmission exists in session data
  - sets isCorrect from session.latestIsCorrect
  - sets correctChoiceId from previousSubmission.correctChoiceId
  - sets explanationMd from previousSubmission.explanationMd
  - sets choiceExplanations from previousSubmission.choiceExplanations
  - clears submitResult when previousSubmission is not present
  - clears submitResult when navigating to unanswered question
```

### 6.3 Component Tests — Practice View

**Files:**
- `app/(app)/app/practice/components/practice-view.test.tsx` (static markup; `renderToStaticMarkup`)
- `app/(app)/app/practice/components/practice-view.browser.spec.tsx` (interaction; `vitest-browser-react`)

```
Previous button:
  - renders "← Previous" button when onPreviousQuestion is provided
  - does not render Previous when onPreviousQuestion is not provided
  - Previous is disabled when hasPreviousQuestion is false
  - Previous is disabled during pending state
  - Previous is disabled during loading state
  - Previous is enabled when hasPreviousQuestion is true and not loading
  - calls onPreviousQuestion when clicked
```

### 6.4 Component Tests — Practice Session Page View

**File:** `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx`

```
Previous question wiring:
  - renders Previous button in the session answering branch
  - hasPreviousQuestion is false when current question is first in navigator
  - hasPreviousQuestion is false when navigator is missing or current question is not found
  - hasPreviousQuestion is true when current question is not first
  - clicking Previous calls onNavigateQuestion with the previous question's ID
```

### 6.5 Component Tests — Question Page Client

**File:** `app/(app)/app/questions/[slug]/question-page-client.test.tsx`

```
Bottom-bar navigation (session review):
  - renders "← Previous" link in bottom bar when not first question
  - renders "Next →" link in bottom bar when not last question
  - does not render Previous in bottom bar when first question
  - does not render Next in bottom bar when last question
  - Previous/Next links include sessionId and from params
  - renders "Question X of Y" status text below the navigator grid
  - does not render inline SessionNavigationBar (removed)

Unanswered review fallback:
  - renders Previous/Next links alongside Submit for unanswered session questions
  - renders Back button in bottom bar for unanswered session questions
  - renders Submit button for unanswered session questions

Non-session flows:
  - does not render Previous/Next when sessionNavigation is null
  - does not render "Question X of Y" when sessionNavigation is null
```

### 6.6 Integration (Browser)

**File:** `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`

```
Tutor revisit integration:
  - submit in tutor mode, then navigate away and back
  - restores submitResult from NextQuestion.session.previousSubmission
```

---

## 7. Implementation Order

```
Phase 1: Tutor State Persistence — Backend
  1. Write test: previousSubmission included for answered tutor question (RED)
  2. Write test: previousSubmission NOT included for unanswered question (RED)
  3. Write test: previousSubmission NOT included for exam mode (RED)
  4. Add previousSubmission to NextQuestion type
  5. Implement buildPreviousSubmission + populate in executeForSession (GREEN)
  6. Verify: pnpm typecheck && pnpm test --run

Phase 2: Tutor State Persistence — Frontend
  7. Write test: syncQuestionStateFromDraftOrSession restores submitResult (RED)
  8. Write test: syncQuestionStateFromDraftOrSession clears submitResult when no previousSubmission (RED)
  9. Update syncQuestionStateFromDraftOrSession to restore submitResult (GREEN)
  10. Verify: pnpm typecheck && pnpm test --run

Phase 3: Previous Button in Practice
  11. Write test: PracticeView renders Previous when callback provided (RED)
  12. Write test: PracticeView disables Previous on first question (RED)
  13. Add onPreviousQuestion + hasPreviousQuestion props, render button (GREEN)
  14. Write test: PracticeSessionPageView computes previousQuestionId (RED)
  15. Wire previousQuestionId computation and pass callback (GREEN)
  16. Verify: pnpm typecheck && pnpm test --run

Phase 4: Review Navigation Relocation
  17. Write test: bottom bar renders Previous/Next links when session nav exists (RED)
  18. Write test: bottom bar omits Previous on first question (RED)
  19. Write test: status label shows "Question X of Y" (RED)
  20. Remove SessionNavigationBar; add bottom-bar links + status label (GREEN)
  21. Update existing SessionNavigationBar tests to assert bottom-bar behavior (GREEN)
  22. Verify: pnpm typecheck && pnpm test --run && pnpm test:browser

Phase 5: Full Verification
  23. pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build
```

---

## 8. Acceptance Criteria

### Tutor State Persistence (Problem A)

- [ ] In Tutor mode, answering a question and navigating away then back restores: selected answer, correct/incorrect highlighting, and explanation
- [ ] `NextQuestion.session.previousSubmission` is populated for answered questions in tutor mode
- [ ] `NextQuestion.session.previousSubmission` is NOT populated for unanswered questions
- [ ] `NextQuestion.session.previousSubmission` is NOT populated in exam mode (security: don't leak answers)
- [ ] `syncQuestionStateFromDraftOrSession` constructs and sets `submitResult` from `previousSubmission`
- [ ] Exam mode answering behavior is unchanged (no highlighting, no feedback until review)

### Previous Button in Practice (Problem B)

- [ ] "← Previous" button appears in practice bottom bar (Tutor + Exam sessions)
- [ ] Previous is disabled on the first question (index 0)
- [ ] Previous is disabled while loading or during pending transitions
- [ ] Previous navigates to the previous question in session order
- [ ] Previous does NOT appear in Quick Practice (no session context)
- [ ] Previous is disabled when navigator data is not loaded (no known previous question)

### Review Navigation Relocation (Problem C)

- [ ] Inline `SessionNavigationBar` (Previous / X of Y / Next) is removed from between navigator grid and question content
- [ ] "Question X of Y" appears as non-interactive status text below the navigator grid
- [ ] "← Previous" and "Next →" links appear in the bottom action bar for session review
- [ ] Previous/Next links preserve all URL params (`sessionId`, `from`, `mode=review`, `historyHref`)
- [ ] Unanswered session-review questions show sequential nav (as available) plus [Submit] and [Back to …] in the bottom bar
- [ ] Non-session review flows are unchanged (no Previous/Next, no status label)

### General

- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build` all pass
- [ ] No regressions in existing practice session tests
- [ ] No regressions in existing question review page tests

---

## 9. Non-Goals (Explicitly Out of Scope)

- **Shared `QuestionActionBar` component** — The button sets differ enough across contexts that a shared component adds complexity without proportional benefit. Keep inline.
- **Navigator convergence** — `QuestionNavigator` (callback-based, active session) and `ReviewQuestionNavigator` (link-based, review pages) remain separate. A shared base component is a future enhancement.
- **Exam mode state persistence** — Exam mode intentionally hides explanations. If a user revisits an answered exam question, they see their selection highlighted as "Answered" but not correct/incorrect. This is by design.
- **Quick Practice Previous button** — Quick Practice has no session ordering. Each question is independently selected by filters.
- **"Stay on the same question" after hard refresh** — `/app/practice/[sessionId]` still loads the next unanswered question on hard refresh (existing behavior). This spec only ensures that when a previously-answered question is loaded via `questionId` navigation, the tutor feedback state can be reconstructed.
- **`attemptId` in restored `submitResult`** — The `SubmitAnswerOutput.attemptId` field is set to a sentinel value (`'restored'`) in the reconstructed result because `NextQuestion` doesn't carry it. No production code currently references `attemptId` in the session UI, so this is safe. If a future UI needs a real attemptId, `previousSubmission` can be extended to include it (requires an attempts lookup).

---

## 10. Risk Assessment

**Risk: Low.**

- **Problem A is additive** — New `previousSubmission` field on the response type. Existing code that doesn't read it is unaffected. Frontend change is in a single callback with clear boundary.
- **Problem B is additive** — New optional callback prop on `PracticeView`. When not provided, no Previous button renders. Existing callers (Quick Practice) are unaffected.
- **Problem C is a layout change** — Moving links from position A to position B. No behavioral change — same links, same params, same destinations. The `SessionNavigationBar` component is removed but its functionality is preserved in the bottom bar.
- **Exam mode security** — `previousSubmission` is gated to tutor mode on the backend. Even if frontend code changes, the data is never sent for exam sessions.

---

## 11. What This Fixes

| Before | After |
|--------|-------|
| Tutor: revisit answered question → locked selection but no feedback | Tutor: revisit answered question → full highlighting + explanation |
| Practice: no "Previous" in bottom bar; must use navigator grid | Practice: "← Previous" in bottom bar alongside "Next Question" |
| Review: Previous/Next at top (inline row); must scroll up to advance | Review: Previous/Next at bottom (action bar); advance without scrolling |
| Review: unanswered question shows only [Submit] | Review: unanswered question shows sequential nav + [Back to …] (not just [Submit]) |
| Practice: navigator grid is only back-navigation mechanism | Practice: grid (random-access) + Previous (sequential) — complementary |

---

## 12. Related

- **[BS-018](../brainstorming/bs-018-question-view-ux-unification.md)** — Brainstorming doc with full UI audit, severity assessment, and verified code paths
- **[Question Rendering Architecture](../practice-engine/question-rendering-architecture.md)** — Canonical reference for all 6 question-viewing contexts
- **SPEC-027** — Session Review Navigation (introduced the inline `SessionNavigationBar` that this spec relocates to the bottom bar)
- **SPEC-028** — Review Question Navigator (color-coded grid that remains at the top)
- **SPEC-020** — Practice Engine Completion (original practice session implementation)
