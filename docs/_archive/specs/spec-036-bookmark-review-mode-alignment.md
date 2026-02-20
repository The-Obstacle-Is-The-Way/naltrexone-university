# SPEC-036: Bookmark Review Mode Alignment

**Date:** 2026-02-20
**Status:** Implemented
**Layer:** Feature
**Resolves:** BS-026
**Related:** SPEC-034 (Review Mode Read-Only & Try Again Scoping), SPEC-023 (Question Review Mode)

---

## Problem Statement

Bookmarks are the only revisit entry point that still opens questions in fresh-attempt mode, while Dashboard and History open in review mode. This creates inconsistent behavior and forces users to submit a new blind attempt from bookmarks to see feedback they can already see immediately from other entry points.

## Decision

Adopt **review-first bookmarks** (Option A): all bookmark question links will include `mode=review`, so bookmarks open in the same review-mode contract as Dashboard/History for previously answered questions. Reattempt remains available via the existing `Try Again` action from the loaded review state.

## Requirements

1. On `/app/bookmarks`, the bookmark card title link must navigate to `/app/questions/[slug]?from=bookmarks&mode=review`.
2. On `/app/bookmarks`, the bookmark action button must navigate to `/app/questions/[slug]?from=bookmarks&mode=review`.
3. The bookmark action button label must change from `Reattempt` to `Review`.
4. The bookmark action button aria-label must change from `Reattempt question: ...` to `Review question: ...`.
5. Clicking a bookmark link for a question with prior attempts must load review mode immediately: prior answer pre-selected, correct answer highlighted, feedback visible on load.
6. In bookmark review mode with prior attempt data, `Try Again` must be visible on load.
7. In bookmark review mode with prior attempt data, `Submit` must not be present on load.
8. In bookmark review mode with prior attempt data, `Back to Bookmarks` must remain visible.
9. Bookmark-origin subtitle on question page must change from `Reattempt a question from your bookmarks.` to `Reviewing a bookmarked question.`
10. For never-answered bookmarks, `mode=review` must fall back to fresh-attempt behavior: no pre-selected choice, no feedback on load, `Submit` visible.
11. Unavailable bookmark rows (`[Question no longer available]`) must remain unchanged: no Review button rendered.
12. No schema changes, repository changes, controller changes, or use-case changes are allowed for this spec.
13. Dashboard review behavior must remain unchanged (already review mode with `attemptId`).
14. History question-review behavior must remain unchanged (already review mode).
15. Session review read-only behavior must remain unchanged (no `Submit`, no `Try Again` when `sessionId` is present).
16. Bookmark cards must remain metadata-minimal in this spec: no correctness badge, no last-attempted date, no attempt count.
17. Quick Practice behavior must remain unchanged (fresh-attempt flow by design).
18. No question-bank reset or progress-reset functionality is included in this spec.

## Implementation

### Files to change

| File path | Exact change | Lines affected (approx.) |
|---|---|---|
| `app/(app)/app/bookmarks/page.tsx` | Add `mode: 'review'` to both `toQuestionRoute(row.slug, { ... })` calls used by the stem title link and action button link. Change action button text `Reattempt` -> `Review`. Change action aria-label prefix `Reattempt question:` -> `Review question:`. | ~92-94, ~139-145 |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | In `getOriginUi` bookmarks branch, change subtitle string to `Reviewing a bookmarked question.` | ~83-88 |
| `tests/e2e/review-mode-audit.spec.ts` | Replace/flip existing test `bookmarks links do not include mode=review` to assert bookmark links include `mode=review`, then click and assert review-mode-on-load state (feedback visible, `Try Again` visible, `Submit` absent, prior choice pre-selected). Keep loading guard before assertions. | ~294-340 |
| `app/(app)/app/bookmarks/page.test.tsx` | Update render assertions for bookmark action copy/aria and href generation to expect `mode=review` and `Review question:` labels. Update unavailable-bookmark negative assertion from `not.toContain('Reattempt')` to `not.toContain('Review question:')` (the word "Review" alone appears in the page header, so the negative assertion must target the aria-label prefix). | existing bookmark assertions section |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Update bookmarks-origin subtitle assertion from `'Reattempt a question from your bookmarks.'` to `'Reviewing a bookmarked question.'` | ~194 |

### Files confirmed unchanged

- `src/application/use-cases/get-previous-attempt.ts`: already resolves latest attempt by `(userId, questionId)` and supports review-mode load contract; no attempt/session wiring change needed.
- `app/(app)/app/questions/[slug]/use-question-page-controller.ts`: already calls `loadPreviousAttempt()` when `mode=review`; no new orchestration required.
- `app/(app)/app/questions/[slug]/question-page-logic.ts`: current submit/reattempt logic already yields correct review-first -> try-again flow for non-session contexts.
- `lib/routes.ts`: `toQuestionRoute` already supports `mode: 'review'`.
- `src/adapters/controllers/question-view-controller.ts`: existing review data path is sufficient; no API change.
- `src/application/use-cases/get-bookmarks.ts` and bookmark repositories: card data remains unchanged by design.
- `db/schema.ts`: no data-model changes required.

## Verification

### Unit tests

1. Update `app/(app)/app/bookmarks/page.test.tsx` to assert bookmark links render with `mode=review` in href for both title link and action link. Specifically, change `toQuestionRoute('q-1', { from: 'bookmarks' })` to `toQuestionRoute('q-1', { from: 'bookmarks', mode: 'review' })`.
2. Update `app/(app)/app/bookmarks/page.test.tsx` to assert action text is `Review` and aria label starts with `Review question:`.
3. Update the unavailable-bookmark test (`'renders unavailable bookmarks without a reattempt link'`) to use `expect(html).not.toContain('Review question:')` instead of `expect(html).not.toContain('Reattempt')`. The generic word "Review" appears in the page header ("Review questions you've bookmarked"), so the negative assertion must target the aria-label prefix to be meaningful.
4. Update `app/(app)/app/questions/[slug]/question-page-client.test.tsx` bookmarks-origin subtitle assertion from `'Reattempt a question from your bookmarks.'` to `'Reviewing a bookmarked question.'` (line ~194).
5. Ensure all updated tests keep React 19 + Vitest conventions already used in these files (no testing-library migration, no per-test timeout overrides).

### E2E tests

**Critical setup requirement:** The existing `ensureBookmarkExistsOnBookmarksPage()` helper bookmarks a question from Quick Practice **without ever answering it**. A review-mode click-through test requires a bookmarked question that has a prior attempt. The test must create a prior attempt before asserting review-mode state.

1. In `tests/e2e/review-mode-audit.spec.ts`, replace the bookmarks link assertion test (`'bookmarks links do not include mode=review'`, lines ~294-308) with a new test that covers both link assertions and click-through review state. Setup sequence:
   - Use `submitQuestionForOutcome(page, CORRECT_SLUG, 'Correct')` to create a prior attempt on a known seeded question.
   - Bookmark that question (navigate to it, click the Bookmark action bar button, confirm "Remove bookmark" appears).
   - Navigate to `/app/bookmarks`.
   - Assert all `a[href^="/app/questions/"]` links include `mode=review` (flipped from the old negative assertion).
2. After the link assertion, click through and assert review-mode-on-load state:
   - Wait for `Loading question` to be hidden before state assertions.
   - Assert URL contains `from=bookmarks` and `mode=review`.
   - Assert subtitle text `Reviewing a bookmarked question.` is visible.
   - Assert feedback is visible using existing pattern:
     - `page.locator('[role="alert"]').filter({ hasText: /^(Correct|Incorrect)/ })`
   - Assert `Try Again` button is visible.
   - Assert `Submit` button count is `0`.
   - Assert at least one radio is checked (previous answer restored).
3. Keep existing session-review assertions intact to ensure read-only behavior remains unaffected.

### Manual verification

1. Open `/app/bookmarks`.
2. Confirm first two bookmark links (stem + action) include `mode=review` and `from=bookmarks`.
3. Confirm action label is `Review`; remove action remains `Remove`.
4. Click `Review` on an already-answered bookmarked question.
5. Confirm:
   - subtitle is `Reviewing a bookmarked question.`
   - prior answer is selected
   - correct answer styling is visible
   - feedback/explanation panel is visible on load
   - `Try Again` is visible
   - `Submit` is not visible
6. Click `Try Again`.
7. Confirm fallback fresh-attempt state: no selected answers, no feedback, `Submit` visible.
8. Navigate back to `/app/bookmarks`; verify card metadata is unchanged (still only difficulty + bookmarked date).
9. Open `/app/history?tab=questions` and `/app/history?tab=sessions`; verify review-mode behavior remains unchanged.
10. For an unavailable bookmark row, confirm no `Review` action appears.

## Edge Cases

1. **Never-answered bookmark**
   - Behavior: `mode=review` requests previous attempt, receives `null`, page falls back to fresh attempt mode.
   - Expected UI: no selected choice, no feedback on load, `Submit` visible.
2. **Deleted/unpublished bookmarked question**
   - Behavior: bookmark list row renders unavailable state.
   - Expected UI: `[Question no longer available]`; no Review button.
3. **Bookmark origin from exam, tutor, or ad-hoc**
   - Behavior: bookmark review resolves by latest attempt for `(userId, questionId)` regardless of original source context.
   - Expected UI: consistent review-mode load contract across all origins.
4. **Session-scoped review protections**
   - Behavior: unchanged; routes with `sessionId` remain read-only.
   - Expected UI: no `Submit`, no `Try Again`, navigator visible.

## Migration / Rollback

1. **Data migration:** none.
2. **Release risk:** low; routing/query-param and copy updates only.
3. **Rollback plan:** revert the five changed files listed above.
4. **Post-rollback state:** bookmarks return to `from=bookmarks` fresh-attempt behavior, with old `Reattempt` copy.
