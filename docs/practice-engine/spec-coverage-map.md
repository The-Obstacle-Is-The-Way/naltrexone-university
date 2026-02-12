# Practice Engine: Spec Coverage Map

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Maps each part of the Practice Engine to the spec that defines it
> **Last Verified:** 2026-02-11

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
| Core question loop (fetch → render → submit → grade → explain) | SPEC-012 | Implemented | Fully compliant |
| Practice sessions (start → answer → navigate → review → end → summary) | SPEC-013 | Implemented | Fully compliant |
| History + bookmarks | SPEC-014 / SPEC-021 | Implemented | `/app/review` restructured to `/app/history` (SPEC-021); `GetMissedQuestions` → `GetAttemptedQuestions` with filters |
| Dashboard stats | SPEC-015 | Implemented | Activity items clickable + difficulty badges via SPEC-019 Phase 3 |
| UI integration patterns | SPEC-018 | Implemented | No architecture violations |
| Practice UX redesign | SPEC-019 | Implemented | All 3 phases complete (2026-02-09) |
| Practice engine completion (decomposition, navigation, enriched summary, session history) | SPEC-020 | Implemented | All 4 phases complete |
| History page restructure (tabbed Sessions + Questions, filters, replaces old review page) | SPEC-021 | Implemented | `/app/review` → `/app/history`; `GetAttemptedQuestions` with result/source filters |

---

## 2. Spec Drift Summary

As of **2026-02-11**, the previously identified spec drift items for the Practice Engine have been paid down by syncing the core specs (ports, use cases, schema, repositories, controllers) to the current implementation. SPEC-021 changes (History page restructure) are now reflected.

When behavior changes introduce new public contracts (ports/use case IO/controller outputs), update the corresponding spec and add a changelog entry.
