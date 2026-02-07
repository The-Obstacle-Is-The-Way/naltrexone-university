# DEBT-114: No Session History Page

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-06 (PR #64)
**Spec Mandate:** [SPEC-020](../specs/spec-020-practice-engine-completion.md) Phase 4

---

## SPEC-020 Reclassification

This debt item has been promoted from discretionary UX debt to a **spec-mandated requirement**. SPEC-019 previously listed session history as a P3 optional feature ("Recent Sessions (optional)"); it is now a required deliverable under SPEC-020 Phase 4 with a formal server action definition in master_spec.md section 4.5.13.

Implementation requires a new port method (`findCompletedByUserId`), a new use case (`GetSessionHistoryUseCase`), a new server action (`getSessionHistory`), and a UI section on the practice landing page.

**Phase:** 4 (Session History)
**Blocked by:** SPEC-020 Phase 3 (DEBT-113)
**Blocks:** None

---

## Description

There is no page in the application where users can view their completed practice sessions as a list. After finishing a tutor or exam session, the session effectively disappears — it becomes a set of individual attempts scattered across the Dashboard and Review pages with no session-level view.

Users cannot answer basic questions like:
- "How many exam sessions have I done this week?"
- "What was my score on yesterday's 20-question exam?"
- "Have my exam scores been improving over time?"

### Expected Behavior

A session history view (either a dedicated page or a section on the Practice landing page) that shows:

```
📊 Session History

Exam  • 15/20 (75%) • 45 min • Feb 6, 2026
Tutor • 8/10 (80%)  • 12 min • Feb 5, 2026
Exam  • 18/20 (90%) • 38 min • Feb 4, 2026
Tutor • 5/5 (100%)  • 8 min  • Feb 3, 2026

[View all →]
```

Each session entry should be clickable to view the per-question breakdown (leveraging `GetPracticeSessionReviewUseCase` which already exists).

---

## Impact

- Sessions are a first-class concept in the practice flow but invisible after completion.
- Users lose all session-level performance tracking.
- No way to compare exam scores over time — a core value proposition for board prep.
- The Practice landing page (`/app/practice`) only shows the session starter form and incomplete session resume — no history.

---

## Root Cause

### What Exists

| Asset | Status | Notes |
|-------|--------|-------|
| `practice_sessions` table | ✓ | Has `mode`, `startedAt`, `endedAt`, `paramsJson` (with question count, scores) |
| `PracticeSessionRepository` | ✓ | Has `findByIdAndUserId()`, `findIncompleteByUserId()` — but NO `findCompletedByUserId()` |
| `EndPracticeSessionOutput` | ✓ | Returns `answered`, `correct`, `accuracy`, `durationSeconds` |
| `GetPracticeSessionReviewUseCase` | ✓ | Returns per-question breakdown for any session |

### What's Missing

| Asset | Status | Needed |
|-------|--------|--------|
| `PracticeSessionRepository.findCompletedByUserId()` | ✗ | Paginated query for ended sessions |
| `GetSessionHistoryUseCase` | ✗ | Use case to fetch completed sessions with summary stats |
| Controller action | ✗ | `getSessionHistory()` server action |
| UI page/section | ✗ | Session history list on Practice page or dedicated route |

### Spec Status

SPEC-019 (Practice UX Redesign) mentions this as a P3 optional feature:
> "Recent Sessions (optional)" — shows list of past sessions with scores

It was planned but deferred.

---

## Resolution

### Option A: Section on Practice Landing Page (Recommended)

Add a "Recent Sessions" section below the session starter form on `/app/practice`:

1. Add `findCompletedByUserId(userId, limit)` to `PracticeSessionRepository` port and Drizzle implementation.
2. Create `GetSessionHistoryUseCase` that queries completed sessions and computes summary stats from `questionStates`.
3. Add `getSessionHistory` server action to `practice-controller.ts`.
4. Render session list on Practice page below the starter form.

### Option B: Dedicated Session History Page

Create `/app/practice/history` as a standalone page with pagination, filtering by mode, and session detail drill-down.

### Option C: Dashboard Integration

Add a "Sessions" card to the Dashboard alongside "Recent Activity" that shows session-level stats.

---

## Verification

- [ ] Completed sessions visible as a list (Practice page or dedicated route)
- [ ] Each session shows: mode, question count, score/accuracy, duration, date
- [ ] Clicking a session shows per-question breakdown
- [ ] Pagination works for users with many sessions
- [ ] Ad-hoc attempts (outside sessions) are handled correctly (excluded from session list)
- [ ] Unit tests for new use case and repository method
- [ ] Existing test suite passes

---

## Related

- [SPEC-020: Practice Engine Completion](../specs/spec-020-practice-engine-completion.md) — Phase 4
- [SPEC-019: Practice UX Redesign](../specs/spec-019-practice-ux-redesign.md) (previously P3 optional; now required via SPEC-020)
- DEBT-113 (Dashboard and Review lack session context)
- BUG-072 (No question navigation in sessions)
- BUG-073 (Tutor mode missing session summary)
- `src/application/use-cases/get-practice-session-review.ts` (already supports per-question detail)
- `src/adapters/repositories/drizzle-practice-session-repository.ts`
- `app/(app)/app/practice/page.tsx`
