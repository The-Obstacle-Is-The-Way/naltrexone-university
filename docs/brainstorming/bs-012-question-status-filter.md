# BS-012: Question Status Filter for Practice & Quick Practice

**Date:** 2026-02-12
**Triggered by:** Product analysis of review/reattempt UX — discovered that the Practice Engine has no way to filter questions by attempt status (unanswered, incorrect, marked), which is a foundational feature in every major question bank (UWorld, AMBOSS, BoardVitals)
**Scope:** Add a Question Status filter to Practice session creation and Quick Practice
**Related:** BS-011 (History review wiring — deferred until this filter exists), SPEC-013 (Practice sessions), SPEC-019 (Practice UX redesign)

---

> **Status note:** This doc captures discovery + early design exploration. The implementation-ready
> decisions live in `docs/specs/spec-024-question-status-filter.md`.
>
> **UX caveat (2026-02-12):** The multi-select OR logic and "All" chip proposed here turned out to be confusing in practice. See [BS-013](./bs-013-status-filter-ux-confusion.md) for the open redesign discussion. Leading thought: default to unanswered, single-select Incorrect/Marked only, no "All" chip.

## The Problem

Users cannot target their practice to specific question statuses. There is no way to:

1. **Practice only unanswered questions** — to ensure you see every question in the bank
2. **Practice only incorrect questions** — to focus on weak areas (the #1 review strategy in medical education)
3. **Practice only marked/bookmarked questions** — to revisit flagged questions

Every major question bank (UWorld, AMBOSS, BoardVitals) provides a Question Status filter at session creation time. Without it:

- Users waste time re-answering questions they already got right
- There's no targeted review workflow for incorrect questions
- The History page becomes the only entry point for reattempting incorrects (which creates the UX confusion documented in BS-011 Bug A)

---

## Current State

### Practice Session Creation (`/app/practice`)

Current filters:
- **Mode:** Tutor / Exam
- **Questions:** Count (default 20)
- **Difficulty:** Easy / Medium / Hard (multi-select, leave empty = all)
- **Tags:** Exam Section, Substance, Topic, Treatment (collapsible groups)

Missing: **Question Status**

### Quick Practice (`/app/practice/quick`)

Current behavior:
- `selectNextQuestionId()` picks the least-recently-seen question from all published candidates
- **No user-facing filters at all** — no difficulty, no tags, no status. The page immediately serves a random question.

Missing: **Question Status filter** (and arguably difficulty/tag filters, but those are out of scope for this doc)

### Question Selection Logic

- Sessions: `listPublishedCandidateIds(filters)` → currently accepts `tagSlugs[]` and `difficulties[]`
- Quick Practice: `selectNextQuestionId()` → picks from all candidates, prioritizing least-recently-seen

Both paths need to accept a `status` filter that pre-filters the candidate pool.

---

## Proposed Design

### Practice Session Creation

Add a **Question Status** row between Mode and Difficulty:

```
Mode:       [Tutor] [Exam]    Questions: [20]
Status:     [Unanswered] [Incorrect] [Marked] [All]
Difficulty: [Easy] [Medium] [Hard]
Tags:       ...
```

**Behavior:**
- Toggle-chip UI, same style as Difficulty
- Order (left to right): Unanswered, Incorrect, Marked, All
- Default selection: **Unanswered** (not All — users should default to unseen questions)
- Multi-select: No — pick one status filter per session (simplifies question selection logic)
- "Leave empty to include all" hint text, consistent with Difficulty
- If selected status yields 0 candidates after other filters, show a message: "No questions match these filters"

**Status definitions:**
- **Unanswered:** Questions the user has never attempted (0 attempts)
- **Incorrect:** Questions where the user's most recent attempt was incorrect
- **Marked:** Questions the user has bookmarked (existing bookmark system)
- **All:** No status filter applied (current default behavior)

### Quick Practice

Add a status filter above the question area:

```
Quick Practice
Answer one question at a time.

Status: [Unanswered] [Incorrect] [Marked] [All]

[Question card...]
```

**Behavior:**
- Same toggle-chip UI as Practice
- Default: **Unanswered**
- Persists selection across questions within the same Quick Practice session (URL param or local state)
- `selectNextQuestionId()` respects the selected status when filtering candidates

---

## Implementation Sketch

### Domain Layer

No domain changes needed. Status filtering is a query concern (which questions to include), not a domain rule.

### Application Layer

1. **Extend `listPublishedCandidateIds` filters** to accept `status?: 'unanswered' | 'incorrect' | 'marked' | 'all'`
2. **Extend `selectNextQuestionId` filters** similarly for Quick Practice
3. Status resolution requires joining against `attempts` table (for unanswered/incorrect) or `bookmarks` table (for marked)

### Adapter Layer (Repository)

The repository query for candidate IDs needs to:
- **Unanswered:** `WHERE question.id NOT IN (SELECT questionId FROM attempts WHERE userId = ?)`
- **Incorrect:** Latest-attempt-per-question for the user, filtered to `isCorrect = false` (most recent attempt is incorrect). For example, Postgres `DISTINCT ON`:
  ```sql
  SELECT DISTINCT ON (question_id)
    question_id, is_correct
  FROM attempts
  WHERE user_id = ?
  ORDER BY question_id, answered_at DESC, id DESC
  ```
- **Marked:** `WHERE question.id IN (SELECT questionId FROM bookmarks WHERE userId = ?)`
- **All:** No additional filter (current behavior)

### Frontend

1. Add `QuestionStatusFilter` component (toggle chips, same pattern as difficulty)
2. Wire into Practice session creation form state
3. Wire into Quick Practice page state
4. Pass status to `startPracticeSession` / `selectNextQuestionId` server actions

---

## Severity / Priority

**High.** This is a foundational feature for any question bank product. It unblocks:
- Targeted review of incorrect questions (the primary study strategy)
- Clean separation of History (review-only) from Practice (attempt/reattempt)
- Future "Reset progress" feature (which would clear status back to Unanswered)

---

## Open Questions

1. **Multi-select vs single-select for Status?** Current proposal is single-select. Could allow multi-select (e.g., "Unanswered + Incorrect") but adds complexity. Start simple.
2. **Should "Incorrect" use most-recent-attempt or any-attempt?** Proposed: most recent attempt. If you got it wrong then right, it's no longer "Incorrect."
3. **Quick Practice status persistence:** URL param (`?status=unanswered`) or component state? URL param is shareable and survives refresh.
4. **Candidate count display:** Should the UI show how many questions match the current filter combination before starting? (e.g., "42 questions available") — nice to have, not required for v1.

---

## Deferred (Out of Scope)

- **History tab review/reattempt behavior** (BS-011 Bug A) — resolve after this filter exists
- **Reset progress feature** — separate brainstorming doc when needed
- **Advanced filters** (e.g., "not attempted in last 30 days") — future enhancement

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-12 | Question Status filter is prerequisite to resolving BS-011 Bug A | Without an alternative reattempt path, can't make History review-only |
| 2026-02-12 | Default to Unanswered, not All | Users should prioritize unseen questions; matches UWorld/AMBOSS default behavior |
| 2026-02-12 | Order: Unanswered, Incorrect, Marked, All | Frequency of use ordering — most users want Unanswered or Incorrect |
| 2026-02-12 | Scope to Practice + Quick Practice only | History stays untouched; this is a pure additive feature |
| 2026-02-12 | Confirmed via Playwright E2E audit (`brainstorming-audit.spec.ts`) | Practice page has no Status/Unanswered/Incorrect/Marked UI. Quick Practice has zero filters (not even difficulty or tags). |
