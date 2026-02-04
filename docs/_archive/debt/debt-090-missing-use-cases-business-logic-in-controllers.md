# DEBT-090: Missing Application Use Cases (Business Logic Lives in Controllers)

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-04
**Archived:** 2026-02-04

---

## Description

Several adapter controllers contained substantial business/use-case logic (selection, aggregation, orchestration) that should live in application-layer use cases per Clean Architecture and the project SSOT.

## Resolution

- Added missing application-layer use cases (TDD) under `src/application/use-cases/`:
  - `toggle-bookmark`
  - `get-bookmarks`
  - `get-missed-questions`
  - `get-user-stats`
  - `start-practice-session`
  - `end-practice-session`
  - `create-checkout-session`
  - `create-portal-session`
- Refactored controllers to stay thin and delegate business rules to use cases:
  - Controllers keep request-layer concerns only (auth/entitlement, input validation, rate limiting, idempotency, error mapping).
- Updated composition root wiring in `lib/container.ts` to construct and inject use cases into controllers.

## Verification

- New use-case unit tests exist and pass (`src/application/use-cases/*.test.ts`).
- Controller tests updated to validate request-layer behavior and use-case invocation.
- Verified green gates:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test --run`
  - `pnpm build`

