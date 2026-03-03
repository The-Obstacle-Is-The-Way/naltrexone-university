# DEBT-272: Fakes Test God File Split

**Status:** Active
**Priority:** P3
**Date:** 2026-03-03
**Owner:** Testing
**Related:** DEBT-270

---

## Description

`src/application/test-helpers/fakes.test.ts` is currently **1,383 lines** with **36 `describe` blocks** and **64 `it()` tests**. It exercises multiple unrelated fake classes in one file, creating a multi-concern test "god file".

### Verified current contents (2026-03-03)

- Top-level fake suites in this file: **12**
- Total nested + top-level `describe` blocks: **36**
- Total tests (`it(...)`): **64**

| Top-level suite | Line range | `it()` count in range |
|---|---:|---:|
| `FakeLogger` | 24-47 | 1 |
| `FakePracticeSessionRepository` | 48-72 | 2 |
| `FakeQuestionRepository` | 73-108 | 2 |
| `FakeSubscriptionRepository` | 109-219 | 3 |
| `FakeAuthGateway` | 220-233 | 2 |
| `FakePaymentGateway` | 234-281 | 1 |
| `FakeUserRepository` | 282-414 | 10 |
| `FakeBookmarkRepository` | 415-491 | 8 |
| `FakeTagRepository` | 492-520 | 2 |
| `FakeStripeCustomerRepository` | 521-596 | 7 |
| `FakeStripeEventRepository` | 597-763 | 11 |
| `FakeAttemptRepository` | 764-1383 | 15 |

### `fakes/` directory inventory (`*.ts`)

The following `.ts` files exist under `src/application/test-helpers/fakes/`:

- `fake-attempt-repository.ts`
- `fake-bookmark-repository.ts`
- `fake-gateways.ts`
- `fake-idempotency-key-repository.ts`
- `fake-logger.ts`
- `fake-practice-session-repository.ts`
- `fake-question-repository.ts`
- `fake-stripe-customer-repository.ts`
- `fake-stripe-event-repository.ts`
- `fake-subscription-repository.ts`
- `fake-tag-repository.ts`
- `fake-use-cases.ts`
- `fake-use-cases.test.ts`
- `fake-user-repository.ts`
- `index.ts`

Note: `FakeIdempotencyKeyRepository` and `FakeRateLimiter` are exported from `fakes/index.ts`, but they are **not** top-level suites in `fakes.test.ts`.

### Split-risk verification

- Shared imports in `fakes.test.ts`:
  - `ApplicationError` (line 2)
  - Barrel import from `@/src/application/test-helpers/fakes` (lines 3-16)
  - `Tag` type (line 17)
  - Domain factories `createPracticeSession`, `createQuestion`, `createTag` (lines 18-22)
- Global/shared hooks:
  - No `beforeEach`, `beforeAll`, `afterEach`, or `afterAll`
  - No top-level mutable shared state
- Cross-fake dependencies:
  - No top-level fake suite references another fake class (each suite only instantiates its own fake class)

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

Split `fakes.test.ts` into per-fake colocated test files under `src/application/test-helpers/fakes/`.

Recommended extraction plan (12 files, matching current top-level suites):

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

Do not move `fake-use-cases.test.ts`; it is already split and should remain separate.

## Acceptance criteria

- [ ] 12 new colocated fake test files are created (matching the 12 top-level suites above)
- [ ] Original `fakes.test.ts` deleted
- [ ] All 64 existing assertions from `fakes.test.ts` are preserved
- [ ] `pnpm test --run` passes
- [ ] No cross-suite behavior changes (pure file movement)

## Effort estimate

~2-3 hours. Mechanical extraction plus import cleanup.

## Risk

Negligible. Pure file reorganization.
