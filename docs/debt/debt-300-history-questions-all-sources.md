# DEBT-300: History Questions Tab — Show All Question Sources, Not Ad-Hoc Only

**Priority:** P2
**Created:** 2026-03-10
**Status:** Open
**Related:** DEBT-299 (dashboard recent activity date label)

---

## Context

The Dashboard has two "recent" panels:

| Panel | Shows | Source filter |
|-------|-------|---------------|
| **Recent sessions** (left) | Session-level summaries | Tutor + Exam |
| **Recent activity** (right) | Individual question attempts | All sources (ad-hoc + tutor + exam) |

"View all" on Recent activity links to the History Questions tab (`/app/history?tab=questions`).

The History Questions tab **hardcodes** `source: 'adhoc'` at `app/(app)/app/history/page.tsx:87`, so it only shows sessionless attempts (`practiceSessionId = null`). In the current codebase, that bucket is broader than Quick Practice — it also includes standalone/review reattempts — but the History page subtitle and empty state currently market the tab as "Quick Practice questions."

Questions answered inside Tutor or Exam sessions are invisible on the Questions tab, even though those same questions can appear on Dashboard Recent activity.

This creates two problems:

1. **IA inconsistency:** Dashboard Recent activity shows tutor/exam questions → user clicks "View all" → those questions disappear from the History Questions tab.
2. **Missing capability:** A user who got a question wrong in a tutor or exam session cannot find it later by searching by tag, difficulty, result, or source in the Questions tab. They must fall back to session-based review (or another surface like bookmarks/dashboard if the question still appears there).

### Why this matters for a question bank system

The atomic unit of value is the **question**, not the session. Sessions are batching containers. Every major question bank (UWorld, Amboss) provides a single unified question history with filters — no artificial separation by how the question was encountered.

---

## Decision

**Show all question sources in the History Questions tab by default.** Add a "Source" filter dropdown so users can narrow to a specific origin if they want.

This was chosen over the alternative (restricting both Dashboard and History to ad-hoc only) because:

- It's additive — removes a restriction rather than adding one
- The filter infrastructure already exists (`SourceFilter` type, `parseSourceFilter`, `buildHistoryQuestionsHref` source param, Drizzle repository source filter logic)
- Dashboard Recent activity already shows all sources, so "View all" becomes consistent
- If we change our mind, re-adding `source: 'adhoc'` is a one-line revert

---

## Code Changes

### 1. Remove hardcoded ad-hoc filter

`app/(app)/app/history/page.tsx:87`:

```tsx
// Before:
source: 'adhoc',

// After:
source: questionsFilters.source ?? undefined,
```

### 2. Parse source filter from search params

`app/(app)/app/history/page.tsx` — add `source` to `HistorySearchParams`, import `parseSourceFilter`, and thread the parsed value into `questionsFilters`:

```tsx
const questionsFilters: QuestionsFilters = {
  difficulty: parseDifficultyFilter(params.difficulty),
  tagSlug: parseTagSlugFilter(params.tag),
  result: parseResultFilter(params.result),
  source: parseSourceFilter(params.source),  // NEW
  sort: parseQuestionsSort(params.sort),
};
```

Add `source` to `HistorySearchParams` type:

```tsx
type HistorySearchParams = {
  // ... existing fields
  source?: string;  // NEW
};
```

### 3. Add "Source" filter dropdown to Questions tab UI

`app/(app)/app/history/components/history-questions-tab.tsx` — add a fifth filter control alongside Result, Difficulty, Tag, and Sort:

```tsx
<Select
  value={selectedSource ?? ALL_FILTER_VALUE}
  onValueChange={(value) =>
    applyFilter(
      patchFilters({
        source: value === ALL_FILTER_VALUE ? null : value as SourceFilter,
      }),
    )
  }
>
  <SelectTrigger id="history-questions-source" className="w-full" aria-label="Source">
    <SelectValue placeholder="All sources" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value={ALL_FILTER_VALUE}>All sources</SelectItem>
    <SelectItem value="adhoc">Ad-hoc practice</SelectItem>
    <SelectItem value="tutor">Tutor session</SelectItem>
    <SelectItem value="exam">Exam session</SelectItem>
  </SelectContent>
</Select>
```

Wire `source` into `selectedSource`, `patchFilters`, and `hasActiveControls` in the same component.

Use the existing provenance language already shown on question rows (`Tutor session` / `Exam session` / `Ad-hoc practice`). Do **not** relabel `adhoc` as "Quick Practice" in the filter UI without a broader schema/product decision, because `adhoc` is not Quick Practice-only.

### 4. Update grid layout

The filter grid currently uses `lg:grid-cols-4` for four controls. With five filters, update to `lg:grid-cols-5` or consider a two-row layout on smaller screens.

### 5. Update copy

- **History page subtitle** (`history-page-client.tsx:39`): Change "Review completed sessions and your Quick Practice questions." → "Review completed sessions and all attempted questions."
- **Empty state** (`history-questions-tab.tsx:383`): Change "No Quick Practice questions yet. Questions from Tutor and Exam sessions can be reviewed from the Sessions tab." → "No questions attempted yet." (with a CTA to Practice)

### 6. No dashboard changes needed

Dashboard Recent activity already shows all sources. The page's "View all" link already points to `/app/history?tab=questions`, and the upstream dashboard stats use `listRecentByUserId(...)` with no source filter. No dashboard JSX changes are required.

### 7. No repository/controller changes needed

- `src/adapters/controllers/review-controller.ts` already validates `source: z.enum(['tutor', 'exam', 'adhoc'])`
- `src/adapters/repositories/drizzle-attempt-repository.ts` already implements source filtering:
  - `adhoc` → `isNull(practiceSessionId)`
  - `tutor` / `exam` → `practiceSessions.mode = sourceFilter`
- This debt is a History page wiring + UI exposure change, not a repository-layer change

---

## Test Updates

### `app/(app)/app/history/page.test.tsx`

- Update existing assertions that verify `source: 'adhoc'` in the `getAttemptedQuestionsFn` call (lines 102, 295, 372, 451) to verify `source: undefined` (or the parsed value from search params)
- Add a test case: when `?source=tutor` is in search params, the controller call includes `source: 'tutor'`
- Add a test case: when no `source` param is present, the controller call includes `source: undefined`

### `app/(app)/app/history/components/history-questions-tab.test.tsx`

- Replace the existing `does not render a Source filter control` assertion (currently around line 256) with a positive Source-filter assertion
- Update the existing filter-control count assertions (currently expecting 4 triggers) to expect 5 triggers and include the `Source` label
- Add/adjust a test for the Source filter dropdown rendering with correct options: All sources, Ad-hoc practice, Tutor session, Exam session
- Update empty state test to match new copy

### `app/(app)/app/history/history-search-params.test.ts`

- `parseSourceFilter` is already tested (line 142). `buildHistoryQuestionsHref` already handles `source` in the URL (line 214). No new tests needed here unless filter interaction changes.

---

## Acceptance Criteria

- [ ] History Questions tab shows all questions by default (ad-hoc + tutor + exam)
- [ ] "Source" filter dropdown added with options: All sources, Ad-hoc practice, Tutor session, Exam session
- [ ] Selecting a source filter narrows the list and appears in the URL as `&source=adhoc|tutor|exam`
- [ ] "Clear filters" resets source along with other filters
- [ ] Page subtitle updated to reflect all-source scope
- [ ] Empty state copy updated (no longer references "Quick Practice" specifically)
- [ ] Dashboard "View all" → History Questions is now consistent (both show all sources)
- [ ] Existing filter interactions (Result, Difficulty, Tag, Sort) unaffected
- [ ] All unit tests updated and passing
- [ ] Visual verification: tutor/exam session questions appear in Questions tab with correct origin labels

## What This Does Not Change

- No changes to the History Sessions tab
- No changes to Dashboard Recent activity rendering or routing
- No changes to `review-controller.ts` schema validation
- No changes to `drizzle-attempt-repository.ts` source-filter semantics
