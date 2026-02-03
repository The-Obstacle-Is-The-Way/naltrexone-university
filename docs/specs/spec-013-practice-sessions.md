# SPEC-013: Practice Sessions

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented
**Slice:** SLICE-3 (Practice Sessions)
**Depends On:** SLICE-2 (Core Question Loop)
**Implements:** ADR-001, ADR-003, ADR-011

---

## Objective

Implement structured practice sessions:

- Start a session with filters (mode/count/tags/difficulties)
- Persist an immutable question order (`practice_sessions.params_json.questionIds`)
- Track progress and allow ending a session
- Enforce tutor vs exam explanation rules

**SSOT:** `docs/specs/master_spec.md` (SLICE-3 + Section 4.5.5+).

---

## Source of Truth

- `docs/specs/master_spec.md`:
  - SLICE-3 (acceptance criteria + implementation checklist)
  - Section 4.5.5+ (session server actions + behavior)
- Domain rules:
  - `docs/specs/spec-003-domain-services.md` (session progress + explanation logic)

---

## Acceptance Criteria

- Given I choose count/mode/tags, when I click Start, then a practice session is created.
- When I proceed through questions, the app shows progress (e.g., 3/20).
- When I end the session, I see score and total duration.
- In exam mode, explanations are hidden until the session ends.

---

## Test Cases

- `tests/integration/actions.questions.integration.test.ts`: `getNextQuestion(session)` respects `params_json.questionIds` order and completion rules.
- `tests/e2e/practice.spec.ts`: start session → answer → end → summary (and exam-mode explanation gating).

---

## Implementation Checklist (Ordered)

1. Implement `startPracticeSession` and persist `questionIds` in `params_json`.
2. Implement session runner route `/app/practice/[sessionId]`.
3. Implement `endPracticeSession`.
4. Enforce exam-mode explanation gating.

---

## Files to Create/Modify

- `src/domain/entities/practice-session.ts`
- `src/domain/services/session.ts` — `computeSessionProgress()`, `shouldShowExplanation()`
- `src/domain/services/shuffle.ts` — deterministic selection/shuffle
- `src/application/use-cases/start-practice-session.ts`, `end-practice-session.ts`
- `src/adapters/repositories/drizzle-practice-session-repository.ts`
- `src/adapters/controllers/practice-controller.ts`
- `app/(app)/app/practice/[sessionId]/page.tsx`
- `components/question/*` (progress display + exam/tutor behaviors)
- `lib/container.ts` (add session factories)

---

## Non-Negotiable Requirements

- **Session immutability:** once started, the question list/order is fixed.
- **Deterministic progress:** progress is computed from persisted session state + attempts.
- **Exam mode secrecy:** no explanations until `ended_at` is set.

---

## Demo (Manual)

Once implemented:

1. Ensure you have an entitled user (complete SLICE-1).
2. `pnpm dev` and visit `/app/practice`.
3. Start a session with a count and mode.
4. Answer at least one question; verify progress increments.
5. End the session; verify summary shows answered/correct/accuracy/duration.
6. Repeat in exam mode; verify explanations are hidden until the session ends.

---

## Definition of Done

- Behavior matches SLICE-3 in `docs/specs/master_spec.md`.
- Session question order is reproducible and stored server-side.
- Integration tests cover session lifecycle; E2E smoke covers one session run.
