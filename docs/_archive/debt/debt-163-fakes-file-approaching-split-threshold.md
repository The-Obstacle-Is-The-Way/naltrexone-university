# DEBT-163: Test Fakes Split Into Modules (Was ~1,500 LOC)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The test-fakes surface grew large enough that a single-file approach became hard to navigate and prone to merge conflicts. The original monolithic `fakes.ts` was split into modules under `src/application/test-helpers/fakes/`, with a single barrel re-export (`src/application/test-helpers/fakes/index.ts`) to preserve import ergonomics.

Current exports still include `FakeLogger`, `FakeQuestionRepository`, `FakeAttemptRepository`, `FakePracticeSessionRepository`, `FakeSubscriptionRepository`, `FakeUserRepository`, `FakeBookmarkRepository`, `FakeTagRepository`, `FakeStripeCustomerRepository`, `FakeStripeEventRepository`, `FakeAuthGateway`, `FakePaymentGateway`, `FakeRateLimiter`, `FakeIdempotencyKeyRepository`, and others.

## Impact

- Navigating to a specific fake requires scrolling through 1400+ lines
- Merge conflicts become more likely as multiple developers modify the same file
- IDE performance may degrade with very large files

## Resolution

Split into domain-focused modules while maintaining a single re-export index:

```text
src/application/test-helpers/
  fakes/
    index.ts               # re-exports everything
    fake-repositories.ts   # Fake*Repository implementations (and idempotency fakes)
    fake-gateways.ts       # FakeAuthGateway, FakePaymentGateway, FakeRateLimiter
    fake-use-cases.ts      # Fake*UseCase implementations (where appropriate)
    fake-logger.ts         # FakeLogger
```

## Verification

- [x] Files split into logical groupings
- [x] All existing imports still work via barrel re-export
- [x] `pnpm test --run` passes

## Related

- `src/application/test-helpers/fakes/`
