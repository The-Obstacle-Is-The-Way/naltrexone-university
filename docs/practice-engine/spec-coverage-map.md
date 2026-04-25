# Practice Engine: Spec Coverage Map

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Maps each part of the Practice Engine to the spec that defines it
> **Last Verified:** 2026-04-25

---

## 1. Coverage Map

| Component | Primary Spec | Status | Notes |
|-----------|-------------|--------|-------|
| Domain entities (Question, Choice, Attempt, PracticeSession, Bookmark, Tag) | SPEC-001 | Implemented | Fully compliant |
| Value objects (PracticeMode, QuestionDifficulty, etc.) | SPEC-002 | Implemented | Synced to implementation (EntitledStatuses includes `pastDue`) |
| Domain services (grading, session, statistics, shuffle, question-selection) | SPEC-003 | Implemented | Synced to implementation (`createQuestionSeed()`, `selectNextQuestionId()`) |
| Application ports (all repository interfaces) | SPEC-004 | Implemented | Synced to implementation (ISP composite `AttemptRepository`, port-per-module structure) |
| Core use cases (application orchestration) | SPEC-005 | Implemented | Synced to implementation (full use-case inventory documented) |
| Database schema | SPEC-006 | Implemented | Synced to implementation (`rate_limits`, `idempotency_keys`, partial unique attempt index) |
| Repository implementations | SPEC-007 | Implemented | Synced to implementation (includes `DrizzleIdempotencyKeyRepository`; unit + integration testing strategy) |
| Server actions / controllers | SPEC-010 | Implemented | Synced to implementation (`ActionErrorCode` = `ApplicationErrorCode`; `createAction` + `handleError`) |
| Core question loop (fetch → render → submit → grade → explain) | SPEC-012 | Implemented | Active exam uses draft-save/finalize rather than per-question submit; BUG-239 tracks a remaining implicit latest-reader fallback gap |
| Practice sessions (start → answer → navigate → review → end/finalize → summary) | SPEC-013 | Implemented | Active exam draft/finalize flow shipped; BUG-238 tracks an unbounded draft timing validation gap |
| History + bookmarks | SPEC-014 / SPEC-021 | Implemented | `/app/review` restructured to `/app/history` with Sessions + Questions tabs (SPEC-021) |
| Dashboard stats | SPEC-015 | Implemented | Activity items clickable + difficulty badges via SPEC-019 Phase 3 |
| UI integration patterns | SPEC-018 | Implemented | No architecture violations |
| Practice UX redesign | SPEC-019 | Implemented | All 3 phases complete (2026-02-09) |
| Practice engine completion (decomposition, navigation, enriched summary, session history) | SPEC-020 | Implemented | All 4 phases complete |
| History page restructure (tabbed Sessions + Questions, filters, replaces old review page) | SPEC-021 | Implemented | `/app/review` → `/app/history`; `GetAttemptedQuestions` with result/source filters |
| Question Log (attempted questions) | SPEC-022 | Implemented | History "Questions" tab = filterable attempted-question log (Result/Source server-side; Difficulty/Tag client-side in v1) |
| Question Review Mode | SPEC-023 | Implemented | `?mode=review` pre-populates previous answer + shows explanation on load |
| Question Status Filter | SPEC-024 | Implemented | Status filter (unanswered/incorrect/bookmarked) on Practice session creation + Quick Practice; extends `listPublishedCandidateIds` |
| Choice Label Desync Fix | SPEC-025 | Implemented | Shuffled choice views ensure consistent labels across QuestionCard and Feedback |
| History Tab — Review-Only Links | SPEC-026 | Implemented | History Questions tab routes all rows through `mode=review` consistently |
| Session Review Navigation | SPEC-027 | Implemented | Sequential prev/next nav + "Question X of Y" in review; attempt identity via `sessionId`/`attemptId` URL params |
| Status Filter Segmented Control + Review Navigator | SPEC-028 | Implemented | Segmented control for status/difficulty filters; color-coded question navigator grid in review mode |
| Dev Environment Resilience | SPEC-029 | Implemented | Client-side timeouts, observable failure states, `ErrorCard` recovery actions |
| Question View UX Unification | SPEC-030 | Implemented | Tutor state persistence fix, Previous button in practice, review nav relocation to bottom bar |
| Retry Lineage + Session Review Inline Retry | [Retry Logic SSOT](./retry-logic.md) + DEBT-265 | Implemented | Provenance + validation + inline retry + observability + mixed-id hardening are complete. Active-exam secrecy gates are enforced; keep the archived bug family in the regression set. |

---

## 2. Spec/Doc Drift Summary

As of **2026-04-25**, SPEC-021 through SPEC-030 implementation coverage remains strong. The open practice-area bug register contains [BUG-238](../bugs/bug-238-active-exam-draft-cumulative-ms-unbounded.md) and [BUG-239](../bugs/bug-239-active-exam-latest-attempt-readers-drop-visible-fallback.md), both filed after the BUG-235/236/237 active-exam visibility trilogy was fixed and archived. [BS-014](../brainstorming/bs-014-practice-starter-question-count-ux.md) remains a UX follow-up, while [DEBT-318](../_archive/debt/debt-318-tutor-bookmark-before-answer.md) is resolved.

When behavior changes introduce new public contracts (ports/use case IO/controller outputs), update the corresponding spec and add a changelog entry.
