# DEBT-266: Retry Observability and Session-Review Marker Persistence

**Status:** Active
**Priority:** P3
**Date:** 2026-03-01
**Owner:** Practice Engine
**Related:** [DEBT-265](./debt-265-retry-lineage-and-review-practice-unification.md), [DEBT-267](./debt-267-get-previous-attempt-identifier-contract-hardening.md), [Retry Logic SSOT](../practice-engine/retry-logic.md)

---

## Problem Statement

DEBT-265 implemented retry provenance and inline session-review retry end-to-end, but two follow-up slices remain:

1. **Observability gap**
- Retry behavior is persisted correctly, but there is no explicit telemetry contract for:
  - retry origin + outcome (`correct` / `incorrect`)
  - review hydration outcome (`attempt`, `session_unanswered`, `no_prior_attempt`, `hydration_error`)
  - mixed identifier normalization (`attemptId + sessionId`)

2. **Session-review retried indicator persistence decision**
- `wasRetried` is currently visit-scoped UI state in question-page controller.
- It survives in-flow navigation, but resets on hard refresh/new visit.
- Product decision is not yet codified for whether this indicator must persist cross-visit.

---

## Why This Is Debt

Core functionality is correct and user-facing flow works, but without explicit telemetry and persistence policy:

- regressions can go undetected,
- dashboard/analytics cannot reliably segment retry behavior by origin,
- teams may make inconsistent assumptions about whether retry markers should persist across sessions.

---

## Scope

### 1) Retry Observability Contract

Add structured events/counters for:

- `retry_submitted`
  - fields: `retryOrigin`, `isCorrect`, `hasParent`, `hasRetrySessionId`
- `review_hydration_outcome`
  - fields: `origin`, `mode`, `outcome` (`attempt` | `session_unanswered` | `no_prior_attempt` | `hydration_error`)
- `review_identifier_normalized`
  - fields: `from`, `hadAttemptId`, `hadSessionId`, `normalizedTo`

Events should be emitted in server-side execution paths where possible; client-only warnings are insufficient as the long-term source of truth.

### 2) Session-Review Retry Marker Policy

Decide and document one of two contracts:

- **Option A (current behavior, explicitly accepted):** marker is visit-scoped only.
- **Option B (persistent behavior):** marker is server-derived from attempt lineage and survives refresh/new visits.

If Option B is chosen, implement a server read model for session-review rows that overlays retry lineage without mutating session snapshot state.

---

## Non-Goals

- Reworking DEBT-265 core provenance schema or submit flow.
- Changing session immutability or latest-attempt-wins semantics.
- Introducing a new retry UX model.

---

## Acceptance Criteria

- [ ] Telemetry events for retry origin/outcome are emitted and test-covered.
- [ ] Hydration outcome telemetry exists for all 4 review states.
- [ ] Mixed-id normalization emits structured telemetry (not just `console.warn`).
- [ ] Product decision on retry marker persistence is documented in SSOT.
- [ ] If persistent markers are required, session-review UI reflects lineage-derived retry markers after page refresh.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Over-instrumentation noise | Define stable event schemas and sampling/aggregation strategy up front |
| Marker persistence corrupts session snapshot semantics | Keep session data immutable; compute marker from standalone lineage overlay only |
| Divergent behavior across origins | Centralize origin mapping and telemetry fields around existing `retryOrigin` enum |
