# BS-026: Bookmark Reattempt vs Review Mode Consistency

**Date:** 2026-02-20
**Triggered by:** Manual UX audit of the bookmarks page — clicking "Reattempt" opens a fresh attempt form instead of showing the previous answer, which is inconsistent with every other entry point in the system (Dashboard, History, Session Breakdown)
**Scope:** Bookmarks are the only entry point that bypasses review mode, creating a disjointed mental model for users who expect to see their previous answer before deciding to reattempt
**Related:** [SPEC-034](../_archive/specs/spec-034-review-mode-readonly-and-try-again-scoping.md) (Review Mode Read-Only & Try Again Scoping), [SPEC-023](../_archive/specs/spec-023-question-review-mode.md) (Question Review Mode), [BS-022](../_archive/brainstorming/bs-022-unanswered-question-review-handling.md), [BS-023](../_archive/brainstorming/bs-023-try-again-state-consistency.md)

---

## The Problem

### Inconsistent entry-point behavior

Every entry point in the system that lets a user revisit a previously answered question opens it in **review mode** — showing their previous answer, the correct answer, and the explanation. The sole exception is **Bookmarks**, which opens questions in **fresh attempt mode** (blank form, Submit button, no feedback).

| Entry Point | URL Params | Mode | Shows Previous Answer? | Try Again Available? |
|-------------|-----------|------|----------------------|---------------------|
| Dashboard Recent Activity | `from=dashboard&mode=review&attemptId=...` | Review | Yes | Yes |
| History (individual question) | `from=history&mode=review` | Review | Yes | Yes |
| History (session breakdown) | `from=history&mode=review&sessionId=...` | Review (read-only) | Yes | No |
| Session Breakdown (post-end) | `from=practice&mode=review&sessionId=...` | Review (read-only) | Yes | No |
| **Bookmarks** | `from=bookmarks` | **Practice (fresh)** | **No** | **N/A (Submit button)** |

### What the user experiences

1. **Bookmarks page** says "Review questions you've bookmarked" — implying a review flow
2. Clicking "Reattempt" opens the question with subtitle "Reattempt a question from your bookmarks"
3. The question appears blank — no previous answer, no feedback, just a Submit button
4. This creates a **new standalone attempt** disconnected from any session context or prior attempt
5. After submitting, the user sees feedback and "Try Again" — but they could have seen their *previous* feedback first

Meanwhile, clicking the same question from the History page shows their last answer in review mode, with "Try Again" if they want a fresh attempt. The user gets *more context* from History than from their own curated bookmark list.

### Cross-context bookmark confusion

A bookmarked question can originate from any context:
- Tutor session (feedback shown immediately after each answer)
- Exam session (feedback shown after session ends)
- Quick Practice / ad-hoc question (feedback shown immediately)

Regardless of origin, the bookmark "Reattempt" flow strips all context and starts fresh. This means:
- A user who bookmarked a question they got wrong in an exam can't see *what* they got wrong from the bookmarks page
- A user who bookmarked for later review has to re-answer before seeing any feedback
- The bookmark becomes a "repeat practice" tool, not a "review and learn" tool

### Data model gap

The bookmark entity (`db/schema.ts`) stores only:
```
userId, questionId, createdAt
```

It does **not** store:
- Original session context (tutor/exam/ad-hoc)
- Original attempt outcome (correct/incorrect)
- Original attempt ID (for linking to the specific review)

However, this gap is not a blocker — `GetPreviousAttemptUseCase` already resolves the latest attempt by `(userId, questionId)` without needing a stored attempt ID. The bookmark page just needs to add `mode=review` to its links.

---

## Root Cause Analysis

### Code trace: why bookmarks skip review mode

**Bookmarks page** (`app/(app)/app/bookmarks/page.tsx`, lines 92-94 and 139-141):
```typescript
toQuestionRoute(row.slug, { from: 'bookmarks' })
// Produces: /app/questions/[slug]?from=bookmarks
// Missing: mode=review
```

**Question page client** (`app/(app)/app/questions/[slug]/question-page-client.tsx`, line 365):
```typescript
const parsedMode = parseQuestionMode(mode);
// mode is undefined → parsedMode is null → no review behavior triggered
```

**Controller** (`use-question-page-controller.ts`):
- When `mode` is null, `loadPreviousAttempt()` is never called
- Question loads in fresh attempt mode

**Origin UI** (`question-page-client.tsx`, lines 83-88):
```typescript
if (resolvedOrigin === 'bookmarks') {
  return {
    backHref: ROUTES.APP_BOOKMARKS,
    backLabel: 'Back to Bookmarks',
    subtitle: 'Reattempt a question from your bookmarks.',
  };
}
```

### Historical design decision

SPEC-023 (Question Review Mode, 2026-02-11) explicitly excluded bookmarks from review mode:
> "Bookmarks are for re-practicing, not reviewing."

This was a reasonable initial decision — bookmarks were conceived as a "practice again" shortcut. But after SPEC-034 unified review mode behavior across all other entry points, bookmarks now stand alone as the inconsistent outlier.

### E2E test codifies current behavior

`tests/e2e/review-mode-audit.spec.ts`, lines 294-308, explicitly asserts that bookmark links do **not** include `mode=review`. Any change will require updating this test.

---

## Live UX Audit Evidence (Chrome Agent, 2026-02-20)

A browser-level UX audit confirmed all code-trace findings and surfaced additional concrete observations:

### The "blind attempt tax"

In History/Dashboard, the user arrives at a pre-populated review state — previous answer highlighted, correct answer shown, full explanation visible, "Try Again" available. In Bookmarks, the user must first submit a blind attempt (choose an answer with no context, click Submit, wait for feedback) before reaching the same explained state. The user pays an interaction and cognitive cost for information that is immediately available from every other entry point.

### Bookmark cards show zero progress signal

After completing a reattempt from Bookmarks and returning to the Bookmarks page, the card is **unchanged** — same truncated stem, same difficulty badge, same bookmark date. There is no "last attempted" date, no correct/incorrect badge, no attempt count. The user cannot distinguish between a bookmark they've never touched and one they just answered correctly. In contrast, History and Dashboard list cards both show `Correct` (green) or `Incorrect` (red) inline.

### No answered-vs-unanswered differentiation

The bookmark list treats all bookmarks identically regardless of attempt history. A user studying for boards who bookmarks 50 questions has no way to see which ones they've already reviewed and which remain untouched — they must click into each one individually.

---

## Severity Assessment

**Severity:** Medium — UX inconsistency, not a data integrity bug

**Who is affected:**
- Any user who bookmarks questions for later review (the primary use case for bookmarks)
- Most impactful for users studying for boards who bookmark difficult questions to revisit

**How often:**
- Every bookmark interaction. The bookmarks page is a primary navigation target.

**User impact:**
- Confusion: "I bookmarked this to review, but it made me re-answer it"
- Lost learning opportunity: Users must re-answer before seeing their previous mistake ("blind attempt tax")
- Wasted effort: Creating unnecessary duplicate attempts for questions the user just wants to review
- No progress tracking: Bookmark cards show no indication of attempt history, making study prioritization impossible

---

## Proposed Fix (Sketch)

### Option A: Review-first bookmarks (Recommended)

Change bookmarks to behave like History individual question links:

1. **Bookmark links** → add `mode=review` to the URL
2. **Question page** → `loadPreviousAttempt()` triggers, showing previous answer + feedback
3. **Try Again** → available (no sessionId, so `canReattemptInContext()` returns true)
4. **Subtitle** → change from "Reattempt a question from your bookmarks" to "Reviewing a bookmarked question"
5. **Button label** → change from "Reattempt" to "Review" on the bookmarks page

**URL change:**
```
Before: /app/questions/[slug]?from=bookmarks
After:  /app/questions/[slug]?from=bookmarks&mode=review
```

**User flow:**
```
Bookmarks page → Click "Review" → See previous answer + feedback + explanation
                                 → Click "Try Again" if they want a fresh attempt
                                 → Or just read the explanation and go back
```

**Edge case — never-answered bookmark:**
If the user bookmarked a question but never answered it (e.g., bookmarked during a session but skipped it), `loadPreviousAttempt()` returns `null` and the page gracefully falls back to fresh attempt mode. No special handling needed — this is how review mode already works.

### Option B: Dual action (Review + Reattempt buttons)

Keep "Reattempt" as-is but add a "Review" button next to it:
- "Review" → opens in `mode=review` (see previous answer)
- "Reattempt" → opens in practice mode (fresh attempt)

**Downside:** Adds complexity, doubles the action surface, and most users probably want review-first anyway. The "Try Again" button already serves as the reattempt path from review mode.

### Option C: Status quo (do nothing)

Keep bookmarks as "reattempt only." Accept the inconsistency.

**Downside:** Bookmarks remain the only entry point that doesn't show previous context, and the page header saying "Review" while the action says "Reattempt" remains misleading.

---

## Implementation Scope (Option A)

### Files to change

| File | Change |
|------|--------|
| `app/(app)/app/bookmarks/page.tsx` | Add `mode: 'review'` to `toQuestionRoute()` calls; change button text "Reattempt" → "Review" |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Update `getOriginUi('bookmarks')` subtitle to "Reviewing a bookmarked question." |
| `tests/e2e/review-mode-audit.spec.ts` | Update bookmark test to assert `mode=review` IS present (flip the assertion) |
| Bookmark E2E test | Add review-mode assertions: feedback visible, Try Again visible, choice pre-selected |

### Files that need NO changes

- `GetPreviousAttemptUseCase` — already handles `(userId, questionId)` latest-attempt lookup
- `question-page-logic.ts` — `canReattemptInContext()` already returns true when no sessionId
- `use-question-page-controller.ts` — already calls `loadPreviousAttempt()` when `mode=review`
- `lib/routes.ts` — already supports `mode: 'review'` in `toQuestionRoute()`
- Bookmark domain entity / repository — no schema changes needed
- `GetBookmarksUseCase` — no changes needed (doesn't need attempt data; the question page handles that)

### Estimated touch points: 3-4 files, ~15 lines of code + E2E test updates

---

## Open Questions

1. **Should bookmarks show the last attempt outcome on the card itself?** Currently bookmark cards show only `difficulty` and `bookmarked date`. Adding a small badge like "Last: Correct" or "Last: Incorrect" would help users prioritize which bookmarks to review. This would require enriching `GetBookmarksUseCase` to join against the attempts table — a meaningful backend change beyond the URL-only fix. **Recommendation:** Defer to a follow-up enhancement. The review-mode URL change is the minimal fix.

2. **Should the bookmarks page header change from "Review questions you've bookmarked" to something else?** Currently it says "Review" but the action is "Reattempt." If we change to review-first mode, the header becomes accurate. No change needed.

3. **What about "Quick Practice" entry?** Quick Practice (`/app/practice/quick`) also opens questions in fresh attempt mode, but this is intentional — Quick Practice is explicitly a "new attempt" flow, not a "review" flow. No change needed there.

4. **Should "Remove" stay on the bookmarks page?** Yes — removing bookmarks is orthogonal to review vs reattempt. The user should still be able to unbookmark from the list.

5. **Question bank reset feature?** The user mentioned wanting a "reset all progress" feature. This is a separate concern (clearing all attempts for all questions) and should be tracked independently if desired. It doesn't block this bookmark consistency fix.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-11 | SPEC-023: Bookmarks excluded from review mode | "Bookmarks are for re-practicing, not reviewing" — valid initial stance |
| 2026-02-18 | SPEC-034: All other entry points unified under review mode | Dashboard, History, Session Breakdown all use `mode=review` with Try Again |
| 2026-02-20 | BS-026: Bookmarks should adopt review-first mode | After SPEC-034, bookmarks are the sole outlier; review-first with Try Again available gives users the best of both worlds |
