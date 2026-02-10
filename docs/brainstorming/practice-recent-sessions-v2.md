# Practice "Recent Sessions" Panel — Iteration 2

**Date:** 2026-02-09
**Scope:** ONLY the "Recent sessions" panel on `/app/practice` and the shared `SessionBreakdownList` component.
**Prerequisite:** PR #83 (Phase 1-4 from `practice-ux-audit.md`) must be merged first.
**Parent doc:** `practice-ux-audit.md` (Problems 5-7)

---

> **Note (2026-02-10): Superseded by `docs/specs/spec-021-history-page-restructure.md`.**
> SPEC-021 removes the Practice "Recent sessions" panel entirely in favor of `/app/history` (Sessions tab).
> Keep this doc as historical context only; do not implement it as future work.

## What We're Fixing

Three UX problems, all scoped to one component and its child:

| # | Problem | Severity | Files |
|---|---------|----------|-------|
| 5 | Breakdown renders below ALL sessions instead of inline | **High** — visually broken | `practice-session-history-panel.tsx` |
| 6 | No date on session rows | **Medium** — missing critical context | `practice-session-history-panel.tsx` |
| 7 | Breakdown status labels are flat/unstyled | **Low** — visual polish | `session-breakdown-list.tsx` |

---

## Current State (What the User Sees)

### Session Row (today)

```
┌────────────────────────────────────────────────────────────┐
│ Exam • 0/20 correct (0%) • 1m 2s         [Hide breakdown]  │
├────────────────────────────────────────────────────────────┤
│ Tutor • 0/20 correct (0%) • 19s           [View breakdown] │
├────────────────────────────────────────────────────────────┤
│ Tutor • 1/20 correct (100%) • 1m 20s      [View breakdown] │
├────────────────────────────────────────────────────────────┤
│ Tutor • 0/20 correct (0%) • 31s           [View breakdown] │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ Session breakdown                                          │
│ 1. In the COMBINE study... Answered Incorrect              │
│ 2. According to Vlad... Unanswered                         │
│ 3. A 72-year-old woman... Unanswered                       │
│ ...                                                        │
└────────────────────────────────────────────────────────────┘
```

**Problems visible:**
1. Breakdown at the bottom, disconnected from the "Exam" session that's selected
2. No dates — can't tell when sessions happened
3. "Answered Incorrect" and "Unanswered" labels blend into the question text

### Session Row (target)

```
┌────────────────────────────────────────────────────────────┐
│ Exam • 0/20 correct (0%) • 1m 2s • Feb 9  [Hide breakdown] │
│                                                            │
│  1. In the COMBINE study...          Answered · Incorrect  │
│  2. According to Vlad...                      Unanswered   │
│  3. A 72-year-old woman...                    Unanswered   │
│  ...                                                       │
├────────────────────────────────────────────────────────────┤
│ Tutor • 0/20 correct (0%) • 19s • Feb 9    [View breakdown]│
├────────────────────────────────────────────────────────────┤
│ Tutor • 1/20 correct (100%) • 1m 20s • Feb 8 [View ...]    │
├────────────────────────────────────────────────────────────┤
│ Tutor • 0/20 correct (0%) • 31s • Feb 8    [View breakdown]│
└────────────────────────────────────────────────────────────┘
```

**What changed:**
1. Breakdown is inline inside the selected session's `<li>`
2. Date shown on every session row (from `endedAt`)
3. Status labels are visually distinct (Correct = green, Incorrect = destructive, Unanswered = muted)

---

## Data Inventory

### Already available — no backend changes needed

**`SessionHistoryRow`** (from `get-session-history.ts`):
```typescript
{
  sessionId: string;
  mode: 'tutor' | 'exam';
  questionCount: number;
  answered: number;           // ❌ not displayed (could be useful)
  correct: number;
  accuracy: number;
  durationSeconds: number;
  startedAt: string;          // ❌ NOT DISPLAYED — adding this
  endedAt: string;            // ❌ NOT DISPLAYED — using for date
}
```

**`PracticeSessionReviewRow`** (from `get-practice-session-review.ts`):
```typescript
// Available variant:
{
  isAvailable: true;
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';   // ❌ not displayed (intentional per guard rail)
  order: number;
  isAnswered: boolean;
  isCorrect: boolean | null;
  markedForReview: boolean;  // ❌ not displayed
}
```

### Existing utilities — no new utils needed

- `formatDate(isoString)` in `lib/format-date.ts` → returns `"Feb 9, 2026"` format
- `formatDuration(seconds)` in `lib/format-duration.ts` → returns `"1m 2s"` format
- `getStemPreview(stemMd, length)` in `src/adapters/shared/stem-preview.ts`
- `toQuestionRoute(slug, { from })` in `lib/routes.ts`

---

## Implementation Plan

### Fix 5: Move Breakdown Inline

**File:** `app/(app)/app/practice/components/practice-session-history-panel.tsx`

**Current structure** (lines 64-130):
```tsx
{/* Session list */}
<ul>
  {props.rows.map((row) => (
    <li key={row.sessionId}>
      {/* session row content + button */}
    </li>
  ))}
</ul>

{/* Breakdown — OUTSIDE the list */}
{props.selectedSessionId ? (
  <div className="mt-4 space-y-3">
    <div>Session breakdown</div>
    {/* loading/error/data */}
    <SessionBreakdownList rows={...} />
  </div>
) : null}
```

**Target structure:**
```tsx
<ul>
  {props.rows.map((row) => {
    const isSelected = props.selectedSessionId === row.sessionId;
    return (
      <li key={row.sessionId}>
        {/* session row content + button */}

        {/* Breakdown — INSIDE the li, only for selected session */}
        {isSelected ? (
          <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
            {/* loading/error/data */}
            <SessionBreakdownList rows={...} />
          </div>
        ) : null}
      </li>
    );
  })}
</ul>
{/* Remove the old breakdown section entirely */}
```

**Key decisions:**
- Remove the "Session breakdown" heading — the context is obvious when it's inline
- Add a subtle `border-t` separator between the session row and its breakdown
- Loading/error states stay inline within the selected `<li>`

### Fix 6: Add Date to Session Rows

**File:** `app/(app)/app/practice/components/practice-session-history-panel.tsx`

**Change:** Add `formatDate(row.endedAt)` as a fourth bullet-separated segment in each session row.

**Current:**
```tsx
<span className="font-medium">{formatSessionMode(row.mode)}</span>
<span className="mx-2">•</span>
<span>{row.correct}/{row.questionCount} correct ({formatSessionAccuracy(row.accuracy)})</span>
<span className="mx-2">•</span>
<span>{formatDuration(row.durationSeconds)}</span>
```

**Target:**
```tsx
<span className="font-medium">{formatSessionMode(row.mode)}</span>
<span className="mx-2">•</span>
<span>{row.correct}/{row.questionCount} correct ({formatSessionAccuracy(row.accuracy)})</span>
<span className="mx-2">•</span>
<span>{formatDuration(row.durationSeconds)}</span>
<span className="mx-2">•</span>
<span>{formatDate(row.endedAt)}</span>
```

**Import:** Add `import { formatDate } from '@/lib/format-date';`

### Fix 7: Style Breakdown Status Labels

**File:** `app/(app)/app/practice/components/session-breakdown-list.tsx`

**Current** (lines 36-39):
```tsx
<span>{row.isAnswered ? 'Answered' : 'Unanswered'}</span>
{row.isAnswered && row.isCorrect !== null ? (
  <span>{row.isCorrect ? 'Correct' : 'Incorrect'}</span>
) : null}
```

**Target:**
```tsx
{row.isAnswered ? (
  <>
    {row.isCorrect === true ? (
      <span className="text-emerald-500">Correct</span>
    ) : row.isCorrect === false ? (
      <span className="text-destructive">Incorrect</span>
    ) : null}
  </>
) : (
  <span className="text-muted-foreground/60">Unanswered</span>
)}
```

**Design decisions:**
- Drop the "Answered" label entirely — if they see "Correct" or "Incorrect", it's obviously answered
- `Correct` → `text-emerald-500` (green, consistent with success patterns)
- `Incorrect` → `text-destructive` (red, uses existing design token)
- `Unanswered` → `text-muted-foreground/60` (even more muted, de-emphasize)
- **No badges/pills** — keep it as text to match the compact list style

---

## Test Plan

### Unit Test Updates

**`session-breakdown-list.test.tsx`:**
- Update assertion for "renders answered/unanswered and correct/incorrect status labels"
- Old: checks for "Answered" text → Remove (we're dropping "Answered" label)
- New: check for "Correct" text with appropriate class, "Incorrect" with destructive class, "Unanswered" text

### Browser Spec Updates

**`practice-session-history-panel.browser.spec.tsx`:**
- Update to verify breakdown renders **inside** the session row (not at bottom)
- Verify date is visible on session rows
- Verify toggling a different session moves the breakdown

### New Tests Needed

None — existing test files cover the right behaviors, they just need assertion updates.

---

## File Change Summary

| File | Change |
|------|--------|
| `practice-session-history-panel.tsx` | Move breakdown inline, add date to rows |
| `session-breakdown-list.tsx` | Style status labels (Correct/Incorrect/Unanswered) |
| `session-breakdown-list.test.tsx` | Update status label assertions |
| `practice-session-history-panel.browser.spec.tsx` | Update for inline breakdown + date |

**Backend changes:** NONE
**New files:** NONE
**Deleted files:** NONE

---

## Scope Boundary

**In scope:**
- Breakdown placement (inline under selected session)
- Date display on session rows
- Status label styling in breakdown list

**Out of scope (documented for later):**
- Session review mode / session replay page (see Open Question 4 in `practice-ux-audit.md`)
- Pagination / "Load more" for sessions
- Difficulty badges in breakdown rows
- `markedForReview` indicator in breakdown
- `answered` count display in session rows
- Cross-page consistency (Dashboard, Review, Bookmarks) — separate rail in `review-consistency-audit.md`

---

## Guard Rails

1. **Do NOT change the data contract** — `PracticeSessionHistoryPanelProps` shape stays the same
2. **Do NOT change the hook** — `usePracticeSessionHistory` logic is unchanged; we're only moving where the component renders the data it already receives
3. **Do NOT add new props** — the component already has `selectedSessionId`, `selectedReview`, `reviewStatus`, and `rows` with `startedAt`/`endedAt`
4. **Do NOT touch `SessionSummaryView`** — it uses the same `SessionBreakdownList` and will get the label styling for free, but its layout is fine (no inline placement issue)
5. **Stick to existing design tokens** — `text-destructive`, `text-muted-foreground`, `border-border` are established; only `text-emerald-500` is new (standard Tailwind green)

---

## Relationship to Other Docs

- **`practice-ux-audit.md`** — Problems 5, 6, 7 are defined there; this doc is the implementation spec
- **`review-consistency-audit.md`** — Guard rail 5 in that doc says "Do NOT add date metadata to the breakdown" — we're adding date to the *session row*, not the *breakdown question rows*; consistent with that rule
- **SPEC-019** — Already marked "Implemented"; this is polish iteration, not a new spec
