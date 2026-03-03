# DEBT-270: Integration Test God File Split

**Status:** Resolved  
**Priority:** P3  
**Opened:** 2026-03-03  
**Resolved:** 2026-03-03  
**Owner:** Testing  
**Related:** DEBT-271, DEBT-272

---

## Summary

This debt item is fully completed.

Before refactor, `tests/integration/repositories.integration.test.ts` was a 3,004-line god file with 60 tests across 13 top-level `describe` suites.  
After refactor, those suites were split into 9 domain-scoped files plus one shared helper file, and the original god file was removed.

## Baseline (measured before cuts)

- Command: `pnpm test:integration`
- Result: **78/78 tests passing**
- Relevant file: `tests/integration/repositories.integration.test.ts` (**60 tests**)

### Pre-split top-level suites (actual)

| Describe block | Lines (pre-split) | Tests |
|---|---:|---:|
| `DrizzleQuestionRepository` | 210-797 | 13 |
| `DrizzlePracticeSessionRepository + DrizzleAttemptRepository` | 798-1736 | 19 |
| `DrizzleBookmarkRepository` | 1737-1763 | 1 |
| `Stripe repositories` | 1764-1950 | 5 |
| `DrizzleUserRepository` | 1951-2100 | 6 |
| `DrizzleIdempotencyKeyRepository` | 2101-2261 | 4 |
| `DrizzleRateLimiter` | 2262-2288 | 1 |
| `DrizzleTagRepository` | 2289-2332 | 1 |
| `BUG-186: GetPracticeSessionReview active-exam secrecy` | 2333-2443 | 2 |
| `BUG-187: Dashboard counts exclude active-exam attempts` | 2444-2616 | 3 |
| `BUG-192: Attempted-question history excludes active-exam attempts` | 2617-2691 | 1 |
| `BUG-195: Question candidate status filters exclude active-exam attempts` | 2692-2872 | 1 |
| `BUG-188: CAS works with legacy JSON shapes` | 2873-3004 | 3 |

## Delivered Refactor

### Shared extraction

Added `tests/integration/helpers.ts` with:
- DB bootstrap + local-host guard (`createIntegrationDb`)
- `CleanupState` + `createCleanupState()`
- `cleanupAfterEach(...)`
- `closeConnection(...)`
- parameterized fixtures:
  - `createUser(db, cleanup)`
  - `createQuestion(db, cleanup, input)`
  - `createTag(db, cleanup, input)`

### Final split layout

| New file | Source suites | Tests |
|---|---|---:|
| `tests/integration/rate-limiter.integration.test.ts` | `DrizzleRateLimiter` | 1 |
| `tests/integration/tag-repository.integration.test.ts` | `DrizzleTagRepository` | 1 |
| `tests/integration/bookmark-repository.integration.test.ts` | `DrizzleBookmarkRepository` | 1 |
| `tests/integration/idempotency-key-repository.integration.test.ts` | `DrizzleIdempotencyKeyRepository` | 4 |
| `tests/integration/user-repository.integration.test.ts` | `DrizzleUserRepository` | 6 |
| `tests/integration/stripe-repositories.integration.test.ts` | `Stripe repositories` | 5 |
| `tests/integration/bug-regression.integration.test.ts` | `BUG-186`, `BUG-187`, `BUG-192`, `BUG-195`, `BUG-188` | 10 |
| `tests/integration/question-repository.integration.test.ts` | `DrizzleQuestionRepository` | 13 |
| `tests/integration/session-attempt-repository.integration.test.ts` | `DrizzlePracticeSessionRepository + DrizzleAttemptRepository` | 19 |

Removed:
- `tests/integration/repositories.integration.test.ts`

## Verification

- Final integration gate: `pnpm test:integration` -> **78/78 passing**
- Refactor preserved behavior (structural reorganization only)
- No cross-file state dependency introduced (each test file initializes its own DB/cleanup hooks via shared helpers)

## Acceptance Criteria

- [x] Each new file is self-contained (imports shared helpers, defines own hooks/state)
- [x] Shared helpers extracted to `tests/integration/helpers.ts`
- [x] Existing integration tests still pass with unchanged behavior
- [x] No test depends on execution order or state from another file
- [x] Original god file removed
- [x] `pnpm test:integration` passes with no regressions
