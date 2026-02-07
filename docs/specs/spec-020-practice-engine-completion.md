# SPEC-020: Practice Engine Completion

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented
**Layer:** Feature
**Date:** 2026-02-06 (amended 2026-02-07)
**Depends On:** SPEC-013, SPEC-014, SPEC-015
**Addresses Debt:** DEBT-113, DEBT-114, DEBT-115, DEBT-116, DEBT-122, DEBT-123
**Related Bugs:** BUG-072, BUG-073

---

## 1. Executive Summary

Six deferred practice engine gaps (DEBT-113 through DEBT-116, DEBT-122, DEBT-123) and two "Won't Fix" bugs (BUG-072, BUG-073) represent **baseline requirements for any board-prep question bank** — features standard in UWorld, Amboss, and Kaplan — that were incorrectly classified as optional UX debt because the master spec didn't explicitly require them.

The spec is incomplete, not the implementation. This spec promotes all six items to first-class requirements organized in four phases, with structural debt (god components) paid first so features are added on a clean foundation.

---

## 2. Problem Statement

Professional board-prep question banks universally provide: in-session question navigation, per-question session summaries, session-grouped dashboards, and session history. Their absence in our product creates real pedagogical and usability gaps.

### 2.1 God Components Block Feature Work (DEBT-115, DEBT-116)

The practice page (823 lines, 20 `useState`) and session page (670 lines, 17 `useState`) are monolithic client components that combine UI rendering, state machine logic, data fetching, and business coordination. Adding navigation or enriched summaries to these files will push them past 1000 lines and make them untestable.

### 2.2 No In-Run Question Navigation (DEBT-122, BUG-072)

Users can only move forward during active answering. They cannot revisit previous questions or jump to specific questions until exam review. The backend already supports `questionId` param in `getNextQuestion` (master_spec 4.5.3 Case A step 3), so this is purely a UI gap.

### 2.3 Aggregate-Only Session Summary (DEBT-123, BUG-073)

The session summary screen shows only totals (`answered`, `correct`, `accuracy`, `durationSeconds`) with no per-question breakdown. `GetPracticeSessionReviewUseCase` already provides the detail data — it's just not called from the summary screen.

### 2.4 Dashboard and Review Lack Session Context (DEBT-113)

The Dashboard "Recent Activity" and Review "Missed Questions" views display flat lists of individual attempts with no session grouping. The `attempts.practiceSessionId` FK exists but is unused in these views.

### 2.5 No Session History (DEBT-114)

After completing a session, it effectively disappears. There is no page or section where users can view past sessions, compare scores over time, or drill into per-question results — a core value proposition for board prep.

---

## 3. Functional Requirements

| ID | Requirement | Phase | Source |
|----|-------------|-------|--------|
| FR-1 | Practice page component decomposed to ≤ 300 lines per file | 1 | DEBT-115 |
| FR-2 | Session page component decomposed to ≤ 300 lines per file | 1 | DEBT-116 |
| FR-3 | In-run question navigation (back/jump) in both tutor and exam modes | 2 | DEBT-122, BUG-072 |
| FR-4 | Per-question breakdown on session summary screen | 2 | DEBT-123, BUG-073 |
| FR-5 | Dashboard and Review pages include session context (mode, session grouping) | 3 | DEBT-113 |
| FR-6 | Completed session history list with drill-down to per-question detail | 4 | DEBT-114 |

---

## 4. Non-Functional Requirements

- No regressions in existing test suite (882+ tests)
- TDD for all new behavior (Red → Green → Refactor)
- Clean Architecture boundaries preserved (dependencies point inward only)
- Fakes over mocks for all testable ports
- No new DB migrations for Phases 1–3
- Phase 4 requires new repository method but no schema change

---

## 5. Phase Plan

### Phase 1: Structural Refactoring (PREREQUISITE)

**Goal:** Decompose both god components so feature work in Phases 2–4 can be added cleanly.

**Scope:**

1. **Practice page** (`app/(app)/app/practice/page.tsx`, 823 lines):
   - Extract `usePracticeSession()` hook — session lifecycle state machine
   - Extract `useQuestionLoader()` hook — question fetching, loading, error retry
   - Extract `useBookmarkManager()` hook — bookmark toggle, status, messages
   - Extract `useFilterState()` hook — tag/difficulty filter management
   - Split `PracticeView` into composed subcomponents

2. **Session page** (`app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`, 670 lines):
   - Extract `useSessionStateMachine()` hook — question → review → summary transitions
   - Extract `useQuestionProgression()` hook — next question, answer submission, mark-for-review
   - Extract `useSessionReview()` hook — review stage data, finalization
   - Extract `useBookmarkManager()` hook — shared with practice page if possible

**Target file structure:**

```
app/(app)/app/practice/
├── page.tsx                          # ≤ 300 lines, orchestrator
├── hooks/
│   ├── usePracticeSession.ts
│   ├── useQuestionLoader.ts
│   ├── useBookmarkManager.ts
│   └── useFilterState.ts
├── components/
│   ├── PracticeSessionStarter.tsx
│   ├── PracticeQuestionView.tsx
│   └── PracticeFilters.tsx
└── [sessionId]/
    ├── page.tsx
    ├── practice-session-page-client.tsx  # ≤ 300 lines, orchestrator
    ├── hooks/
    │   ├── useSessionStateMachine.ts
    │   ├── useQuestionProgression.ts
    │   └── useSessionReview.ts
    └── components/
        ├── SessionProgress.tsx
        ├── SessionQuestionView.tsx
        ├── ExamReviewStage.tsx
        └── SessionSummary.tsx
```

**Gate:** No file > 300 lines, all existing tests pass, no behavioral regressions.

---

### Phase 2: Core Navigation + Enriched Summary

**Goal:** Add in-run question navigation and per-question session summary detail.

**Question Navigator (FR-3):**

- Numbered grid component showing all session questions with status indicators:
  - Unanswered (default)
  - Answered (correct/incorrect in tutor; neutral in exam)
  - Current (highlighted)
  - Marked for review (exam mode)
- Clicking a number calls `getNextQuestion({ sessionId, questionId })` — backend already supports this (master_spec 4.5.3 Case A step 3: "If questionId is provided, it must belong to params_json.questionIds")
- Available in both tutor and exam modes during active answering
- Responsive: collapsed on mobile, expanded on desktop

**Enriched Summary (FR-4):**

- After `endPracticeSession` returns totals, UI calls `getPracticeSessionReview(sessionId)` to fetch per-question detail
- Summary screen shows:
  - Aggregate totals (existing)
  - Per-question list: question stem excerpt, correct/incorrect/skipped, time spent (if tracked)
  - In exam mode: explanations now visible for all questions
- No change to `EndPracticeSessionOutput` type — review data comes from the existing `getPracticeSessionReview` action (SRP: keep end and review separate)

**Gate:** Navigation verified in both tutor and exam modes. Summary shows per-question breakdown.

---

### Phase 3: Session Context in Existing Views

**Goal:** Enrich Dashboard and Review with session metadata.

**Type amendments:**

Amend `UserStatsOutput.recentActivity` items:
```typescript
sessionId: string | null;               // null for ad-hoc attempts
sessionMode: 'tutor' | 'exam' | null;   // null for ad-hoc attempts
```

Amend `MissedQuestionRow`:
```typescript
sessionId: string | null;               // null for ad-hoc attempts
sessionMode: 'tutor' | 'exam' | null;   // null for ad-hoc attempts
```

**Implementation:**

- `listRecentByUserId()` SQL: LEFT JOIN `practice_sessions` on `attempts.practiceSessionId`
- `listMissedQuestionsByUserId()` SQL: LEFT JOIN `practice_sessions`
- Dashboard UI: group consecutive attempts from same session, show session badge
- Review UI: show session origin badge on each missed question
- Nullable fields preserve backward compatibility for ad-hoc attempts

**Gate:** Dashboard groups attempts by session. Review shows session origin. Ad-hoc attempts display correctly without session context.

---

### Phase 4: Session History

**Goal:** Let users view completed sessions and drill into per-question detail.

**New port method:**

```typescript
// PracticeSessionRepository
findCompletedByUserId(userId: string, limit: number, offset: number): Promise<{
  rows: CompletedSessionRow[];
  total: number;
}>;
```

**New use case:**

```typescript
// GetSessionHistoryUseCase
execute(input: { limit: number; offset: number }): Promise<GetSessionHistoryOutput>
```

Computes stats from `questionStates` in `params_json` for each completed session.

**New server action:**

```typescript
// getSessionHistory(limit, offset)
// Input: zPagination
// Output: GetSessionHistoryOutput
```

```typescript
export type SessionHistoryRow = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  questionCount: number;
  answered: number;
  correct: number;
  accuracy: number;       // 0..1
  durationSeconds: number;
  startedAt: string;      // ISO
  endedAt: string;        // ISO
};

export type GetSessionHistoryOutput = {
  rows: SessionHistoryRow[];
  total: number;
  limit: number;
  offset: number;
};
```

**UI:**

- "Recent Sessions" section on practice landing page (below session starter)
- Each session row is clickable → calls `getPracticeSessionReview(sessionId)` for drill-down
- Paginated list with mode, score, duration, date

**Gate:** Session list visible on practice page. Clicking a session shows per-question detail.

---

## 6. Design Details

### 6.1 Component Decomposition Targets (Phase 1)

| Current File | Lines | Target | Max Lines |
|--------------|-------|--------|-----------|
| `practice/page.tsx` | 823 | Orchestrator + 4 hooks + 3 components | ≤ 300 each |
| `[sessionId]/practice-session-page-client.tsx` | 670 | Orchestrator + 3 hooks + 4 components | ≤ 300 each |

### 6.2 Navigator Component (Phase 2)

```typescript
interface QuestionNavigatorProps {
  questions: Array<{
    questionId: string;
    index: number;
    status: 'unanswered' | 'answered' | 'current' | 'marked';
    isCorrect?: boolean; // only in tutor mode after answering
  }>;
  onNavigate: (questionId: string) => void;
  mode: 'tutor' | 'exam';
}
```

### 6.3 Type Amendments (Phase 3)

See master_spec.md sections 4.5.7 and 4.5.8 for the amended output types.

### 6.4 New Server Action (Phase 4)

See master_spec.md section 4.5.13 for the full `getSessionHistory` specification.

---

## 7. Tests First

### Phase 1: Hook Isolation Tests

```typescript
// hooks/usePracticeSession.test.ts
describe('usePracticeSession', () => {
  it('initializes with idle state');
  it('transitions to active when session starts');
  it('transitions to ended when session ends');
  it('handles session abandon with confirmation');
});

// hooks/useQuestionLoader.test.ts
describe('useQuestionLoader', () => {
  it('loads question on mount');
  it('transitions to loading on next question');
  it('handles load failure with retry');
});
```

### Phase 2: Navigator + Summary Tests

```typescript
// components/QuestionNavigator.test.tsx
describe('QuestionNavigator', () => {
  it('renders numbered grid for all session questions');
  it('highlights current question');
  it('shows answered status for completed questions');
  it('shows marked-for-review indicator in exam mode');
  it('calls onNavigate with questionId on click');
});

// Session summary enrichment
describe('SessionSummary', () => {
  it('displays aggregate totals');
  it('displays per-question breakdown after review data loads');
  it('shows explanations in exam mode after session ends');
});
```

### Phase 3: Session Context Tests

```typescript
describe('GetUserStatsUseCase', () => {
  it('includes sessionId and sessionMode in recentActivity items');
  it('returns null sessionId for ad-hoc attempts');
});

describe('GetMissedQuestionsUseCase', () => {
  it('includes sessionId and sessionMode in missed question rows');
  it('returns null sessionId for ad-hoc misses');
});
```

### Phase 4: Session History Tests

```typescript
describe('GetSessionHistoryUseCase', () => {
  it('returns completed sessions ordered by endedAt desc');
  it('computes accuracy from questionStates');
  it('respects pagination limit and offset');
  it('excludes incomplete sessions');
});
```

---

## 8. Acceptance Criteria

### Phase 1
- [ ] No single practice-related file exceeds 300 lines
- [ ] Each extracted hook has independent unit tests
- [ ] Practice page behavior unchanged (regression-free)
- [ ] Session page behavior unchanged for both tutor and exam modes
- [ ] All existing tests pass

### Phase 2
- [ ] Users can navigate to any question during active answering (back/jump)
- [ ] Question navigator shows status indicators (unanswered/answered/current/marked)
- [ ] Navigation works in both tutor and exam modes
- [ ] Session summary shows per-question breakdown alongside aggregate totals
- [ ] Exam mode summary shows explanations for all questions
- [ ] No change to `EndPracticeSessionOutput` type

### Phase 3
- [ ] Dashboard recent activity includes session context (sessionId, sessionMode)
- [ ] Review missed questions include session context
- [ ] Ad-hoc attempts (no session) display correctly with null session fields
- [ ] Dashboard groups attempts by session when session context exists
- [ ] Existing pagination on Review page still works

### Phase 4
- [ ] Completed sessions visible as a list on practice landing page
- [ ] Each session shows: mode, question count, score/accuracy, duration, date
- [ ] Clicking a session shows per-question breakdown (via `getPracticeSessionReview`)
- [ ] Pagination works for users with many sessions
- [ ] New `FakePracticeSessionRepository` supports `findCompletedByUserId`

---

## 9. Related

### Specs
- [SPEC-013: Practice Sessions](./spec-013-practice-sessions.md) — session lifecycle
- [SPEC-014: Review + Bookmarks](./spec-014-review-bookmarks.md) — review/missed questions
- [SPEC-015: Dashboard](./spec-015-dashboard.md) — user stats
- [SPEC-019: Practice UX Redesign](./spec-019-practice-ux-redesign.md) — page architecture

### ADRs
- [ADR-001: Clean Architecture](../adr/adr-001-clean-architecture.md)
- [ADR-003: Testing Strategy](../adr/adr-003-testing-strategy.md)

### Debt (Superseded)
- [DEBT-113](../_archive/debt/debt-113-dashboard-review-lack-session-context.md) — Phase 3
- [DEBT-114](../_archive/debt/debt-114-no-session-history-page.md) — Phase 4
- [DEBT-115](../_archive/debt/debt-115-practice-page-god-component.md) — Phase 1
- [DEBT-116](../_archive/debt/debt-116-session-page-god-component.md) — Phase 1
- [DEBT-122](../_archive/debt/debt-122-in-run-question-navigation-gap.md) — Phase 2
- [DEBT-123](../_archive/debt/debt-123-session-summary-missing-question-breakdown.md) — Phase 2

### Bugs (Reclassified)
- [BUG-072](../_archive/bugs/bug-072-no-question-navigation-in-practice-sessions.md) — Phase 2
- [BUG-073](../_archive/bugs/bug-073-tutor-mode-missing-session-summary-detail.md) — Phase 2

---

## 10. Implementation Status (2026-02-07)

| Phase | FR | Requirement | Status | Notes |
|-------|-----|-------------|--------|-------|
| 1 | FR-1 | Practice page ≤ 300 lines per file | **Done** | `page.tsx` = 115 lines; hooks extracted to `usePracticeSessionControls`, `usePracticeQuestionFlow` |
| 1 | FR-2 | Session page ≤ 300 lines per file | **Done** | `practice-session-page-client.tsx` = 21 lines; hook extracted to `usePracticeSessionPageController` |
| 2 | FR-3 | In-run question navigation (back/jump) | **Done** | `QuestionNavigator` is rendered in active session UI (`PracticeSessionPageView` topContent) and wired to `getNextQuestion({ sessionId, questionId })` via `onNavigateQuestion` in `usePracticeSessionPageController`. |
| 2 | FR-4 | Per-question breakdown on session summary | **Done** | `SessionSummaryView` calls `getPracticeSessionReview` and displays per-question list with order, stem, status, correctness badge |
| 3 | FR-5 | Dashboard/Review include session context | **Done** | `sessionId` and `sessionMode` fields present in `UserStatsOutput.recentActivity` and `MissedQuestionRow`. Dashboard groups by session. Review shows session origin badge. |
| 4 | FR-6 | Session history list with drill-down | **Done** | `PracticeSessionHistoryPanel` on practice page. Rows clickable → per-question breakdown via `getPracticeSessionReview`. |

**Remaining work for this spec:** none. Residual UX/navigation polish is tracked in [SPEC-019](./spec-019-practice-ux-redesign.md) Phase 2/3.

---

## 11. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-02-06 | Architecture Review | Initial draft |
| 2026-02-07 | Architecture Review | **Status correction:** "Implemented" → "Partial". Added Section 10 (Implementation Status) documenting per-phase completion. FR-3 (in-run navigation) identified as sole remaining gap — navigator exists in exam review but not during active answering. |
| 2026-02-07 | Engineering | **Status correction:** "Partial" → "Implemented" after verifying FR-3 wiring in active answering state. Updated superseded debt/bug links to archived locations. |
