# BUG-020: Missing Review/Missed Questions Page — Dead Controller Code

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

The review controller (`getMissedQuestions`) is fully implemented but never called from any page. Users cannot review questions they got wrong — a core feature for a question bank app.

**Observed behavior:**
- User answers questions incorrectly
- User wants to review mistakes
- No "Missed Questions" or "Review" page exists
- Controller code exists but is dead code

**Expected behavior:**
- `/app/review` page showing incorrectly answered questions
- Ability to re-attempt missed questions
- Filtering by date range, difficulty, tags

## Steps to Reproduce

1. Navigate to `/app/practice`
2. Answer several questions incorrectly
3. Look for a "Review" or "Missed Questions" page
4. Observe: No such page exists
5. Search codebase: `getMissedQuestions` is never called from React

## Root Cause

**What exists:**
- `getMissedQuestions()` in review-controller.ts — complete ✓
- Container wiring `createReviewControllerDeps()` — complete ✓
- Pagination support — complete ✓

**What's missing:**
- `/app/(app)/app/review/page.tsx` — does not exist
- Server action export for `getMissedQuestions` — not exposed
- Navigation to review page — does not exist

The controller was built during the Clean Architecture implementation but never wired to UI.

## Fix

1. Create `/app/(app)/app/review/page.tsx`:
```typescript
export default async function ReviewPage() {
  const missed = await getMissedQuestions({ limit: 20, offset: 0 });
  return (
    <MissedQuestionsList questions={missed.data.questions} />
  );
}
```

2. Export `getMissedQuestions` as a server action

3. Add navigation link to review page

4. Implement re-attempt flow from review list

## Verification

- [ ] Page created at `/app/review`
- [ ] Page displays missed questions with pagination
- [ ] Can navigate to re-attempt a missed question
- [ ] Pagination works (load more / next page)
- [ ] Navigation link added to app layout
- [ ] E2E test: answer wrong → review → reattempt

## Related

- `src/adapters/controllers/review-controller.ts`
- SPEC-014: Review and Bookmarks
- BUG-018: Missing Bookmarks View Page (similar pattern)
