# DEBT-131: Missing Error Path Tests for 6 Use Cases

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-07

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

Implemented coverage additions:
- `end-practice-session.test.ts`: NOT_FOUND + CONFLICT propagation
- `get-incomplete-practice-session.test.ts`: repository failure propagation
- `get-session-history.test.ts`: malformed completed-row handling + repository failure propagation
- `get-bookmarks.test.ts`: bookmark repository failure propagation
- `get-missed-questions.test.ts`: empty-page with non-zero total + repository failure propagation
- `get-user-stats.test.ts`: stats repository failure propagation

## Verification

- [x] Each use case has at least one added error-path test
- [x] Uses existing `Fake*` classes from `src/application/test-helpers/fakes.ts`
- [x] Full quality gates pass (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `src/application/use-cases/` — Use case implementations
- `src/application/test-helpers/fakes.ts` — Test fakes
- ADR-003 — Testing Strategy
