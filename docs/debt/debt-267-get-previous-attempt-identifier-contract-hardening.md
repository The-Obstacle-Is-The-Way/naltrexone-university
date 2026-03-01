# DEBT-267: GetPreviousAttempt Identifier Contract Hardening

**Status:** Active
**Priority:** P3
**Date:** 2026-03-01
**Owner:** Practice Engine
**Related:** [Retry Logic SSOT](../practice-engine/retry-logic.md), [DEBT-265](./debt-265-retry-lineage-and-review-practice-unification.md), [DEBT-266](./debt-266-retry-observability-and-session-review-marker-persistence.md)

---

## Problem Statement

`GetPreviousAttemptUseCase` currently accepts both `attemptId` and `sessionId` in one request and uses permissive precedence behavior.

The question-page route now normalizes mixed identifiers (`sessionId` wins), so current UX is stable, but the downstream use-case contract is still ambiguous for any future caller that bypasses this boundary normalization.

---

## Why This Is Debt

- Boundary normalization is a safety rail, not a full contract guarantee.
- Mixed identifiers can cause accidental hydration semantics drift (attempt-based vs session-based review intent).
- Retry provenance correctness depends on consistent displayed-attempt hydration semantics.

---

## Scope

1. Harden `GetPreviousAttempt` input contract so mixed `attemptId + sessionId` is explicitly rejected or represented as a typed discriminated union.
2. Keep current user-facing behavior unchanged for normalized question-page routes.
3. Add test coverage for identifier exclusivity at application and controller boundaries.
4. Document the final precedence/rejection rule in the retry SSOT and question-rendering docs.

---

## Non-Goals

- Reworking DEBT-265 retry lineage schema.
- Changing session immutability or append-only attempt behavior.
- Introducing new review routes.

---

## Acceptance Criteria

- [ ] `GetPreviousAttempt` no longer has ambiguous mixed-id behavior.
- [ ] Mixed-id calls are deterministically rejected or mapped via a typed contract (no implicit precedence).
- [ ] Existing question-page review flows continue to work unchanged.
- [ ] Unit tests cover all identifier combinations.
- [ ] Docs reflect the hardened contract in one canonical place.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Breaking unknown callers that relied on permissive behavior | Keep normalization at route boundary and add targeted regression tests before tightening use-case contract |
| Contract drift across layers | Mirror contract in controller Zod schema + use-case runtime validation + SSOT docs |
