# Session Review Navigation Gap — Brainstorming

**Date:** 2026-02-11
**Last Verified:** 2026-02-12 (code audit)
**Triggered by:** Systematic audit of core user flows after SPEC-021/022/023 implementation
**Scope:** The "learn from mistakes" loop — what happens when a user finishes a session and wants to review their answers

---

> **Status note:** This gap is specced in `docs/specs/spec-027-session-review-navigation.md`.

## Why This Wasn't Found Earlier

Before answering "what's the gap," a note on *why* this required manual intervention to surface.

The gaps that became SPEC-021, SPEC-022, and SPEC-023 share a common trait: **each component works correctly in isolation, but the user journey between them is broken.** Code analysis alone (reading files, grepping for bugs, running tests) validates component behavior — it doesn't validate *transitions* between components. The question page renders correctly. The session summary renders correctly. The History page renders correctly. The *flow between them* is where the jank lives.

To catch these proactively, the right tool is **Playwright-driven user journey simulation** — not code analysis, not unit tests, but walking through the app as a real user would. "I just finished a 20-question exam. I got 14/20. I want to understand what I got wrong. Now what?" That question can't be answered by reading `session-summary-view.tsx`. It can only be answered by clicking through the app.

Going forward, every spec should be followed by a Playwright user journey audit that walks the complete flow end-to-end, including all navigation transitions, back buttons, and "what happens next?" at every dead-end.

---

## The Problem

**After completing a practice session, the "review your mistakes" flow is a disjointed, multi-page round-trip nightmare.**

After SPEC-023 lands, reviewing a *single* wrong answer works perfectly — the question page shows the previous answer highlighted, the correct answer, and the explanation. But reviewing *multiple* wrong answers from the same session requires the user to manually navigate back and forth between pages, losing context at every transition.

### The User's Mental Model

A physician who just finished a 20-question exam expects:

```
Complete exam → See score (14/20 = 70%) → Review wrong answers → Learn from mistakes → Done
```

This is the core learning loop. Every board prep platform (UWorld, AMBOSS, Anki) nails this. The user wants to step through their wrong answers one by one, reading each explanation, understanding why the correct answer is correct, and moving on to the next one.

### What Actually Happens (Post-SPEC-023)

```
1. Complete exam → Session Summary (14/20, 70%)
2. See "Question breakdown" list with 20 questions, 6 marked "Incorrect"
3. Click question #3 (Incorrect)
4.   → Navigates to /app/questions/placeholder-03?from=practice&mode=review
5.   → Shows previous answer highlighted + explanation (SPEC-023 works!)
6.   → Back link says "Back to Practice"
7. Click "Back to Practice"
8.   → Navigates to /app/practice (the SESSION STARTER page)
9.   → Session summary is GONE. Context is LOST.
10. Navigate to History → Sessions → find the session → View breakdown
11. Scroll to find the next wrong answer (#7)
12. Click question #7
13.   → Opens in review mode (good)
14.   → Back link says "Back to History"
15. Click "Back to History"
16.   → Goes to /app/history (generic History page)
17.   → Session breakdown is collapsed. Have to find session again.
18. Repeat steps 10-17 for questions #11, #14, #18, #19
```

**Total navigation actions to review 6 wrong answers: ~36 clicks.** Should be: ~12 clicks (6 questions × 2: read + next).

### Why It's Broken

Three independent design decisions compound into a terrible experience:

1. **"Back to Practice" goes to `/app/practice`, not back to the session summary.** The `from=practice` origin maps to `ROUTES.APP_PRACTICE` (the session starter page). The session summary is at `/app/practice/[sessionId]`, but the question page URL carries no `sessionId`, so it cannot link back to the session route.

2. **The question page has no concept of sibling questions.** It loads one question by slug. It doesn't know what session it came from, what other questions are in that session, or what question comes next. There's no "Next question" or "Previous question" affordance.

3. **Session context is not carried through the URL.** When `SessionBreakdownList` generates links, it uses `toQuestionRoute(slug, { from: 'practice', mode: 'review' })`. There's no `sessionId` or `questionIndex` parameter. The question page is stateless with respect to its session origin.

---

## Current Architecture (Code Trace)

### Session Summary → Question Link

`session-summary-view.tsx:84` renders:
```tsx
<SessionBreakdownList rows={summaryReview.rows} />
```

`session-breakdown-list.tsx:24` generates links:
```tsx
<Link href={toQuestionRoute(row.slug, { from, mode: 'review' })} ... />
```
Default `from` is `'practice'`. No session context in the URL.

### Question Page Back Link

`question-page-client.tsx:60-66`:
```tsx
if (resolvedOrigin === 'practice') {
  return {
    backHref: ROUTES.APP_PRACTICE,     // '/app/practice' — NOT the session!
    backLabel: 'Back to Practice',
    subtitle: 'Review a question from your practice history.',
  };
}
```

### History → Session Breakdown → Question Link

Same `SessionBreakdownList` component, but with `from='history'`.
Back link goes to `/app/history` — not back to the specific session with its breakdown expanded.

### Missing: Sequential Navigation

`QuestionView` (question-page-client.tsx) has no props for:
- `sessionId` (which session this question belongs to)
- `sessionQuestions` (the list of questions in the session)
- `currentIndex` (where in the session this question is)
- `onNextQuestion` / `onPreviousQuestion` (navigation handlers)
- `nextQuestionSlug` / `prevQuestionSlug` (for link-based navigation)

---

## Related Open Items

| Source | Finding | Connection |
|--------|---------|------------|
| `bs-006-review-consistency-audit.md` I4 (archived) | Question page is a single-question dead end — no "Next Question" | Direct — this is the same problem for History/Bookmarks flows |
| `bs-006-review-consistency-audit.md` I5 (archived) | Session context is lost on question detail page | Direct — the question page doesn't carry sessionId |
| `bs-002-practice-engine-state-audit.md` Finding 14 (archived) | Exam review data stale after answering from review | Related — reviewing a question and then returning to exam review shows old data |
| `bs-002-practice-engine-state-audit.md` Finding 15 (archived) | "No more questions found" dead-end state | Related — end-of-session UX gaps |
| `bs-001-practice-ux-audit.md` Open Question 4 (archived) | Session review mode — "Should clicking a session breakdown open a session replay page?" | This is exactly the feature we need |

---

## Proposed Approach

### What We're Building

**Session-aware question navigation.** When a user clicks a question from a session breakdown (either from the Session Summary or from History), the question page should:
1. Know which session it belongs to
2. Show "Next question" / "Previous question" navigation within the session
3. Have a "Back" link that returns to the session summary or History session breakdown — not to the generic Practice or History page
4. Optionally: filter to "Next wrong answer" / "Previous wrong answer" for focused review

### Two Approaches

#### Approach A: URL-Driven Sequential Navigation (Recommended)

**How it works:** Carry session context in the URL. The question page receives the session ID and uses it to fetch the session's question list for navigation.

**URL format:**
```
/app/questions/{slug}?from=practice&mode=review&sessionId={uuid}
```

Or for History-originated review:
```
/app/questions/{slug}?from=history&mode=review&sessionId={uuid}
```

**What changes:**

1. **`toQuestionRoute`** gains an optional `sessionId` param
2. **`SessionBreakdownList`** passes the session ID to link generation
3. **Question page server component** extracts `sessionId` from searchParams
4. **`useQuestionPageController`** receives `sessionId`, fetches the session's question list via a new controller action
5. **`QuestionView`** renders prev/next navigation when session context is available
6. **Back link** when `sessionId` is present:
   - `from=practice` → `/app/practice/{sessionId}` (back to session, which shows summary if ended)
   - `from=history` → `/app/history?tab=sessions` (back to History sessions)

**Advantages:**
- Fully URL-driven — works with browser back/forward
- Shareable URLs (a user could share "review question 3 from my exam session")
- No new pages — reuses existing question page
- Session question list is already available via `getPracticeSessionReview`

**Disadvantages:**
- Adds URL complexity (more params)
- Requires a controller action to fetch session question list from the question page

#### Approach B: Dedicated Session Review Page

**How it works:** A new route `/app/practice/{sessionId}/review` that renders all session questions inline with explanations, scrollable on one page.

**What it shows:**
- Session stats at the top (same as Session Summary)
- Each question rendered sequentially: stem → user's answer (highlighted) → correct answer → explanation
- Scroll-based navigation (all questions on one page)
- Optional filter: "Show only wrong answers"

**Advantages:**
- No navigation needed — everything on one page
- Closest to UWorld's post-session review experience
- Natural evolution of the Session Summary page

**Disadvantages:**
- New page/route to build
- Renders all question data at once (could be heavy for 50-question sessions)
- Doesn't integrate with the existing question-level review mode (SPEC-023)
- Duplicates rendering logic from `QuestionCard` + `Feedback`

### Recommendation: Approach A

**Rationale:** Approach A reuses everything we've already built. SPEC-023 created review mode. The question page already renders the post-answer state perfectly. All we need is to carry session context through the URL and add prev/next navigation. This is lower effort, fully consistent with existing patterns, and avoids creating a new page.

Approach B (dedicated review page) is the better UX for power users but requires more work and creates duplication. It can be built as a Phase 2 enhancement if Approach A proves insufficient.

---

## Detailed Design (Approach A)

### Layer 1: Routes

**File:** `lib/routes.ts`

Extend `toQuestionRoute` options:

```typescript
export function toQuestionRoute(
  slug: string,
  options?: {
    from?: QuestionOrigin;
    mode?: QuestionMode;
    sessionId?: string;     // ← NEW
  },
): string
```

When `sessionId` is present, append `&sessionId={uuid}` to the URL.

### Layer 2: Session Breakdown Links

**File:** `app/(app)/app/shared/components/session-breakdown-list.tsx`

Add `sessionId` prop:

```typescript
export function SessionBreakdownList({
  rows,
  from = 'practice',
  sessionId,            // ← NEW
}: {
  rows: PracticeSessionReviewRow[];
  from?: QuestionOrigin;
  sessionId?: string;   // ← NEW
})
```

Pass to link generation:
```tsx
<Link href={toQuestionRoute(row.slug, { from, mode: 'review', sessionId })} ... />
```

### Layer 3: Question Page Server Component

**File:** `app/(app)/app/questions/[slug]/page.tsx`

Extract `sessionId` from searchParams alongside `from` and `mode`.

### Layer 4: Question Page Client

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx`

**New props for `QuestionView`:**
```typescript
sessionNavigation?: {
  sessionId: string;
  questions: Array<{ slug: string; order: number; isCorrect: boolean | null }>;
  currentIndex: number;
} | null;
```

**Back link behavior change:**
When `sessionId` is present and `from=practice`:
```typescript
backHref: `/app/practice/${sessionId}`   // back to session (shows summary)
backLabel: 'Back to Session'
```

**Prev/Next navigation:**
When `sessionNavigation` is present, render:
```tsx
<div className="flex items-center gap-4">
  {prev ? <Link href={toQuestionRoute(prev.slug, { from, mode: 'review', sessionId })}>
    ← Previous
  </Link> : null}
  <span className="text-sm text-muted-foreground">
    Question {currentIndex + 1} of {total}
  </span>
  {next ? <Link href={toQuestionRoute(next.slug, { from, mode: 'review', sessionId })}>
    Next →
  </Link> : null}
</div>
```

**Optional enhancement:** "Next wrong answer" button that skips correct questions.

### Layer 5: Controller + Use Case

**File:** `src/adapters/controllers/question-view-controller.ts`

New action: `getSessionQuestionList(sessionId)` that returns the session's questions with their order, slug, and correctness. This reuses `GetPracticeSessionReviewUseCase` data.

### Layer 6: Session Summary Integration

**File:** `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

Pass `sessionId` to `SessionBreakdownList`:
```tsx
<SessionBreakdownList rows={summaryReview.rows} sessionId={summary.sessionId} />
```

This requires `EndPracticeSessionOutput` to include `sessionId` (it may already — the session URL provides it).

### Layer 7: History Sessions Integration

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx` (or wherever session breakdown is rendered)

Pass `sessionId` to `SessionBreakdownList` from the expanded session row.

---

## What This Fixes

| Before | After |
|--------|-------|
| Click question from session → review → "Back to Practice" → LOST | Click question from session → review → "Back to Session" → session summary |
| No way to go to next question in session review | "Next →" link goes to next question, preserving session context |
| Reviewing 6 wrong answers: ~36 clicks | Reviewing 6 wrong answers: ~12 clicks (open first + 5 "Next") |
| No indication of session position | "Question 3 of 20" shown during review |
| History breakdown → question → "Back to History" → breakdown collapsed | History breakdown → question → "Back to History" → (still loses breakdown state, but this is a minor issue) |

---

## What We're NOT Building

1. **Dedicated session review page** (`/app/practice/{sessionId}/review`) — Phase 2 if needed
2. **Question-level attempt history** ("You've attempted this 3 times") — separate future feature
3. **Auto-redirect to History after session end** — considered and rejected; the session summary page is the right landing spot
4. **Cross-session "Next question" from Dashboard or History Questions tab** — out of scope; this is specifically for session-context review
5. **Reattempt mode from session review** — "Try Again" in session review context is an open design question (does the new attempt belong to the session? probably not)
6. **Back-link state preservation for History** — making "Back to History" re-expand the right session breakdown requires URL state management that's not worth the complexity in v1

---

## Impact Assessment

**User-facing:** This is the second most impactful UX improvement after SPEC-023. SPEC-023 makes individual question review work. This spec makes *session-level* review work — the bread and butter of board prep study.

**Code scope:** Small-to-medium. No new components. No new use cases (reuses session review data). Changes are primarily in URL generation, prop threading, and adding prev/next navigation to the question page.

**Risk:** Low. Additive only — doesn't change any existing behavior. Session-unaware URLs still work exactly as before. The new navigation only appears when `sessionId` is in the URL.

---

## Entry Points That Should Carry Session Context

| Entry Point | Currently | Should Be |
|-------------|-----------|-----------|
| Session Summary → Breakdown → click question | `from=practice`, no sessionId | `from=practice`, `sessionId={id}` |
| History → Sessions → Breakdown → click question | `from=history`, no sessionId | `from=history`, `sessionId={id}` |
| Dashboard → Recent Sessions → click question | `from=dashboard`, no sessionId | `from=dashboard`, `sessionId={id}` |
| History → Questions → click question | `from=history`, no sessionId | **No change** — Questions tab is question-level, not session-level |
| Bookmarks → click question | `from=bookmarks`, no sessionId | **No change** — Bookmarks are not session-scoped |

---

## Verification Plan

After implementation, verify with Playwright:

1. **Flow 1: Session Summary → Sequential Review**
   - Complete a tutor session
   - From session summary, click first wrong answer
   - Verify review mode works (SPEC-023)
   - Verify "Next →" link navigates to next session question
   - Verify "Back to Session" returns to session summary (not practice landing page)
   - Step through all wrong answers sequentially

2. **Flow 2: History → Session Review**
   - Navigate to History → Sessions → View breakdown
   - Click a question from the breakdown
   - Verify review mode and session navigation work
   - Verify "Back" returns to History

3. **Flow 3: Non-session flows are unchanged**
   - Navigate to History → Questions → click a question
   - Verify NO session navigation appears (no prev/next)
   - Verify "Back to History" works as before
   - Same for Bookmarks and Dashboard Recent Activity (non-session rows)

---

## Priority

**P1 — Core user flow.** This directly impacts the core learning loop (answer → review → learn). Without it, the entire review infrastructure built across SPEC-021/022/023 is undermined by navigation friction. The data is there. The components are there. The *flow* is broken.

---

## Playwright Validation (2026-02-11)

**Test:** `tests/e2e/audit-history-spec.spec.ts`
**Screenshots:** `tests/e2e/screenshots/audit-01-*.png` through `audit-10-*.png`

### Test Flow

1. Sign in → ensure subscription
2. Start a tutor session with 2 questions
3. Answer both questions (both incorrect → 0/2, 0%)
4. End session → Session Summary
5. Click first question from the breakdown list
6. Inspect back link, sequential navigation, session context
7. Click back link → observe destination
8. Navigate to History → Sessions → View breakdown
9. Click question from History breakdown
10. Inspect back link from History entry point
11. Click back → observe whether breakdown stays expanded

### Results

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Breakdown link includes `sessionId` | **FAIL** | Href: `/app/questions/ciccarone-shoptaw-2022-002?from=practice&mode=review` — no `sessionId` param |
| 2 | Question opens in review mode (SPEC-023) | **PASS** | URL includes `mode=review`, subtitle says "Review a question from your practice history." |
| 3 | Back link goes to session summary | **FAIL** | Back link text: "Back to Practice", href: `/app/practice` — NOT `/app/practice/{sessionId}` |
| 4 | Back link does NOT go to `/app/practice` landing | **FAIL** | Back link href is exactly `/app/practice` |
| 5 | "Next question" sequential navigation present | **FAIL** | No session-aware next/prev navigation on question detail page |
| 6 | "Previous question" sequential navigation present | **FAIL** | No previous question navigation |
| 7 | Position indicator ("Question X of Y") present | **FAIL** | No position indicator rendered |
| 8 | History breakdown link includes `sessionId` | **FAIL** | Href: `/app/questions/ciccarone-shoptaw-2022-002?from=history&mode=review` — no `sessionId` |
| 9 | History back link goes to session breakdown | **FAIL** | Back link text: "Back to History", href: `/app/history` — generic History page |
| 10 | History breakdown stays expanded after back | **FAIL** | Breakdown collapses — no question links visible after navigating back |

### Summary

**9 out of 10 checks FAILED.** Only SPEC-023 review mode (check #2) passed.

Every gap described in this document is **confirmed by Playwright with screenshot evidence**:

- **Screenshot `audit-03`**: Session Summary page showing 2 questions, both Incorrect, with clickable breakdown links.
- **Screenshot `audit-04`/`audit-05`**: Question detail page after clicking breakdown link — shows "Back to Practice" link pointing to `/app/practice`, not session summary. No next/prev navigation. No position indicator.
- **Screenshot `audit-06`**: After clicking "Back to Practice" — lands on question page, not the session summary (navigation context fully lost).
- **Screenshot `audit-07`**: History → Sessions tab showing list of sessions with "View breakdown" buttons.
- **Screenshot `audit-08`**: History session breakdown expanded showing question links with Correct/Incorrect labels.
- **Screenshot `audit-09`**: Question from History breakdown — shows "Back to History" pointing to `/app/history` (generic). No session navigation.
- **Screenshot `audit-10`**: After clicking "Back to History" — History page but breakdown is collapsed, session context lost.

### Conclusion

The brainstorming document's analysis is **fully validated**. The three root causes identified (wrong back-link destination, no sequential navigation, no session context in URL) are all confirmed by the live application. The proposed fix (Approach A: URL-driven sequential navigation with `sessionId` param) remains the correct approach.
