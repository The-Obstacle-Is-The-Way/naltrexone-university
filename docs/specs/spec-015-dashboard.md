# SPEC-015: Dashboard

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Partial
**Slice:** SLICE-5 (Dashboard)
**Depends On:** SLICE-4 (Review + Bookmarks)
**Implements:** ADR-001, ADR-003, ADR-010

---

## Objective

Provide a fast, motivating dashboard for subscribed users:

- Total answered
- Overall accuracy
- Last 7 days accuracy
- Current streak (UTC days with ≥1 attempt)
- Recent activity list

**SSOT:** `docs/specs/master_spec.md` (SLICE-5).

---

## Source of Truth

- `docs/specs/master_spec.md`:
  - SLICE-5 (acceptance criteria + implementation checklist)
- Domain computations:
  - `docs/specs/spec-003-domain-services.md` (`computeAccuracy`, `computeStreak`, windowing helpers)

---

## Acceptance Criteria

- Dashboard shows total answered, overall accuracy, last 7 days accuracy, current streak.
- Shows recent activity list.

---

## Test Cases

- `src/domain/services/statistics.test.ts`: `computeAccuracy()`, `computeStreak()` pure function tests (colocated).
- `src/application/use-cases/get-user-stats.test.ts`: use case tests with fakes (colocated).
- `tests/e2e/practice.spec.ts`: answering questions updates dashboard stats.

---

## Implementation Checklist (Ordered)

1. Build domain services: `src/domain/services/statistics.ts`:
   - `computeAccuracy()`
   - `computeStreak()`
   - `filterAttemptsInWindow()`
2. Build use case: `src/application/use-cases/get-user-stats.ts`.
3. Build controller: `src/adapters/controllers/stats-controller.ts` (`'use server'` `getUserStats`).
4. Build `/app/dashboard` page with stat cards and recent activity list.

---

## Files to Create/Modify

- `src/domain/services/statistics.ts`
- `src/application/use-cases/get-user-stats.ts`
- `src/adapters/controllers/stats-controller.ts`
- `app/(app)/app/dashboard/page.tsx`
- `components/stats/*`
- `lib/container.ts` (add stats factories)

---

## Non-Negotiable Requirements

- **No stored stats:** compute from persisted attempts (no denormalized counters for MVP).
- **UTC correctness:** streak and window calculations use UTC day boundaries.
- **No stale entitlement:** dashboard is behind the subscription gate (server-side).

---

## Demo (Manual)

Once implemented:

1. Ensure you have an entitled user with attempts (SLICE-1 + SLICE-2/3).
2. Visit `/app/dashboard`.
3. Verify stats match the DB ground truth:
   - total answered
   - overall accuracy
   - last 7 days accuracy
   - current streak (UTC)
4. Verify recent activity list matches the most recent attempts.

---

## Definition of Done

- Behavior matches SLICE-5 in `docs/specs/master_spec.md`.
- Dashboard renders server-side and loads fast for MVP data volumes.
- Integration tests validate stats correctness; E2E smoke covers dashboard load.
