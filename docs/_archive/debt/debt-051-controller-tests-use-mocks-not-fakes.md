# DEBT-051: Controller Tests Use vi.fn() Instead of Fakes

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

Controller tests originally used ad-hoc `vi.fn()` objects for internal dependencies instead of in-memory fakes passed via dependency injection. This made tests more brittle and less representative of real behavior.

## Impact

- Tests coupled to implementation details
- Refactoring internal implementation breaks tests
- Can't verify real behavior — only that methods were called
- Inconsistent with domain/use-case test patterns
- Makes it harder to understand what the code actually does

## Resolution

Refactored controller tests to follow the “fakes over mocks” guidance:

- Use fakes from `src/application/test-helpers/fakes.ts` to set up in-memory state.
- Assert on returned data and fake state changes (behavior), not mocked call counts.
- Avoid `vi.mock()` for internal modules; keep mocks only for external/framework modules when necessary.

## Verification

- [x] Controller tests updated and passing.
- [x] No internal dependency mocking via `vi.fn()` in controller tests.

## Related

- DEBT-050: Missing fake implementations
 - `src/application/test-helpers/fakes.ts`
 - `src/adapters/controllers/*.test.ts`
