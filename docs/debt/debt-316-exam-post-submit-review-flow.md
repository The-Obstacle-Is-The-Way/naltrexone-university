# DEBT-316: Exam Post-Submit Review Flow

**Priority:** P2
**Created:** 2026-03-15
**Status:** Open
**Source:** Manual QA + browser walkthrough + code audit + adversarial audit (2026-03-15/16)
**Scope:** Exam session post-submit flow and last-question bottom bar

---

## Problem

After submitting an exam, the student has never seen any explanations. The #1 thing they want is to review what they got right and wrong. But the Session Summary offers no obvious way to do that — the three explicit buttons are "Back to Dashboard", "View in History", and "Start another session".

There ARE clickable review links in the question breakdown list, but they are:
- **Lazy-loaded** — not available until a secondary fetch completes
- **Visually invisible as links** — no underline, no color differentiation, just a pointer cursor on hover (confirmed by browser walkthrough)

Additionally, after answering the last exam question, the bottom bar loses all forward-facing buttons (Submit disappears, Next was already hidden). The only way to proceed is the "Review answers" button in the header, which is easy to miss.

---

## What We're Building

Two UI changes. Zero architectural changes. No new use cases, no new endpoints, no new route helpers.

### Change 1: Add "Review your answers" primary CTA to Session Summary

- Render an exam-only primary button labeled `Review your answers`
- Position it as the **first and most prominent** action button, before "Back to Dashboard"
- Link it to: `toQuestionRoute(firstSlug, { from: 'history', mode: 'review', sessionId })`

**Key decision: use `from=history`, not `from=practice`.** This makes the return link on the question review page say "Back to History" instead of "Back to Session". This completely sidesteps the non-durable return path problem (the practice session page cannot rehydrate a completed summary on remount). The user already saw their stats on the summary screen — going to History after reviewing is a natural endpoint.

**Where to get `firstSlug`:** Use `summaryReview.rows` after the summary-review fetch completes. The CTA renders once the breakdown data is available (same timing as the existing breakdown links). If the fetch fails, the CTA doesn't render and the user falls back to the existing "View in History" path.

### Change 2: Add "Review answers" to the bottom bar after the last exam question

After the last answer is submitted in exam mode:
- Submit button disappears (existing behavior)
- Next button is hidden (existing behavior)
- **NEW:** Render a `Review answers` button in the bottom bar that calls the existing `onEndSession` handler

This reuses the existing handler — no new flow logic. The button just makes the finishing action visible where the user is already looking (bottom bar) instead of only in the header.

---

## Before / After User Flow

### Before (current)

```
Answer Q1 → auto-advance → Answer Q2 (last)
→ bottom bar: [Previous] [Bookmark] [Mark for review]     ← no obvious "finish" action
→ user must find "Review answers" in header
→ Review Questions checklist → Submit exam → Confirm
→ Session Summary
   [Back to Dashboard] [View in History] [Start another session]
   Question breakdown (lazy, links invisible)              ← no obvious review path
→ user must click "View in History" → find session → click into review
```

### After (with fix)

```
Answer Q1 → auto-advance → Answer Q2 (last)
→ bottom bar: [Previous] [**Review answers**] [Bookmark] [Mark for review]
→ click "Review answers" (bottom bar or header)
→ Review Questions checklist → Submit exam → Confirm
→ Session Summary
   [**Review your answers**] [Back to Dashboard] [View in History] [Start another session]
→ click "Review your answers"
→ Question 1 review (explanations, clinical pearl, why others wrong)
   [Practice Again] [Next] [Back to History]
→ Next → Question 2 review
   [Previous] [Try Again] [Back to History]
→ click "Back to History" when done
```

**Result:** One click from Session Summary to explanations. Clear bottom-bar CTA to finish the exam. No architectural changes needed.

---

## Implementation Details

### Change 1: `session-summary-view.tsx`

The `SessionSummaryView` component receives `summary` (with `sessionId` and `mode`) and `review` (with `rows` containing slugs). When `summary.mode === 'exam'` and a reviewable slug is available from `review.rows`, render the CTA:

```typescript
// Pseudocode — exact placement TBD by implementer
const firstReviewableSlug = review?.rows.find(r => r.isAvailable)?.slug;

// In the action button row, BEFORE "Back to Dashboard":
{summary.mode === 'exam' && firstReviewableSlug ? (
  <Button asChild className="rounded-full">
    <Link href={toQuestionRoute(firstReviewableSlug, {
      from: 'history',
      mode: 'review',
      sessionId: summary.sessionId,
    })}>
      Review your answers
    </Link>
  </Button>
) : null}
```

Source files:
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:98-108` — action button row
- `lib/routes.ts:25-49` — `toQuestionRoute` helper
- `app/(app)/app/shared/components/session-breakdown-list.tsx:34-48` — existing review link pattern to follow

### Change 2: `practice-view.tsx`

In the bottom action bar, after the Submit button conditional and before the Next button conditional, add an exam-specific completion CTA:

```typescript
// When: exam mode, answer submitted (submitResult exists), last question (no next)
{props.submitResult && props.hasNextQuestion === false && props.isExamMode && props.onEndSession ? (
  <Button type="button" className="rounded-full" onClick={props.onEndSession}>
    Review answers
  </Button>
) : null}
```

Source files:
- `app/(app)/app/practice/components/practice-view.tsx:301-324` — bottom bar conditionals
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:235-236` — `onEndSession` already wired

The `onEndSession` prop is already passed through from the page view. The only new prop needed is `isExamMode` and `onEndSession` on `PracticeView` if not already present (check existing props).

---

## Known Issues Deferred (Not In This Fix)

| Issue | Why deferred |
|-------|-------------|
| Pre-submit "Open question" loses navigator context (Root Cause B) | Header "Review answers" works as escape hatch. Lower urgency. |
| Non-durable return path for `from=practice` links (Root Cause E) | Sidestepped by using `from=history` for the new CTA. Existing breakdown links still have this issue but it's not made worse. |
| Summary-review fetch failure has no retry button (Root Cause F) | Edge case. User falls back to "View in History". |
| Auto-advance has no durable feedback (Claim 5) | Transient "Submitting..." exists. Polish concern. |
| "Submit" label overlap with "Submit exam" (Claim 6) | Different screens, low confusion risk. Polish concern. |

---

## Test Plan

### Unit Tests

1. Session Summary renders `Review your answers` CTA when `summary.mode === 'exam'` and a reviewable slug exists in `review.rows`.
2. CTA is NOT rendered for tutor sessions.
3. CTA is NOT rendered when `review` is null (loading/error state).
4. CTA links to `toQuestionRoute(firstSlug, { from: 'history', mode: 'review', sessionId })`.
5. After last exam question is submitted, bottom bar renders `Review answers` button.
6. `Review answers` bottom bar button calls `onEndSession` when clicked.
7. `Review answers` bottom bar button does NOT render for tutor mode.
8. `Review answers` bottom bar button does NOT render when there are more questions (`hasNextQuestion !== false`).

### Manual QA

1. Complete a 2-question exam → submit → verify `Review your answers` appears as the first/primary button on Session Summary.
2. Click it → verify Q1 opens with explanations, question navigator, and session navigation.
3. Navigate through all questions with Next → verify Previous/Next work and "Back to History" is the return link.
4. Click "Back to History" → verify it goes to `/app/history`, not a dead-end.
5. After answering the last exam question, verify `Review answers` appears in the bottom bar.
6. Click the bottom-bar `Review answers` → verify it opens the Review Questions checklist.
7. Complete a tutor session → verify Session Summary does NOT show "Review your answers" (or shows it demoted, TBD).
