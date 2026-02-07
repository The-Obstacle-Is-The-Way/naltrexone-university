# DEBT-131: Missing Error Path Tests for 6 Use Cases

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

---

## Description

Six application use cases have limited or no tests for error paths (NOT_FOUND, validation failures, permission errors). Happy paths are well-tested, but error conditions are under-covered.

## Impact

- Regressions in error handling may go undetected
- TDD mandate requires comprehensive coverage for all behavioral paths

## Affected Use Cases

| Use Case | Current Tests | Missing Error Paths |
|----------|--------------|---------------------|
| `end-practice-session` | 1 test | Session not found, session already ended |
| `get-incomplete-practice-session` | 2 tests | No explicit not-found test |
| `get-session-history` | 2 tests | Pagination edge cases, empty results |
| `get-bookmarks` | 3 tests | Repository failure, empty user |
| `get-missed-questions` | 4 tests | Count overflow, empty results |
| `get-user-stats` | 3 tests | Partial repository failure, degraded stats |

## Resolution

Add error-path tests for each use case following TDD (Red → Green → Refactor).

## Verification

- [ ] Each use case has at least one error-path test
- [ ] Using `Fake*` classes from `src/application/test-helpers/fakes.ts`
- [ ] All tests follow Red → Green → Refactor

## Related

- `src/application/use-cases/` — Use case implementations
- `src/application/test-helpers/fakes.ts` — Test fakes
- ADR-003 — Testing Strategy
