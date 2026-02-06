# DEBT-119: Ports File Is a God Module (353 Lines, 10 Interfaces)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Description

`src/application/ports/repositories.ts` is a 353-line file containing 10 port interface definitions:

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

## Resolution (Implemented)

Implemented Option A with one file per repository contract and a barrel:

- Added:
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
- Replaced `src/application/ports/repositories.ts` with barrel re-exports.
- Added type-level parity test:
  - `src/application/ports/repository-port-modules.test.ts`

## Verification

- [x] Repository contracts are split into focused modules
- [x] Barrel re-export preserves existing import surface
- [x] Consumer imports remain compatible
- [x] Existing test suite passes

## Related

- `src/application/ports/repositories.ts`
- `src/application/ports/repository-port-modules.test.ts`
- DEBT-091 (archived)
