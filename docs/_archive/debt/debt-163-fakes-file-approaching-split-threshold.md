# DEBT-163: Test Fakes File Approaching Split Threshold (1472 Lines)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

`src/application/test-helpers/fakes.ts` is 1,472 lines long and contains 30+ fake implementations. While well-structured and correctly implementing interfaces, the file is becoming difficult to navigate and maintain.

Current exports include: `FakeLogger`, `FakeQuestionRepository`, `FakeAttemptRepository`, `FakePracticeSessionRepository`, `FakeSubscriptionRepository`, `FakeUserRepository`, `FakeBookmarkRepository`, `FakeTagRepository`, `FakeStripeCustomerRepository`, `FakeStripeEventRepository`, `FakeAuthGateway`, `FakePaymentGateway`, `FakeRateLimiter`, `FakeIdempotencyKeyRepository`, and many more.

## Impact

- Navigating to a specific fake requires scrolling through 1400+ lines
- Merge conflicts become more likely as multiple developers modify the same file
- IDE performance may degrade with very large files

## Resolution

Consider splitting into domain-focused modules while maintaining a single re-export index:

```
src/application/test-helpers/
  fakes/
    index.ts           # re-exports everything
    repositories.ts    # FakeXxxRepository implementations
    gateways.ts        # FakeAuthGateway, FakePaymentGateway
    infrastructure.ts  # FakeLogger, FakeRateLimiter, FakeIdempotencyKeyRepository
```

## Verification

- [ ] Files split into logical groupings
- [ ] All existing imports still work via barrel re-export
- [ ] `pnpm test --run` passes

## Related

- `src/application/test-helpers/fakes.ts`
