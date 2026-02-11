# Question Review Mode Gap — Brainstorming

**Date:** 2026-02-11
**Triggered by:** Manual walk-through of Dashboard > Recent Activity and History > Questions flows after SPEC-022 merge
**Scope:** Clicking any previously-answered question (from Dashboard, History, or Session Breakdown) opens a blank re-attempt form instead of showing the user's previous answer with feedback

---

## The Problem

There is **no read-only review mode** for previously-answered questions. Every entry point that says "review" actually opens a fresh attempt form:

| Entry Point | What User Expects | What Actually Happens |
|------------|-------------------|----------------------|
| Dashboard > Recent Activity (Incorrect) | See what I got wrong + explanation | Blank form with "Submit" button |
| Dashboard > Recent Activity (Correct) | See why it was correct + explanation | Blank form with "Submit" button |
| History > Questions > "Reattempt" | Fresh attempt (acceptable) | Fresh attempt (correct) |
| History > Questions > "Review" | See previous answer + explanation | Blank form with "Submit" (wrong) |
| History > Sessions > Breakdown > click question | See that session's answer + explanation | Blank form with "Submit" (wrong) |
| Practice > Session Summary > click question | See that session's answer + explanation | Blank form with "Submit" (wrong) |

**The jank the user feels:** The UI says "Review" and "Reviewing a question from your history" but presents a blank slate. The user already answered this question — they want to see *what* they answered and *why* it was right or wrong. Instead they get a do-over they didn't ask for.

**Why re-attempting without context is confusing:** When a user re-answers a previously-answered question, what happens to the old attempt? Is it replaced? Do both exist? The user has no mental model for this. The `attempts` table logs every submission independently (`id`, `answeredAt`), so re-answering creates a *new* row — but the user doesn't know that. From their perspective, the original result vanished and they're guessing again with the correct answer fresh in memory from the "Incorrect" badge they just saw.

---

## Current Architecture

### Question Page (`/app/questions/[slug]`)

The question page is a single-mode page with one flow:

```
URL: /app/questions/[slug]?from={origin}

1. loadQuestion(slug) → fetches question stem + choices (NO attempt data)
2. setSelectedChoiceId(null) → always blank
3. setSubmitResult(null) → no feedback shown
4. User selects choice → Submit → submitSelectedAnswer() → creates new attempt row
5. Feedback component appears with explanation
```

**Key files:**
- `app/(app)/app/questions/[slug]/question-page-logic.ts` — state machine (load → select → submit → feedback)
- `app/(app)/app/questions/[slug]/question-page-client.tsx` — `QuestionView` renders question + feedback
- `app/(app)/app/questions/[slug]/use-question-page-controller.ts` — hooks up state + server actions
- `src/adapters/controllers/question-view-controller.ts` — `getQuestionBySlug()` returns stem + choices only

### What the Page *Does* Have

The `Feedback` component (`components/question/feedback.tsx`) already perfectly renders:
- Correct/Incorrect badge
- Full explanation markdown
- Per-choice explanations ("Why other answers are wrong")

It's only shown when `submitResult` is non-null — i.e., after the user submits a *new* answer.

### What the Page *Doesn't* Have

1. **No attempt lookup** — the page never queries "has this user answered this question before?"
2. **No review mode flag** — no way to pre-populate `selectedChoiceId` and `submitResult` from a previous attempt
3. **No read-only state** — choices are always interactive, "Submit" is always shown

### The `from` Parameter

The `?from=` query param currently only controls the back-link destination and subtitle text:

| `from` | Back Link | Subtitle |
|--------|-----------|----------|
| `dashboard` | `/app/dashboard` | "Review a question from your recent activity." |
| `history` | `/app/history` | "Reviewing a question from your history." |
| `practice` | `/app/practice` | "Review a question from your practice history." |
| `bookmarks` | `/app/bookmarks` | "Reattempt a question from your bookmarks." |

It does *not* change the page behavior.

---

## The Missing Piece: Review Mode

### Conceptual Model

The question detail page needs to support two distinct modes:

**Attempt Mode** (current — works correctly for fresh questions):
```
Question stem → choices (selectable) → Submit → Feedback
```

**Review Mode** (missing — needed for all "review" entry points):
```
Question stem → choices (locked, previous answer highlighted, correct answer highlighted) → Feedback (immediate)
Action: "Try Again" (switches to Attempt Mode) | "Back to {origin}"
```

### Data Required for Review Mode

To render review mode, the page needs the user's most recent attempt for this question:

```typescript
type PreviousAttemptData = {
  selectedChoiceId: string;   // what the user chose
  isCorrect: boolean;         // right or wrong
  correctChoiceId: string;    // the right answer
  explanationMd: string;      // main explanation
  choiceExplanations: Array<{ // per-choice feedback
    choiceId: string;
    explanationMd: string | null;
  }>;
};
```

This is essentially the same shape as `SubmitAnswerOutput` — the data that's shown after submitting. We need to retrieve it from the existing attempt rather than creating a new one.

### Where the Data Lives

The `attempts` table already stores `selectedChoiceId` and `isCorrect` for every attempt. The question's `choices` table has `isCorrect` (to identify the correct choice) and `explanationMd` (per-choice explanations). The question itself has `explanationMd` (main explanation).

So all data needed to reconstruct `SubmitAnswerOutput` from a previous attempt already exists — it just needs a query path.

---

## Related Question: Session-Level Review

A related but separate gap: there is no **session review page** that shows all questions from a completed session in order with their answers.

**Current session review flow:**
1. History > Sessions tab > "View breakdown" → expands inline list showing question stems + Correct/Incorrect/Unanswered badges
2. Clicking a question from the breakdown → opens `/app/questions/[slug]?from=history` → **blank re-attempt form** (same bug)

**What's missing:** A dedicated session review page (or expanded inline view) where each question shows the user's selected answer, the correct answer, and the explanation — all on one scrollable page, without navigating to individual question pages.

This is a larger feature and should be a separate spec. The immediate fix is the question-level review mode described above.

---

## Proposed Approach (Uncle Bob Style)

### Layer 1: Domain — Zero Changes Needed
The domain entities (`Attempt`, `Question`, `Choice`) already contain all relevant data. No domain changes required.

### Layer 2: Application — New Use Case

```
GetPreviousAttemptUseCase
  Input:  { userId, questionId }
  Output: { selectedChoiceId, isCorrect, correctChoiceId, explanationMd, choiceExplanations } | null
```

This use case:
1. Queries the attempt repository for the user's most recent attempt on this question
2. If no attempt exists, returns `null`
3. If attempt exists, loads the question with choices to reconstruct the full feedback

Could reuse the existing `enrichWithQuestion` pattern from `get-attempted-questions.ts`.

### Layer 3: Adapters — New Controller Method + Port Query

**New port method on `AttemptRepository`:**
```typescript
findLatestByUserAndQuestion(userId: string, questionId: string): Promise<Attempt | null>
```

**New controller action in `question-view-controller.ts`:**
```typescript
getPreviousAttempt(input: { questionId: string }): Promise<ActionResult<PreviousAttemptData | null>>
```

### Layer 4: App — Question Page Receives Review Mode

**URL change:** `/app/questions/[slug]?from=history&mode=review`

Or: infer review mode automatically from `from` parameter (e.g., `from=history` or `from=dashboard` implies review when a previous attempt exists).

**Question page logic change:**
1. On mount, call `getPreviousAttempt()` alongside `getQuestionBySlug()`
2. If previous attempt exists AND mode=review:
   - Pre-populate `selectedChoiceId` from previous attempt
   - Pre-populate `submitResult` from previous attempt data
   - Choices render in locked/read-only state
   - `Feedback` component renders immediately
   - "Submit" button hidden; "Try Again" button shown

**Key principle:** Review mode is a presentation concern — it uses the same `QuestionView` component but with pre-populated state. No new components needed.

---

## What NOT to Build Yet

1. **Question reset / bank reset** — Users want to eventually "reset" a question to attempt it fresh. This is a separate feature (clear previous attempts for a question or all questions). Don't couple it with review mode.

2. **Session-level review page** — A full page showing all questions + answers from a completed session. Important but separate scope. The immediate fix is question-level review.

3. **Re-attempt state management** — "What happens to the old attempt when I re-answer?" is an existing behavior (a new attempt row is created, both coexist, latest wins). This needs UX clarification but is orthogonal to review mode.

---

## Entry Points That Should Trigger Review Mode

| Entry Point | Current Behavior | Should Be |
|------------|-----------------|-----------|
| Dashboard > Recent Activity click | Attempt mode | **Review mode** (user is reviewing, not re-attempting) |
| History > Questions > "Review" button | Attempt mode | **Review mode** |
| History > Questions > "Reattempt" button | Attempt mode | **Attempt mode** (this one is correct!) |
| History > Sessions > Breakdown > click | Attempt mode | **Review mode** (user is reviewing session results) |
| Practice > Session Summary > click | Attempt mode | **Review mode** (user is reviewing what they just did) |
| Bookmarks > click | Attempt mode | **Attempt mode** (bookmarks are for re-practicing) |

---

## Impact Assessment

**User-facing:** This is the single most impactful UX improvement available right now. Every review flow currently dead-ends at a confusing blank form. Fixing it makes the entire History and Dashboard experience coherent.

**Code scope:** Moderate. ~1 new use case, ~1 new repository method, ~1 new controller action, modifications to the question page controller and view. All within existing architectural patterns.

**Risk:** Low. Review mode is additive — it doesn't change attempt mode behavior. The `QuestionView` component already supports all the visual states (selected choice, correct choice highlighted, Feedback component). It just needs to be initialized with data instead of starting blank.
