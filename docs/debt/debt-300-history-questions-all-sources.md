# DEBT-300: History Questions Tab — Align Source Scope With Dashboard Recent Activity

**Priority:** P2
**Created:** 2026-03-10
**Status:** Open
**Related:** DEBT-299 (dashboard recent activity date label)

---

## Context

The Dashboard has two "recent" panels:

| Panel | Shows | Source scope |
|-------|-------|--------------|
| **Recent sessions** (left) | Session-level summaries | Tutor + Exam |
| **Recent activity** (right) | Recent attempt rows | Ad-hoc + Tutor + visible Exam attempts |

"View all" on Recent activity links to the History Questions tab (`/app/history?tab=questions`).

The History Questions tab **hardcodes** `source: 'adhoc'` at `app/(app)/app/history/page.tsx:87`, so it only shows sessionless attempts (`practiceSessionId = null`). In the current codebase, that bucket is broader than Quick Practice — it also includes standalone/review reattempts — but the History page subtitle and empty state currently market the tab as "Quick Practice questions."

This creates the core debt:

- Dashboard Recent activity can surface tutor or exam-origin questions.
- The linked History Questions tab only shows ad-hoc questions.
- A user can click from a broader recent-activity surface into a narrower history surface and lose the same questions they were just shown.

This debt is specifically about that **source-scope mismatch**. It is **not** about making Dashboard and History identical in every other way.

### Scope clarification

- **Dashboard Recent activity is attempt-level.** It shows recent attempts and may contain multiple rows for the same question over time.
- **History Questions is latest-attempt-per-question.** It shows one row per question based on the latest visible attempt for that question.
- **Source filtering follows latest visible attempt semantics.** A question appears under `source=tutor|exam|adhoc` only when its latest visible attempt matches that source; this is not an "ever seen in this source" ledger.
- **Active exam attempts remain excluded** by existing repository visibility rules. This debt does not change that behavior.
- **History Questions review links remain standalone history review** unless a separate follow-up changes them. This debt is about what rows appear on the tab, not about adding session-review navigation from this surface.

---

## Decision

**Show all currently eligible question sources in the History Questions tab by default.** Add a "Source" filter dropdown so users can narrow to a specific origin if they want.

For this doc, "all currently eligible question sources" means:

- `adhoc`
- `tutor`
- `exam`

Subject to existing visibility rules, which already exclude active exam attempts.

This was chosen over the alternative (restricting both Dashboard and History to ad-hoc only) because:

- It's additive — removes a restriction rather than adding one
- The filter infrastructure already exists (`SourceFilter` type, `parseSourceFilter`, `buildHistoryQuestionsHref` source param, Drizzle repository source filter logic)
- Dashboard Recent activity already shows a broader source mix than History Questions, so "View all" becomes directionally consistent
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

Import `type SourceFilter` from `history-search-params`, then wire `source` into `selectedSource`, `patchFilters`, and `hasActiveControls` in the same component.

Use the existing provenance language already shown on question rows (`Tutor session` / `Exam session` / `Ad-hoc practice`). Do **not** relabel `adhoc` as "Quick Practice" in the filter UI without a broader schema/product decision, because `adhoc` is not Quick Practice-only.

### 4. Update grid layout

The filter grid currently uses `lg:grid-cols-4` for four controls. With five filters, update to `lg:grid-cols-5` or consider a two-row layout on smaller screens.

### 5. Update copy

- **History page subtitle** (`history-page-client.tsx:39`): Change "Review completed sessions and your Quick Practice questions." → "Review completed sessions and your attempted questions."
- **Empty state** (`history-questions-tab.tsx:383`): Change "No Quick Practice questions yet. Questions from Tutor and Exam sessions can be reviewed from the Sessions tab." → "No questions attempted yet." (with a CTA to Practice)

### 6. No dashboard changes needed

Dashboard Recent activity already shows a broader source mix than History Questions today (ad-hoc + tutor + visible exam attempts). The page's "View all" link already points to `/app/history?tab=questions`, and the upstream dashboard stats use `listRecentByUserId(...)` with no explicit source filter. No dashboard JSX changes are required.

This still does **not** make Dashboard and History row-for-row identical, because Dashboard remains attempt-level while History Questions remains latest-attempt-per-question.

### 7. No repository/controller changes needed

- `src/adapters/controllers/review-controller.ts` already validates `source: z.enum(['tutor', 'exam', 'adhoc'])`
- `src/adapters/repositories/drizzle-attempt-repository.ts` already implements source filtering:
  - `adhoc` → `isNull(practiceSessionId)`
  - `tutor` / `exam` → `practiceSessions.mode = sourceFilter`
- This debt is a History page wiring + UI exposure change, not a repository-layer change

### 8. No review-navigation changes needed for this debt

The current History Questions card link is:

```tsx
toQuestionRoute(row.slug, {
  from: 'history',
  mode: 'review',
  historyHref,
});
```

This debt does **not** change that review-link contract. If we later decide that tutor/exam-origin rows on the Questions tab should deep-link into session review with `sessionId`, that is a separate follow-up.

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
- Add/adjust a test that `Clear filters` drops `source` from the generated History Questions href
- Update empty state test to match new copy

### `app/(app)/app/history/history-search-params.test.ts`

- `parseSourceFilter` is already tested (line 142). `buildHistoryQuestionsHref` already handles `source` in the URL (line 214). No new tests needed here unless filter interaction changes.

---

## Acceptance Criteria

- [ ] History Questions tab no longer hardcodes `source: 'adhoc'`
- [ ] History Questions tab shows all eligible questions by default (ad-hoc + tutor + exam, still subject to existing active-exam exclusion)
- [ ] "Source" filter dropdown added with options: All sources, Ad-hoc practice, Tutor session, Exam session
- [ ] Selecting a source filter narrows the list and appears in the URL as `&source=adhoc|tutor|exam`
- [ ] "Clear filters" resets source along with other filters
- [ ] Page subtitle updated to reflect all-source scope
- [ ] Empty state copy updated (no longer references "Quick Practice" specifically)
- [ ] Dashboard "View all" → History Questions is aligned on source scope (the destination no longer drops tutor/exam rows solely because of an ad-hoc-only filter)
- [ ] Existing filter interactions (Result, Difficulty, Tag, Sort) unaffected
- [ ] History Questions remains latest-attempt-per-question; this debt does not convert it into an attempt ledger
- [ ] Source filter semantics remain "latest visible attempt per question," not "question was ever seen in this source"
- [ ] Current History Questions review-link behavior remains unchanged
- [ ] All unit tests updated and passing
- [ ] Visual verification: tutor/exam session questions appear in Questions tab with correct origin labels

## What This Does Not Change

- No changes to the History Sessions tab
- No changes to Dashboard Recent activity rendering or routing
- No changes to `review-controller.ts` schema validation
- No changes to `drizzle-attempt-repository.ts` source-filter semantics
- No changes to active-exam exclusion behavior
- No conversion of History Questions into an attempt-by-attempt activity feed
- No change from latest-attempt-per-question semantics to "any attempt ever from this source" semantics
- No changes to History Questions review links or session-review navigation wiring
