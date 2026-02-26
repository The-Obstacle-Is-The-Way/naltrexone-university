# BUG-152: History Questions Tab Navigator Mismatch — Ad-Hoc Questions Grouped Into Fake Session

**Status:** Fixed (2026-02-26)
**Priority:** P1
**Date:** 2026-02-25
**Source:** [BS-034](../brainstorming/bs-034-history-questions-tab-review-navigator-mismatch.md)

---

## Description

When a user reviews any question from the **History → Questions** tab, ALL visible questions on the current page (up to 20) are bundled into a `historySeq` URL parameter. The question review page interprets this sequence as a navigable group and renders a Question Navigator — even when every question in the list is an independent ad-hoc question with no shared session.

**Observed behavior:**
1. User navigates to History → Questions tab — sees "Showing 1–20 of 49"
2. User clicks "Review" on any question
3. Question page shows "Question navigator" with **20 buttons** (matching page limit, not a session) and label "Question 1 of 20"
4. User can navigate between completely unrelated questions using the navigator
5. All navigator buttons are gray/neutral — no green/red color coding despite the user having answered these questions

**Two dimensions:**
- **Ad-hoc questions get a fake session:** Independent questions answered one-at-a-time are grouped into a navigable sequence. The navigator implies they belong together. They don't.
- **Tutor/Exam questions lose their real session context:** When reviewed from the Questions tab, session questions get `historySeq` instead of `sessionId` — no color coding, wrong question group, session relationship severed.

**Expected behavior:**
- Ad-hoc questions: standalone review (no navigator), identical to Dashboard review
- Tutor/Exam questions: reviewed from the Sessions tab only, with real session navigator and color-coded buttons

## Steps to Reproduce

1. Sign in and complete several Quick Practice questions across different topics
2. Navigate to **History → Questions** tab
3. Click "Review" on any question
4. Observe: Question Navigator appears with 20 buttons, "Question 1 of 20"
5. Click different navigator buttons — jumps between unrelated topics
6. Note: All buttons are gray (no correctness color coding)

## Root Cause

### 1. History Questions tab builds sequence from ALL visible rows

`app/(app)/app/history/components/history-questions-tab.tsx:192-196`:

```tsx
const historySequence = rows.flatMap((row) =>
  row.isAvailable ? [row.slug] : [],
);
const historySequenceParam =
  historySequence.length > 0 ? historySequence.join(',') : undefined;
```

Every available question on the current page is collected into one flat sequence — regardless of `sessionId`, `sessionMode`, or whether questions have any relationship.

### 2. Every review link gets the full sequence

`app/(app)/app/history/components/history-questions-tab.tsx:502-508`:

```tsx
const href = toQuestionRoute(row.slug, {
  from: 'history',
  mode: 'review',
  historyHref,
  historySeq: historySequenceParam,
  historyIndex: historyIndexBySlug.get(row.slug),
});
```

No check for `row.sessionId`. Ad-hoc and session questions get identical `historySeq` treatment.

### 3. Controller creates fake SessionNavigation from historySeq

`app/(app)/app/questions/[slug]/use-question-page-controller.ts:105-136`:

When `sessionId` is absent but `historySequence` is present, the controller builds a `SessionNavigation` object with `isCorrect: null` for all questions. This produces the navigator with all-gray buttons.

### 4. Navigator renders with neutral buttons

`app/(app)/app/questions/[slug]/components/review-question-navigator.tsx:46-81`:

Since `isCorrect` is `null`, every button renders `variant="outline"` — no green/red color coding.

## Fix (Decided: Position A — Ad-Hoc Only)

Scope the Questions tab to ad-hoc questions only. This eliminates both the navigator bug and the session context loss.

### Change 1: Filter query to ad-hoc only

**File:** `app/(app)/app/history/page.tsx:86-94`

Hardcode `source: 'adhoc'` in the `getAttemptedQuestions` call for the Questions tab:

```diff
 const [result, tagsResult] = await Promise.all([
   getAttemptedQuestionsFn({
     limit,
     offset,
     result: questionsFilters.result ?? undefined,
-    source: questionsFilters.source ?? undefined,
+    source: 'adhoc',
     difficulty: questionsFilters.difficulty ?? undefined,
     tagSlug: questionsFilters.tagSlug ?? undefined,
     sort: questionsFilters.sort ?? undefined,
   }),
   getTagsFn({}),
 ]);
```

The `GetAttemptedQuestions` use case already supports a `source` filter. The underlying `DrizzleAttemptRepository` already filters `isNull(latestAttemptRows.practiceSessionId)` for `source: 'adhoc'`.

### Change 2: Remove historySequence computation and historySeq from review links

**File:** `app/(app)/app/history/components/history-questions-tab.tsx`

Delete lines 192-199 (`historySequence`, `historySequenceParam`, `historyIndexBySlug` computation).

Simplify review links at lines 502-508:

```diff
 const href = toQuestionRoute(row.slug, {
   from: 'history',
   mode: 'review',
   historyHref,
-  historySeq: historySequenceParam,
-  historyIndex: historyIndexBySlug.get(row.slug),
 });
```

Every question on the tab is ad-hoc, so every review is standalone — no navigator.

### Change 3: Remove the Source filter dropdown

**File:** `app/(app)/app/history/components/history-questions-tab.tsx`

With only ad-hoc questions on the tab, the Source filter (All / Tutor / Exam / Ad-hoc practice) is unnecessary. Remove it from the UI. The remaining filters (Result, Difficulty, Tag, Sort) are still useful.

### Change 4: Update subtitle

**File:** `app/(app)/app/history/history-page-client.tsx:39`

```diff
-Review completed sessions and all attempted questions.
+Review completed sessions and your Quick Practice questions.
```

"Quick Practice" matches the nav bar label and tells users which mode's questions live on this tab.

### Change 5: Add empty state for zero ad-hoc questions

**File:** `app/(app)/app/history/components/history-questions-tab.tsx`

Users who have only done Tutor/Exam sessions will see an empty Questions tab. Add:

> *"No Quick Practice questions yet. Questions from Tutor and Exam sessions can be reviewed from the Sessions tab."*

## Affected Files

| File | Change |
|------|--------|
| `app/(app)/app/history/page.tsx` | Hardcode `source: 'adhoc'` in Questions-tab fetch |
| `app/(app)/app/history/components/history-questions-tab.tsx` | Remove `historySequence` computation. Simplify review links. Remove Source filter dropdown. Add empty state. |
| `app/(app)/app/history/components/history-questions-tab.test.tsx` | Update review link href expectations (no `historySeq`/`historyIndex`). Remove/update Source filter tests. |
| `app/(app)/app/history/history-search-params.ts` | Optional: remove `source` from `QuestionsFilters` UI type |
| `app/(app)/app/history/history-page-client.tsx` | Update subtitle text |
| `tests/e2e/session-review-navigation.spec.ts` | Update E2E test to assert standalone review (no navigator, no `historySeq`/`historyIndex`). Update empty-state matcher for new "No Quick Practice questions yet" message. |

**No changes needed to:**
- `use-question-page-controller.ts` — `historySeq` path remains as dead-code fallback
- `review-question-navigator.tsx` — unchanged, just won't be triggered from Questions tab
- `lib/routes.ts` — `toQuestionRoute` already supports simplified signature
- `get-attempted-questions.ts` — already supports `source` filter

## Verification

- [x] Questions tab shows only ad-hoc (Quick Practice) questions
- [x] Tutor/Exam questions do NOT appear on Questions tab
- [x] Clicking "Review" on a question shows standalone review (no navigator)
- [x] Sessions tab still shows Tutor/Exam sessions with correct navigator and color coding
- [x] Source filter dropdown is removed from Questions tab
- [x] Subtitle reads "Review completed sessions and your Quick Practice questions."
- [x] Empty state shown when user has zero ad-hoc questions
- [x] Review link `href` does NOT contain `historySeq` or `historyIndex` params
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test --run` passes
- [x] `pnpm build` succeeds

## Related

- [BS-034](../brainstorming/bs-034-history-questions-tab-review-navigator-mismatch.md) — brainstorming doc (full analysis)
- [SPEC-027](../_archive/specs/spec-027-session-review-navigation.md) — Session Review Navigation
- [SPEC-022](../_archive/specs/spec-022-question-log.md) — Question Log
- [BUG-151](../_archive/bugs/bug-151-card-row-affordance-inconsistency.md) — Card/Row Affordance (converted question cards to Pattern A)
