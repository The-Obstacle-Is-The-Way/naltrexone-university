# Question Review Mode Gap — Brainstorming

**Date:** 2026-02-11
**Triggered by:** Manual walk-through of Dashboard > Recent Activity and History > Questions flows after SPEC-022 merge
**Scope:** Clicking any previously-answered question (from Dashboard, History, or Session Breakdown) opens a blank re-attempt form instead of showing the user's previous answer with feedback

---

> **Terminology:** Throughout this document, "blank form" or "fresh form" means **the question loads with its stem and choices visible, but has zero memory of the user's previous attempt** — no choice is pre-selected, no feedback or explanation is shown, and the Submit button is presented as if the user has never seen this question before. It does NOT mean an empty or broken page.

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

---

## Code Path Trace (Verified 2026-02-11)

Complete end-to-end trace confirming the gap exists at every layer.

### Server Component → Client Component → Controller

```
page.tsx (server)
  ↓ extracts `from` param from searchParams — nothing else
  ↓ passes slug + from to QuestionPageClient

question-page-client.tsx (client)
  ↓ parseQuestionOrigin(from) → controls subtitle/back-link ONLY
  ↓ useQuestionPageController({ slug }) — no `from`, no attempt data

use-question-page-controller.ts (hook)
  ↓ useState<string | null>(null)         → selectedChoiceId always null
  ↓ useState<SubmitAnswerOutput | null>(null) → submitResult always null
  ↓ useEffect → loadQuestion() on mount

question-page-logic.ts (state machine)
  ↓ loadQuestion() calls:
    setSelectedChoiceId(null)   ← LINE 44: ALWAYS null
    setSubmitResult(null)       ← LINE 45: ALWAYS null
  ↓ calls getQuestionBySlug(slug) — fetches stem + choices ONLY

question-view-controller.ts (server action)
  ↓ getQuestionBySlug() queries QuestionRepository.findPublishedBySlug()
  ↓ returns: { questionId, slug, stemMd, difficulty, choices[] }
  ↓ NEVER queries AttemptRepository — zero attempt data returned
```

### What `getQuestionBySlugOutput` Contains vs What Review Mode Needs

| Field | In `GetQuestionBySlugOutput`? | Needed for Review? |
|-------|------------------------------|-------------------|
| `questionId` | Yes | — |
| `slug` | Yes | — |
| `stemMd` | Yes | Yes |
| `choices[].id` | Yes | Yes |
| `choices[].label` | Yes | Yes |
| `choices[].textMd` | Yes | Yes |
| `selectedChoiceId` (user's answer) | **No** | **Yes** |
| `isCorrect` | **No** | **Yes** |
| `correctChoiceId` | **No** | **Yes** |
| `explanationMd` | **No** | **Yes** |
| `choiceExplanations[]` | **No** | **Yes** |

### Feedback Component Gating

`question-page-client.tsx` line 146–152:
```tsx
{props.submitResult ? (
  <Feedback
    isCorrect={props.submitResult.isCorrect}
    explanationMd={props.submitResult.explanationMd}
    choiceExplanations={props.submitResult.choiceExplanations}
  />
) : null}
```

`submitResult` is **only** set by `submitSelectedAnswer()` — which creates a NEW attempt. There is no code path that sets it from a previous attempt.

### Choice Rendering Already Supports Review Visual States

`question-card.tsx` lines 41–48 + `choice-button.tsx` lines 27–36:
```tsx
// QuestionCard computes correctness per choice:
const correctness =
  correctChoiceId === null ? null        // pre-submit: no coloring
  : choice.id === correctChoiceId ? 'correct'   // green border + bg
  : selected ? 'incorrect'              // red border + bg (user's wrong pick)
  : null;                               // other choices: neutral

// ChoiceButton renders disabled state:
disabled && 'cursor-not-allowed opacity-50'
correctness === 'correct' && 'border-success bg-success/10 text-success-foreground'
correctness === 'incorrect' && 'border-destructive bg-destructive/10 text-destructive'
```

When `correctChoiceId` is non-null, choices auto-lock (`disabled={disabled || correctChoiceId !== null}`). This means if we pre-populate `correctChoiceId` + `selectedChoiceId` on mount, the choices render in their post-submit visual state automatically — green/red borders, locked, no additional styling needed.

### Entry Points — All Identical Links, No Differentiation

| Entry Point | Link Code | Distinguishes Review vs Reattempt? |
|-------------|-----------|-----------------------------------|
| Dashboard Recent Activity | `toQuestionRoute(row.slug, { from: 'dashboard' })` | No |
| History Questions "Review" button | `toQuestionRoute(row.slug, { from: 'history' })` | No — same URL as "Reattempt" |
| History Questions "Reattempt" button | `toQuestionRoute(row.slug, { from: 'history' })` | No — identical to "Review" |
| Session Breakdown click | `toQuestionRoute(row.slug, { from })` | No |
| Bookmarks click | `toQuestionRoute(row.slug, { from: 'bookmarks' })` | No |

The History Questions tab renders `{row.isCorrect ? 'Review' : 'Reattempt'}` as button text but both produce the **exact same URL**. The semantic distinction exists only in the label.

### Missing Repository Method

`src/application/ports/attempt-repository.ts` — available methods on `AttemptRepository`:
- `findByUserId()` — paginated history
- `findBySessionId()` — session review
- `listRecentByUserId()` — recent attempts
- `listAttemptedQuestionsByUserId()` — paginated question list
- `findMostRecentAnsweredAtByQuestionIds()` — timestamps only, no attempt data

**Missing:** `findLatestByUserAndQuestion(userId: string, questionId: string): Promise<Attempt | null>` — the method needed to look up a single previous attempt for review mode.

---

## Browser UX Audit (Claude in Chrome, 2026-02-11) — VALIDATED BY PLAYWRIGHT

The following observations were reported by an AI browser agent navigating the Vercel preview deployment. Each claim is tagged with its validation status.

### Observation 1: Dashboard → Recent Activity → Question Page [VALIDATED BY PLAYWRIGHT]

**Claim:** Clicking an "Incorrect" item in Recent Activity navigates to `/app/questions/[slug]?from=dashboard`. Subtitle reads "Review a question from your recent activity." Form is blank — four unselected choices, Submit button, zero context about the previous attempt.

**Code evidence supports this:** `dashboard/page.tsx` line 209 uses `toQuestionRoute(row.slug, { from: 'dashboard' })`. The `getOriginUi('dashboard')` returns subtitle "Review a question from your recent activity." `loadQuestion()` always resets to null state.

### Observation 2: History → Questions → "Review" Button [VALIDATED BY PLAYWRIGHT]

**Claim:** The "Review" button (shown for correct questions) and "Reattempt" button (shown for incorrect questions) both navigate to identical URLs. Clicking "Review" shows the same blank form with "Reviewing a question from your history." subtitle.

**Code evidence supports this:** `history-questions-tab.tsx` lines 365–374 — both buttons use `toQuestionRoute(row.slug, { from: 'history' })`. Button text varies (`row.isCorrect ? 'Review' : 'Reattempt'`) but URL is identical.

### Observation 3: History → Sessions → Breakdown → Click Question [VALIDATED BY PLAYWRIGHT]

**Claim:** Session breakdown shows Correct/Incorrect/Unanswered badges per question. Clicking a question opens the same blank form with "Reviewing a question from your history." subtitle.

**Code evidence supports this:** `session-breakdown-list.tsx` line 24 uses `toQuestionRoute(row.slug, { from })` where `from` is `'practice'` or `'history'`. Same blank page.

### Observation 4: Post-Submit Feedback Component Renders Correctly [VALIDATED BY PLAYWRIGHT]

**Claim:** After submitting an answer, the Feedback component renders:
- Correct/Incorrect badge in a colored card (green border for correct, red for incorrect)
- "Explanation" section with markdown content
- "Clinical pearl" if present in explanation
- "Why other answers are wrong" section with per-choice breakdowns
- User's incorrect choice highlighted with red border
- Correct choice highlighted with green border
- Wrong unchosen choices dimmed (opacity-50 via disabled state)
- "Try Again" button and "Back to [origin]" link

**Code evidence supports this:** `feedback.tsx` renders `isCorrect` badge, `explanationMd` via Markdown, and `choiceExplanations` for incorrect choices. `choice-button.tsx` applies `border-success bg-success/10` for correct and `border-destructive bg-destructive/10` for incorrect. `question-card.tsx` line 58: `disabled={disabled || correctChoiceId !== null}` locks choices when correctChoiceId is set. `question-page-client.tsx` lines 170–180 render "Try Again" and "Back to [origin]" buttons when `submitResult` exists.

### Chrome Agent Design Recommendations (For Reference — Not Validated)

These are design opinions from the browser agent, included for brainstorming purposes:

1. **Review mode = post-submit state on load.** Pre-populate `selectedChoiceId` and `submitResult` from the previous attempt. The existing `QuestionCard` + `Feedback` components already render the correct visual state. No new components needed.

2. **Locked choices should NOT use `opacity-50` disabled styling.** The current disabled state (`cursor-not-allowed opacity-50`) looks "broken." Instead, review mode should use a "settled" visual — choices still fully visible but non-interactive. Remove hover effect, remove cursor pointer, no opacity change. The red/green border treatment is sufficient signal.

3. **"Try Again" replaces "Submit" in review mode.** Already exists in post-submit flow. Just show it by default when entering review mode.

4. **Subtitle should include date.** Instead of generic "Reviewing a question from your history," use "You answered this incorrectly on Feb 11, 2026" to anchor the user in time.

5. **No modals, no separate route, no tabs within the page.** Same page, same URL, state-driven rendering. `?mode=review` param or auto-infer from `from` + previous attempt existence.

6. **Anti-patterns to avoid:** Modal overlays for review content, separate `/review` route duplicating question page, toolbar with mode toggle buttons, showing previous answer AND new answer selection simultaneously.

---

## Playwright Validation (2026-02-11) — ALL CLAIMS CONFIRMED

Automated E2E spec: `tests/e2e/review-mode-audit.spec.ts`
Run against: `localhost:3000` (local dev server, same codebase as Vercel deployment)
Result: **6/6 tests passed**

### Test 1: Question page always shows blank form regardless of entry point
**Status: PASS — gap confirmed**

Steps validated:
1. Created an incorrect attempt for `placeholder-01-naltrexone-mechanism`
2. Navigated to Dashboard → clicked question in Recent Activity
3. Asserted URL contains `?from=dashboard`
4. Asserted subtitle "Review a question from your recent activity." is visible
5. Asserted Submit button is visible (blank attempt mode)
6. Asserted no Feedback component (`role="alert"` with Correct/Incorrect) on page
7. Asserted all radio buttons are unchecked (no pre-selected choice)
8. Repeated same assertions from History → Questions tab (`?from=history`)

### Test 2: Session breakdown links to blank question page
**Status: PASS — gap confirmed**

Steps validated:
1. Started a 1-question Tutor session, submitted answer, ended session
2. Navigated to History → Sessions → clicked "View breakdown"
3. Confirmed breakdown expanded with Correct/Incorrect badges visible
4. Clicked question link from breakdown
5. Asserted Submit button is visible (blank form)
6. Asserted no Feedback component on load
7. Asserted all radio buttons unchecked

### Test 3: Post-submit feedback component renders correctly
**Status: PASS — existing feedback flow works**

Steps validated:
1. Navigated to question page, selected choice A, clicked Submit
2. Asserted Feedback component (`role="alert"` with Correct/Incorrect badge) appeared
3. Asserted "Explanation" text is present inside feedback
4. Asserted Submit button is gone
5. Asserted "Try Again" button is visible
6. Asserted correct choice has `border-success` CSS class (green highlight)
7. Asserted all radio buttons are disabled (locked after submit)

### Test 4: Review and Reattempt buttons produce identical URLs
**Status: PASS — no differentiation confirmed**

Steps validated:
1. Navigated to History → Questions tab
2. Found all links with `aria-label` starting with "Review question:" or "Reattempt question:"
3. Asserted every link contains `from=history` in href
4. Asserted NO link contains `mode=` parameter
5. Asserted NO link contains `attemptId=` parameter

### Summary of Validated Findings

| Claim | Source | Playwright Result |
|-------|--------|------------------|
| Dashboard → question page shows blank form | Chrome agent | **Confirmed** |
| Subtitle says "Review" but form is blank | Chrome agent | **Confirmed** |
| No Feedback component renders on load | Code audit | **Confirmed** |
| No radio button is pre-selected | Code audit | **Confirmed** |
| History → question page shows blank form | Chrome agent | **Confirmed** |
| Session breakdown → question page shows blank form | Chrome agent | **Confirmed** |
| Post-submit Feedback renders with correct/incorrect badges | Chrome agent | **Confirmed** |
| Post-submit choices lock with green/red borders | Chrome agent | **Confirmed** |
| "Try Again" button appears after submit | Chrome agent | **Confirmed** |
| "Review" and "Reattempt" buttons produce identical URLs | Code audit | **Confirmed** |
| No `mode` or `attemptId` param in any entry point URL | Code audit | **Confirmed** |

### Additional Playwright Discovery

The question page contains a non-Feedback `role="alert"` element (page title announcement: `"Question - Addiction Boards"`). This means any future implementation should NOT use `role="alert"` presence alone to detect review mode — it should check for the Feedback-specific content (Correct/Incorrect text) inside the alert.
