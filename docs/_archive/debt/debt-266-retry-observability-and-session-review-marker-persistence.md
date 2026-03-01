# DEBT-266: Retry Observability and Session-Review Marker Persistence

**Status:** Resolved
**Priority:** P3
**Date:** 2026-03-01
**Owner:** Practice Engine
**Related:** [DEBT-265](./debt-265-retry-lineage-and-review-practice-unification.md), [DEBT-267](./debt-267-get-previous-attempt-identifier-contract-hardening.md), [Retry Logic SSOT](../practice-engine/retry-logic.md)

---

## Problem Statement

DEBT-265 implemented retry provenance and inline session-review retry end-to-end, but left two follow-up slices:

1. retry/hydration/normalization observability contract
2. session-review retry-marker persistence policy

Both slices are now implemented and documented.

---

## Resolution Summary

Implemented telemetry events:

- `retry_submitted` (server, `SubmitAnswerUseCase`)
  - fields: `retryOrigin`, `isCorrect`, `hasParent`, `hasRetrySessionId`
- `review_hydration_outcome` (server, `question-view-controller`)
  - outcomes: `attempt`, `session_unanswered`, `no_prior_attempt`, `hydration_error`
- `review_identifier_normalized` (server route boundary, question page)
  - fields: `mode`, `normalizedTo`, `hadAttemptId`, `hadSessionId`, `slug`, `from`

Product policy decision:

- **Option A accepted:** session-review `wasRetried` marker is visit-scoped by design.
- No server-persistent overlay is required for current product contract.

---

## Implemented Surface

- `src/application/use-cases/submit-answer.ts`
- `src/adapters/controllers/question-view-controller.ts`
- `app/(app)/app/questions/[slug]/page.tsx`
- `src/application/use-cases/submit-answer.test.ts`
- `src/adapters/controllers/question-view-controller.test.ts`
- `app/(app)/app/questions/[slug]/page.test.tsx`
- `docs/practice-engine/retry-logic.md`

---

## Non-Goals

- Reworking DEBT-265 core provenance schema or submit flow.
- Changing session immutability or latest-attempt-wins semantics.
- Introducing a new retry UX model.

---

## Acceptance Criteria

- [x] Telemetry events for retry origin/outcome are emitted and test-covered.
- [x] Hydration outcome telemetry exists for all 4 review states.
- [x] Mixed-id normalization emits structured telemetry (not just `console.warn`).
- [x] Product decision on retry marker persistence is documented in SSOT.
- [x] Persistent marker overlay is intentionally not required (Option A accepted).

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Over-instrumentation noise | Define stable event schemas and sampling/aggregation strategy up front |
| Marker persistence corrupts session snapshot semantics | Keep session data immutable; compute marker from standalone lineage overlay only |
| Divergent behavior across origins | Centralize origin mapping and telemetry fields around existing `retryOrigin` enum |
