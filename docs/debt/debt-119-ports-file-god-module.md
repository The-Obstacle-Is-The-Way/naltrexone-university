# DEBT-119: Ports File Is a God Module (352 Lines, 10+ Interfaces)

**Status:** Open
**Priority:** P3
**Date:** 2026-02-06

---

## Description

`src/application/ports/repositories.ts` is a 352-line file containing 10+ port interface definitions:

- `QuestionRepository` (with composed sub-interfaces)
- `AttemptRepository` (with composed sub-interfaces)
- `PracticeSessionRepository`
- `BookmarkRepository`
- `TagRepository`
- `SubscriptionRepository`
- `StripeCustomerRepository`
- `StripeEventRepository`
- `UserRepository`
- `IdempotencyKeyRepository`

While the interfaces themselves are well-designed (properly segregated into reader/writer sub-interfaces), having all of them in one file violates the Single Responsibility Principle at the module level.

## Impact

- Any developer working on any repository port must open the same 352-line file
- Merge conflicts more likely when multiple people modify different ports simultaneously
- File will only grow as new entities are added
- IDE navigation is cluttered — harder to jump to a specific port

## Resolution

### Option A: One File Per Aggregate (Recommended)

Split into:
- `src/application/ports/question-repository.ts`
- `src/application/ports/attempt-repository.ts`
- `src/application/ports/practice-session-repository.ts`
- `src/application/ports/bookmark-repository.ts`
- `src/application/ports/tag-repository.ts`
- `src/application/ports/subscription-repository.ts`
- `src/application/ports/stripe-customer-repository.ts`
- `src/application/ports/stripe-event-repository.ts`
- `src/application/ports/user-repository.ts`
- `src/application/ports/idempotency-key-repository.ts`
- `src/application/ports/index.ts` (barrel re-export)

### Option B: Group by Bounded Context

- `src/application/ports/content-repositories.ts` (Question, Tag)
- `src/application/ports/practice-repositories.ts` (Attempt, PracticeSession, Bookmark)
- `src/application/ports/billing-repositories.ts` (Subscription, StripeCustomer, StripeEvent)
- `src/application/ports/identity-repositories.ts` (User, IdempotencyKey)

## Verification

- [ ] Each port file contains 1-2 related interfaces
- [ ] Barrel re-export preserves all existing imports
- [ ] No import changes needed in consuming files (barrel handles it)
- [ ] Existing test suite passes

## Related

- `src/application/ports/repositories.ts` (352 lines)
- `src/application/ports/gateways.ts` (smaller, acceptable size)
- DEBT-091 (archived — AttemptRepository ISP violation, related concern)
