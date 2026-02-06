# DEBT-113: Dashboard and Review Pages Lack Session Context

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-06
**Resolved:** 2026-02-06 (PR #63)
**Spec Mandate:** [SPEC-020](../specs/spec-020-practice-engine-completion.md) Phase 3

---

## SPEC-020 Reclassification

This debt item has been promoted from discretionary UX debt to a **spec-mandated requirement**. Master spec sections 4.5.7 and 4.5.8 now include `sessionId` and `sessionMode` fields in `UserStatsOutput.recentActivity` and `MissedQuestionRow` respectively. SLICE-5 acceptance criteria now includes: "Recent activity groups attempts by session when session context exists."

Implementation requires port-level type changes, SQL LEFT JOIN changes in repository queries, and UI updates to group/badge session context.

**Phase:** 3 (Session Context in Existing Views)
**Blocked by:** SPEC-020 Phases 1–2 (DEBT-115, DEBT-116, DEBT-122, DEBT-123)
**Blocks:** SPEC-020 Phase 4

---

## Description

The Dashboard "Recent Activity" and Review "Missed Questions" pages display flat lists of individual question attempts with no session grouping. When a user completes a 20-question exam session, they see 20 separate rows — not a single session entry that can be expanded or drilled into.

The database already stores session context (`attempts.practiceSessionId` FK to `practice_sessions`), but the data layer for these views ignores it entirely.

### Dashboard — Recent Activity

**Current:** Flat list of individual attempts.
```
"A 24-year-old woman who has been using cannabis daily..."  Incorrect
"A 28-year-old woman with opioid use disorder..."          Incorrect
"Acamprosate showed no evidence of efficacy..."             Incorrect
"Which statement best characterizes motivational..."        Correct
```

**Expected:** Session-grouped activity.
```
Exam Session • 15/20 correct (75%) • Feb 6
  └─ 20 questions • 45 min

Tutor Session • 8/10 correct (80%) • Feb 5
  └─ 10 questions • 12 min

Ad-hoc: "A 24-year-old woman who has been..." • Incorrect • Feb 4
```

### Review — Missed Questions

**Current:** Flat list of missed questions with no session origin.
```
"Which statement best characterizes motivational..."  Easy • Missed 2026-02-06
"A 24-year-old woman who has been using cannabis..."   Medium • Missed 2026-02-06
```

**Expected:** Session context on each missed question.
```
"Which statement best characterizes motivational..."  Easy • Missed in Exam Session (Feb 6)
"A 24-year-old woman who has been using cannabis..."   Medium • Missed in Tutor Session (Feb 6)
```

Or grouped by session:
```
Exam Session (Feb 6) — 5 missed of 20
  ├─ "Which statement best characterizes motivational..."  Easy
  ├─ "A 24-year-old woman who has been using cannabis..."  Medium
  └─ ...
```

---

## Impact

- Users who practice in sessions see a disconnected wall of individual questions — no sense of "I did an exam and scored 75%."
- No way to tell which questions came from which session, or which were ad-hoc.
- The session as a first-class concept exists in the data model but is invisible in the two primary views users see after practicing.
- Reduces the pedagogical value of session-based practice — users can't reflect on session-level performance trends.

---

## Root Cause (Tracer Bullet)

### Data Flow — Dashboard

```
DashboardPage
  → getUserStats({})                              [stats-controller.ts]
    → GetUserStatsUseCase.execute()               [get-user-stats.ts]
      → attempts.listRecentByUserId(userId, 20)   [AttemptStatsReader port]
        → SQL: SELECT * FROM attempts              [drizzle-attempt-repository.ts]
              WHERE userId = ?
              ORDER BY answeredAt DESC
              LIMIT 20
              -- NO JOIN to practice_sessions
              -- practiceSessionId exists on rows but is not surfaced in output
```

**Gap:** `listRecentByUserId()` returns raw attempts (including `practiceSessionId`). The use case enriches rows with question metadata, but it does not expose `sessionId`/`sessionMode` in `UserStatsOutput.recentActivity`, so the UI cannot render session context.

### Data Flow — Review

```
ReviewPage
  → getMissedQuestions({ limit, offset })          [review-controller.ts]
    → GetMissedQuestionsUseCase.execute()          [get-missed-questions.ts]
      → attempts.listMissedQuestionsByUserId()     [AttemptMissedQuestionsReader port]
        → SQL: ranked latest-attempt subquery       [drizzle-attempt-repository.ts]
              where attemptRank = 1 and isCorrect = false
              -- NO JOIN to practice_sessions
              -- Session context completely absent
```

**Gap:** `listMissedQuestionsByUserId()` groups by `questionId` (latest incorrect attempt per question), but never includes which session the miss came from.

### What Exists (Unused)

| Layer | Asset | Session-aware? |
|-------|-------|----------------|
| DB schema | `attempts.practiceSessionId` column | ✓ FK exists |
| DB schema | `practice_sessions` table | ✓ Has mode, startedAt, endedAt |
| DB index | `sessionUserAnsweredAtIdx` | ✓ Composite index ready |
| Port | `AttemptSessionReader.findBySessionId()` | ✓ Returns session attempts |
| Use case | `GetPracticeSessionReviewUseCase` | ✓ Per-question review data |

All the data is there. The Dashboard and Review views just don't query it.

---

## Resolution

### Option A: Enrich Existing Views with Session Context (Recommended — Incremental)

1. **Dashboard**: Add `sessionId`, `sessionMode` to `recentActivity` items. LEFT JOIN `practice_sessions` in `listRecentByUserId()`. Group consecutive attempts from the same session in the UI.
2. **Review**: Add `sessionId`, `sessionMode` to missed question rows. Show session badge/label next to each missed question.
3. No new pages needed — just richer data in existing views.

### Option B: Session-First Views (Larger Redesign)

1. Dashboard shows session-level entries as primary, with drill-down to individual questions.
2. Review groups missed questions by session.
3. Requires new use cases and significant UI refactoring.

### Shared Prerequisites

- Extend `AttemptStatsReader` port to return session metadata alongside attempts.
- Update `listRecentByUserId()` SQL to LEFT JOIN `practice_sessions`.
- Update `listMissedQuestionsByUserId()` SQL to include session context.
- Add `sessionId?: string`, `sessionMode?: PracticeMode` to output types.

---

## Verification

- [ ] Dashboard recent activity shows session context (mode, session grouping or badge)
- [ ] Review missed questions include session origin (which session the miss came from)
- [ ] Ad-hoc attempts (no session) display correctly without session context
- [ ] Existing pagination still works on Review page
- [ ] Unit tests updated for enriched output types
- [ ] Existing test suite passes

---

## Related

- [SPEC-020: Practice Engine Completion](../specs/spec-020-practice-engine-completion.md) — Phase 3
- DEBT-114 (No session history page)
- BUG-072 (No question navigation in sessions)
- BUG-073 (Tutor mode missing session summary)
- `src/application/use-cases/get-user-stats.ts`
- `src/application/use-cases/get-missed-questions.ts`
- `src/adapters/repositories/drizzle-attempt-repository.ts`
- `app/(app)/app/dashboard/page.tsx`
- `app/(app)/app/review/page.tsx`
- `db/schema.ts` (attempts table, practice_sessions table)
