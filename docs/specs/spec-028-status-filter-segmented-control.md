# SPEC-028: Status & Difficulty Filter — Segmented Control Redesign

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Feature
**Date:** 2026-02-13
**Brainstorming:** `docs/brainstorming/bs-013-status-filter-ux-confusion.md`
**Supersedes:** Status filter portion of SPEC-024

---

## 1. Problem Statement

The status filter on Practice (`/app/practice`) and Quick Practice (`/app/practice/quick`) uses multi-select filter chips with invisible OR logic. Users read adjacent selected pills as AND (intersection), but the code applies OR (union) — an impossible combination for mutually exclusive progress states. Additionally:

1. **No default selection.** Nothing selected = all questions, the least targeted study mode.
2. **"Marked" conflates two dimensions.** Progress (unanswered/incorrect) is mutually exclusive per question; bookmarked is orthogonal. Same chip row implies they're peers.
3. **Empty-state ambiguity.** "Nothing selected" is ambiguous — hint text exists on Practice but not Quick Practice.
4. **Vocabulary mismatch.** "Marked" (chip), "Bookmark" (action button), "Bookmarks" (nav link) — three words for one concept.
5. **Quick Practice layout.** Filter sits above the page heading via `topContent`, making it feel like a site-level control.

### Bugs Found During Live Inspection (2026-02-13)

- **Missing hint text:** Practice shows "Leave empty to include all questions"; Quick Practice shows nothing.
- **Vocabulary mismatch:** "Marked" (chip), "Bookmark" (action button), "Bookmarks" (nav link) — three words for one concept.
- **Filter above heading:** `topContent` renders at line 120 of `practice-view.tsx`, before the `<h1>` at line 124.

All bugs are resolved naturally by this redesign.

---

## 2. Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Control type | Single-select segmented control | Inherently single-select; reuses existing Tutor/Exam component |
| Status segments | `Unanswered \| Incorrect \| Bookmarked` | Three study intents, one at a time |
| Status default | Unanswered (pre-selected) | Most common study intent; always-one-active eliminates empty-state ambiguity |
| "All" option | Killed | Not a study intent — nobody deliberately mixes all statuses |
| "Correct" segment | Deferred | Add as 4th segment when reset-question-bank feature is built |
| Vocabulary | "Marked" → "Bookmarked" | Matches "Bookmark" verb and "Bookmarks" nav link |
| Bookmark dimension | Flattened as peer segment | Two-row layout is over-engineered; `/app/bookmarks` page handles cross-filtering |
| Difficulty control | Also segmented: `All \| Easy \| Medium \| Hard` | Consistency; "All" warranted because mixing difficulties IS valid |
| Difficulty default | All | Default study intent for difficulty is "no preference" |
| URL params (Quick Practice) | Single value (`?status=incorrect`); omit when Unanswered | Multi-value no longer needed |
| Quick Practice layout | Filter below heading | Move from `topContent` to `belowHeadingContent` |
| Hint text | Removed | Unnecessary when something is always selected |

---

## 3. Detailed Design

### 3.1 Domain Value Object Change

**File:** `src/domain/value-objects/question-progress-status.ts`

**Before:**
```typescript
export const AllQuestionProgressStatuses = [
  'unanswered',
  'incorrect',
  'marked',
] as const;
```

**After:**
```typescript
export const AllQuestionProgressStatuses = [
  'unanswered',
  'incorrect',
  'bookmarked',
] as const;
```

This is a rename (`marked` → `bookmarked`). All downstream types (`QuestionProgressStatus`, `isValidQuestionProgressStatus`) update automatically via `typeof`.

### 3.2 Zod Schema Update

**File:** `src/adapters/shared/zod-schemas.ts`

No code change needed — `zQuestionProgressStatus` is derived from `AllQuestionProgressStatuses`:
```typescript
export const zQuestionProgressStatus = z.enum(AllQuestionProgressStatuses);
```

This auto-updates when the value object changes. Verify with `pnpm typecheck`.

### 3.3 Repository Query Update

**File:** `src/adapters/repositories/drizzle-question-repository.ts` (~line 192)

**Before:**
```typescript
case 'marked':
```

**After:**
```typescript
case 'bookmarked':
```

The query logic (bookmark subquery) is unchanged — only the case label renames.

### 3.4 Display Label Update

**File:** `app/(app)/app/practice/practice-page-types.ts`

**Before:**
```typescript
export function statusDisplayLabel(status: QuestionProgressStatus): string {
  switch (status) {
    case 'unanswered':
      return 'Unanswered';
    case 'incorrect':
      return 'Incorrect';
    case 'marked':
      return 'Marked';
    default:
      return assertUnreachable(status);
  }
}
```

**After:**
```typescript
export function statusDisplayLabel(status: QuestionProgressStatus): string {
  switch (status) {
    case 'unanswered':
      return 'Unanswered';
    case 'incorrect':
      return 'Incorrect';
    case 'bookmarked':
      return 'Bookmarked';
    default:
      return assertUnreachable(status);
  }
}
```

### 3.5 Practice Filters Type Update

**File:** `app/(app)/app/practice/practice-page-types.ts`

**Before:**
```typescript
export type PracticeFilters = {
  tagSlugs: string[];
  difficulties: Array<NextQuestion['difficulty']>;
  statuses: QuestionProgressStatus[];
};
```

**After:**
```typescript
export type PracticeFilters = {
  tagSlugs: string[];
  difficulty: NextQuestion['difficulty'] | null;
  status: QuestionProgressStatus;
};
```

Key changes:
- `statuses: QuestionProgressStatus[]` → `status: QuestionProgressStatus` (single value, never empty)
- `difficulties: Array<...>` → `difficulty: ... | null` (single value, `null` = all)

### 3.6 Practice Session Starter — Replace Status Chips with Segmented Control

**File:** `app/(app)/app/practice/components/practice-session-starter.tsx`

**Status filter section (lines ~126-147) — Before:**
```tsx
<div>
  <div className="text-sm font-medium text-foreground">Status</div>
  <fieldset className="mt-2 flex flex-wrap gap-2 border-0 p-0 m-0" aria-label="Status">
    {AllQuestionProgressStatuses.map((status) => (
      <FilterChip key={status} label={statusDisplayLabel(status)} selected={...} onClick={...} />
    ))}
  </fieldset>
  <div className="mt-1 text-xs text-muted-foreground">Leave empty to include all questions</div>
</div>
```

**After:**
```tsx
<div>
  <div className="text-sm font-medium text-foreground">Status</div>
  <div className="mt-2">
    <SegmentedControl
      options={AllQuestionProgressStatuses.map((s) => ({
        value: s,
        label: statusDisplayLabel(s),
      }))}
      value={props.filters.status}
      onChange={(value) =>
        props.onStatusChange(value as unknown as QuestionProgressStatus)
      }
      legend="Status"
    />
  </div>
</div>
```

**Difficulty filter section (lines ~149-172) — Before:**
```tsx
<div>
  <div className="text-sm font-medium text-foreground">Difficulty</div>
  <fieldset className="mt-2 flex flex-wrap gap-2 border-0 p-0 m-0" aria-label="Difficulty">
    {difficulties.map((difficulty) => (
      <FilterChip key={difficulty} label={...} selected={...} onClick={...} />
    ))}
  </fieldset>
  <div className="mt-1 text-xs text-muted-foreground">Leave empty to include all difficulties.</div>
</div>
```

**After:**
```tsx
<div>
  <div className="text-sm font-medium text-foreground">Difficulty</div>
  <div className="mt-2">
    <SegmentedControl
      options={[
        { value: 'all', label: 'All' },
        ...AllDifficulties.map((d) => ({
          value: d,
          label: d.charAt(0).toUpperCase() + d.slice(1),
        })),
      ]}
      value={props.filters.difficulty ?? 'all'}
      onChange={(v) => props.onDifficultyChange(v === 'all' ? null : v as QuestionDifficulty)}
      legend="Difficulty"
    />
  </div>
</div>
```

Both hint texts are removed.

### 3.7 Practice Session Start Hook — Update State Shape

**File:** `app/(app)/app/practice/hooks/use-practice-session-start.ts`

**Before (line ~36-40):**
```typescript
const [filters, setFilters] = useState<PracticeFilters>({
  tagSlugs: [],
  difficulties: [],
  statuses: [],
});
```

**After:**
```typescript
const [filters, setFilters] = useState<PracticeFilters>({
  tagSlugs: [],
  difficulty: null,
  status: 'unanswered',
});
```

### 3.8 Practice Session Start Logic — Update Toggle Handlers

**File:** `app/(app)/app/practice/practice-page-session-start.ts`

**Replace `createToggleStatusHandler`:**

Before: toggles status in array (multi-select).

After: sets a single status value:
```typescript
export function createStatusChangeHandler(input: {
  setFilters: (
    next: PracticeFilters | ((prev: PracticeFilters) => PracticeFilters),
  ) => void;
  setIdempotencyKey: (key: string) => void;
  createIdempotencyKey: () => string;
}): (status: PracticeFilters['status']) => void {
  return (status) => {
    input.setFilters((prev) => ({ ...prev, status }));
    input.setIdempotencyKey(input.createIdempotencyKey());
  };
}
```

**Replace `createToggleDifficultyHandler`:**

Before: toggles difficulty in array (multi-select).

After: sets a single difficulty or null:
```typescript
export function createDifficultyChangeHandler(input: {
  setFilters: (
    next: PracticeFilters | ((prev: PracticeFilters) => PracticeFilters),
  ) => void;
  setIdempotencyKey: (key: string) => void;
  createIdempotencyKey: () => string;
}): (difficulty: PracticeFilters['difficulty']) => void {
  return (difficulty) => {
    input.setFilters((prev) => ({ ...prev, difficulty }));
    input.setIdempotencyKey(input.createIdempotencyKey());
  };
}
```

### 3.9 Start Session — Convert Single Values to Array for Use Case

**File:** `app/(app)/app/practice/practice-page-session-start.ts` (in `startSession`)

The `StartPracticeSessionInput` use case still accepts arrays for `statuses` and `difficulties` (the backend supports multi-filter for other entry points). Convert at the call site:

```typescript
statuses: [filters.status],
difficulties: filters.difficulty ? [filters.difficulty] : [],
```

### 3.10 Controller Schema Update

**File:** `src/adapters/controllers/practice-schemas.ts`

The `StartPracticeSessionInputSchema` still accepts arrays — no change needed at the controller level. The schema is already correct for receiving `['unanswered']` as a single-element array.

Similarly, `QuestionFiltersSchema` in `question-controller.ts` still accepts arrays — no change needed.

### 3.11 Quick Practice — Replace Chips, Fix Layout, Update URL Params

**File:** `app/(app)/app/practice/quick/quick-practice-client.tsx`

**Major changes:**

1. **Replace multi-select URL params with single-value:**

**Before (`parseStatusParams`):**
```typescript
export function parseStatusParams(searchParams: SearchParamsLike): QuestionProgressStatus[] {
  const raw = searchParams.get('status');
  if (!raw) return [];
  return raw.split(',').filter(/* ... */);
}
```

**After (`parseStatusParam`):**
```typescript
export function parseStatusParam(searchParams: SearchParamsLike): QuestionProgressStatus {
  const raw = searchParams.get('status');
  if (raw && isValidQuestionProgressStatus(raw)) return raw;
  return 'unanswered';
}
```

Always returns a single value. Default is `'unanswered'`.

2. **Replace `buildQuickPracticeStatusHref`:**

**Before:** Toggles status in comma-separated list.

**After (`buildQuickPracticeStatusHref`):**
```typescript
export function buildQuickPracticeStatusHref(input: {
  searchParams: SearchParamsLike;
  status: QuestionProgressStatus;
}): string {
  const nextParams = new URLSearchParams(input.searchParams.toString());
  if (input.status === 'unanswered') {
    nextParams.delete('status'); // unanswered is the default, no param needed
  } else {
    nextParams.set('status', input.status);
  }
  const qs = nextParams.toString();
  return qs.length > 0
    ? `${ROUTES.APP_PRACTICE_QUICK}?${qs}`
    : ROUTES.APP_PRACTICE_QUICK;
}
```

3. **Replace filter chips with segmented control and move below heading:**

**Before:** `topContent` prop with `FilterChip` components.

**After:** Replace `topContent` with `belowHeadingContent` (new prop on `PracticeView`):
```tsx
<PracticeView
  title="Quick Practice"
  description="Answer one question at a time."
  belowHeadingContent={
    <div className="mt-4">
      <SegmentedControl
        options={AllQuestionProgressStatuses.map((s) => ({
          value: s,
          label: statusDisplayLabel(s),
        }))}
        value={status}
        onChange={(s) => {
          const href = buildQuickPracticeStatusHref({
            searchParams,
            status: s as QuestionProgressStatus,
          });
          router.push(href, { scroll: false });
        }}
        legend="Status"
      />
    </div>
  }
  // ... rest of props
/>
```

4. **Update filters construction:**

**Before:**
```typescript
const filters: PracticeFilters = useMemo(() => ({
  tagSlugs: EMPTY_TAG_SLUGS,
  difficulties: EMPTY_DIFFICULTIES,
  statuses,
}), [statuses]);
```

**After:**
```typescript
const filters: PracticeFilters = useMemo(() => ({
  tagSlugs: EMPTY_TAG_SLUGS,
  difficulty: null,
  status,
}), [status]);
```

### 3.12 PracticeView — Add `belowHeadingContent` Prop

**File:** `app/(app)/app/practice/components/practice-view.tsx`

Add a new optional prop `belowHeadingContent?: React.ReactNode` to `PracticeViewProps`. Render it after the heading block (after line ~130), before the question card area:

```tsx
{props.topContent}
<div>
  <div className="flex flex-col gap-3 ...">
    <div>
      <h1 ...>{title}</h1>
      <p ...>{description}</p>
    </div>
    {/* ... buttons */}
  </div>
  {props.belowHeadingContent}
</div>
```

Keep `topContent` as-is (it is used by the practice session page to render the question navigator above the heading). Quick Practice should move from `topContent` → `belowHeadingContent`.

### 3.13 Practice Question Loading — Convert Filters for Controller

**File:** `app/(app)/app/practice/practice-page-logic.ts` (in `loadNextQuestion` / `createLoadNextQuestionAction`)

The `getNextQuestion` server action expects `filters.statuses` and `filters.difficulties` as arrays (see `QuestionFiltersSchema` in `question-controller.ts`). Convert the single-select UI values at the call site:

```typescript
const serverFilters = {
  tagSlugs: filters.tagSlugs,
  difficulties: filters.difficulty ? [filters.difficulty] : [],
  statuses: [filters.status],
};

// When calling getNextQuestion:
requestInput: { filters: serverFilters },
```

### 3.14 Question Repository Port — Update JSDoc

**File:** `src/application/ports/question-repository.ts`

Update the JSDoc comment that says `Status values (unanswered, incorrect, marked)` to say `(unanswered, incorrect, bookmarked)`.

---

## 4. Files Summary

### Modified Files

| File | Change |
|------|--------|
| `src/domain/value-objects/question-progress-status.ts` | Rename `'marked'` → `'bookmarked'` |
| `src/domain/value-objects/question-progress-status.test.ts` | Update test expectations |
| `src/adapters/repositories/drizzle-question-repository.ts` | Rename case `'marked'` → `'bookmarked'` |
| `src/adapters/repositories/drizzle-question-repository.test.ts` | Update test expectations |
| `src/application/ports/question-repository.ts` | Update JSDoc |
| `app/(app)/app/practice/practice-page-types.ts` | Rename case, change `PracticeFilters` shape |
| `app/(app)/app/practice/practice-page-types.test.ts` | Update tests for new type shape and label |
| `app/(app)/app/practice/practice-page-session-start.ts` | Replace toggle handlers with set handlers |
| `app/(app)/app/practice/hooks/use-practice-session-start.ts` | Update initial state shape |
| `app/(app)/app/practice/components/practice-session-starter.tsx` | Replace FilterChips with SegmentedControl for Status and Difficulty |
| `app/(app)/app/practice/components/practice-session-starter.test.tsx` | Update to expect segmented controls |
| `app/(app)/app/practice/quick/quick-practice-client.tsx` | Replace chips with segmented control, fix layout, single-value URL params |
| `app/(app)/app/practice/quick/quick-practice-client.test.tsx` | Update URL param tests, layout assertions |
| `app/(app)/app/practice/components/practice-view.tsx` | Add `belowHeadingContent` prop (keep existing `topContent`) |
| `app/(app)/app/practice/components/practice-view.test.tsx` | Update layout assertions |
| `app/(app)/app/practice/practice-page-logic.ts` | Convert single filter values to arrays for `getNextQuestion` |
| `src/adapters/controllers/practice-controller.test.ts` | Update `'marked'` → `'bookmarked'` in test data |
| `src/adapters/controllers/question-controller.test.ts` | Update `'marked'` → `'bookmarked'` in test data |

### No New Files

The segmented control component already exists at `components/ui/segmented-control.tsx`.

---

## 5. Test Plan

### 5.1 Domain Layer (Vitest)

**File:** `src/domain/value-objects/question-progress-status.test.ts`

```
- AllQuestionProgressStatuses includes 'bookmarked' (not 'marked')
- isValidQuestionProgressStatus('bookmarked') returns true
- isValidQuestionProgressStatus('marked') returns false
```

### 5.2 Repository Layer (Vitest)

**File:** `src/adapters/repositories/drizzle-question-repository.test.ts`

```
- listPublishedCandidateIds with status 'bookmarked' returns bookmarked questions
- (existing tests updated from 'marked' to 'bookmarked')
```

### 5.3 Controller Layer (Vitest)

**Files:** `practice-controller.test.ts`, `question-controller.test.ts`

```
- Zod schema accepts 'bookmarked' as a valid status
- Zod schema rejects 'marked' as an invalid status
```

### 5.4 Practice Page Types (Vitest)

**File:** `app/(app)/app/practice/practice-page-types.test.ts`

```
- statusDisplayLabel('bookmarked') returns 'Bookmarked'
- statusDisplayLabel('marked') → compile error (not a valid type)
- PracticeFilters.status is a single QuestionProgressStatus (not an array)
- PracticeFilters.difficulty is QuestionDifficulty | null (not an array)
```

### 5.5 Practice Session Starter (Vitest — `renderToStaticMarkup`)

**File:** `app/(app)/app/practice/components/practice-session-starter.test.tsx`

```
- renders Status segmented control with Unanswered, Incorrect, Bookmarked segments
- renders Difficulty segmented control with All, Easy, Medium, Hard segments
- does NOT render "Leave empty to include all questions" hint text
- does NOT render "Leave empty to include all difficulties" hint text
- renders Status with legend="Status" for accessibility
- renders Difficulty with legend="Difficulty" for accessibility
- does NOT render FilterChip components for Status or Difficulty
```

### 5.6 Quick Practice Client (Vitest — `renderToStaticMarkup`)

**File:** `app/(app)/app/practice/quick/quick-practice-client.test.tsx`

```
- parseStatusParam returns 'unanswered' when no param present (default)
- parseStatusParam returns 'incorrect' when ?status=incorrect
- parseStatusParam returns 'unanswered' for invalid values
- parseStatusParam treats comma-separated legacy values as invalid and defaults to 'unanswered'
- buildQuickPracticeStatusHref omits ?status for 'unanswered' (default)
- buildQuickPracticeStatusHref sets ?status=incorrect for 'incorrect'
- buildQuickPracticeStatusHref sets ?status=bookmarked for 'bookmarked'
- buildQuickPracticeStatusHref preserves other query params
- renders segmented control below page heading (not above)
- renders 'Bookmarked' segment (not 'Marked')
```

### 5.7 Practice View Layout (Vitest — `renderToStaticMarkup`)

**File:** `app/(app)/app/practice/components/practice-view.test.tsx`

```
- renders belowHeadingContent after the heading, before question area
- renders topContent above the heading when provided
- does not render topContent if prop is not provided
```

### 5.8 Existing Test Suite

All 203 existing test files must continue to pass after the rename and type changes.

```bash
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build
```

---

## 6. Implementation Order

```
Phase 1: Domain Rename (RED → GREEN)
  1. Update question-progress-status.test.ts: 'marked' → 'bookmarked'
  2. Update question-progress-status.ts: 'marked' → 'bookmarked'
  3. Run pnpm typecheck — fix all compile errors cascading from the rename:
     - drizzle-question-repository.ts (case label)
     - practice-page-types.ts (switch case + display label)
     - All test files referencing 'marked'
  4. Run pnpm test --run — verify all 1348 tests pass

Phase 2: Practice Filters Type Change (RED → GREEN)
  5. Update practice-page-types.test.ts for new PracticeFilters shape
  6. Update PracticeFilters: statuses[] → status, difficulties[] → difficulty
  7. Fix compile errors in hooks, components, and logic files
  8. Add filters-to-array conversion where server actions are called
  9. Run pnpm typecheck && pnpm test --run

Phase 3: Practice Page — Segmented Controls (RED → GREEN)
  10. Update practice-session-starter.test.tsx: expect SegmentedControl, not FilterChip
  11. Replace Status FilterChips with SegmentedControl in practice-session-starter.tsx
  12. Replace Difficulty FilterChips with SegmentedControl
  13. Remove both hint text lines
  14. Update use-practice-session-start.ts initial state
  15. Replace toggle handlers with set handlers in practice-page-session-start.ts
  16. Run pnpm test --run

Phase 4: Quick Practice — Segmented Control + Layout Fix (RED → GREEN)
  17. Update quick-practice-client.test.tsx: new URL param tests, layout assertions
  18. Replace parseStatusParams → parseStatusParam (single value)
  19. Replace buildQuickPracticeStatusHref (single value)
  20. Replace FilterChips with SegmentedControl
  21. Add belowHeadingContent prop to PracticeView
  22. Move Quick Practice filter from topContent to belowHeadingContent
  23. Keep topContent for session navigator
  24. Run pnpm test --run

Phase 5: Full Verification
  25. pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build
  26. Manual smoke test on both pages
```

---

## 7. Acceptance Criteria

- [ ] Status filter on Practice page is a single-select segmented control: `Unanswered | Incorrect | Bookmarked`
- [ ] Status defaults to Unanswered on Practice page
- [ ] Difficulty filter on Practice page is a single-select segmented control: `All | Easy | Medium | Hard`
- [ ] Difficulty defaults to All on Practice page
- [ ] Status filter on Quick Practice is a single-select segmented control below the page heading
- [ ] Status defaults to Unanswered on Quick Practice (no URL param = Unanswered)
- [ ] Quick Practice URL uses single value: `?status=incorrect` (not comma-separated)
- [ ] "Marked" is renamed to "Bookmarked" in all filter labels
- [ ] Hint text "Leave empty to include all questions/difficulties" is removed from both pages
- [ ] The word "Marked" no longer appears in any filter chip or segmented control
- [ ] No `FilterChip` components are used for Status or Difficulty (Tags still use them)
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build` all pass

---

## 8. Non-Goals

- **"Correct" segment.** Deferred until reset-question-bank feature. Add as 4th segment then.
- **Tag filter changes.** Tags stay as multi-select filter chips. Different use case — tags are additive.
- **History page filters.** DEBT-206 handles the History Questions tab separately.
- **Backend schema changes.** Controller and use case schemas still accept arrays. Only the frontend narrows to single values.
- **`FilterChip` component deletion.** Still used for tag filters. Keep the component.
- **Cross-filtering (incorrect + bookmarked).** Deliberately excluded. `/app/bookmarks` page handles bookmark-focused study.

---

## 9. Risk Assessment

**Risk: Low.**

- Reuses an existing, tested component (`SegmentedControl`)
- No backend logic changes — only a domain value rename and frontend type narrowing
- The `marked` → `bookmarked` rename is a global find-and-replace with TypeScript compiler verification
- URL param change on Quick Practice is backwards-tolerant: old `?status=marked` URLs will default to `unanswered` (graceful degradation, not a crash)

**Migration note:** Old bookmarked URLs (`?status=marked`) will silently reset to the default. This is acceptable because Quick Practice URLs are not persisted or shared — they're ephemeral navigation state.

---

## 10. Related

- **BS-013** (Brainstorming) — Problem discovery, UX audit, and design decisions
- **BS-012** (Brainstorming) — Original status filter design (diverged in SPEC-024)
- **SPEC-024** (Archived) — Original status filter implementation (multi-select chips)
- **DEBT-206** — Client-side difficulty/tag filters on History tab (separate issue, not affected)
- **Segmented control:** `components/ui/segmented-control.tsx` (existing component with 8 passing tests)
