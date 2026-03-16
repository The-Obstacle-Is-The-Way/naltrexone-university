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

Additionally, after answering the last exam question, the bottom bar loses all forward-facing buttons. Submit disappears. On the actual last question, Next is already hidden. The only way to proceed is the `Review answers` button in the header, which is easy to miss.

---

## What We're Building

Two UI changes. Zero architectural changes. No new use cases, no new endpoints, no new route helpers.

### Change 1: Add "Review your answers" primary CTA to Session Summary

- Render an exam-only primary button labeled `Review your answers`
- Position it as the **first and most prominent** action button, before "Back to Dashboard"
- Link it to: `toQuestionRoute(firstSlug, { from: 'history', mode: 'review', sessionId })`
- Pass `from="history"` into the existing Session Summary `SessionBreakdownList` as well

**Key decision: use `from=history`, not `from=practice`.** In this route contract, `from` controls the review page's return destination and chrome, not literal browser provenance. Using `from=history` makes the return link say `Back to History` instead of `Back to Session`, which cleanly avoids the non-durable completed-session return path. The user already saw their stats on the summary screen; History is the natural endpoint after review.

**Important constraint:** Do not add the CTA and leave the existing summary breakdown links on `from=practice`. That would keep two different review routes on the same screen, and one of them would still point users back to the broken `Back to Session` target.

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

Also change the existing breakdown list on the Session Summary to use the same review origin:

```typescript
<SessionBreakdownList
  rows={summaryReview.rows}
  from="history"
  sessionId={summary.sessionId}
/>
```

That keeps every completed-session review entry point on the summary screen aligned to the same durable return destination.

Source files:
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:98-108` — action button row
- `lib/routes.ts:25-49` — `toQuestionRoute` helper
- `app/(app)/app/shared/components/session-breakdown-list.tsx:34-48` — existing review link pattern to follow
- `app/(app)/app/practice/[sessionId]/page.test.tsx:81-134` — existing summary-link expectation currently uses `from=practice` and must be updated

### Change 2: `practice-view.tsx`

In the bottom action bar, after the Submit button conditional and before the Next button conditional, add an exam-specific completion CTA. Key it off the authoritative session position, not navigator-derived `hasNextQuestion`.

```typescript
const isExamMode = sessionInfo?.mode === 'exam';
const isLastSessionQuestion =
  sessionInfo !== null &&
  typeof sessionInfo.index === 'number' &&
  typeof sessionInfo.total === 'number' &&
  sessionInfo.index >= sessionInfo.total - 1;

{props.submitResult && isExamMode && isLastSessionQuestion && props.onEndSession ? (
  <Button type="button" className="rounded-full" onClick={props.onEndSession}>
    Review answers
  </Button>
) : null}
```

**Do not use `hasNextQuestion === false` as the deciding condition.** In the current page composition, `hasNextQuestion` comes from the review navigator data, not from the authoritative `sessionInfo.index/total` session position. Navigator absence or filtering can make it `false` for reasons other than "the user is on the final session question."

Source files:
- `app/(app)/app/practice/components/practice-view.tsx:301-324` — bottom bar conditionals
- `app/(app)/app/practice/components/practice-view.tsx:90-92` — current exam-mode derivation from `sessionInfo`
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:235-236` — `onEndSession` already wired
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:147-164` — last-question auto-advance already keys off `sessionInfo.index/total`
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx:599-660` — existing tests show `hasNextQuestion` means "last available navigable question", not necessarily "last session question"

No new props are required for this minimal fix. `PracticeView` already receives `sessionInfo`, `submitResult`, and `onEndSession`.

---

## Known Issues Deferred (Not In This Fix)

| Issue | Why deferred |
|-------|-------------|
| Pre-submit "Open question" loses navigator context (Root Cause B) | Header "Review answers" works as escape hatch. Lower urgency. |
| Non-durable return path for other `from=practice` completed-session links (Root Cause E) | This fix should remove the problem from Session Summary entry points by using `from=history` there. Other practice-origin review links remain out of scope here. |
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
5. Session Summary breakdown links also use `from=history` when rendered from the summary screen.
6. CTA is NOT rendered when `review.rows` exists but contains no available question slug.
7. After the last exam question is submitted, bottom bar renders `Review answers` button.
8. `Review answers` bottom bar button calls `onEndSession` when clicked.
9. `Review answers` bottom bar button does NOT render for tutor mode.
10. `Review answers` bottom bar button does NOT render after a submitted answer on a non-final exam question, even if `hasNextQuestion` is false or omitted.
11. Summary error state still renders the existing alert text and omits the CTA.

### Manual QA

1. Complete a 2-question exam → submit → verify `Review your answers` appears as the first/primary button on Session Summary.
2. Click it → verify Q1 opens with explanations, question navigator, and `Back to History` in the review UI.
3. From the same Session Summary, click a question breakdown link → verify it also opens review with `Back to History` rather than `Back to Session`.
4. Navigate through all questions with Next/Previous → verify session navigation works.
5. Click `Back to History` → verify it goes to `/app/history?tab=sessions`, not a dead-end.
6. Submit question 1 of a 2-question exam → verify the app auto-advances to question 2 and does NOT expose a finish/review CTA on question 1.
7. After answering the last exam question, verify `Review answers` appears in the bottom bar.
8. Click the bottom-bar `Review answers` → verify it opens the Review Questions checklist.
9. Complete a tutor session → verify Session Summary does NOT show the new exam-only `Review your answers` CTA.
