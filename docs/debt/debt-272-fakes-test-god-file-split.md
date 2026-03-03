# DEBT-272: Fakes Test God File Split

**Status:** Active
**Priority:** P3
**Date:** 2026-03-03
**Owner:** Testing
**Related:** DEBT-270

---

## Description

`src/application/test-helpers/fakes.test.ts` is 1,383 lines containing 36 `describe` blocks that test 13+ separate fake implementations. Each fake is an independent class with its own contract — there is no behavioral coupling between them. This is a multi-concern god file.

### Current contents (13 fakes, 36 describe blocks)

| Fake Class | Approximate Lines |
|-----------|------------------|
| `FakeLogger` | ~40 |
| `FakePracticeSessionRepository` | ~250 |
| `FakeQuestionRepository` | ~180 |
| `FakeSubscriptionRepository` | ~80 |
| `FakeAuthGateway` | ~60 |
| `FakePaymentGateway` | ~100 |
| `FakeUserRepository` | ~80 |
| `FakeBookmarkRepository` | ~80 |
| `FakeTagRepository` | ~60 |
| `FakeStripeCustomerRepository` | ~80 |
| `FakeStripeEventRepository` | ~80 |
| `FakeAttemptRepository` | ~200 |
| `FakeIdempotencyKeyRepository` | ~50 |
| `FakeRateLimiter` | ~40 |

## Why this is debt

1. **Navigation:** Finding the test for `FakeBookmarkRepository` requires scrolling past 600+ lines of unrelated fake tests.
2. **Colocation mismatch:** The fakes themselves are already properly split into individual files under `src/application/test-helpers/fakes/` (e.g., `fake-user-repository.ts`, `fake-attempt-repository.ts`). The test file doesn't match this structure.
3. **Diff noise:** Any change to one fake's test creates a diff in a file that covers 12 other fakes.

## Why it's low priority

- Each fake is relatively simple (contract-mirror with in-memory state).
- The file is well-organized internally (each fake has its own top-level `describe`).
- Fakes change infrequently — only when a repository interface changes.
- No correctness risk from the current structure.

## Proposed resolution

Split into per-fake test files colocated with their implementations:

```
src/application/test-helpers/fakes/
├── fake-attempt-repository.ts
├── fake-attempt-repository.test.ts          ← NEW
├── fake-bookmark-repository.ts
├── fake-bookmark-repository.test.ts         ← NEW
├── fake-logger.ts
├── fake-logger.test.ts                      ← NEW
├── fake-practice-session-repository.ts
├── fake-practice-session-repository.test.ts ← NEW
├── ... (one .test.ts per fake)
└── index.ts
```

Delete `src/application/test-helpers/fakes.test.ts` after extraction.

## Acceptance criteria

- [ ] Each fake has a colocated `.test.ts` file
- [ ] Original `fakes.test.ts` deleted
- [ ] All existing tests pass with identical assertions
- [ ] `pnpm test --run` shows same test count (tests move, not disappear)

## Effort estimate

~2 hours. Mechanical file splitting.

## Risk

Negligible. Pure file reorganization.
