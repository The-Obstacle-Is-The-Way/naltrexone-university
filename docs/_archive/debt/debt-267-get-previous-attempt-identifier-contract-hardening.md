# DEBT-267: GetPreviousAttempt Identifier Contract Hardening

**Status:** Resolved
**Priority:** P3
**Date:** 2026-03-01
**Owner:** Practice Engine
**Related:** [Retry Logic SSOT](../practice-engine/retry-logic.md), [DEBT-265](./debt-265-retry-lineage-and-review-practice-unification.md), [DEBT-266](./debt-266-retry-observability-and-session-review-marker-persistence.md)

---

## Problem Statement

`GetPreviousAttempt` previously allowed mixed `attemptId + sessionId` input with permissive precedence behavior. That left downstream ambiguity and relied on route normalization alone.

---

## Why This Is Debt

- Boundary normalization is a safety rail, not a full contract guarantee.
- Mixed identifiers can cause accidental hydration semantics drift (attempt-based vs session-based review intent).
- Retry provenance correctness depends on consistent displayed-attempt hydration semantics.

---

## Resolution Summary

Implemented deterministic rejection for mixed identifiers:

- Use case runtime contract rejects `attemptId + sessionId` with `VALIDATION_ERROR`.
- Controller input schema rejects mixed identifiers via Zod `superRefine`.
- Route boundary normalization remains in place as defense-in-depth.
- Question hydration helper now also normalizes mixed ids before server action dispatch.

User-facing behavior for normalized question-page review flows is unchanged.

---

## Non-Goals

- Reworking DEBT-265 retry lineage schema.
- Changing session immutability or append-only attempt behavior.
- Introducing new review routes.

---

## Acceptance Criteria

- [x] `GetPreviousAttempt` no longer has ambiguous mixed-id behavior.
- [x] Mixed-id calls are deterministically rejected (no implicit precedence).
- [x] Existing question-page review flows continue to work unchanged.
- [x] Unit tests cover identifier exclusivity at controller/use-case boundaries.
- [x] Docs reflect the hardened contract in retry SSOT and question-rendering docs.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Breaking unknown callers that relied on permissive behavior | Keep normalization at route boundary and add targeted regression tests before tightening use-case contract |
| Contract drift across layers | Mirror contract in controller Zod schema + use-case runtime validation + SSOT docs |
