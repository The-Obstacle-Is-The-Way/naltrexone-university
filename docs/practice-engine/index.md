# Practice Engine

> **Type:** Canonical Reference Document (Living)
> **Last Verified:** 2026-03-02 (ordering policy + DEBT-268 sync)
> **Scope:** Everything related to practicing questions — the core product feature

---

## 1. What Is the Practice Engine?

The Practice Engine is the core feature of Naltrexone University. It's the system that lets subscribed users answer board-prep questions, track their progress, and review their performance. Every other feature (dashboard stats, bookmarks, review) is a consumer of data produced by the Practice Engine.

**User perspective:** "I open the app, answer questions, see if I'm right, learn from explanations, track my score over time."

**System perspective:** A vertical slice through every Clean Architecture layer — from domain entities to database schema to React UI — orchestrating question selection, answer grading, session management, and progress tracking.

---

## 2. Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (app/)                             │
│  /app/practice          — Practice landing (start/continue)         │
│  /app/practice/quick    — Quick Practice (ad-hoc, no session)       │
│  /app/practice/[sessionId] — Session runner (tutor/exam)            │
│  /app/dashboard         — Stats + recent activity (consumer)        │
│  /app/history           — History: sessions + questions (consumer)  │
│  /app/bookmarks         — Saved questions (consumer)                │
│  /app/questions/[slug]  — Question detail (attempt/review)          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Server Actions ('use server')
┌──────────────────────────────┴──────────────────────────────────────┐
│                      Controllers (adapters/)                        │
│  question-controller    — getNextQuestion, submitAnswer             │
│  question-view-controller — getQuestionBySlug, getPreviousAttempt    │
│  practice-controller    — start/end session, review, history, mark  │
│  bookmark-controller    — toggle, list                              │
│  tag-controller         — listAll                                   │
│  review-controller      — getAttemptedQuestions                     │
│  stats-controller       — getUserStats                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Use Case calls
┌──────────────────────────────┴──────────────────────────────────────┐
│                      Use Cases (application/)                       │
│  GetNextQuestion         StartPracticeSession                       │
│  SubmitAnswer            EndPracticeSession                         │
│  GetPreviousAttempt      GetPracticeSessionReview                   │
│  ToggleBookmark          GetIncompletePracticeSession                │
│  GetBookmarks            SetPracticeSessionQuestionMark              │
│  GetAttemptedQuestions   GetSessionHistory                          │
│  GetUserStats            CountAvailableQuestions                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Port interfaces
┌──────────────────────────────┴──────────────────────────────────────┐
│                      Ports (application/ports/)                     │
│  QuestionRepository      AttemptRepository (7 sub-interfaces)       │
│  PracticeSessionRepository  BookmarkRepository  TagRepository       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Implementations
┌──────────────────────────────┴──────────────────────────────────────┐
│                   Repositories (adapters/repositories/)              │
│  DrizzleQuestionRepository     DrizzleAttemptRepository              │
│  DrizzlePracticeSessionRepository  DrizzleBookmarkRepository         │
│  DrizzleTagRepository                                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ SQL via Drizzle ORM
┌──────────────────────────────┴──────────────────────────────────────┐
│                      Database (db/schema.ts)                        │
│  questions  choices  tags  question_tags                             │
│  attempts   practice_sessions   bookmarks                           │
└─────────────────────────────────────────────────────────────────────┘
```

Dependencies point **inward only** (Clean Architecture, ADR-001). The domain layer has zero external imports.

---

## 3. Document Directory

| Document | Scope |
|----------|-------|
| [Architecture Layers](./architecture-layers.md) | Domain entities, value objects, services, errors; Application use cases, ports; Adapters repositories, controllers, schema |
| [Frontend Layer](./frontend-layer.md) | Routes, hook architecture, data flow, shared UI components, error handling |
| [Practice Modes](./practice-modes.md) | Ad-hoc / Tutor / Exam modes, session lifecycle, question selection, grading, concurrency |
| [Security Model](./security-model.md) | Authentication, authorization, rate limiting, idempotency, data isolation |
| [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md) | Canonical cross-layer policy for correctness/explanation exposure timing in exam mode |
| [Current State](./current-state.md) | What's working, open debt, SPEC-019 status, product decisions |
| [Spec Coverage Map](./spec-coverage-map.md) | Maps each component to its defining spec; drift summary |
| [File Index](./file-index.md) | Directory listings for all practice-engine source files |
| [Content Pipeline](./content-pipeline.md) | Full end-to-end trace: MDX authoring → seeding → database → shuffling → rendering. Includes resolved BS-011 root cause analysis (SPEC-025, SPEC-026) and developer operations (import, seed, troubleshoot). |
| [Question Rendering Architecture](./question-rendering-architecture.md) | How questions are rendered, navigated, and state-managed across all 6 viewing contexts. Shared vs context-specific components, hydration/retry state flows, navigation patterns. |
| [Retry Logic](./retry-logic.md) | Canonical retry/reattempt behavior across tutor, exam, quick practice, history, dashboard, and bookmarks; includes runtime topology, provenance contract, tracer bullets, and acceptance status. |
| [Ordering Policy](./ordering-policy.md) | Canonical question and choice ordering rules across all practice paths. Design principles, per-path ordering contracts, domain service roles, and anti-patterns. |

---

## 3.1 Canonical Policy Registry

These documents define cross-layer invariants. If other docs conflict, these win until updated:

| Policy | Canonical Doc | Applies To |
|--------|----------------|------------|
| Exam answer secrecy (active exam = no correctness/explanation exposure) | [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md) | Use cases, repositories, controllers, frontend rendering, test contracts |
| Ordering determinism (question/choice ordering) | [Ordering Policy](./ordering-policy.md) | Session start, quick practice, review routes, rendering contracts |

---

## 4. Related Documentation

| Document | Purpose |
|----------|---------|
| [Master Spec](../specs/master_spec.md) | Complete technical specification (SSOT) |
| [SPEC-012](../_archive/specs/spec-012-core-question-loop.md) | Core question loop requirements |
| [SPEC-013](../_archive/specs/spec-013-practice-sessions.md) | Practice session requirements |
| [SPEC-014](../_archive/specs/spec-014-review-bookmarks.md) | Review + bookmarks requirements |
| [SPEC-015](../_archive/specs/spec-015-dashboard.md) | Dashboard requirements |
| [SPEC-019](../_archive/specs/spec-019-practice-ux-redesign.md) | UX redesign (all phases implemented) |
| [SPEC-020](../_archive/specs/spec-020-practice-engine-completion.md) | Practice engine completion (all done) |
| [SPEC-021](../_archive/specs/spec-021-history-page-restructure.md) | History page restructure (replaces `/app/review`) |
| [SPEC-022](../_archive/specs/spec-022-question-log.md) | Question Log (History Questions tab = attempted-question log) |
| [SPEC-023](../_archive/specs/spec-023-question-review-mode.md) | Question Review Mode (`?mode=review`) |
| [SPEC-024](../_archive/specs/spec-024-question-status-filter.md) | Question status filter for practice starter |
| [SPEC-025](../_archive/specs/spec-025-choice-label-desync-fix.md) | Choice label desync fix (resolved BS-011 Bug B) |
| [SPEC-026](../_archive/specs/spec-026-history-review-only.md) | History review-only links (resolved BS-011 Bug A) |
| [SPEC-027](../_archive/specs/spec-027-session-review-navigation.md) | Session review navigation (Previous/Next in review) |
| [SPEC-028](../_archive/specs/spec-028-review-question-navigator.md) | Review question navigator (color-coded grid) |
| [SPEC-029](../_archive/specs/spec-029-dev-environment-resilience.md) | Dev environment resilience (timeouts, error handling) |
| [SPEC-030](../_archive/specs/spec-030-question-view-ux-unification.md) | Question View UX Unification (Implemented) |
| [ADR-001](../adr/adr-001-clean-architecture-layers.md) | Clean Architecture decision |
| [ADR-003](../adr/adr-003-testing-strategy.md) | Testing strategy (TDD, fakes over mocks) |
| [ADR-006](../adr/adr-006-error-handling-strategy.md) | Error handling (ApplicationError) |
| [ADR-015](../adr/adr-015-idempotency-strategy.md) | Idempotency strategy |
| [Frontend Standards](../frontend/standards.md) | UI/UX standards and known violations |
| [Frontend Design Principles](../frontend/design-principles.md) | Navigation zones, action bar composition, state persistence expectations |
| [BS-011](../_archive/brainstorming/bs-011-history-review-wiring-and-choice-label-desync.md) | History review wiring + choice label desync (resolved; see SPEC-025, SPEC-026) |
| [Debt Register](../debt/index.md) | All open technical debt |

---

## 5. Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Resolved DEBT-268: daily-seeded shuffle implemented in `executeForFilters`, ordering-policy.md updated from target to implemented state, satellite docs aligned. |
| 2026-03-02 | Added Exam Answer Secrecy Policy as canonical registry for correctness/explanation exposure timing across use cases, repositories, controllers, and frontend. Added Canonical Policy Registry section in this index and synced security/retry/current-state/spec-coverage docs to active BUG-180/181/185 status. |
| 2026-03-02 | Added Ordering Policy document — canonical question/choice ordering rules across all paths. BS-038 audit promoted to DEBT-268 for Quick Practice ordering fix. |
| 2026-03-01 | Closed DEBT-266 and DEBT-267 after implementation: added retry/hydration/normalization telemetry, accepted visit-scoped retry-marker policy, and hardened mixed `attemptId + sessionId` previous-attempt contract. |
| 2026-03-01 | Closed DEBT-265 core scope in debt tracking, moved observability/retry-marker persistence slices into DEBT-266, and added DEBT-267 for downstream mixed-identifier contract hardening. |
| 2026-02-08 | Initial version — created from full vertical audit of domain → application → adapters → frontend layers. Cross-referenced against SPEC-001 through SPEC-020. |
| 2026-02-09 | Synced with SPEC-019 updates: Phase 2 now "Ready for Implementation"; routes table adds `/app/practice/quick` (pending); practice mode table updated; Section 9.4 added for product decisions (review = missed-only, session runner route stays, nav label stays "Review"). |
| 2026-02-09 | Implemented SPEC-019 Phase 2: `/app/practice` is now landing-only, `/app/practice/quick` hosts ad-hoc question flow, and the route/status tables updated accordingly. |
| 2026-02-09 | Implemented SPEC-019 Phase 3: actionable dashboard activity + difficulty badges; progressive tag filter disclosure; review clarification + filters; origin-aware question navigation; improved empty states. |
| 2026-02-11 | Decomposed monolith index into focused sub-documents. Added Content Pipeline (full end-to-end trace from MDX authoring through rendering, including BS-011 Bug B root cause). Absorbed `docs/dev/question-content-pipeline.md` into `content-pipeline.md`. |
| 2026-02-11 | Synced all sub-documents to SPEC-021: `/app/review` → `/app/history`; `GetMissedQuestions` → `GetAttemptedQuestions`; AttemptRepository ISP updated (7 sub-interfaces); practice landing no longer embeds session history; added undocumented domain modules (`subscription-plan`, `session-stats`, `get-previous-attempt`). |
| 2026-02-12 | Updated architecture diagram and related-links to reflect SPEC-022 and SPEC-023 implementations (History Questions = attempted-question log; question detail supports `?mode=review`). |
| 2026-02-16 | Added Question Rendering Architecture document — cross-context component map, state persistence analysis, navigation architecture. Synced last-verified to SPEC-028. |
| 2026-02-16 | Accuracy audit: added `CountAvailableQuestions` to architecture diagram; fixed 9 broken spec links (`../specs/` → `../_archive/specs/`); added SPEC-024 through SPEC-030 to related docs; updated Content Pipeline scope (Bug B resolved). Sub-docs: file-index missing files added, practice-modes mode count corrected, frontend-layer hook line count updated. |
| 2026-03-01 | Added Retry Logic document as source of truth for reattempt semantics, including cross-mode behavior matrix, P0-P4 audit findings, and implementation contract. Linked DEBT-265 for follow-up remediation. |
| 2026-03-01 | Practice-engine doc sync after DEBT-265 implementation: updated retry SSOT + debt execution doc to implemented state, corrected question-rendering matrix/hydration semantics, refreshed spec-coverage and architecture-layer contracts, and added DEBT-266 for observability/persistence follow-ups. |
