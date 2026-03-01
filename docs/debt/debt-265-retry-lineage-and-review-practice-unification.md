# DEBT-265: Retry Lineage and Review/Practice Unification

**Status:** Active  
**Priority:** P2  
**Date:** 2026-03-01  
**Owner:** Practice Engine  
**Related:** [Practice Engine Retry Logic](../practice-engine/retry-logic.md), [SPEC-034](../_archive/specs/spec-034-review-mode-readonly-and-try-again-scoping.md), [SPEC-036](../_archive/specs/spec-036-bookmark-review-mode-alignment.md), BUG-068, BUG-153

---

## Description

The current retry experience is partially unified but still fragmented:

1. Session review (`mode=review&sessionId=...`) is correctly read-only.
2. Standalone review surfaces (`history`, `dashboard`, `bookmarks`) allow "Try Again/Practice Again" and create new standalone attempts.
3. Retry submissions currently have no explicit lineage/provenance metadata (`retryOfAttemptId`, retry origin/context), so analytics cannot reliably separate original attempts from retries.
4. Session review has no explicit "Practice this question" bridge CTA to the standalone retry flow.
5. Non-session review hydration failures can silently degrade to attempt mode, creating accidental duplicate attempts.

## Why this is debt (not a one-line fix)

This crosses multiple architecture layers:

- Domain model changes (attempt provenance semantics)
- Application/port contract changes (submit payload + validation rules)
- Controller schema changes (input surface)
- Database schema migration (new columns/indexes)
- Frontend state and UX changes (retry handoff + fallback messaging)
- Observability/reporting alignment (retry-aware metrics)

A local UI tweak cannot safely solve this without creating data/model drift.

## Required change set

### 1) Retry provenance model

- Add nullable attempt lineage fields:
  - `retryOfAttemptId`
  - `retryOrigin` (`history`, `dashboard`, `bookmarks`, `session_review_bridge`, `other`)
  - optional `retrySessionId` (originating session when bridged from session review)
- Enforce validation:
  - same user ownership
  - same question linkage
  - parent attempt exists when lineage is provided

### 2) Submit flow contract updates

- Extend `submitAnswer` controller schema/use-case input to accept optional retry provenance.
- Preserve immutable historical attempts: retries must create new rows, never mutate existing attempts.

### 3) Review-mode UX unification

- Keep session review read-only (no inline submit/try again).
- Add explicit CTA in session review: "Practice this question" (or equivalent), routing to standalone retry mode with origin context.
- In standalone review, keep retry controls but attach retry provenance to submit payload after hydration.

### 4) Hydration failure safety

- Replace silent fallback in non-session review contexts with explicit UI state:
  - clear message that prior attempt could not be loaded
  - explicit user action before submitting as a fresh attempt

### 5) Observability + docs consistency

- Emit retry-aware telemetry counters/events by `retryOrigin`.
- Keep docs synchronized:
  - `docs/practice-engine/retry-logic.md` (SSOT)
  - `docs/practice-engine/question-rendering-architecture.md`
  - `docs/practice-engine/spec-coverage-map.md` terminology cleanup

## Acceptance criteria

- [ ] Session review routes never submit attempts directly.
- [ ] Standalone retries create new attempts and include provenance metadata when applicable.
- [ ] Retry provenance is queryable in DB and visible in logs/analytics.
- [ ] Non-session review hydration failure is explicit (no silent degradation).
- [ ] Session-review page provides a first-class bridge to standalone practice retry.
- [ ] Practice-engine docs are consistent on retry semantics across tutor/exam/quick/bookmarks/history review.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Over-coupling retry metadata to frontend routing params | Validate + normalize in controller/use case; treat params as hints, not authority |
| Backfill/reporting drift during migration | Keep provenance nullable and forward-compatible; default old rows to null lineage |
| UX confusion between review and attempt modes | Explicit labels/CTA copy and visible mode indicators |
| Session metrics contamination | Preserve immutable session attempts and compute session summaries from in-session rows only |

